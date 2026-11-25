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
 *  7. Backend Vercel configuration (`backend/vercel.json`) and Express serverless export (`backend/server.js`) are valid.
 *  8. Strict CORS policy permits official Frontend Production & Preview aliases and blocks untrusted origins.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
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
        update(p) { state.op = 'update'; state.payload = p; return builder; },
        eq() { return builder; },
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
  const origCreateAuthClient = supabase.createAuthClient;
  const origSharedSignIn = supabase.auth.signInWithPassword;
  const origUpdateUser = supabase.auth.admin.updateUserById;

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
  let sharedSignInCalls = 0;
  const createdAuthClients = [];
  const REAL_PASSWORD = 'RealSupabasePassword#2026!';

  // Guard: shared privileged DB client's signInWithPassword must NEVER be called
  supabase.auth.signInWithPassword = async () => {
    sharedSignInCalls++;
    throw new Error('BUG: signInWithPassword called on shared privileged DB client!');
  };

  let mockAuthHandler = async ({ email, password }) => {
    signInCalls++;
    if (password === REAL_PASSWORD) {
      const u = email === secretaryUser.email ? secretaryUser : studentUser;
      return { data: { user: { id: u.id, email: u.email } }, error: null };
    }
    return { data: { user: null }, error: { message: 'Invalid login credentials' } };
  };

  supabase.createAuthClient = () => {
    const client = {
      _id: createdAuthClients.length + 1,
      auth: {
        signInWithPassword: (...args) => mockAuthHandler(...args),
      },
    };
    createdAuthClients.push(client);
    return client;
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
    mockAuthHandler = async () => {
      throw new Error('ECONNREFUSED: Supabase Auth unreachable');
    };
    await assert.rejects(
      () => AuthService.loginUser(studentUser.email, REAL_PASSWORD),
      (err) => err.status === 503
    );
    assert.strictEqual(mockSessionDb._rows.length, beforeRows, 'No session may be created when Supabase Auth is unavailable');
    console.log('PASS 5: Supabase authentication errors/outages fail closed (503, no session issued).');

    // Restore mock signInWithPassword for Test 6
    mockAuthHandler = async () => ({
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

    // 7. Verify backend/vercel.json and Express serverless entry point (`backend/server.js`)
    const vercelConfigPath = path.resolve(__dirname, '../vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    assert.strictEqual(vercelConfig.framework, 'express', 'backend/vercel.json must configure the Express framework');
    assert.strictEqual(vercelConfig.installCommand, 'npm install', 'backend/vercel.json must install backend dependencies');

    const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    assert(
      serverSource.includes('if (require.main === module)'),
      'backend/server.js must guard app.listen behind require.main === module for serverless compatibility'
    );
    const app = require('../server');
    assert.strictEqual(typeof app, 'function', 'backend/server.js must export the Express app');
    console.log('PASS 7: backend/vercel.json and Express serverless export verified.');

    // 8. Verify strict CORS policy permits official Frontend Production & Preview aliases and blocks untrusted origins
    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${testServer.address().port}`;
      const allowedTestOrigins = [
        'https://cess-docu-flow.vercel.app',
        'https://cess-docu-flow-git-frontend-timpla-10.vercel.app',
        'https://cess-docu-flow-git-integration-cicd-vercel-timpla-10.vercel.app',
      ];
      for (const origin of allowedTestOrigins) {
        const preflight = await fetch(`${baseUrl}/api/health`, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization,Content-Type',
          },
        });
        assert.strictEqual(preflight.status, 204, `CORS preflight must succeed for ${origin}`);
        assert.strictEqual(
          preflight.headers.get('access-control-allow-origin'),
          origin,
          `Access-Control-Allow-Origin must reflect ${origin}`
        );
      }

      const blockedRes = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil.example.com' },
      });
      assert.strictEqual(
        blockedRes.headers.get('access-control-allow-origin'),
        null,
        'Untrusted origin must not receive Access-Control-Allow-Origin'
      );
      assert(blockedRes.status >= 400, 'Untrusted origin must be rejected by strict CORS middleware');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
    console.log('PASS 8: Strict CORS allows Frontend Production & Preview aliases and blocks untrusted origins.');

    // 9. Verify loginUser() uses isolated auth client and NEVER mutates shared privileged DB client
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;
    const clientsBefore = createdAuthClients.length;
    mockAuthHandler = async ({ email, password }) => {
      signInCalls++;
      if (password === REAL_PASSWORD) {
        const u = email === secretaryUser.email ? secretaryUser : studentUser;
        return { data: { user: { id: u.id, email: u.email } }, error: null };
      }
      return { data: { user: null }, error: { message: 'Invalid login credentials' } };
    };
    const isolatedLoginRes = await AuthService.loginUser(studentUser.email, REAL_PASSWORD);
    assert.strictEqual(isolatedLoginRes.verified, true);
    assert.strictEqual(createdAuthClients.length, clientsBefore + 1, 'loginUser must allocate a disposable isolated auth client');
    assert.strictEqual(sharedSignInCalls, 0, 'Shared privileged DB client signInWithPassword must NEVER be called');
    console.log('PASS 9: loginUser uses isolated auth client; shared privileged DB client remains untouched.');

    // 10. Verify changePassword() uses isolated auth client and NEVER mutates shared DB client
    const EmailService = require('../services/emailService');
    const origSendChanged = EmailService.sendPasswordChangedAlert;
    EmailService.sendPasswordChangedAlert = async () => ({ success: true });
    supabase.auth.admin.updateUserById = async () => ({ data: { user: { id: studentUser.id } }, error: null });
    const clientsBeforeChange = createdAuthClients.length;
    try {
      const chRes = await AuthService.changePassword(studentUser, {
        currentPassword: REAL_PASSWORD,
        newPassword: 'AnotherStrongPassword#2027',
        confirmPassword: 'AnotherStrongPassword#2027',
      });
      assert.strictEqual(chRes.success, true);
      assert.strictEqual(createdAuthClients.length, clientsBeforeChange + 1, 'changePassword must use an isolated auth client');
      assert.strictEqual(sharedSignInCalls, 0, 'Shared DB client must NEVER be called by changePassword');
    } finally {
      EmailService.sendPasswordChangedAlert = origSendChanged;
    }
    console.log('PASS 10: changePassword uses isolated auth client; shared DB client remains untouched.');

    // 11. Two concurrent logins use separate disposable auth clients and cannot mutate each other or SessionModel's DB client
    const clientsBeforeConcurrent = createdAuthClients.length;
    const rowsBeforeConcurrent = mockSessionDb._rows.length;
    const [cLogin1, cLogin2] = await Promise.all([
      AuthService.loginUser(studentUser.email, REAL_PASSWORD),
      AuthService.loginUser(secretaryUser.email, REAL_PASSWORD),
    ]);
    assert.strictEqual(cLogin1.verified, true);
    assert.strictEqual(cLogin2.verified, true);
    assert.strictEqual(createdAuthClients.length, clientsBeforeConcurrent + 2, 'Each concurrent login must get its own isolated auth client');
    assert.notStrictEqual(
      createdAuthClients[clientsBeforeConcurrent],
      createdAuthClients[clientsBeforeConcurrent + 1],
      'Concurrent logins must not share the same auth client instance'
    );
    assert.strictEqual(mockSessionDb._rows.length, rowsBeforeConcurrent + 2, 'SessionModel must persist both sessions on privileged client');
    assert.strictEqual(sharedSignInCalls, 0);
    console.log('PASS 11: Concurrent logins use separate disposable auth clients without mutating shared DB client.');

    // 12. Real createAuthClient() refuses to fall back to SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY when public key is missing
    const origPub = process.env.SUPABASE_PUBLISHABLE_KEY;
    const origAnon = process.env.SUPABASE_ANON_KEY;
    const origSecret = process.env.SUPABASE_SECRET_KEY;
    const origSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      delete process.env.SUPABASE_PUBLISHABLE_KEY;
      delete process.env.SUPABASE_ANON_KEY;
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_should_never_be_used_for_auth_client';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_should_never_be_used_for_auth_client';
      assert.throws(
        () => origCreateAuthClient(),
        /SUPABASE_PUBLISHABLE_KEY \/ SUPABASE_ANON_KEY/,
        'createAuthClient must fail closed when public/anon key is missing instead of falling back to service-role key'
      );
    } finally {
      if (origPub === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = origPub;
      if (origAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = origAnon;
      if (origSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = origSecret;
      if (origSvc === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = origSvc;
    }
    console.log('PASS 12: createAuthClient fails closed when public/anon key is missing (never falls back to service-role key).');

    console.log('\nALL 12 AUTH SECURITY HARDENING TESTS PASSED!');
  } finally {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origAllowDemo === undefined) delete process.env.ALLOW_DEMO_AUTH;
    else process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    UserModel.findByEmail = origFindByEmail;
    supabase.createAuthClient = origCreateAuthClient;
    supabase.auth.signInWithPassword = origSharedSignIn;
    supabase.auth.admin.updateUserById = origUpdateUser;
    SessionModel._resetClient();
  }
}

runTests().catch((err) => {
  console.error('AUTH SECURITY TEST FAILURE:', err);
  process.exit(1);
});
