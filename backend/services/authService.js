const crypto = require('crypto');
const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const SessionModel = require('../models/sessionModel');
const EmailService = require('./emailService');
const {
  ROLES,
  ALL_ROLES,
  ROLE_TO_OFFICE_NAME,
  toDbRoleName,
  getRoleLabel,
  isInstitutionalEmail,
  canPerformAction,
} = require('../utils/roles');

/**
 * PB-03: Account Security & Password Reset State
 * - Stores one-time password reset token hashes (never raw passwords)
 * - Tracks custom password hashes after password reset/change
 * - Maintains sanitized account security logs where passwords are NEVER exposed
 */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PASSWORD_LENGTH = 8;
const passwordResetTokens = new Map(); // tokenHash -> { email, userId, expiresAt, used, createdAt }
const customPasswordHashes = new Map(); // email -> sha256(password)
const securityAuditLogs = []; // Sanitized security event log entries

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'oldpassword',
  'password_hash',
  'passwordhash',
  'secret',
  'service_role_key',
  'supabase_secret_key',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * PB-03 Acceptance Criterion: "password is never exposed in logs"
 * Recursively strips/redacts any password or secret fields from log payloads or strings.
 */
function sanitizeForLog(input, secretsToRedact = []) {
  const secretValues = secretsToRedact
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());

  const redactString = (str) => {
    let result = String(str);
    for (const sec of secretValues) {
      if (sec && result.includes(sec)) {
        result = result.split(sec).join('[REDACTED]');
      }
    }
    // Redact common key=value or JSON patterns containing passwords
    result = result.replace(
      /(["']?(?:password|currentPassword|newPassword|confirmPassword|oldPassword)["']?\s*[:=]\s*["'])([^"']*)(["'])/gi,
      '$1[REDACTED]$3'
    );
    return result;
  };

  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return redactString(input);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForLog(item, secretValues));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string') {
      sanitized[key] = redactString(val);
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeForLog(val, secretValues);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * PB-03: Records an account security event while guaranteeing passwords are never exposed in logs.
 */
function recordSecurityEvent({
  event,
  email = null,
  userId = null,
  status = 'success',
  message = '',
  metadata = {},
  secretsToRedact = [],
}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event,
    email: email ? String(email).trim().toLowerCase() : null,
    userId: userId || null,
    status,
    message: sanitizeForLog(message, secretsToRedact),
    metadata: sanitizeForLog(metadata, secretsToRedact),
  };
  securityAuditLogs.unshift(entry);
  if (securityAuditLogs.length > 500) {
    securityAuditLogs.length = 500;
  }
  return entry;
}

/**
 * Returns the primary role-based password (e.g. "secretary123", "student123", "faculty123")
 * and valid variations for roles with dots/underscores.
 */
function getPasswordsForRole(role, origin, email = '') {
  const emailPrefix = email ? email.split('@')[0].toLowerCase() : '';
  const valid = new Set();

  if (emailPrefix) {
    valid.add(`${emailPrefix}123`);
    valid.add(`${emailPrefix.replace(/[._]/g, '')}123`);
  }

  if (role === 'faculty' && origin === 'IDS') {
    valid.add('ids.faculty123');
    valid.add('idsfaculty123');
    valid.add('faculty123');
  } else if (role === 'ids_principal') {
    valid.add('ids.principal123');
    valid.add('ids_principal123');
    valid.add('idsprincipal123');
    valid.add('principal123');
  } else if (role) {
    valid.add(`${role}123`);
  }

  const list = Array.from(valid);
  return {
    primary: list[0] || 'student123',
    validSet: valid,
  };
}

function splitFullName(fullName) {
  const clean = (fullName || 'University User').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' };
  }
  const lastName = parts.pop();
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

/**
 * Provisions a user in Supabase Auth + `"User"` + `user_role` + `user_office`
 * matching `supabase/supabase_schema.sql`
 */
async function provisionVerifiedUser({
  email,
  password,
  name,
  role,
  origin = 'CESS',
  department = 'CESS',
  accountStatus = 'Active',
  isWhitelisted = true,
}) {
  const cleanEmail = email.trim().toLowerCase();
  const safeRole = ALL_ROLES.includes(role) ? role : ROLES.STUDENT;
  const safeOrigin = origin === 'IDS' ? 'IDS' : 'CESS';
  const dbRoleName = toDbRoleName(safeRole, safeOrigin);
  const { primary: rolePassword, validSet } = getPasswordsForRole(safeRole, safeOrigin, cleanEmail);
  const targetPassword = password || rolePassword;
  const { firstName, lastName } = splitFullName(name);

  if (validSet.has(targetPassword)) {
    customPasswordHashes.delete(cleanEmail);
  } else {
    customPasswordHashes.set(cleanEmail, sha256(targetPassword));
  }

  // 1. Check or create in Supabase Auth
  const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const existingAuthUser = usersList?.users?.find(
    (u) => u.email && u.email.toLowerCase() === cleanEmail
  );

  let authUserId = existingAuthUser?.id;

  if (!authUserId) {
    const { data: createdAuth, error: authErr } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: {
        name,
        role: safeRole,
        department,
      },
    });
    if (authErr) throw new Error(`Auth creation failed: ${authErr.message}`);
    authUserId = createdAuth.user.id;
  } else {
    await supabase.auth.admin.updateUserById(authUserId, {
      password: targetPassword,
      email_confirm: true,
    });
  }

  // 2. Upsert into `"User"` table
  const { error: userErr } = await supabase.from('User').upsert(
    {
      user_id: authUserId,
      university_email: cleanEmail,
      first_name: firstName,
      last_name: lastName,
      department_or_office: department,
      account_status: accountStatus,
      is_whitelisted: isWhitelisted,
    },
    { onConflict: 'user_id' }
  );
  if (userErr) throw new Error(`"User" upsert failed: ${userErr.message}`);

  // 3. Assign role in `user_role` junction table
  const roleId = await UserModel.getRoleIdByName(dbRoleName);
  if (roleId) {
    await supabase.from('user_role').delete().eq('user_id', authUserId);
    const { error: urErr } = await supabase
      .from('user_role')
      .insert({ user_id: authUserId, role_id: roleId });
    if (urErr) throw new Error(`user_role insert failed: ${urErr.message}`);
  }

  // 4. Assign office in `user_office` junction table (for reviewing & admin roles)
  const officeName = ROLE_TO_OFFICE_NAME[safeRole];
  if (officeName) {
    const officeId = await UserModel.getOfficeIdByName(officeName);
    if (officeId) {
      await supabase.from('user_office').delete().eq('user_id', authUserId);
      await supabase
        .from('user_office')
        .insert({ user_id: authUserId, office_id: officeId });
    }
  }

  return UserModel.findById(authUserId);
}

const AuthService = {
  /**
   * PB-02: Sign In with Institutional Email & Role Password + Whitelist/Admin Verification Check
   */
  async loginUser(email, password, rememberMe = true) {
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!isInstitutionalEmail(cleanEmail)) {
      const err = new Error('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.');
      err.status = 400;
      throw err;
    }

    if (!password) {
      const err = new Error('Please enter your password.');
      err.status = 400;
      throw err;
    }

    const profile = await UserModel.findByEmail(cleanEmail);
    if (!profile) {
      const err = new Error('Invalid email or password, or account not yet verified.');
      err.status = 401;
      throw err;
    }

    if (profile.account_status === 'Pending_Verification' || !profile.is_whitelisted) {
      const err = new Error(
        'Your registration is pending verification by the College Secretary. Please wait for approval.'
      );
      err.status = 403;
      throw err;
    }

    if (profile.account_status === 'Inactive' || !profile.active) {
      const err = new Error('Your account has been deactivated by the College Secretary.');
      err.status = 403;
      throw err;
    }

    const { validSet } = getPasswordsForRole(profile.role, profile.origin, cleanEmail);
    const hasCustomPassword = customPasswordHashes.has(cleanEmail);

    if (hasCustomPassword) {
      if (sha256(password) !== customPasswordHashes.get(cleanEmail)) {
        recordSecurityEvent({
          event: 'login_failed',
          email: cleanEmail,
          userId: profile.id,
          status: 'failure',
          message: 'Failed sign-in attempt with invalid password.',
          secretsToRedact: [password],
        });
        const err = new Error('We couldn’t sign you in. Please check your university email and password.');
        err.status = 401;
        throw err;
      }
    } else if (!validSet.has(password)) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInErr) {
        recordSecurityEvent({
          event: 'login_failed',
          email: cleanEmail,
          userId: profile.id,
          status: 'failure',
          message: 'Failed sign-in attempt with invalid password.',
          secretsToRedact: [password],
        });
        const err = new Error('We couldn’t sign you in. Please check your university email and password.');
        err.status = 401;
        throw err;
      }
    }

    recordSecurityEvent({
      event: 'login_success',
      email: cleanEmail,
      userId: profile.id,
      status: 'success',
      message: `User ${cleanEmail} signed in successfully.`,
      secretsToRedact: [password],
    });

    // PB-04 (SRS 3.1 REQ-AUTH-14): Issue session token with Remember-Me lifecycle (7 days vs 1 day)
    const session = SessionModel.createSession({
      userId: profile.id,
      email: cleanEmail,
      role: profile.role,
      origin: profile.origin,
      rememberMe: Boolean(rememberMe),
    });

    return {
      verified: true,
      user: profile,
      token: session.token,
      rememberMe: session.rememberMe,
      session: {
        sessionId: session.sessionId,
        rememberMe: session.rememberMe,
        expiresAt: session.expiresAt,
        ttlMs: session.ttlMs,
      },
    };
  },

  /**
   * PB-03 (SRS 3.1 REQ-AUTH-7): Request a password reset via registered university email.
   * - Reset uses registered university email (@msunaawan.edu.ph)
   * - Password/secrets are never exposed in logs
   * - Success and failure messages are clear
   */
  async requestPasswordReset(email, options = {}) {
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      recordSecurityEvent({
        event: 'password_reset_request_failed',
        email: null,
        status: 'failure',
        message: 'Password reset request rejected: missing email address.',
      });
      const err = new Error('Please enter your registered university email address (@msunaawan.edu.ph).');
      err.status = 400;
      throw err;
    }

    if (!isInstitutionalEmail(cleanEmail)) {
      recordSecurityEvent({
        event: 'password_reset_request_failed',
        email: cleanEmail,
        status: 'failure',
        message: 'Password reset request rejected: non-university email domain.',
      });
      const err = new Error(
        'Only official university Gmail accounts (@msunaawan.edu.ph) are accepted for password reset.'
      );
      err.status = 400;
      throw err;
    }

    const profile = await UserModel.findByEmail(cleanEmail);
    if (!profile) {
      recordSecurityEvent({
        event: 'password_reset_request_failed',
        email: cleanEmail,
        status: 'failure',
        message: 'Password reset request rejected: unregistered university email.',
      });
      const err = new Error(
        'No registered university account was found for this email address. Please register or contact the College Secretary.'
      );
      err.status = 404;
      throw err;
    }

    if (profile.account_status === 'Pending_Verification' || !profile.is_whitelisted) {
      recordSecurityEvent({
        event: 'password_reset_request_failed',
        email: cleanEmail,
        userId: profile.id,
        status: 'failure',
        message: 'Password reset request rejected: account pending College Secretary verification.',
      });
      const err = new Error(
        'Password reset is unavailable because your registration is still pending verification by the College Secretary.'
      );
      err.status = 403;
      throw err;
    }

    if (profile.account_status === 'Inactive' || !profile.active) {
      recordSecurityEvent({
        event: 'password_reset_request_failed',
        email: cleanEmail,
        userId: profile.id,
        status: 'failure',
        message: 'Password reset request rejected: account is deactivated.',
      });
      const err = new Error(
        'Password reset is unavailable because this account has been deactivated by the College Secretary.'
      );
      err.status = 403;
      throw err;
    }

    // Generate cryptographically secure one-time recovery token & dynamic 6-digit OTP code
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);
    const otpCode = crypto.randomInt
      ? crypto.randomInt(100000, 1000000).toString()
      : Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = sha256(otpCode);
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;

    const tokenRecord = {
      email: cleanEmail,
      userId: profile.id,
      createdAt: Date.now(),
      expiresAt,
      used: false,
    };
    passwordResetTokens.set(tokenHash, tokenRecord);
    passwordResetTokens.set(otpHash, tokenRecord);

    // Also accept Figma demo code in non-production for instant prototyping
    if (process.env.NODE_ENV !== 'production') {
      passwordResetTokens.set(sha256('658485'), tokenRecord);
    }

    // Best-effort trigger of Supabase Auth email recovery link (non-blocking if rate-limited)
    try {
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: options.redirectTo || 'http://localhost:5173/reset-password',
      });
    } catch {
      // Recovery token is managed deterministically above
    }

    recordSecurityEvent({
      event: 'password_reset_requested',
      email: cleanEmail,
      userId: profile.id,
      status: 'success',
      message: `Password reset instructions dispatched to registered university email (${cleanEmail}).`,
      metadata: {
        deliveryChannel: 'university_email',
        expiresAt: new Date(expiresAt).toISOString(),
      },
    });

    // Dispatch real email via Nodemailer
    EmailService.sendPasswordResetEmail({
      to: cleanEmail,
      name: profile.name || cleanEmail,
      code: otpCode,
      resetToken: rawToken,
      expiresAt,
    }).catch((mailErr) => {
      console.warn(`[Nodemailer] Warning: Could not deliver reset email to ${cleanEmail}:`, mailErr.message);
    });

    return {
      success: true,
      email: cleanEmail,
      message: `Password reset instructions have been sent to your registered university email (${cleanEmail}).`,
      resetToken: rawToken,
      code: otpCode,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  },

  /**
   * PB-03 (SRS 3.1 REQ-AUTH-7): Complete password reset using recovery token & new password.
   * - Validates token, expiration, single-use, and registered university email match
   * - Enforces password strength & confirmation match
   * - Updates password securely in Supabase Auth without exposing password in logs
   */
  async confirmPasswordReset(input = {}) {
    const rawToken = (input.token || input.resetToken || input.code || '').trim();
    const providedEmail = input.email ? String(input.email).trim().toLowerCase() : null;
    const newPassword = input.newPassword ?? input.password ?? '';
    const confirmPassword = input.confirmPassword;
    const secrets = [newPassword, confirmPassword, rawToken].filter(Boolean);

    if (!rawToken) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: providedEmail,
        status: 'failure',
        message: 'Password reset confirmation rejected: missing recovery token.',
        secretsToRedact: secrets,
      });
      const err = new Error(
        'Password reset token is required. Please use the reset link sent to your registered university email.'
      );
      err.status = 400;
      throw err;
    }

    const tokenHash = sha256(rawToken);
    const tokenRecord = passwordResetTokens.get(tokenHash);

    if (!tokenRecord || tokenRecord.used || Date.now() > tokenRecord.expiresAt) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: providedEmail || tokenRecord?.email || null,
        userId: tokenRecord?.userId || null,
        status: 'failure',
        message: 'Password reset confirmation rejected: invalid, expired, or already-used recovery token.',
        secretsToRedact: secrets,
      });
      const err = new Error(
        tokenRecord?.used
          ? 'This password reset token has already been used. Please request a new password reset link.'
          : 'Invalid or expired password reset token. Please request a new password reset link.'
      );
      err.status = 400;
      throw err;
    }

    if (providedEmail && providedEmail !== tokenRecord.email) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: providedEmail,
        userId: tokenRecord.userId,
        status: 'failure',
        message: 'Password reset confirmation rejected: email mismatch for recovery token.',
        secretsToRedact: secrets,
      });
      const err = new Error(
        'The provided email does not match the registered university email for this password reset token.'
      );
      err.status = 400;
      throw err;
    }

    const targetEmail = tokenRecord.email;

    if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: targetEmail,
        userId: tokenRecord.userId,
        status: 'failure',
        message: 'Password reset confirmation rejected: empty new password.',
        secretsToRedact: secrets,
      });
      const err = new Error('Please enter a new password.');
      err.status = 400;
      throw err;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: targetEmail,
        userId: tokenRecord.userId,
        status: 'failure',
        message: 'Password reset confirmation rejected: password shorter than minimum length.',
        secretsToRedact: secrets,
      });
      const err = new Error(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      err.status = 400;
      throw err;
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      recordSecurityEvent({
        event: 'password_reset_confirm_failed',
        email: targetEmail,
        userId: tokenRecord.userId,
        status: 'failure',
        message: 'Password reset confirmation rejected: password confirmation mismatch.',
        secretsToRedact: secrets,
      });
      const err = new Error('The new passwords you entered do not match.');
      err.status = 400;
      throw err;
    }

    const profile = await UserModel.findByEmail(targetEmail);
    if (!profile || !profile.active) {
      const err = new Error('Registered university account is no longer active.');
      err.status = 403;
      throw err;
    }

    // Update password in Supabase Auth
    const { error: updateErr } = await supabase.auth.admin.updateUserById(profile.id, {
      password: newPassword,
      email_confirm: true,
    });
    if (updateErr) {
      const err = new Error('Unable to update password at this time. Please try again.');
      err.status = 500;
      throw err;
    }

    const { validSet } = getPasswordsForRole(profile.role, profile.origin, targetEmail);
    if (validSet.has(newPassword)) {
      customPasswordHashes.delete(targetEmail);
    } else {
      customPasswordHashes.set(targetEmail, sha256(newPassword));
    }

    // Invalidate token immediately (single-use)
    tokenRecord.used = true;

    recordSecurityEvent({
      event: 'password_reset_completed',
      email: targetEmail,
      userId: profile.id,
      status: 'success',
      message: `Password successfully reset via registered university email (${targetEmail}).`,
      secretsToRedact: secrets,
    });

    // Notify user of password update via Nodemailer
    EmailService.sendPasswordChangedAlert({
      to: targetEmail,
      name: profile?.name || targetEmail,
    }).catch((err) => {
      console.warn('[Nodemailer] Warning: Could not deliver password changed alert:', err.message);
    });

    return {
      success: true,
      email: targetEmail,
      message: 'Your password has been reset successfully. You can now sign in with your new password.',
    };
  },

  /**
   * PB-03: Signed-in account security — Change password for authenticated user.
   */
  async changePassword(actor, input = {}) {
    if (!actor || !actor.email) {
      const err = new Error('Unauthorized: Please sign in to change your password.');
      err.status = 401;
      throw err;
    }

    const cleanEmail = actor.email.trim().toLowerCase();
    const currentPassword = input.currentPassword ?? '';
    const newPassword = input.newPassword ?? '';
    const confirmPassword = input.confirmPassword;
    const secrets = [currentPassword, newPassword, confirmPassword].filter(Boolean);

    if (!currentPassword) {
      recordSecurityEvent({
        event: 'password_change_failed',
        email: cleanEmail,
        userId: actor.id,
        status: 'failure',
        message: 'Password change rejected: missing current password.',
        secretsToRedact: secrets,
      });
      const err = new Error('Please enter your current password.');
      err.status = 400;
      throw err;
    }

    if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
      const err = new Error('Please enter a new password.');
      err.status = 400;
      throw err;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      recordSecurityEvent({
        event: 'password_change_failed',
        email: cleanEmail,
        userId: actor.id,
        status: 'failure',
        message: 'Password change rejected: new password shorter than minimum length.',
        secretsToRedact: secrets,
      });
      const err = new Error(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      err.status = 400;
      throw err;
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      recordSecurityEvent({
        event: 'password_change_failed',
        email: cleanEmail,
        userId: actor.id,
        status: 'failure',
        message: 'Password change rejected: new password confirmation mismatch.',
        secretsToRedact: secrets,
      });
      const err = new Error('The new passwords you entered do not match.');
      err.status = 400;
      throw err;
    }

    // Verify current password
    const { validSet } = getPasswordsForRole(actor.role, actor.origin, cleanEmail);
    const hasCustomPassword = customPasswordHashes.has(cleanEmail);
    let currentValid = false;

    if (hasCustomPassword) {
      currentValid = sha256(currentPassword) === customPasswordHashes.get(cleanEmail);
    } else if (validSet.has(currentPassword)) {
      currentValid = true;
    } else {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword,
      });
      currentValid = !signInErr;
    }

    if (!currentValid) {
      recordSecurityEvent({
        event: 'password_change_failed',
        email: cleanEmail,
        userId: actor.id,
        status: 'failure',
        message: 'Password change rejected: incorrect current password.',
        secretsToRedact: secrets,
      });
      const err = new Error('Your current password is incorrect. Please check and try again.');
      err.status = 401;
      throw err;
    }

    if (currentPassword === newPassword) {
      const err = new Error('Your new password must be different from your current password.');
      err.status = 400;
      throw err;
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(actor.id, {
      password: newPassword,
      email_confirm: true,
    });
    if (updateErr) {
      const err = new Error('Unable to update password at this time. Please try again.');
      err.status = 500;
      throw err;
    }

    if (validSet.has(newPassword)) {
      customPasswordHashes.delete(cleanEmail);
    } else {
      customPasswordHashes.set(cleanEmail, sha256(newPassword));
    }

    recordSecurityEvent({
      event: 'password_changed',
      email: cleanEmail,
      userId: actor.id,
      status: 'success',
      message: `Account password updated by signed-in user (${cleanEmail}).`,
      secretsToRedact: secrets,
    });

    // Notify user of password update via Nodemailer
    EmailService.sendPasswordChangedAlert({
      to: cleanEmail,
      name: actor.name || cleanEmail,
    }).catch((err) => {
      console.warn('[Nodemailer] Warning: Could not deliver password changed alert:', err.message);
    });

    return {
      success: true,
      email: cleanEmail,
      message: 'Your account password has been changed successfully.',
    };
  },

  /**
   * PB-03: Retrieve sanitized account security logs (passwords are never exposed).
   */
  getSecurityLogs() {
    return securityAuditLogs.map((entry) => sanitizeForLog(entry));
  },

  /**
   * PB-02: Sign In with University Google Workspace (@msunaawan.edu.ph)
   */
  async loginWithGoogle(email, rememberMe = true) {
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!isInstitutionalEmail(cleanEmail)) {
      const err = new Error('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.');
      err.status = 400;
      throw err;
    }

    const profile = await UserModel.findByEmail(cleanEmail);
    if (!profile) {
      const err = new Error(
        'No active university account was found for this Gmail address. Please register or contact the College Secretary.'
      );
      err.status = 404;
      throw err;
    }

    if (!profile.active) {
      const err = new Error('Your account is inactive or pending College Secretary verification.');
      err.status = 403;
      throw err;
    }

    const session = SessionModel.createSession({
      userId: profile.id,
      email: cleanEmail,
      role: profile.role,
      origin: profile.origin,
      rememberMe: Boolean(rememberMe),
    });

    return {
      verified: true,
      user: profile,
      token: session.token,
      rememberMe: session.rememberMe,
      session: {
        sessionId: session.sessionId,
        rememberMe: session.rememberMe,
        expiresAt: session.expiresAt,
        ttlMs: session.ttlMs,
      },
    };
  },

  /**
   * PB-04: Explicit logout ends the session
   */
  async logoutUser(token, user) {
    const cleanToken = token ? token.replace(/^Bearer\s+/i, '').trim() : null;
    if (cleanToken) {
      SessionModel.revokeSession(cleanToken);
    }
    if (user?.id) {
      recordSecurityEvent({
        event: 'logout',
        email: user.email,
        userId: user.id,
        status: 'success',
        message: 'User logged out successfully. Session terminated.',
      });
    }
    return {
      success: true,
      message: 'Logged out successfully. Session terminated.',
    };
  },

  /**
   * PB-02: Registration with Whitelist Auto-Verification OR Admin Verification Queue
   */
  async registerUser(input) {
    const cleanName = (input.name || '').trim();
    const cleanEmail = (input.email || '').trim().toLowerCase();

    if (!cleanName) {
      const err = new Error('Please enter your full name.');
      err.status = 400;
      throw err;
    }

    if (!isInstitutionalEmail(cleanEmail)) {
      const err = new Error('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.');
      err.status = 400;
      throw err;
    }

    const existingUser = await UserModel.findByEmail(cleanEmail);

    if (existingUser && existingUser.account_status === 'Active') {
      const err = new Error('An account with this institutional email already exists. Please proceed to Sign In.');
      err.status = 409;
      throw err;
    }

    // 1. If already pre-registered in "User" with is_whitelisted = true -> Auto-Verify & Activate!
    if (existingUser && existingUser.is_whitelisted) {
      const activated = await provisionVerifiedUser({
        email: cleanEmail,
        password: input.password,
        name: existingUser.name || cleanName,
        role: existingUser.role,
        origin: existingUser.origin || input.origin || 'CESS',
        department: existingUser.department || input.department || 'CESS',
        accountStatus: 'Active',
        isWhitelisted: true,
      });

      // Send real email notification via Nodemailer
      EmailService.sendAccountActivatedEmail({
        to: cleanEmail,
        name: existingUser.name || cleanName,
        role: existingUser.role,
        department: existingUser.department || input.department || 'CESS',
      }).catch((mailErr) => {
        console.warn(`[Nodemailer] Warning: Could not deliver activation email to ${cleanEmail}:`, mailErr.message);
      });

      return {
        status: 'activated',
        verificationSource: 'whitelist',
        message: 'Account verified against the official masterlist whitelist and activated immediately.',
        user: activated,
      };
    }

    if (existingUser && existingUser.account_status === 'Pending_Verification') {
      const err = new Error(
        'Your registration is already pending verification with the College Secretary.'
      );
      err.status = 409;
      throw err;
    }

    // 2. Not on Whitelist -> Create in "User" with account_status = 'Pending_Verification', is_whitelisted = false
    const requestedRole = ALL_ROLES.includes(input.requestedRole)
      ? input.requestedRole
      : ROLES.STUDENT;

    const pendingUser = await provisionVerifiedUser({
      email: cleanEmail,
      password: input.password,
      name: cleanName,
      role: requestedRole,
      origin: input.origin === 'IDS' ? 'IDS' : 'CESS',
      department: (input.department || 'General').trim(),
      accountStatus: 'Pending_Verification',
      isWhitelisted: false,
    });

    // Send real email notification via Nodemailer
    EmailService.sendRegistrationQueuedEmail({
      to: cleanEmail,
      name: cleanName,
      requestedRole,
      department: (input.department || 'General').trim(),
    }).catch((mailErr) => {
      console.warn(`[Nodemailer] Warning: Could not deliver queued registration email to ${cleanEmail}:`, mailErr.message);
    });

    return {
      status: 'pending',
      verificationSource: 'admin_verification_queue',
      message: 'Email not found in pre-loaded whitelist. Registration queued for College Secretary verification.',
      pending: pendingUser,
    };
  },

  /**
   * PB-02: Admin (College Secretary) approves a pending registration and assigns verified role
   */
  async approvePendingRegistration(actor, registrationId, overrides = {}) {
    if (!canPerformAction(actor, 'verify_registration')) {
      const err = new Error('Forbidden: Only the College Secretary can approve pending registrations.');
      err.status = 403;
      throw err;
    }

    const reg = await UserModel.findPendingById(registrationId);
    if (!reg) {
      const err = new Error('Pending registration record not found.');
      err.status = 404;
      throw err;
    }

    const verifiedRole = overrides.role || reg.role;
    const verifiedDepartment = overrides.department || reg.department;
    const verifiedOrigin = overrides.origin || reg.origin || 'CESS';

    const verifiedUser = await provisionVerifiedUser({
      email: reg.email,
      password: overrides.password,
      name: reg.name,
      role: verifiedRole,
      origin: verifiedOrigin,
      department: verifiedDepartment,
      accountStatus: 'Active',
      isWhitelisted: true,
    });

    // Send real activation email via Nodemailer
    EmailService.sendAccountActivatedEmail({
      to: reg.email,
      name: reg.name,
      role: verifiedRole,
      department: verifiedDepartment,
    }).catch((mailErr) => {
      console.warn(`[Nodemailer] Warning: Could not deliver approval email to ${reg.email}:`, mailErr.message);
    });

    return {
      status: 'approved',
      verifiedBy: actor.name,
      user: verifiedUser,
    };
  },

  /**
   * PB-02: Admin (College Secretary) rejects a pending registration
   */
  async rejectPendingRegistration(actor, registrationId, reason) {
    if (!canPerformAction(actor, 'verify_registration')) {
      const err = new Error('Forbidden: Only the College Secretary can reject registrations.');
      err.status = 403;
      throw err;
    }

    const reg = await UserModel.findPendingById(registrationId);

    const { error } = await supabase
      .from('User')
      .update({ account_status: 'Inactive', is_whitelisted: false })
      .eq('user_id', registrationId);
    if (error) throw error;

    const updated = await UserModel.findById(registrationId);

    // PB-02: Notify student/faculty when Secretary rejects their account
    if (reg?.email) {
      EmailService.sendRegistrationRejectedEmail({
        to: reg.email,
        name: reg.name,
        reason: reason || 'Application credentials could not be verified against institutional masterlists.',
      }).catch((mailErr) => {
        console.warn(`[Nodemailer] Warning: Could not deliver rejection email to ${reg.email}:`, mailErr.message);
      });
    }

    return updated;
  },

  /**
   * PB-02: Admin (College Secretary) imports/updates Whitelist Masterlist into `"User"` + `user_role`
   */
  async importWhitelist(actor, entries) {
    if (!canPerformAction(actor, 'manage_whitelist')) {
      const err = new Error('Forbidden: Only the College Secretary can manage the whitelist.');
      err.status = 403;
      throw err;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      const err = new Error('Please provide at least one whitelist entry.');
      err.status = 400;
      throw err;
    }

    const results = [];
    for (const item of entries) {
      const cleanEmail = (item.email || '').trim().toLowerCase();
      if (!isInstitutionalEmail(cleanEmail)) continue;

      const saved = await provisionVerifiedUser({
        email: cleanEmail,
        name: (item.name || '').trim(),
        role: item.role || ROLES.STUDENT,
        origin: item.origin === 'IDS' ? 'IDS' : 'CESS',
        department: (item.department || 'CESS').trim(),
        accountStatus: 'Active',
        isWhitelisted: true,
      });
      results.push(saved);
    }

    return {
      importedCount: results.length,
      entries: results,
    };
  },

  /**
   * PB-02: Admin (College Secretary) directly creates or updates a user account & role
   */
  async saveUserAccount(actor, input) {
    if (!canPerformAction(actor, 'manage_users')) {
      const err = new Error('Forbidden: Only the College Secretary can manage user accounts.');
      err.status = 403;
      throw err;
    }

    if (!isInstitutionalEmail(input.email)) {
      const err = new Error('Email must end with @msunaawan.edu.ph.');
      err.status = 400;
      throw err;
    }

    return provisionVerifiedUser({
      email: input.email,
      password: input.password,
      name: input.name,
      role: input.role,
      origin: input.origin,
      department: input.department,
      accountStatus: 'Active',
      isWhitelisted: true,
    });
  },
};

module.exports = {
  ...AuthService,
  provisionVerifiedUser,
  getPasswordsForRole,
  sanitizeForLog,
  recordSecurityEvent,
};
