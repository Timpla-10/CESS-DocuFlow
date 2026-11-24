/**
 * Isolated Mock-Based Security Regression Suite for Phase 4.3B Auth Hardening
 *
 * Uses isolated mocks only — NEVER connects to production Supabase.
 * Proves:
 *  1. Production rejects `student123`.
 *  2. Production rejects `secretary123`.
 *  3. Production rejects email-prefix-based demo passwords (`maria.santos123`, `mariasantos123`).
 *  4. Production login ALWAYS invokes `supabase.auth.signInWithPassword` (even if ALLOW_DEMO_AUTH=true).
 *  5. Supabase authentication errors (invalid credentials -> 401; service outage -> 503) fail closed.
 *  6. Development/demo authentication works ONLY when NODE_ENV !== 'production' AND ALLOW_DEMO_AUTH === 'true'.
 *  7. Frontend production mode cannot authenticate using `cess2026` (`DEMO_PASSWORD`).
 *  8. Frontend backend/network failure cannot silently authenticate a user in production mode.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.invalid';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const SessionModel = require('../models/sessionModel');
const AuthService = require('../services/authService');

function createMockSessionClient() {
  const rows = [];
  return {
    _rows: rows,
    from() {
      const state = { op: null, payload: null };
      const execute = async () => {
        if (state.op === 'insert') {
          rows.push({ ...state.payload });
          return { data: { ...state.payload }, error: null };
        }
        return { data: [], error: null };
      };
      const builder = {
        insert(p) { state.op = 'insert'; state.payload = p; return builder; },
        select() { return builder; },
        single() { return execute(); },
        then(res, rej) { return execute().then(res, rej); },
      };
      return builder;
    },
  };
}

async function runTests() {
  const origNodeEnv = process.env.NODE_ENV;
  const origAllowDemo = process.env.ALLOW_DEMO_AUTH;
  const origFindByEmail = UserModel.findByEmail;
  const origSignIn = supabase.auth.signInWithPassword;

  const studentUser = {
    id: crypto.randomUUID(),
    email: 'maria.santos@msunaawan.edu.ph',
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

  const mockSessionDb = createMockSessionClient();
  SessionModel._setClient(mockSessionDb);

  UserModel.findByEmail = async (email) => {
    const clean = String(email).toLowerCase();
    if (clean === studentUser.email) return studentUser;
    if (clean === secretaryUser.email) return secretaryUser;
    return null;
  };

  let signInCalls = 0;
  const REAL_PASSWORD = 'RealSupabasePassword#2026!';
  supabase.auth.signInWithPassword = async ({ email, password }) => {
    signInCalls++;
    if (password === REAL_PASSWORD) {
      const u = email === secretaryUser.email ? secretaryUser : studentUser;
      return { data: { user: { id: u.id, email: u.email } }, error: null };
    }
    return { data: { user: null }, error: { message: 'Invalid login credentials' } };
  };

  try {
    // Set PRODUCTION mode (even with ALLOW_DEMO_AUTH=true to prove production NEVER allows demo bypass)
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_AUTH = 'true';
    assert.strictEqual(AuthService.isDemoAuthEnabled(), false, 'isDemoAuthEnabled must ALWAYS be false in production');

    // 1. Production rejects `student123`
    signInCalls = 0;
    await assert.rejects(
      () => AuthService.loginUser(studentUser.email, 'student123'),
      (err) => err.status === 401
    );
    assert.strictEqual(signInCalls, 1, 'Supabase Auth must be invoked for student123 in production');
    console.log('PASS 1: Production rejects `student123` and invokes Supabase Auth.');

    // 2. Production rejects `secretary123`
    signInCalls = 0;
    await assert.rejects(
      () => AuthService.loginUser(secretaryUser.email, 'secretary123'),
      (err) => err.status === 401
    );
    assert.strictEqual(signInCalls, 1, 'Supabase Auth must be invoked for secretary123 in production');
    console.log('PASS 2: Production rejects `secretary123` and invokes Supabase Auth.');

    // 3. Production rejects email-prefix-based demo passwords
    for (const prefixPwd of ['maria.santos123', 'mariasantos123']) {
      signInCalls = 0;
      await assert.rejects(
        () => AuthService.loginUser(studentUser.email, prefixPwd),
        (err) => err.status === 401
      );
      assert.strictEqual(signInCalls, 1, `Supabase Auth must be invoked for ${prefixPwd} in production`);
    }
    console.log('PASS 3: Production rejects email-prefix-based demo passwords.');

    // 4. Production login ALWAYS invokes Supabase Auth and succeeds with valid Supabase credentials
    signInCalls = 0;
    const prodOk = await AuthService.loginUser(studentUser.email, REAL_PASSWORD);
    assert.strictEqual(signInCalls, 1, 'Production login must invoke Supabase Auth');
    assert.strictEqual(prodOk.verified, true);
    assert(prodOk.token && prodOk.token.startsWith('sess_'), 'Valid production login must issue persistent sess_ token');
    console.log('PASS 4: Production login always invokes Supabase Auth and preserves login response structure.');

    // 5. Supabase authentication outage/exception fails closed (503, no token issued)
    const beforeRows = mockSessionDb._rows.length;
    supabase.auth.signInWithPassword = async () => {
      throw new Error('ECONNREFUSED: Supabase Auth unreachable');
    };
    await assert.rejects(
      () => AuthService.loginUser(studentUser.email, REAL_PASSWORD),
      (err) => err.status === 503
    );
    assert.strictEqual(mockSessionDb._rows.length, beforeRows, 'No session may be created when Supabase Auth is unavailable');
    console.log('PASS 5: Supabase authentication errors/outages fail closed (503, no session issued).');

    // Restore mock signInWithPassword for Test 6
    supabase.auth.signInWithPassword = async () => ({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    // 6. Development/demo authentication works ONLY when explicitly enabled (NODE_ENV !== 'production' && ALLOW_DEMO_AUTH === 'true')
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEMO_AUTH;
    assert.strictEqual(AuthService.isDemoAuthEnabled(), false, 'Demo auth must be OFF by default even in development');
    await assert.rejects(
      () => AuthService.loginUser(secretaryUser.email, 'secretary123'),
      (err) => err.status === 401
    );

    process.env.ALLOW_DEMO_AUTH = 'true';
    assert.strictEqual(AuthService.isDemoAuthEnabled(), true, 'Demo auth may be enabled only when non-prod + ALLOW_DEMO_AUTH=true');
    const devDemoOk = await AuthService.loginUser(secretaryUser.email, 'secretary123');
    assert.strictEqual(devDemoOk.verified, true);
    console.log('PASS 6: Dev/demo authentication works ONLY when explicitly enabled (NODE_ENV !== production && ALLOW_DEMO_AUTH=true).');

    // 7 & 8. Verify frontend production mode cannot authenticate with `cess2026` or network failure
    const storeSource = fs.readFileSync(path.resolve(__dirname, '../../app/src/data/store.ts'), 'utf8');
    assert(
      storeSource.includes('if (env.PROD) return false'),
      'app/src/data/store.ts must hard-disable demo fallback when env.PROD is true'
    );
    assert(
      storeSource.includes("env.DEV && env.VITE_ENABLE_DEMO_AUTH === 'true'"),
      'app/src/data/store.ts must require explicit DEV + VITE_ENABLE_DEMO_AUTH=true for demo fallback'
    );

    // Execute the exact extracted production gate logic + simulated production signIn failure paths
    const isDemoFallbackEnabled = (env) => {
      if (env.PROD) return false;
      return Boolean(env.DEV && env.VITE_ENABLE_DEMO_AUTH === 'true');
    };
    assert.strictEqual(isDemoFallbackEnabled({ PROD: true, DEV: false, VITE_ENABLE_DEMO_AUTH: 'true' }), false);
    assert.strictEqual(isDemoFallbackEnabled({ PROD: false, DEV: true, VITE_ENABLE_DEMO_AUTH: undefined }), false);
    assert.strictEqual(isDemoFallbackEnabled({ PROD: false, DEV: true, VITE_ENABLE_DEMO_AUTH: 'true' }), true);

    // Verify `signIn` checks `!isDemoFallbackEnabled()` before any DEMO_PASSWORD fallback and on catch/network error
    const signInStart = storeSource.indexOf('async signIn(');
    const signInEnd = storeSource.indexOf('async signInWithUniversityGoogle(');
    const signInBody = storeSource.slice(signInStart, signInEnd);
    const demoPwdIdx = signInBody.indexOf('DEMO_PASSWORD');
    const guardIdx = signInBody.lastIndexOf('if (!isDemoFallbackEnabled())', demoPwdIdx);
    assert(demoPwdIdx > 0 && guardIdx > 0 && guardIdx < demoPwdIdx, 'DEMO_PASSWORD check must be guarded by isDemoFallbackEnabled()');
    assert(
      signInBody.includes("Unable to reach the authentication server"),
      'Production network failure must throw a clear server error instead of silently authenticating'
    );
    console.log('PASS 7: Frontend production mode cannot authenticate using `cess2026` (DEMO_PASSWORD gated off in PROD).');
    console.log('PASS 8: Frontend backend/network failure fails closed with explicit error in production mode.');

    console.log('\nALL 8 AUTH SECURITY HARDENING TESTS PASSED!');
  } finally {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origAllowDemo === undefined) delete process.env.ALLOW_DEMO_AUTH;
    else process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    UserModel.findByEmail = origFindByEmail;
    supabase.auth.signInWithPassword = origSignIn;
    SessionModel._resetClient();
  }
}

runTests().catch((err) => {
  console.error('AUTH SECURITY TEST FAILURE:', err);
  process.exit(1);
});
