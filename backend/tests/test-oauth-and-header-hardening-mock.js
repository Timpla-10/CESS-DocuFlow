/**
 * Isolated Mock-Based Security Regression Suite for Phase 4.3C:
 * Google OAuth & Header-Based Identity Hardening
 *
 * Uses isolated mocks only — NEVER connects to live Supabase.
 * Proves:
 *  1. Production Google login rejects a plain email-only request (503 when unconfigured, 401 when enabled without token).
 *  2. Production Google login rejects invalid, expired, non-Google, or unverified-email identity tokens (401).
 *  3. Google authentication cannot create a session before successful verification (and succeeds only with verified Google token).
 *  4. Production rejects `x-user-email` without a Bearer token (401).
 *  5. Production rejects `x-user-id` without a Bearer token (401).
 *  6. Production accepts a valid Bearer session token (200).
 *  7. Invalid or expired Bearer tokens are rejected (401).
 *  8. Session database failures fail closed (500, next() never called).
 *  9. Explicit non-production compatibility (ALLOW_HEADER_AUTH=true, ALLOW_DEMO_AUTH=true) does NOT activate in production.
 * 10. Existing role-based authorization (`requireRole`, `requireAction`) remains intact.
 * 11-12. `x-session-token` hardening in production vs explicit non-production opt-in.
 * 13-19. `GET /api/auth/directory` Bearer auth, role-scoped filtering, inactive exclusion, 8-field projection, and DB error forwarding.
 */
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.invalid';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

const app = require('../server');
const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const SessionModel = require('../models/sessionModel');
const AuthService = require('../services/authService');
const AuthController = require('../controllers/authController');
const { verifyUser, requireRole, requireAction, isHeaderAuthAllowed } = require('../middleware/authMiddleware');

function createMockSessionClient(backingRows = []) {
  const rows = backingRows;
  function matches(row, filters) {
    return filters.every((f) => {
      const val = row[f.col];
      if (f.op === 'eq') return val === f.val;
      if (f.op === 'gt') return new Date(val).getTime() > new Date(f.val).getTime();
      return false;
    });
  }
  return {
    _rows: rows,
    from() {
      const state = { op: null, payload: null, filters: [], single: false, maybeSingle: false };
      const execute = async () => {
        if (state.op === 'insert') {
          rows.push({ ...state.payload });
          return { data: state.single ? { ...state.payload } : [{ ...state.payload }], error: null };
        }
        if (state.op === 'select') {
          const m = rows.filter((r) => matches(r, state.filters)).map((r) => ({ ...r }));
          if (state.maybeSingle) return { data: m[0] || null, error: null };
          return { data: m, error: null };
        }
        if (state.op === 'update') {
          const upd = [];
          for (const r of rows) {
            if (matches(r, state.filters)) {
              Object.assign(r, state.payload);
              upd.push({ ...r });
            }
          }
          if (state.maybeSingle) return { data: upd[0] || null, error: null };
          return { data: upd, error: null };
        }
        return { data: null, error: null };
      };
      const b = {
        insert(p) { state.op = 'insert'; state.payload = p; return b; },
        select() { if (!state.op) state.op = 'select'; return b; },
        update(p) { state.op = 'update'; state.payload = p; return b; },
        eq(col, val) { state.filters.push({ op: 'eq', col, val }); return b; },
        gt(col, val) { state.filters.push({ op: 'gt', col, val }); return b; },
        single() { state.single = true; return execute(); },
        maybeSingle() { state.maybeSingle = true; return execute(); },
        then(res, rej) { return execute().then(res, rej); },
      };
      return b;
    },
  };
}

function invokeMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, nextCalled: false, req }); },
    };
    mw(req, res, () => resolve({ status: 200, nextCalled: true, req }));
  });
}

async function runTests() {
  const origEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEMO_AUTH: process.env.ALLOW_DEMO_AUTH,
    ALLOW_HEADER_AUTH: process.env.ALLOW_HEADER_AUTH,
    GOOGLE_OAUTH_ENABLED: process.env.GOOGLE_OAUTH_ENABLED,
  };
  const origFindByEmail = UserModel.findByEmail;
  const origFindById = UserModel.findById;
  const origFindAll = UserModel.findAll;
  const origGetUser = supabase.auth.getUser;

  const studentUser = {
    id: crypto.randomUUID(),
    email: 'student@msunaawan.edu.ph',
    name: 'Maria Santos',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    active: true,
    is_whitelisted: true,
    account_status: 'Active',
  };
  const secretaryUser = {
    id: crypto.randomUUID(),
    email: 'secretary@msunaawan.edu.ph',
    name: 'Ms. Carmela Ortiz',
    role: 'secretary',
    origin: 'CESS',
    department: 'CESS',
    active: true,
    is_whitelisted: true,
    account_status: 'Active',
  };

  const sessionRows = [];
  SessionModel._setClient(createMockSessionClient(sessionRows));

  UserModel.findByEmail = async (email) => {
    const clean = String(email).toLowerCase();
    if (clean === studentUser.email) return studentUser;
    if (clean === secretaryUser.email) return secretaryUser;
    return null;
  };
  UserModel.findById = async (id) => {
    if (id === studentUser.id) return studentUser;
    if (id === secretaryUser.id) return secretaryUser;
    return null;
  };

  try {
    // =========================================================================
    // PRODUCTION MODE TESTS (with ALLOW_DEMO_AUTH=true & ALLOW_HEADER_AUTH=true
    // intentionally set to prove prod NEVER activates non-prod compatibility!)
    // =========================================================================
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_AUTH = 'true';
    process.env.ALLOW_HEADER_AUTH = 'true';
    delete process.env.GOOGLE_OAUTH_ENABLED;

    // 1. Production Google login rejects a plain email-only request (503 when unconfigured, 401 when enabled without token)
    await assert.rejects(
      () => AuthService.loginWithGoogle({ email: secretaryUser.email }),
      (err) => err.status === 503
    );
    assert.strictEqual(sessionRows.length, 0, 'No session created on unconfigured Google login');

    process.env.GOOGLE_OAUTH_ENABLED = 'true';
    await assert.rejects(
      () => AuthService.loginWithGoogle({ email: secretaryUser.email }),
      (err) => err.status === 401
    );
    assert.strictEqual(sessionRows.length, 0, 'No session created on plain email-only Google login');
    console.log('PASS 1: Production Google login rejects plain email-only requests (503 unconfigured, 401 missing token).');

    // 2. Production Google login rejects invalid, expired, non-Google, and unverified-email identity tokens
    supabase.auth.getUser = async (token) => {
      if (token === 'expired-or-invalid-token') {
        return { data: { user: null }, error: { message: 'JWT expired' } };
      }
      if (token === 'non-google-provider-token') {
        return {
          data: {
            user: {
              id: secretaryUser.id,
              email: secretaryUser.email,
              email_confirmed_at: new Date().toISOString(),
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          },
          error: null,
        };
      }
      if (token === 'unverified-email-google-token') {
        return {
          data: {
            user: {
              id: secretaryUser.id,
              email: secretaryUser.email,
              email_confirmed_at: null,
              app_metadata: { provider: 'google', providers: ['google'] },
            },
          },
          error: null,
        };
      }
      if (token === 'valid-google-oauth-token') {
        return {
          data: {
            user: {
              id: secretaryUser.id,
              email: secretaryUser.email,
              email_confirmed_at: new Date().toISOString(),
              app_metadata: { provider: 'google', providers: ['google'] },
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: { message: 'Invalid token' } };
    };

    for (const badToken of ['expired-or-invalid-token', 'non-google-provider-token', 'unverified-email-google-token']) {
      await assert.rejects(
        () => AuthService.loginWithGoogle({ accessToken: badToken }),
        (err) => err.status === 401
      );
    }
    console.log('PASS 2: Production Google login rejects invalid, expired, non-Google, and unverified tokens (401).');

    // 3. Google authentication cannot create a session before successful verification; verified token succeeds
    assert.strictEqual(sessionRows.length, 0, 'Zero sessions created across all failed Google attempts');
    const googleOk = await AuthService.loginWithGoogle({
      email: 'attacker@msunaawan.edu.ph', // ignored in favor of verified token email
      accessToken: 'valid-google-oauth-token',
    });
    assert.strictEqual(googleOk.verified, true);
    assert.strictEqual(googleOk.user.email, secretaryUser.email, 'Must resolve to verified token email, not body email');
    assert.strictEqual(sessionRows.length, 1, 'Session created only after successful cryptographic verification');
    console.log('PASS 3: Google auth creates session ONLY after cryptographic verification and ignores spoofed body email.');

    // 4. Production rejects `x-user-email` without a Bearer token
    const emailHeaderRes = await invokeMiddleware(verifyUser, {
      headers: { 'x-user-email': secretaryUser.email },
    });
    assert.strictEqual(emailHeaderRes.nextCalled, false);
    assert.strictEqual(emailHeaderRes.status, 401);
    console.log('PASS 4: Production rejects `x-user-email` without a Bearer token (401).');

    // 5. Production rejects `x-user-id` without a Bearer token
    const idHeaderRes = await invokeMiddleware(verifyUser, {
      headers: { 'x-user-id': secretaryUser.id },
    });
    assert.strictEqual(idHeaderRes.nextCalled, false);
    assert.strictEqual(idHeaderRes.status, 401);
    console.log('PASS 5: Production rejects `x-user-id` without a Bearer token (401).');

    // 6. Production accepts a valid Bearer session token
    const validBearerRes = await invokeMiddleware(verifyUser, {
      headers: { authorization: `Bearer ${googleOk.token}` },
    });
    assert.strictEqual(validBearerRes.nextCalled, true);
    assert.strictEqual(validBearerRes.req.user.email, secretaryUser.email);
    console.log('PASS 6: Production accepts valid Bearer persistent session token (200).');

    // 7. Invalid or expired Bearer tokens are rejected
    const invalidBearerRes = await invokeMiddleware(verifyUser, {
      headers: { authorization: 'Bearer sess_invalid_forged_token' },
    });
    assert.strictEqual(invalidBearerRes.nextCalled, false);
    assert.strictEqual(invalidBearerRes.status, 401);

    // Expire the valid session and confirm rejection
    sessionRows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const expiredBearerRes = await invokeMiddleware(verifyUser, {
      headers: { authorization: `Bearer ${googleOk.token}` },
    });
    assert.strictEqual(expiredBearerRes.nextCalled, false);
    assert.strictEqual(expiredBearerRes.status, 401);
    console.log('PASS 7: Invalid and expired Bearer tokens are rejected (401).');

    // 8. Session database failures fail closed (500, next() never called)
    SessionModel._setClient({
      from() {
        const errP = Promise.resolve({ data: null, error: { message: 'database unavailable' } });
        const c = {
          select() { return c; },
          eq() { return c; },
          maybeSingle() { return errP; },
          then(r, j) { return errP.then(r, j); },
        };
        return c;
      },
    });
    const origConsoleError = console.error;
    console.error = () => {};
    let dbFailRes;
    try {
      dbFailRes = await invokeMiddleware(verifyUser, {
        headers: { authorization: `Bearer ${googleOk.token}` },
      });
    } finally {
      console.error = origConsoleError;
      SessionModel._setClient(createMockSessionClient(sessionRows));
    }
    assert.strictEqual(dbFailRes.nextCalled, false);
    assert.strictEqual(dbFailRes.status, 500);
    console.log('PASS 8: Session database failures fail closed (500, next() never called).');

    // 9. Explicit non-production compatibility does NOT activate in production
    assert.strictEqual(isHeaderAuthAllowed(), false, 'ALLOW_HEADER_AUTH=true must NOT activate in production');
    assert.strictEqual(AuthService.isDemoAuthEnabled(), false, 'ALLOW_DEMO_AUTH=true must NOT activate in production');

    process.env.NODE_ENV = 'development';
    assert.strictEqual(isHeaderAuthAllowed(), true, 'ALLOW_HEADER_AUTH=true activates only in non-production');
    delete process.env.ALLOW_HEADER_AUTH;
    assert.strictEqual(isHeaderAuthAllowed(), false, 'Header auth is OFF by default even in development');
    console.log('PASS 9: Non-production compatibility flags never activate in production and are OFF by default.');

    // 10. Existing role-based authorization (`requireRole`, `requireAction`) remains intact
    process.env.NODE_ENV = 'production';
    const secSession = await SessionModel.createSession({
      userId: secretaryUser.id,
      email: secretaryUser.email,
      role: 'secretary',
      origin: 'CESS',
      rememberMe: true,
    });
    const stuSession = await SessionModel.createSession({
      userId: studentUser.id,
      email: studentUser.email,
      role: 'student',
      origin: 'CESS',
      rememberMe: true,
    });

    const secAuth = await invokeMiddleware(verifyUser, { headers: { authorization: `Bearer ${secSession.token}` } });
    const stuAuth = await invokeMiddleware(verifyUser, { headers: { authorization: `Bearer ${stuSession.token}` } });
    assert.strictEqual(secAuth.nextCalled, true);
    assert.strictEqual(stuAuth.nextCalled, true);

    const secRoleCheck = await invokeMiddleware(requireRole('secretary'), secAuth.req);
    const stuRoleCheck = await invokeMiddleware(requireRole('secretary'), stuAuth.req);
    assert.strictEqual(secRoleCheck.nextCalled, true, 'Secretary allowed by requireRole(secretary)');
    assert.strictEqual(stuRoleCheck.nextCalled, false);
    assert.strictEqual(stuRoleCheck.status, 403, 'Student rejected by requireRole(secretary)');

    const secActCheck = await invokeMiddleware(requireAction('manage_users'), secAuth.req);
    const stuActCheck = await invokeMiddleware(requireAction('manage_users'), stuAuth.req);
    assert.strictEqual(secActCheck.nextCalled, true, 'Secretary allowed by requireAction(manage_users)');
    assert.strictEqual(stuActCheck.nextCalled, false);
    assert.strictEqual(stuActCheck.status, 403, 'Student rejected by requireAction(manage_users)');
    console.log('PASS 10: Existing role-based authorization (requireRole & requireAction) remains intact.');

    // 11. Production rejects `x-session-token` without Authorization Bearer header (even when ALLOW_HEADER_AUTH=true)
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_HEADER_AUTH = 'true';
    const prodXSessionRes = await invokeMiddleware(verifyUser, {
      headers: { 'x-session-token': secSession.token },
    });
    assert.strictEqual(prodXSessionRes.nextCalled, false, 'Production must reject x-session-token without Bearer');
    assert.strictEqual(prodXSessionRes.status, 401);

    // Production logout controller must NOT accept x-session-token without Bearer
    let prodLogoutBody = null;
    await AuthController.logout(
      { headers: { 'x-session-token': secSession.token }, user: secretaryUser },
      { json(b) { prodLogoutBody = b; } },
      (err) => { throw err; }
    );
    assert.strictEqual(prodLogoutBody.success, true);
    // Because x-session-token was ignored in production, secSession must NOT have been revoked by x-session-token alone
    const stillValidAfterXHeader = await SessionModel.validateSession(secSession.token);
    assert.strictEqual(stillValidAfterXHeader.valid, true, 'Production logout must ignore x-session-token');

    // Production logout WITH Authorization: Bearer DOES revoke the session
    await AuthController.logout(
      { headers: { authorization: `Bearer ${secSession.token}` }, user: secretaryUser },
      { json(b) { prodLogoutBody = b; } },
      (err) => { throw err; }
    );
    const revokedAfterBearerLogout = await SessionModel.validateSession(secSession.token);
    assert.strictEqual(revokedAfterBearerLogout.valid, false, 'Production logout with Bearer token must revoke session');
    console.log('PASS 11: Production rejects x-session-token (even with ALLOW_HEADER_AUTH=true) and logout requires Bearer.');

    // 12. Non-production `x-session-token` works ONLY when ALLOW_HEADER_AUTH=true (rejected when unset)
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_HEADER_AUTH;
    const devNoFlagRes = await invokeMiddleware(verifyUser, {
      headers: { 'x-session-token': stuSession.token },
    });
    assert.strictEqual(devNoFlagRes.nextCalled, false, 'Non-production without ALLOW_HEADER_AUTH must reject x-session-token');
    assert.strictEqual(devNoFlagRes.status, 401);

    process.env.ALLOW_HEADER_AUTH = 'true';
    const devWithFlagRes = await invokeMiddleware(verifyUser, {
      headers: { 'x-session-token': stuSession.token },
    });
    assert.strictEqual(devWithFlagRes.nextCalled, true, 'Non-production with ALLOW_HEADER_AUTH=true allows legacy x-session-token');
    assert.strictEqual(devWithFlagRes.req.user.email, studentUser.email);
    console.log('PASS 12: Non-production x-session-token compatibility works ONLY when ALLOW_HEADER_AUTH=true.');

    // =========================================================================
    // GET /api/auth/directory ENDPOINT TESTS (13-19, full Express + middleware)
    // =========================================================================
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_HEADER_AUTH;
    delete process.env.ALLOW_DEMO_AUTH;

    const facultyUser = {
      id: crypto.randomUUID(),
      email: 'faculty@msunaawan.edu.ph',
      name: 'Prof. Elena Cruz',
      role: 'faculty',
      origin: 'CESS',
      department: 'Department of Education',
      position: 'Assistant Professor',
      active: true,
      is_whitelisted: true,
      account_status: 'Active',
      password_hash: 'internal-hash-must-not-leak',
      session_token: 'sess_internal_must_not_leak',
    };
    const inactiveFaculty = {
      id: crypto.randomUUID(),
      email: 'inactive.faculty@msunaawan.edu.ph',
      name: 'Prof. Inactive Member',
      role: 'faculty',
      origin: 'CESS',
      department: 'Department of Education',
      position: 'Instructor',
      active: false,
      is_whitelisted: false,
      account_status: 'Inactive',
      password_hash: 'internal-hash-must-not-leak',
    };
    const inactiveStudent = {
      id: crypto.randomUUID(),
      email: 'inactive.student@msunaawan.edu.ph',
      name: 'Inactive Student',
      role: 'student',
      origin: 'CESS',
      department: 'BSEd English',
      position: 'Student',
      active: false,
      is_whitelisted: false,
      account_status: 'Inactive',
    };
    const directoryFixture = [
      { ...studentUser, position: 'Student', password_hash: 'hash-student', internal_secret: 'nope' },
      { ...secretaryUser, position: 'College Secretary', password_hash: 'hash-sec', session_token: 'tok-sec' },
      facultyUser,
      inactiveFaculty,
      inactiveStudent,
    ];

    UserModel.findById = async (id) => directoryFixture.find((u) => u.id === id) || null;
    UserModel.findAll = async () => directoryFixture.map((u) => ({ ...u }));

    const dirSecSession = await SessionModel.createSession({
      userId: secretaryUser.id,
      email: secretaryUser.email,
      role: 'secretary',
      origin: 'CESS',
      rememberMe: true,
    });
    const dirFacSession = await SessionModel.createSession({
      userId: facultyUser.id,
      email: facultyUser.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: true,
    });
    const dirStuSession = await SessionModel.createSession({
      userId: studentUser.id,
      email: studentUser.email,
      role: 'student',
      origin: 'CESS',
      rememberMe: true,
    });

    const dirServer = http.createServer(app);
    await new Promise((resolve) => dirServer.listen(0, '127.0.0.1', resolve));
    const dirBaseUrl = `http://127.0.0.1:${dirServer.address().port}`;
    try {
      // 13. Unauthenticated request (and spoofed identity header) returns 401
      const unauthDirRes = await fetch(`${dirBaseUrl}/api/auth/directory`);
      assert.strictEqual(unauthDirRes.status, 401, 'Unauthenticated GET /api/auth/directory must return 401');

      const spoofedDirRes = await fetch(`${dirBaseUrl}/api/auth/directory`, {
        headers: { 'x-user-email': secretaryUser.email },
      });
      assert.strictEqual(spoofedDirRes.status, 401, 'Spoofed x-user-email without Bearer must return 401');
      console.log('PASS 13: Unauthenticated and spoofed-header GET /api/auth/directory requests return 401.');

      // 14. Authenticated non-secretary receives active institutional users
      const facDirRes = await fetch(`${dirBaseUrl}/api/auth/directory`, {
        headers: { Authorization: `Bearer ${dirFacSession.token}` },
      });
      assert.strictEqual(facDirRes.status, 200, 'Authenticated faculty must receive 200');
      const facDirBody = await facDirRes.json();
      assert(Array.isArray(facDirBody.users), 'Response must contain users array');
      const facDirIds = facDirBody.users.map((u) => u.id);
      assert(facDirIds.includes(secretaryUser.id), 'Non-secretary directory must include active secretary');
      assert(facDirIds.includes(facultyUser.id), 'Non-secretary directory must include active faculty');
      console.log('PASS 14: Authenticated non-secretary receives active institutional users (200).');

      // 15. Student accounts are excluded for non-secretary roles (faculty & student callers)
      assert(!facDirBody.users.some((u) => u.role === 'student'), 'Faculty directory must exclude students');
      const stuDirRes = await fetch(`${dirBaseUrl}/api/auth/directory`, {
        headers: { Authorization: `Bearer ${dirStuSession.token}` },
      });
      assert.strictEqual(stuDirRes.status, 200);
      const stuDirBody = await stuDirRes.json();
      assert(!stuDirBody.users.some((u) => u.role === 'student'), 'Student directory must exclude student accounts');
      assert.strictEqual(stuDirBody.users.length, 2, 'Non-secretary roles see only active non-student accounts');
      console.log('PASS 15: Student accounts are excluded for non-secretary roles.');

      // 16. Secretary receives active student and non-student accounts
      const secDirRes = await fetch(`${dirBaseUrl}/api/auth/directory`, {
        headers: { Authorization: `Bearer ${dirSecSession.token}` },
      });
      assert.strictEqual(secDirRes.status, 200, 'Authenticated secretary must receive 200');
      const secDirBody = await secDirRes.json();
      const secDirIds = secDirBody.users.map((u) => u.id);
      assert(secDirIds.includes(studentUser.id), 'Secretary directory must include active student');
      assert(secDirIds.includes(facultyUser.id), 'Secretary directory must include active faculty');
      assert(secDirIds.includes(secretaryUser.id), 'Secretary directory must include active secretary');
      assert.strictEqual(secDirBody.users.length, 3, 'Secretary sees all 3 active accounts');
      console.log('PASS 16: Secretary receives active student and non-student accounts.');

      // 17. Inactive accounts are always excluded (for both secretary and non-secretary)
      for (const body of [facDirBody, stuDirBody, secDirBody]) {
        assert(body.users.every((u) => u.active === true), 'All returned directory users must be active');
        assert(!body.users.some((u) => u.id === inactiveFaculty.id), 'Inactive faculty must always be excluded');
        assert(!body.users.some((u) => u.id === inactiveStudent.id), 'Inactive student must always be excluded');
      }
      console.log('PASS 17: Inactive accounts are always excluded for all roles.');

      // 18. Response contains ONLY the exact eight approved fields
      const expectedKeys = ['active', 'department', 'email', 'id', 'name', 'origin', 'position', 'role'];
      for (const body of [facDirBody, secDirBody]) {
        assert.deepStrictEqual(Object.keys(body), ['users'], 'Top-level response must contain only { users }');
        for (const u of body.users) {
          assert.deepStrictEqual(
            Object.keys(u).sort(),
            expectedKeys,
            'Directory user object must contain strictly the 8 approved fields'
          );
          assert.strictEqual(u.password_hash, undefined);
          assert.strictEqual(u.session_token, undefined);
          assert.strictEqual(u.is_whitelisted, undefined);
          assert.strictEqual(u.account_status, undefined);
        }
      }
      console.log('PASS 18: Response contains strictly the 8 approved fields with no internal fields exposed.');

      // 19. Database errors are forwarded via next(err) to the global error handler
      UserModel.findAll = async () => {
        throw new Error('Simulated directory database failure');
      };
      const dbErrRes = await fetch(`${dirBaseUrl}/api/auth/directory`, {
        headers: { Authorization: `Bearer ${dirSecSession.token}` },
      });
      assert.strictEqual(dbErrRes.status, 500, 'Database failure must be forwarded to global error handler (500)');
      const dbErrBody = await dbErrRes.json();
      assert.strictEqual(typeof dbErrBody.error, 'string', 'Error handler must return JSON error message');
      assert(
        dbErrBody.error.includes('Simulated directory database failure'),
        'Global error handler must receive the forwarded error'
      );
      console.log('PASS 19: Database errors on GET /api/auth/directory are forwarded to the global error handler (500).');
    } finally {
      await new Promise((resolve) => dirServer.close(resolve));
    }

    console.log('\nALL 19 GOOGLE OAUTH, HEADER AUTH & DIRECTORY HARDENING TESTS PASSED!');
  } finally {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    UserModel.findByEmail = origFindByEmail;
    UserModel.findById = origFindById;
    UserModel.findAll = origFindAll;
    supabase.auth.getUser = origGetUser;
    SessionModel._resetClient();
  }
}

runTests().catch((err) => {
  console.error('PHASE 4.3C SECURITY TEST FAILURE:', err);
  process.exit(1);
});
