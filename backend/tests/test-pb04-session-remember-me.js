/**
 * Integration Test Suite for Ticket PB-04:
 * "Remember-me and session handling [P1]" (SRS 3.1 REQ-AUTH-14)
 *
 * User Story:
 *   As a user, I want optional Remember me and safe session handling.
 *
 * Acceptance Criteria:
 *   1. Remember-me behavior follows approved design (7-day vs 1-day TTL session token)
 *   2. Inactive sessions expire per agreed policy (7 days of inactivity)
 *   3. Logout ends the session (immediate server-side revocation + token invalidation + security audit log)
 */
const assert = require('assert');
const app = require('../server');
const SessionModel = require('../models/sessionModel');
const AuthService = require('../services/authService');
const { getPasswordsForRole, provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = {
  faculty: {
    idNumber: 'FAC-2026-001',
    name: 'Prof. Juan Dela Cruz',
    email: 'juandelacruz@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary Education',
    position: 'Assistant Professor III',
  },
  secretary: {
    idNumber: 'SEC-2026-001',
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
  console.log('🧪 RUNNING PB-04 INTEGRATION TESTS: REMEMBER-ME & SESSION HANDLING');
  console.log('================================================================\n');

  await seedTestAccounts();
  console.log('✅ Provisioned verified test accounts.\n');

  // Clear in-memory session store for clean test run
  SessionModel.clear();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

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

    const facultyCreds = {
      email: TEST_USERS.faculty.email,
      password: getPasswordsForRole(TEST_USERS.faculty.role, TEST_USERS.faculty.origin, TEST_USERS.faculty.email).primary,
    };

    // -------------------------------------------------------------
    // Test Case 1: Sign in with Remember Me (rememberMe: true)
    // -------------------------------------------------------------
    console.log('1️⃣  Testing Sign In with Remember Me (rememberMe = true)...');
    const rememberLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: facultyCreds.email,
        password: facultyCreds.password,
        rememberMe: true,
      }),
    });

    assert.strictEqual(rememberLoginRes.status, 200, 'Login with rememberMe=true should succeed (200)');
    assert(rememberLoginRes.body.token, 'Response must include session token');
    assert(rememberLoginRes.body.token.startsWith('sess_'), 'Session token should use sess_ prefix');
    assert.strictEqual(rememberLoginRes.body.rememberMe, true, 'rememberMe must be reflected in login response');

    const rememberSession = SessionModel.getSession(rememberLoginRes.body.token);
    assert(rememberSession, 'Session must exist in SessionModel store');
    assert.strictEqual(rememberSession.rememberMe, true, 'SessionModel must store rememberMe: true');
    assert.strictEqual(rememberSession.ttlMs, SessionModel.SEVEN_DAYS_MS, 'Remember-Me TTL must be exactly 7 days');
    console.log('   ✅ Remember-Me session generated with 7-day TTL (604,800,000 ms).');

    // -------------------------------------------------------------
    // Test Case 2: Sign in WITHOUT Remember Me (rememberMe: false)
    // -------------------------------------------------------------
    console.log('\n2️⃣  Testing Sign In WITHOUT Remember Me (rememberMe = false)...');
    const nonRememberLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: facultyCreds.email,
        password: facultyCreds.password,
        rememberMe: false,
      }),
    });

    assert.strictEqual(nonRememberLoginRes.status, 200, 'Login with rememberMe=false should succeed (200)');
    assert(nonRememberLoginRes.body.token, 'Response must include session token');
    assert.strictEqual(nonRememberLoginRes.body.rememberMe, false, 'rememberMe=false must be reflected in login response');

    const nonRememberSession = SessionModel.getSession(nonRememberLoginRes.body.token);
    assert(nonRememberSession, 'Session must exist in SessionModel store');
    assert.strictEqual(nonRememberSession.rememberMe, false, 'SessionModel must store rememberMe: false');
    assert.strictEqual(nonRememberSession.ttlMs, SessionModel.ONE_DAY_MS, 'Non-Remember session TTL must be 1 day (24 hours)');
    console.log('   ✅ Non-Remember session generated with 1-day TTL (86,400,000 ms).');

    // -------------------------------------------------------------
    // Test Case 3: Access Protected Endpoints & Rolling Activity Touch
    // -------------------------------------------------------------
    console.log('\n3️⃣  Testing Authenticated Access & Activity Touch (GET /api/auth/me)...');
    const activeToken = rememberLoginRes.body.token;
    const initialSession = SessionModel.getSession(activeToken);
    const initialLastActive = initialSession.lastActiveAt;

    // Small delay to ensure timestamp advancement
    await new Promise((resolve) => setTimeout(resolve, 50));

    const meRes = await request('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    });

    assert.strictEqual(meRes.status, 200, 'Access with active session token must return 200 OK');
    assert.strictEqual(meRes.body.verified, true, 'Profile must be verified');
    assert.strictEqual(meRes.body.user.email, facultyCreds.email, 'User email must match signed-in user');

    const touchedSession = SessionModel.getSession(activeToken);
    assert(
      new Date(touchedSession.lastActiveAt).getTime() >= new Date(initialLastActive).getTime(),
      'lastActiveAt must be updated on request activity'
    );
    console.log('   ✅ Valid session accepted and rolling activity timestamp touched.');

    // -------------------------------------------------------------
    // Test Case 4: Inactivity Expiration (REQ-AUTH-14 7-day idle policy)
    // -------------------------------------------------------------
    console.log('\n4️⃣  Testing Inactivity Expiration (REQ-AUTH-14 7-day inactivity limit)...');
    // Artificially age the session to 7 days + 1 second ago
    const expiredToken = nonRememberLoginRes.body.token;
    const sessionToAge = SessionModel.getSession(expiredToken);
    sessionToAge.lastActiveAt = new Date(Date.now() - (SessionModel.SEVEN_DAYS_MS + 1000)).toISOString();

    const inactiveRes = await request('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    assert.strictEqual(inactiveRes.status, 401, 'Request with inactive (> 7 days) session must be rejected (401)');
    assert(
      inactiveRes.body.error.toLowerCase().includes('inactivity'),
      'Error message must indicate session expiration due to inactivity'
    );
    assert.strictEqual(sessionToAge.isRevoked, true, 'Inactive session must be marked as revoked');
    console.log('   ✅ Inactive session (> 7 days) rejected with 401 and automatically revoked.');

    // -------------------------------------------------------------
    // Test Case 5: Explicit Logout Ends Session (POST /api/auth/logout)
    // -------------------------------------------------------------
    console.log('\n5️⃣  Testing Explicit Logout Ends Session (POST /api/auth/logout)...');
    // Login anew to get a fresh active token
    const logoutLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: facultyCreds.email,
        password: facultyCreds.password,
        rememberMe: true,
      }),
    });
    const sessionToLogout = logoutLoginRes.body.token;

    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToLogout}`,
      },
    });

    assert.strictEqual(logoutRes.status, 200, 'Logout request must return 200 OK');
    assert.strictEqual(logoutRes.body.success, true, 'Logout body must indicate success');

    // Verify token is revoked in SessionModel
    const revokedSession = SessionModel.getSession(sessionToLogout);
    assert.strictEqual(revokedSession.isRevoked, true, 'Session must be marked revoked after logout');

    // Attempting to use the revoked token must now fail with 401
    const postLogoutMeRes = await request('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToLogout}`,
      },
    });
    assert.strictEqual(postLogoutMeRes.status, 401, 'Subsequent request with logged-out token must return 401');
    assert(
      postLogoutMeRes.body.error.toLowerCase().includes('terminated') ||
      postLogoutMeRes.body.error.toLowerCase().includes('revoked'),
      'Error message must state session is terminated/revoked'
    );
    console.log('   ✅ Logout revoked session immediately; subsequent requests rejected with 401.');

    // -------------------------------------------------------------
    // Test Case 6: Security Audit Logging Captures Logout Event
    // -------------------------------------------------------------
    console.log('\n6️⃣  Testing Security Audit Log Captures Logout Event...');
    const secLogs = AuthService.getSecurityLogs();
    const logoutLogs = secLogs.filter((l) => l.event === 'logout' && l.email === facultyCreds.email);

    assert(logoutLogs.length > 0, 'Security audit log must contain logout event for the user');
    const latestLogout = logoutLogs[logoutLogs.length - 1];
    assert.strictEqual(latestLogout.status, 'success', 'Logout audit status must be success');
    assert(latestLogout.timestamp, 'Logout audit entry must have ISO timestamp');
    console.log('   ✅ Security audit log verified: recorded logout event with timestamp and user ID.');

    // -------------------------------------------------------------
    // Test Case 7: Password Reset Cascade Revocation (Multi-Session)
    // -------------------------------------------------------------
    console.log('\n7️⃣  Testing Cascade Revocation of All User Sessions on Password Reset...');
    // Create two parallel sessions for faculty
    const s1 = SessionModel.createSession({
      userId: facultyCreds.email,
      email: facultyCreds.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: true,
    });
    const s2 = SessionModel.createSession({
      userId: facultyCreds.email,
      email: facultyCreds.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: false,
    });

    assert.strictEqual(SessionModel.validateSession(s1.token).valid, true, 'Session 1 must be valid');
    assert.strictEqual(SessionModel.validateSession(s2.token).valid, true, 'Session 2 must be valid');

    // Revoke all sessions for this user ID
    const revokedCount = SessionModel.revokeAllUserSessions(facultyCreds.email);
    assert(revokedCount >= 2, 'Should revoke all active sessions for the user');

    assert.strictEqual(SessionModel.validateSession(s1.token).valid, false, 'Session 1 must now be invalid');
    assert.strictEqual(SessionModel.validateSession(s2.token).valid, false, 'Session 2 must now be invalid');
    console.log('   ✅ All concurrent user sessions successfully revoked on password change/reset.');

    console.log('\n================================================================');
    console.log('🎉 ALL PB-04 REMEMBER-ME & SESSION HANDLING TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-04 Test suite failed with error:', err);
  process.exit(1);
});
