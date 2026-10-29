const supabase = require('../config/database');
const UserModel = require('../models/userModel');
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
  const { primary: rolePassword } = getPasswordsForRole(safeRole, safeOrigin, cleanEmail);
  const targetPassword = password || rolePassword;
  const { firstName, lastName } = splitFullName(name);

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
  async loginUser(email, password) {
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
    if (!validSet.has(password)) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInErr) {
        const err = new Error('We couldn’t sign you in. Please check your university email and password.');
        err.status = 401;
        throw err;
      }
    }

    return {
      verified: true,
      user: profile,
    };
  },

  /**
   * PB-02: Sign In with University Google Workspace (@msunaawan.edu.ph)
   */
  async loginWithGoogle(email) {
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

    return {
      verified: true,
      user: profile,
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

    return {
      status: 'approved',
      verifiedBy: actor.name,
      user: verifiedUser,
    };
  },

  /**
   * PB-02: Admin (College Secretary) rejects a pending registration
   */
  async rejectPendingRegistration(actor, registrationId) {
    if (!canPerformAction(actor, 'verify_registration')) {
      const err = new Error('Forbidden: Only the College Secretary can reject registrations.');
      err.status = 403;
      throw err;
    }

    const { error } = await supabase
      .from('User')
      .update({ account_status: 'Inactive', is_whitelisted: false })
      .eq('user_id', registrationId);
    if (error) throw error;

    return UserModel.findById(registrationId);
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
};
