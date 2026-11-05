/**
 * Integration Test Suite for Ticket PB-03:
 * "Password reset and account security [P0]" (SRS 3.1 REQ-AUTH-7; Section 5.3 Security Requirements)
 *
 * User Story:
 *   As a user, I want to recover access if I forget my password.
 *
 * Acceptance Criteria:
 *   1. Reset uses registered university email (@msunaawan.edu.ph)
 *   2. Password is never exposed in logs (or API responses / error payloads)
 *   3. Success/failure messages are clear
 */
const assert = require('assert');
const app = require('../server');
const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const {
  provisionVerifiedUser,
  getPasswordsForRole,
  sanitizeForLog,
  getSecurityLogs,
} = require('../services/authService');

const TEST_USERS = {
  student: {
    idNumber: '2023-0142',
    name: 'Maria Santos',
    email: 'student@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English, 3rd Year',
    position: 'Student',
  },
  secretary: {
    idNumber: 'SEC-2026-01',
    name: 'Ms. Carmela Ortiz',
    email: 'secretary@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
};

async function seedTestAccounts() {
  for (const acc of Object.values(TEST_USERS)) {
    const { primary } = getPasswordsForRole(acc.role, acc.origin, acc.email);
    await provisionVerifiedUser({
      idNumber: acc.idNumber,
      email: acc.email,
      password: primary,
      name: acc.name,
      role: acc.role,
      origin: acc.origin,
      department: acc.department,
      position: acc.position,
      accountStatus: 'Active',
      isWhitelisted: true,
    });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-03 INTEGRATION TESTS: PASSWORD RESET & ACCOUNT SECURITY');
  console.log('================================================================\n');

  await seedTestAccounts();
  console.log('✅ Provisioned verified test accounts in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  let pendingUserId = null;

  try {
    const request = async (path, options = {}) => {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    };

    const secretaryHeaders = { 'x-user-email': TEST_USERS.secretary.email };
    const studentHeaders = { 'x-user-email': TEST_USERS.student.email };

    // -------------------------------------------------------------------------
    // 1. AC 1 & AC 3: Password Reset Request Validation & Registered University Email
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Password Reset Request Validation (POST /api/auth/forgot-password)...');

    // 1A: Missing email rejected with clear failure message
    const emptyEmailRes = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: '   ' }),
    });
    assert.strictEqual(emptyEmailRes.status, 400);
    assert.ok(
      emptyEmailRes.body.error && emptyEmailRes.body.error.includes('university email'),
      `Expected clear missing-email error, got: ${JSON.stringify(emptyEmailRes.body)}`
    );
    console.log(`   ✅ Empty email rejected (400): "${emptyEmailRes.body.error}"`);

    // 1B: Non-university email rejected with clear failure message
    const externalEmailRes = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'maria.santos@gmail.com' }),
    });
    assert.strictEqual(externalEmailRes.status, 400);
    assert.ok(
      externalEmailRes.body.error && externalEmailRes.body.error.includes('@msunaawan.edu.ph'),
      `Expected clear domain error, got: ${JSON.stringify(externalEmailRes.body)}`
    );
    console.log(`   ✅ Non-university email rejected (400): "${externalEmailRes.body.error}"`);

    // 1C: Unregistered university email rejected with clear failure message
    const unregisteredEmailRes = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'unregistered.user.pb03@msunaawan.edu.ph' }),
    });
    assert.strictEqual(unregisteredEmailRes.status, 404);
    assert.ok(
      unregisteredEmailRes.body.error && unregisteredEmailRes.body.error.includes('No registered university account'),
      `Expected clear unregistered error, got: ${JSON.stringify(unregisteredEmailRes.body)}`
    );
    console.log(`   ✅ Unregistered university email rejected (404): "${unregisteredEmailRes.body.error}"`);

    // 1D: Pending verification account cannot reset password until verified
    const pendingEmail = `pending.pb03.${Date.now().toString().slice(-5)}@msunaawan.edu.ph`;
    const pendingReg = await provisionVerifiedUser({
      email: pendingEmail,
      name: 'Pending Student PB03',
      role: 'student',
      origin: 'CESS',
      department: 'BSEd Science',
      accountStatus: 'Pending_Verification',
      isWhitelisted: false,
    });
    pendingUserId = pendingReg?.id;

    const pendingResetRes = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: pendingEmail }),
    });
    assert.strictEqual(pendingResetRes.status, 403);
    assert.ok(
      pendingResetRes.body.error && pendingResetRes.body.error.includes('pending verification'),
      `Expected clear pending verification error, got: ${JSON.stringify(pendingResetRes.body)}`
    );
    console.log(`   ✅ Unverified/pending account reset denied (403): "${pendingResetRes.body.error}"`);

    // 1E: Registered & active university email succeeds with clear confirmation message
    const validResetReq = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USERS.student.email }),
    });
    assert.strictEqual(validResetReq.status, 200);
    assert.strictEqual(validResetReq.body.success, true);
    assert.strictEqual(validResetReq.body.email, TEST_USERS.student.email);
    assert.ok(validResetReq.body.resetToken, 'Expected one-time resetToken for verification');
    assert.ok(
      validResetReq.body.message && validResetReq.body.message.includes(TEST_USERS.student.email),
      `Expected clear success message, got: ${JSON.stringify(validResetReq.body)}`
    );
    console.log(`   ✅ Registered university email accepted (200): "${validResetReq.body.message}"\n`);

    const recoveryToken = validResetReq.body.resetToken;

    // -------------------------------------------------------------------------
    // 2. AC 1 & AC 3: Password Reset Confirmation & Clear Validation Feedback
    // -------------------------------------------------------------------------
    console.log('2️⃣  Testing Password Reset Confirmation & Security Rules (POST /api/auth/reset-password)...');

    const newTemporaryPassword = 'NewSecurePass#2026!';
    const mismatchedPassword = 'DifferentPass#9999!';
    const weakShortPassword = 'short';

    // 2A: Invalid recovery token rejected with clear message
    const badTokenRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        token: 'invalid-or-forged-token-0000',
        newPassword: newTemporaryPassword,
      }),
    });
    assert.strictEqual(badTokenRes.status, 400);
    assert.ok(badTokenRes.body.error.includes('Invalid or expired password reset token'));
    console.log(`   ✅ Invalid recovery token rejected (400): "${badTokenRes.body.error}"`);

    // 2B: Mismatched university email for token rejected
    const wrongEmailForTokenRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.secretary.email,
        token: recoveryToken,
        newPassword: newTemporaryPassword,
      }),
    });
    assert.strictEqual(wrongEmailForTokenRes.status, 400);
    assert.ok(wrongEmailForTokenRes.body.error.includes('does not match the registered university email'));
    console.log(`   ✅ Cross-account email mismatch rejected (400): "${wrongEmailForTokenRes.body.error}"`);

    // 2C: Short/weak password (< 8 chars) rejected with clear message
    const shortPwRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        token: recoveryToken,
        newPassword: weakShortPassword,
      }),
    });
    assert.strictEqual(shortPwRes.status, 400);
    assert.ok(shortPwRes.body.error.includes('at least 8 characters'));
    console.log(`   ✅ Weak/short password rejected (400): "${shortPwRes.body.error}"`);

    // 2D: Mismatched password confirmation rejected with clear message
    const mismatchPwRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        token: recoveryToken,
        newPassword: newTemporaryPassword,
        confirmPassword: mismatchedPassword,
      }),
    });
    assert.strictEqual(mismatchPwRes.status, 400);
    assert.ok(mismatchPwRes.body.error.includes('do not match'));
    console.log(`   ✅ Mismatched confirmPassword rejected (400): "${mismatchPwRes.body.error}"`);

    // 2E: Valid password reset confirmation succeeds
    const confirmResetRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        token: recoveryToken,
        newPassword: newTemporaryPassword,
        confirmPassword: newTemporaryPassword,
      }),
    });
    assert.strictEqual(confirmResetRes.status, 200);
    assert.strictEqual(confirmResetRes.body.success, true);
    assert.ok(confirmResetRes.body.message.includes('reset successfully'));
    console.log(`   ✅ Password reset completed (200): "${confirmResetRes.body.message}"`);

    // 2F: Replaying the already-used token is rejected
    const replayTokenRes = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        token: recoveryToken,
        newPassword: 'AnotherPassword#2026!',
      }),
    });
    assert.strictEqual(replayTokenRes.status, 400);
    console.log(`   ✅ Single-use token replay blocked (400): "${replayTokenRes.body.error}"\n`);

    // -------------------------------------------------------------------------
    // 3. Verify Sign-In With Reset Password & Signed-In Password Change
    // -------------------------------------------------------------------------
    console.log('3️⃣  Testing Sign-In After Reset & Signed-In Password Change...');

    // 3A: Old password ('student123') is no longer accepted
    const oldPwLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        password: 'student123',
      }),
    });
    assert.strictEqual(oldPwLogin.status, 401);
    console.log(`   ✅ Old password rejected after reset (401): "${oldPwLogin.body.error}"`);

    // 3B: New reset password succeeds
    const newPwLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_USERS.student.email,
        password: newTemporaryPassword,
      }),
    });
    assert.strictEqual(newPwLogin.status, 200);
    assert.strictEqual(newPwLogin.body.verified, true);
    console.log(`   ✅ Sign-in with new reset password succeeded (200 OK)`);

    // 3C: Signed-in password change rejects wrong current password
    const wrongCurrentPwChange = await request('/auth/change-password', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        currentPassword: 'WrongCurrentPassword!99',
        newPassword: 'student123',
        confirmPassword: 'student123',
      }),
    });
    assert.strictEqual(wrongCurrentPwChange.status, 401);
    console.log(`   ✅ Signed-in password change with wrong current password rejected (401): "${wrongCurrentPwChange.body.error}"`);

    // 3D: Signed-in password change restores standard password ('student123')
    const validPwChange = await request('/auth/change-password', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        currentPassword: newTemporaryPassword,
        newPassword: 'student123',
        confirmPassword: 'student123',
      }),
    });
    assert.strictEqual(validPwChange.status, 200);
    assert.strictEqual(validPwChange.body.success, true);
    console.log(`   ✅ Signed-in password change succeeded (200): "${validPwChange.body.message}"\n`);

    // -------------------------------------------------------------------------
    // 4. AC 2: Verify Password Is NEVER Exposed in Logs or API Responses
    // -------------------------------------------------------------------------
    console.log('4️⃣  Testing Log Sanitization & Ensuring Passwords Are Never Exposed in Logs...');

    // 4A: Non-admin cannot view security logs
    const studentTryLogs = await request('/auth/security-logs', {
      headers: studentHeaders,
    });
    assert.strictEqual(studentTryLogs.status, 403);
    console.log('   ✅ Unauthorized role denied access to /api/auth/security-logs (403 Forbidden)');

    // 4B: Secretary retrieves security logs and verifies zero password exposure
    const secLogsRes = await request('/auth/security-logs', {
      headers: secretaryHeaders,
    });
    assert.strictEqual(secLogsRes.status, 200);
    assert.ok(Array.isArray(secLogsRes.body.logs) && secLogsRes.body.logs.length > 0);

    const rawLogsJson = JSON.stringify(secLogsRes.body.logs);
    const directLogsJson = JSON.stringify(getSecurityLogs());
    const combinedLogsText = `${rawLogsJson} ${directLogsJson}`;

    const sensitiveStrings = [
      newTemporaryPassword,
      mismatchedPassword,
      'WrongCurrentPassword!99',
      'student123',
      'faculty123',
      'secretary123',
      recoveryToken,
    ];

    for (const secret of sensitiveStrings) {
      assert.strictEqual(
        combinedLogsText.includes(secret),
        false,
        `SECURITY VIOLATION: Sensitive credential "${secret}" was exposed in logs!`
      );
    }
    console.log(`   ✅ Verified ${secLogsRes.body.logs.length} security log entries: 0 passwords or recovery tokens exposed`);

    // 4C: Direct unit check on sanitizeForLog redaction
    const sampleSensitivePayload = {
      email: 'student@msunaawan.edu.ph',
      password: 'MySecretPassword123!',
      newPassword: 'NewSecretPassword456!',
      nested: {
        currentPassword: 'OldSecretPassword789!',
        note: 'Attempt with password="MySecretPassword123!" failed',
      },
    };
    const sanitized = sanitizeForLog(sampleSensitivePayload, ['MySecretPassword123!']);
    const sanitizedStr = JSON.stringify(sanitized);
    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.newPassword, '[REDACTED]');
    assert.strictEqual(sanitized.nested.currentPassword, '[REDACTED]');
    assert.strictEqual(sanitizedStr.includes('MySecretPassword123!'), false);
    assert.strictEqual(sanitizedStr.includes('NewSecretPassword456!'), false);
    assert.strictEqual(sanitizedStr.includes('OldSecretPassword789!'), false);
    console.log('   ✅ Verified sanitizeForLog() redacts all password fields and inline password strings\n');

    console.log('================================================================');
    console.log('🎉 ALL PB-03 PASSWORD RESET & ACCOUNT SECURITY TESTS PASSED!');
    console.log('================================================================');
  } finally {
    // Ensure student password is restored to 'student123'
    const { primary } = getPasswordsForRole(
      TEST_USERS.student.role,
      TEST_USERS.student.origin,
      TEST_USERS.student.email
    );
    await provisionVerifiedUser({
      ...TEST_USERS.student,
      password: primary,
      accountStatus: 'Active',
      isWhitelisted: true,
    });

    if (pendingUserId) {
      await supabase.from('User').delete().eq('user_id', pendingUserId);
      await supabase.auth.admin.deleteUser(pendingUserId).catch(() => {});
    }
    server.close();
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('❌ PB-03 TEST FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runTests };

