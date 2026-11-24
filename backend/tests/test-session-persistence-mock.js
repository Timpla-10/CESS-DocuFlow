/**
 * Isolated Mock-Based Unit & Concurrency Test Suite for Persistent SessionModel (PB-04 / Vercel Serverless)
 *
 * Uses an in-memory mock Supabase query builder — NEVER connects to production Supabase.
 * Verifies:
 *  1. Opaque `sess_` token creation & SHA-256 hash-only storage (no raw tokens stored)
 *  2. 7-day Remember-Me and 1-day Non-Remember-Me TTL policies
 *  3. Session validation & rolling `last_active_at` update
 *  4. Absolute TTL expiration (1-day & 7-day)
 *  5. 7-day inactivity expiration & automatic revocation
 *  6. Single-session logout revocation & idempotency
 *  7. Cascade revokeAllUserSessions across multiple parallel sessions
 *  8. Invalid, empty, and revoked token rejection
 *  9. Concurrent validation vs revocation race safety (revoked session never reactivated)
 * 10. Serverless cold-start / module reload persistence (require.cache reset)
 * 11. Production guard on SessionModel.clear()
 * 12. verifyUser middleware integration with persistent Bearer `sess_` tokens
 */
const assert = require('assert');
const crypto = require('crypto');

// Ensure placeholder env so config/database loads cleanly without real credentials
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.invalid';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

function createMockSupabase(backingRows = []) {
  const rows = backingRows;

  function matchesFilters(row, filters) {
    return filters.every((f) => {
      const val = row[f.col];
      if (f.op === 'eq') return val === f.val;
      if (f.op === 'neq') return val !== f.val;
      if (f.op === 'gt') return new Date(val).getTime() > new Date(f.val).getTime();
      return false;
    });
  }

  return {
    _rows: rows,
    from(table) {
      assert.strictEqual(table, 'user_session', 'Mock expects user_session table');
      const state = {
        op: null,
        payload: null,
        filters: [],
        expectSingle: false,
        expectMaybeSingle: false,
      };

      const execute = async () => {
        if (state.op === 'insert') {
          const copy = { ...state.payload };
          if (rows.some((r) => r.token_hash === copy.token_hash || r.session_id === copy.session_id)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          }
          rows.push(copy);
          return { data: state.expectSingle ? { ...copy } : [{ ...copy }], error: null };
        }

        if (state.op === 'select') {
          const matched = rows.filter((r) => matchesFilters(r, state.filters)).map((r) => ({ ...r }));
          if (state.expectMaybeSingle) return { data: matched[0] || null, error: null };
          if (state.expectSingle) {
            return matched[0]
              ? { data: matched[0], error: null }
              : { data: null, error: { message: 'Row not found' } };
          }
          return { data: matched, error: null };
        }

        if (state.op === 'update') {
          const updated = [];
          for (const r of rows) {
            if (matchesFilters(r, state.filters)) {
              Object.assign(r, state.payload);
              updated.push({ ...r });
            }
          }
          if (state.expectMaybeSingle) return { data: updated[0] || null, error: null };
          if (state.expectSingle) {
            return updated[0]
              ? { data: updated[0], error: null }
              : { data: null, error: { message: 'Row not found' } };
          }
          return { data: updated, error: null };
        }

        if (state.op === 'delete') {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (matchesFilters(rows[i], state.filters)) rows.splice(i, 1);
          }
          return { data: null, error: null };
        }

        return { data: null, error: { message: 'Unsupported op' } };
      };

      const builder = {
        insert(payload) {
          state.op = 'insert';
          state.payload = payload;
          return builder;
        },
        select() {
          if (!state.op) state.op = 'select';
          return builder;
        },
        update(payload) {
          state.op = 'update';
          state.payload = payload;
          return builder;
        },
        delete() {
          state.op = 'delete';
          return builder;
        },
        eq(col, val) {
          state.filters.push({ op: 'eq', col, val });
          return builder;
        },
        neq(col, val) {
          state.filters.push({ op: 'neq', col, val });
          return builder;
        },
        gt(col, val) {
          state.filters.push({ op: 'gt', col, val });
          return builder;
        },
        single() {
          state.expectSingle = true;
          return execute();
        },
        maybeSingle() {
          state.expectMaybeSingle = true;
          return execute();
        },
        then(resolve, reject) {
          return execute().then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

async function runTests() {
  const sharedPersistentRows = [];
  const mockDb = createMockSupabase(sharedPersistentRows);

  const SessionModel = require('../models/sessionModel');
  SessionModel._setClient(mockDb);

  const testUserId = crypto.randomUUID();

  // 1. Create Remember-Me (7-day) & Non-Remember-Me (1-day) sessions + verify hash-only storage
  const s7 = await SessionModel.createSession({
    userId: testUserId,
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    rememberMe: true,
  });
  const s1 = await SessionModel.createSession({
    userId: testUserId,
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    rememberMe: false,
  });

  assert(s7.token.startsWith('sess_'), 'Token must have sess_ prefix');
  assert.strictEqual(s7.ttlMs, SessionModel.SEVEN_DAYS_MS, 'Remember-me TTL must be 7 days');
  assert.strictEqual(s1.ttlMs, SessionModel.ONE_DAY_MS, 'Non-remember-me TTL must be 1 day');

  // Verify raw tokens NEVER appear in persisted DB rows
  const serializedDb = JSON.stringify(sharedPersistentRows);
  assert(!serializedDb.includes(s7.token), 'Raw bearer token must NEVER be stored in PostgreSQL');
  assert(!serializedDb.includes(s1.token), 'Raw bearer token must NEVER be stored in PostgreSQL');
  assert(serializedDb.includes(SessionModel.hashToken(s7.token)), 'SHA-256 token hash must be stored');
  console.log('PASS 1: Session creation, 7-day/1-day TTLs, and SHA-256 hash-only storage verified.');

  // 2. Validate session & rolling activity touch
  const beforeTouch = (await SessionModel.getSession(s7.token)).lastActiveAt;
  await new Promise((r) => setTimeout(r, 20));
  const v7 = await SessionModel.validateSession(s7.token);
  assert.strictEqual(v7.valid, true, 'Active session must validate');
  assert(new Date(v7.session.lastActiveAt).getTime() >= new Date(beforeTouch).getTime(), 'lastActiveAt must advance');
  console.log('PASS 2: Session validation and rolling activity touch verified.');

  // 3. Server restart / Vercel cold-start persistence test (wipe require.cache & reload SessionModel)
  const modelPath = require.resolve('../models/sessionModel');
  delete require.cache[modelPath];
  const ReloadedSessionModel = require('../models/sessionModel');
  ReloadedSessionModel._setClient(createMockSupabase(sharedPersistentRows));
  const afterRestart = await ReloadedSessionModel.validateSession(s7.token);
  assert.strictEqual(afterRestart.valid, true, 'Session must survive cold start / server restart');
  assert.strictEqual(afterRestart.session.userId, testUserId);
  console.log('PASS 3: Serverless cold-start / restart persistence verified.');

  // 4. Absolute expiration (1-day expired)
  const s1Row = sharedPersistentRows.find((r) => r.token_hash === ReloadedSessionModel.hashToken(s1.token));
  s1Row.expires_at = new Date(Date.now() - 1000).toISOString();
  const expiredRes = await ReloadedSessionModel.validateSession(s1.token);
  assert.strictEqual(expiredRes.valid, false);
  assert.strictEqual(expiredRes.status, 401);
  assert(expiredRes.reason.toLowerCase().includes('expired'));
  assert.strictEqual(s1Row.is_revoked, true, 'Expired session must be marked revoked');
  console.log('PASS 4: Absolute expiration enforcement verified.');

  // 5. 7-day inactivity expiration
  const sIdle = await ReloadedSessionModel.createSession({
    userId: testUserId,
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    rememberMe: true,
  });
  const idleRow = sharedPersistentRows.find((r) => r.token_hash === ReloadedSessionModel.hashToken(sIdle.token));
  idleRow.last_active_at = new Date(Date.now() - (ReloadedSessionModel.SEVEN_DAYS_MS + 1000)).toISOString();
  const idleRes = await ReloadedSessionModel.validateSession(sIdle.token);
  assert.strictEqual(idleRes.valid, false);
  assert.strictEqual(idleRes.status, 401);
  assert(idleRes.reason.toLowerCase().includes('inactivity'));
  assert.strictEqual(idleRow.is_revoked, true);
  console.log('PASS 5: 7-day inactivity expiration verified.');

  // 6. Logout revocation & idempotency
  const revokedFirst = await ReloadedSessionModel.revokeSession(s7.token);
  assert.strictEqual(revokedFirst, true);
  const revokedSecond = await ReloadedSessionModel.revokeSession(s7.token);
  assert.strictEqual(revokedSecond, false, 'Second revoke should be idempotent');
  const postRevoke = await ReloadedSessionModel.validateSession(s7.token);
  assert.strictEqual(postRevoke.valid, false);
  assert.strictEqual(postRevoke.status, 401);
  console.log('PASS 6: Logout revocation and subsequent 401 rejection verified.');

  // 7. Cascade revokeAllUserSessions
  const p1 = await ReloadedSessionModel.createSession({ userId: testUserId, email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', rememberMe: true });
  const p2 = await ReloadedSessionModel.createSession({ userId: testUserId, email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', rememberMe: false });
  const count = await ReloadedSessionModel.revokeAllUserSessions(testUserId);
  assert.strictEqual(count, 2);
  assert.strictEqual((await ReloadedSessionModel.validateSession(p1.token)).valid, false);
  assert.strictEqual((await ReloadedSessionModel.validateSession(p2.token)).valid, false);
  console.log('PASS 7: Cascade revokeAllUserSessions verified.');

  // 8. Invalid & empty token rejection
  assert.strictEqual((await ReloadedSessionModel.validateSession('')).valid, false);
  assert.strictEqual((await ReloadedSessionModel.validateSession('sess_forged_invalid_token')).valid, false);
  console.log('PASS 8: Invalid and empty token rejection verified.');

  // 9. Concurrent validation vs revocation race test
  const sRace = await ReloadedSessionModel.createSession({ userId: testUserId, email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', rememberMe: true });
  const [raceVal, raceRev] = await Promise.all([
    ReloadedSessionModel.validateSession(sRace.token),
    ReloadedSessionModel.revokeSession(sRace.token),
  ]);
  assert.strictEqual(raceRev, true, 'Revocation must succeed');
  const finalRow = sharedPersistentRows.find((r) => r.token_hash === ReloadedSessionModel.hashToken(sRace.token));
  assert.strictEqual(finalRow.is_revoked, true, 'Concurrent validation must NEVER reactivate a revoked session');
  assert.strictEqual((await ReloadedSessionModel.validateSession(sRace.token)).valid, false, 'Subsequent validation must fail');
  console.log(`PASS 9: Concurrent validation/revocation race safety verified (concurrent validate=${raceVal.valid}, final is_revoked=${finalRow.is_revoked}).`);

  // 10. Production guard on clear()
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let clearBlocked = false;
  try {
    await ReloadedSessionModel.clear();
  } catch (err) {
    clearBlocked = err.message.includes('disabled in production');
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
  assert.strictEqual(clearBlocked, true, 'clear() must be blocked in production');
  console.log('PASS 10: Production guard on SessionModel.clear() verified.');

  // 11. verifyUser middleware integration with mocked UserModel + persistent SessionModel
  const sMw = await ReloadedSessionModel.createSession({ userId: testUserId, email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', rememberMe: true });
  const UserModel = require('../models/userModel');
  const origFindById = UserModel.findById;
  UserModel.findById = async (id) =>
    id === testUserId
      ? { id: testUserId, email: 'faculty@msunaawan.edu.ph', name: 'Prof. Test', role: 'faculty', origin: 'CESS', active: true }
      : null;

  // Reload authMiddleware so it picks up ReloadedSessionModel
  delete require.cache[require.resolve('../middleware/authMiddleware')];
  const { verifyUser } = require('../middleware/authMiddleware');

  const callVerify = (authHeader) =>
    new Promise((resolve) => {
      const req = { headers: authHeader ? { authorization: authHeader } : {} };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body, nextCalled: false }); },
      };
      verifyUser(req, res, () => resolve({ status: 200, user: req.user, nextCalled: true }));
    });

  try {
    const okRes = await callVerify(`Bearer ${sMw.token}`);
    assert.strictEqual(okRes.nextCalled, true, 'Valid persistent token must pass verifyUser');
    assert.strictEqual(okRes.user.email, 'faculty@msunaawan.edu.ph');

    await ReloadedSessionModel.revokeSession(sMw.token);
    const revRes = await callVerify(`Bearer ${sMw.token}`);
    assert.strictEqual(revRes.nextCalled, false);
    assert.strictEqual(revRes.status, 401);

    const badRes = await callVerify('Bearer sess_unknown_token');
    assert.strictEqual(badRes.nextCalled, false);
    assert.strictEqual(badRes.status, 401);
  } finally {
    UserModel.findById = origFindById;
  }
  console.log('PASS 11: verifyUser middleware integration verified (valid=200, revoked=401, invalid=401).');

  // 12. Database-error fail-closed test (validateSession throws -> verifyUser returns 500, next() never called)
  const failingMockDb = {
    from() {
      const errResult = Promise.resolve({ data: null, error: { message: 'connection refused' } });
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gt() { return chain; },
        update() { return chain; },
        maybeSingle() { return errResult; },
        single() { return errResult; },
        then(resolve, reject) { return errResult.then(resolve, reject); },
      };
      return chain;
    },
  };

  const sDbErr = await ReloadedSessionModel.createSession({
    userId: testUserId,
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    rememberMe: true,
  });
  ReloadedSessionModel._setClient(failingMockDb);

  let threwOnDbErr = false;
  try {
    await ReloadedSessionModel.validateSession(sDbErr.token);
  } catch (err) {
    threwOnDbErr = err.message.includes('connection refused');
  }
  assert.strictEqual(threwOnDbErr, true, 'validateSession must throw (fail closed) on DB error');

  const origConsoleError = console.error;
  console.error = () => {};
  let dbErrMwRes;
  try {
    dbErrMwRes = await callVerify(`Bearer ${sDbErr.token}`);
  } finally {
    console.error = origConsoleError;
    ReloadedSessionModel._setClient(createMockSupabase(sharedPersistentRows));
  }
  assert.strictEqual(dbErrMwRes.nextCalled, false, 'verifyUser must NEVER call next() on DB error');
  assert.strictEqual(dbErrMwRes.status, 500, 'verifyUser must respond with HTTP 500 on DB error');
  assert.strictEqual(dbErrMwRes.user, undefined, 'User must not be authenticated on DB error');
  console.log('PASS 12: Database-error fail-closed verified (validateSession throws, verifyUser returns 500, next() not called).');

  // 13 & 14. Password reset & password change cascade session revocation (isolated mocks, zero live Supabase/SMTP)
  delete require.cache[require.resolve('../services/authService')];
  const AuthService = require('../services/authService');
  const supabase = require('../config/database');
  const EmailService = require('../services/emailService');

  const mockProfile = {
    id: testUserId,
    email: 'faculty@msunaawan.edu.ph',
    name: 'Prof. Test',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary Education',
    active: true,
    is_whitelisted: true,
    isWhitelisted: true,
    account_status: 'Active',
  };

  const origFindByEmail = UserModel.findByEmail;
  const origResetEmail = supabase.auth.resetPasswordForEmail;
  const origUpdateUser = supabase.auth.admin.updateUserById;
  const origSendReset = EmailService.sendPasswordResetEmail;
  const origSendChanged = EmailService.sendPasswordChangedAlert;

  UserModel.findByEmail = async (email) =>
    String(email).toLowerCase() === mockProfile.email ? mockProfile : null;
  supabase.auth.resetPasswordForEmail = async () => ({ data: {}, error: null });
  supabase.auth.admin.updateUserById = async () => ({ data: { user: { id: testUserId } }, error: null });
  EmailService.sendPasswordResetEmail = async () => ({ success: true });
  EmailService.sendPasswordChangedAlert = async () => ({ success: true });

  try {
    // 13. Password reset revokes all active sessions for the user
    const rSess1 = await ReloadedSessionModel.createSession({
      userId: testUserId,
      email: mockProfile.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: true,
    });
    const rSess2 = await ReloadedSessionModel.createSession({
      userId: testUserId,
      email: mockProfile.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: false,
    });
    assert.strictEqual((await ReloadedSessionModel.validateSession(rSess1.token)).valid, true);
    assert.strictEqual((await ReloadedSessionModel.validateSession(rSess2.token)).valid, true);

    const resetReq = await AuthService.requestPasswordReset(mockProfile.email);
    const resetConfirm = await AuthService.confirmPasswordReset({
      token: resetReq.resetToken,
      email: mockProfile.email,
      newPassword: 'NewSecurePassword#2026',
      confirmPassword: 'NewSecurePassword#2026',
    });
    assert.strictEqual(resetConfirm.success, true, 'confirmPasswordReset must succeed');
    assert.strictEqual((await ReloadedSessionModel.validateSession(rSess1.token)).valid, false, 'Session 1 must be revoked after password reset');
    assert.strictEqual((await ReloadedSessionModel.validateSession(rSess2.token)).valid, false, 'Session 2 must be revoked after password reset');
    console.log('PASS 13: Password reset cascade session revocation verified.');

    // 14. Password change revokes all active sessions (including current session)
    const cSess1 = await ReloadedSessionModel.createSession({
      userId: testUserId,
      email: mockProfile.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: true,
    });
    const cSess2 = await ReloadedSessionModel.createSession({
      userId: testUserId,
      email: mockProfile.email,
      role: 'faculty',
      origin: 'CESS',
      rememberMe: false,
    });
    assert.strictEqual((await ReloadedSessionModel.validateSession(cSess1.token)).valid, true);
    assert.strictEqual((await ReloadedSessionModel.validateSession(cSess2.token)).valid, true);

    const changeRes = await AuthService.changePassword(mockProfile, {
      currentPassword: 'NewSecurePassword#2026',
      newPassword: 'UpdatedPassword#2027',
      confirmPassword: 'UpdatedPassword#2027',
    });
    assert.strictEqual(changeRes.success, true, 'changePassword must succeed');
    assert.strictEqual((await ReloadedSessionModel.validateSession(cSess1.token)).valid, false, 'Current session must be revoked after password change');
    assert.strictEqual((await ReloadedSessionModel.validateSession(cSess2.token)).valid, false, 'Other session must be revoked after password change');
    console.log('PASS 14: Password change cascade session revocation verified.');
  } finally {
    UserModel.findByEmail = origFindByEmail;
    supabase.auth.resetPasswordForEmail = origResetEmail;
    supabase.auth.admin.updateUserById = origUpdateUser;
    EmailService.sendPasswordResetEmail = origSendReset;
    EmailService.sendPasswordChangedAlert = origSendChanged;
    ReloadedSessionModel._resetClient();
  }

  console.log('\nALL 14 PERSISTENT SESSION MOCK TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
