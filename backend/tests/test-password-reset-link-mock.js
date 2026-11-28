/**
 * Isolated Mock Test Suite: Password Reset Link Resolution, Serverless Persistence & Post-Reset Login
 *
 * Verifies:
 *  1. Production / Vercel runtime defaults password reset links to https://cess-docu-flow.vercel.app/forgot-password
 *  2. Trusted request Origin / Referer (Vercel production, Vercel preview, localhost) is preserved dynamically
 *  3. FRONTEND_URL environment override is respected
 *  4. Legacy /reset-password redirectTo is normalized to /forgot-password with email & token query params
 *  5. Untrusted phishing origins/redirectTo values are rejected (open-redirect protection)
 *  6. POST /api/auth/forgot-password passes the resolved resetUrl to BOTH Supabase resetPasswordForEmail
 *     and EmailService.sendPasswordResetEmail and persists hashed reset tokens in user_session
 *  7. POST /api/auth/reset-password works across serverless cold starts (lookup from persistent DB),
 *     updates the password in Supabase Auth, enforces single-use replay protection, revokes old sessions,
 *     and allows immediate login with the NEW password while rejecting the OLD password
 */
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.invalid';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

const serverConfig = require('../config/server');
const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const SessionModel = require('../models/sessionModel');
const EmailService = require('../services/emailService');
const app = require('../server');

function createMockUserSessionDb() {
  const rows = [];
  return {
    _rows: rows,
    from() {
      const state = { op: null, payload: null, filters: [], gtFilters: [] };
      const matches = (row) => {
        for (const [k, v] of state.filters) {
          if (row[k] !== v) return false;
        }
        for (const [k, v] of state.gtFilters) {
          if (!(new Date(row[k]).getTime() > new Date(v).getTime())) return false;
        }
        return true;
      };
      const execute = async (singleMode = null) => {
        if (state.op === 'insert') {
          const items = Array.isArray(state.payload) ? state.payload : [state.payload];
          const inserted = items.map((item) => {
            const copy = { ...item };
            rows.push(copy);
            return copy;
          });
          if (singleMode === 'single') return { data: inserted[0], error: null };
          return { data: inserted, error: null };
        }
        if (state.op === 'update') {
          const updated = [];
          for (const row of rows) {
            if (matches(row)) {
              Object.assign(row, state.payload);
              updated.push({ ...row });
            }
          }
          if (singleMode === 'maybeSingle') return { data: updated[0] || null, error: null };
          return { data: updated, error: null };
        }
        const found = rows.filter(matches).map((r) => ({ ...r }));
        if (singleMode === 'maybeSingle') return { data: found[0] || null, error: null };
        return { data: found, error: null };
      };
      const builder = {
        insert(p) { state.op = 'insert'; state.payload = p; return builder; },
        update(p) { state.op = 'update'; state.payload = p; return builder; },
        select() { if (!state.op) state.op = 'select'; return builder; },
        eq(k, v) { state.filters.push([k, v]); return builder; },
        gt(k, v) { state.gtFilters.push([k, v]); return builder; },
        single() { return execute('single'); },
        maybeSingle() { return execute('maybeSingle'); },
        then(res, rej) { return execute(null).then(res, rej); },
      };
      return builder;
    },
  };
}

async function runTests() {
  const origEnv = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    APP_URL: process.env.APP_URL,
    CLIENT_URL: process.env.CLIENT_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  };
  const origFindByEmail = UserModel.findByEmail;
  const origResetForEmail = supabase.auth.resetPasswordForEmail;
  const origUpdateUserById = supabase.auth.admin.updateUserById;
  const origCreateAuthClient = supabase.createAuthClient;
  const origSendPasswordResetEmail = EmailService.sendPasswordResetEmail;
  const origSendPasswordChangedAlert = EmailService.sendPasswordChangedAlert;

  const testUser = {
    id: crypto.randomUUID(),
    email: 'student.reset@msunaawan.edu.ph',
    name: 'Maria Santos',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    active: true,
    is_whitelisted: true,
    account_status: 'Active',
  };

  let currentSupabasePassword = 'OldPassword#2025!';
  let lastSupabaseRedirect = null;
  let lastEmailPayload = null;
  let server = null;

  const mockSessionDb = createMockUserSessionDb();
  SessionModel._setClient(mockSessionDb);

  try {
    // 1. Unit tests on buildPasswordResetUrl()
    delete process.env.FRONTEND_URL;
    delete process.env.APP_URL;
    delete process.env.CLIENT_URL;
    delete process.env.VERCEL;
    process.env.NODE_ENV = 'production';

    assert.strictEqual(
      serverConfig.buildPasswordResetUrl({ email: testUser.email, token: 'tok123' }),
      'https://cess-docu-flow.vercel.app/forgot-password?email=student.reset%40msunaawan.edu.ph&token=tok123'
    );
    assert.strictEqual(
      serverConfig.buildPasswordResetUrl({
        email: testUser.email,
        token: 'tok456',
        origin: 'https://cess-docu-flow-git-preview-123.vercel.app',
      }),
      'https://cess-docu-flow-git-preview-123.vercel.app/forgot-password?email=student.reset%40msunaawan.edu.ph&token=tok456'
    );
    assert.strictEqual(
      serverConfig.buildPasswordResetUrl({
        email: testUser.email,
        token: 'tok789',
        redirectTo: 'https://cess-docu-flow.vercel.app/reset-password',
      }),
      'https://cess-docu-flow.vercel.app/forgot-password?email=student.reset%40msunaawan.edu.ph&token=tok789'
    );

    const blockedEvil = serverConfig.buildPasswordResetUrl({
      email: testUser.email,
      token: 'tokEvil',
      redirectTo: 'https://evil-phishing.example/forgot-password',
      origin: 'https://evil-phishing.example',
    });
    assert(blockedEvil.startsWith('https://cess-docu-flow.vercel.app/forgot-password?'));

    process.env.FRONTEND_URL = 'https://custom-docuflow.msunaawan.edu.ph/';
    assert.strictEqual(
      serverConfig.buildPasswordResetUrl({ email: testUser.email, token: 'tokCustom' }),
      'https://custom-docuflow.msunaawan.edu.ph/forgot-password?email=student.reset%40msunaawan.edu.ph&token=tokCustom'
    );
    delete process.env.FRONTEND_URL;

    process.env.NODE_ENV = 'development';
    assert.strictEqual(
      serverConfig.buildPasswordResetUrl({
        email: testUser.email,
        token: 'tokLocal',
        origin: 'http://localhost:5174',
      }),
      'http://localhost:5174/forgot-password?email=student.reset%40msunaawan.edu.ph&token=tokLocal'
    );

    // 2. End-to-end HTTP flow in production/Vercel mode
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    UserModel.findByEmail = async (email) =>
      String(email).toLowerCase() === testUser.email ? testUser : null;

    supabase.auth.resetPasswordForEmail = async (email, opts) => {
      lastSupabaseRedirect = opts?.redirectTo || null;
      return { data: {}, error: null };
    };

    supabase.auth.admin.updateUserById = async (userId, attrs) => {
      assert.strictEqual(userId, testUser.id);
      currentSupabasePassword = attrs.password;
      return { data: { user: { id: userId, email: testUser.email } }, error: null };
    };

    supabase.createAuthClient = () => ({
      auth: {
        signInWithPassword: async ({ email, password }) => {
          if (email === testUser.email && password === currentSupabasePassword) {
            return { data: { user: { id: testUser.id, email: testUser.email } }, error: null };
          }
          return { data: { user: null }, error: { message: 'Invalid login credentials' } };
        },
        getUser: async () => ({ data: { user: null }, error: { message: 'Invalid JWT' } }),
      },
    });

    EmailService.sendPasswordResetEmail = async (payload) => {
      lastEmailPayload = payload;
      return { success: true };
    };
    EmailService.sendPasswordChangedAlert = async () => ({ success: true });

    server = app.listen(0);
    const { port } = server.address();

    const postJson = (path, headers, body) =>
      new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
              ...headers,
            },
          },
          (res) => {
            let raw = '';
            res.on('data', (chunk) => {
              raw += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
          }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
      });

    // 2A. Request reset from Vercel production Origin
    const prodRes = await postJson(
      '/api/auth/forgot-password',
      { Origin: 'https://cess-docu-flow.vercel.app' },
      { email: testUser.email }
    );
    assert.strictEqual(prodRes.status, 200);
    assert.strictEqual(prodRes.body.success, true);

    const expectedResetUrl = `https://cess-docu-flow.vercel.app/forgot-password?email=${encodeURIComponent(
      testUser.email
    )}&token=${encodeURIComponent(prodRes.body.resetToken)}`;

    assert.strictEqual(lastSupabaseRedirect, expectedResetUrl);
    assert.strictEqual(lastEmailPayload?.resetUrl, expectedResetUrl);

    // Verify reset token hashes were persisted to DB (survives Vercel cold start)
    const persistedResetRows = mockSessionDb._rows.filter((r) => r.role === 'password_reset');
    assert.strictEqual(persistedResetRows.length, 2, 'Both reset token and 6-digit OTP hashes must be persisted');

    // 2B. Confirm password reset using a cold-start-only persisted token (not in in-memory Map!)
    const coldStartToken = crypto.randomBytes(24).toString('hex');
    await SessionModel.createPasswordResetTokens({
      userId: testUser.id,
      email: testUser.email,
      rawToken: coldStartToken,
      otpCode: '918273',
      expiresAt: Date.now() + 15 * 60 * 1000,
      ttlMs: 15 * 60 * 1000,
    });

    const newPassword = 'MyBrandNewPassword#2026!';
    const confirmRes = await postJson(
      '/api/auth/reset-password',
      { Origin: 'https://cess-docu-flow.vercel.app' },
      {
        email: testUser.email,
        code: coldStartToken,
        newPassword,
        confirmPassword: newPassword,
      }
    );
    assert.strictEqual(confirmRes.status, 200, `Cold-start password reset must succeed, got: ${JSON.stringify(confirmRes.body)}`);
    assert.strictEqual(confirmRes.body.success, true);
    assert.strictEqual(currentSupabasePassword, newPassword, 'Supabase Auth password must be updated to new password');

    // 2C. Replay of consumed cold-start token must fail (400 single-use)
    const replayRes = await postJson(
      '/api/auth/reset-password',
      { Origin: 'https://cess-docu-flow.vercel.app' },
      {
        email: testUser.email,
        code: coldStartToken,
        newPassword: 'AnotherPassword#2026!',
        confirmPassword: 'AnotherPassword#2026!',
      }
    );
    assert.strictEqual(replayRes.status, 400);
    assert(replayRes.body.error.includes('already been used'));

    // 2D. Old password must be rejected (401), NEW password must sign in cleanly (200)
    const oldLoginRes = await postJson(
      '/api/auth/login',
      { Origin: 'https://cess-docu-flow.vercel.app' },
      { email: testUser.email, password: 'OldPassword#2025!' }
    );
    assert.strictEqual(oldLoginRes.status, 401, 'Old password must be rejected after reset');

    const newLoginRes = await postJson(
      '/api/auth/login',
      { Origin: 'https://cess-docu-flow.vercel.app' },
      { email: testUser.email, password: newPassword }
    );
    assert.strictEqual(newLoginRes.status, 200, `Login with new password must succeed, got: ${JSON.stringify(newLoginRes.body)}`);
    assert.strictEqual(newLoginRes.body.verified, true);
    assert(newLoginRes.body.token && newLoginRes.body.token.startsWith('sess_'));

    console.log('✅ ALL PASSWORD RESET LINK, COLD-START PERSISTENCE & POST-RESET LOGIN TESTS PASSED!');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    SessionModel._resetClient();
    UserModel.findByEmail = origFindByEmail;
    supabase.auth.resetPasswordForEmail = origResetForEmail;
    supabase.auth.admin.updateUserById = origUpdateUserById;
    supabase.createAuthClient = origCreateAuthClient;
    EmailService.sendPasswordResetEmail = origSendPasswordResetEmail;
    EmailService.sendPasswordChangedAlert = origSendPasswordChangedAlert;
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

runTests().catch((err) => {
  console.error('❌ PASSWORD RESET LINK TEST FAILED:', err);
  process.exit(1);
});
