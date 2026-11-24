/**
 * Isolated Unit & Mock Test Suite for Staging Database Safety Guards (Phase 4.6)
 *
 * Uses mocked configuration and child-process isolation only — NEVER connects to any real Supabase project.
 * Verifies:
 *  1. Missing APP_ENV blocks execution.
 *  2. APP_ENV=development blocks execution.
 *  3. Missing EXPECTED_STAGING_PROJECT_REF blocks execution.
 *  4. Missing SUPABASE_URL blocks execution.
 *  5. Malformed, HTTP, localhost, IP, and non-Supabase URLs block execution.
 *  6. Production project URL blocks execution when it does not match EXPECTED_STAGING_PROJECT_REF.
 *  7. Mismatched project reference blocks execution.
 *  8. NODE_ENV=production blocks execution even with valid staging ref.
 *  9. Error messages never leak SUPABASE_URL or secret keys.
 * 10. Correct staging configuration passes validation (including dedicated .env.staging loader & key isolation).
 * 11. Guard blocks PB-03 and PB-04 BEFORE any Supabase client initialization or DB/Auth mutation occurs.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  extractSupabaseProjectRef,
  loadStagingEnv,
  assertStagingEnvironment,
  initializeStagingTestEnvironment,
} = require('./stagingSafetyGuard');

const MOCK_STAGING_REF = 'stagingmockref123';
const MOCK_PROD_REF = 'prodmockref999';
const MOCK_STAGING_URL = `https://${MOCK_STAGING_REF}.supabase.co`;
const MOCK_PROD_URL = `https://${MOCK_PROD_REF}.supabase.co`;
const MOCK_SECRET = 'mock-staging-service-role-secret-value';

function validEnv(overrides = {}) {
  return {
    APP_ENV: 'staging',
    NODE_ENV: 'test',
    EXPECTED_STAGING_PROJECT_REF: MOCK_STAGING_REF,
    SUPABASE_URL: MOCK_STAGING_URL,
    SUPABASE_SERVICE_ROLE_KEY: MOCK_SECRET,
    ...overrides,
  };
}

function assertBlocksWithoutLeakingSecrets(fn, expectedSubstring, label) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert(caught, `${label}: expected guard to throw`);
  assert(
    caught.message.toLowerCase().includes(expectedSubstring.toLowerCase()),
    `${label}: expected "${expectedSubstring}" in "${caught.message}"`
  );
  assert(!caught.message.includes(MOCK_STAGING_URL), `${label}: error must NOT leak staging URL`);
  assert(!caught.message.includes(MOCK_PROD_URL), `${label}: error must NOT leak prod URL`);
  assert(!caught.message.includes(MOCK_SECRET), `${label}: error must NOT leak service role key`);
}

function runTests() {
  // 1. Missing APP_ENV blocks execution
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ APP_ENV: '' })),
    'APP_ENV',
    'Missing APP_ENV'
  );
  console.log('PASS 1: Missing APP_ENV blocks execution.');

  // 2. APP_ENV=development blocks execution
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ APP_ENV: 'development' })),
    'APP_ENV',
    'APP_ENV=development'
  );
  console.log('PASS 2: APP_ENV=development blocks execution.');

  // 3. Missing EXPECTED_STAGING_PROJECT_REF blocks execution
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ EXPECTED_STAGING_PROJECT_REF: '' })),
    'EXPECTED_STAGING_PROJECT_REF',
    'Missing EXPECTED_STAGING_PROJECT_REF'
  );
  console.log('PASS 3: Missing EXPECTED_STAGING_PROJECT_REF blocks execution.');

  // 4. Missing SUPABASE_URL blocks execution
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ SUPABASE_URL: '' })),
    'SUPABASE_URL',
    'Missing SUPABASE_URL'
  );
  console.log('PASS 4: Missing SUPABASE_URL blocks execution.');

  // 5. Malformed, HTTP, localhost, IP, and non-Supabase URLs block execution
  for (const badUrl of [
    'not-a-valid-url',
    `http://${MOCK_STAGING_REF}.supabase.co`,
    'https://localhost:54321',
    'https://127.0.0.1:54321',
    'https://evil.example.com',
  ]) {
    assertBlocksWithoutLeakingSecrets(
      () => assertStagingEnvironment(validEnv({ SUPABASE_URL: badUrl })),
      'Staging guard blocked execution',
      `Bad URL (${badUrl})`
    );
  }
  console.log('PASS 5: Malformed, non-HTTPS, localhost, IP, and non-Supabase URLs block execution.');

  // 6. Production project URL blocks execution when it does not match expected staging ref
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ SUPABASE_URL: MOCK_PROD_URL })),
    'does not match',
    'Production URL mismatch'
  );
  console.log('PASS 6: Production project URL blocks execution on ref mismatch.');

  // 7. Mismatched project reference blocks execution
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ EXPECTED_STAGING_PROJECT_REF: 'differentstagingref' })),
    'does not match',
    'Mismatched EXPECTED_STAGING_PROJECT_REF'
  );
  console.log('PASS 7: Mismatched EXPECTED_STAGING_PROJECT_REF blocks execution.');

  // 8. NODE_ENV=production blocks execution even when APP_ENV and project ref match
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ NODE_ENV: 'production' })),
    'NODE_ENV=production',
    'NODE_ENV=production'
  );
  console.log('PASS 8: NODE_ENV=production blocks execution.');

  // 9. Missing privileged key blocks execution without leaking secrets
  assertBlocksWithoutLeakingSecrets(
    () => assertStagingEnvironment(validEnv({ SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '' })),
    'SUPABASE_SERVICE_ROLE_KEY',
    'Missing service role key'
  );
  console.log('PASS 9: Missing privileged key blocks execution and errors never leak URLs or secrets.');

  // 10. Correct staging configuration passes + dedicated .env.staging loader prevents .env leakage
  const ok = assertStagingEnvironment(validEnv());
  assert.strictEqual(ok.projectRef, MOCK_STAGING_REF);
  assert.strictEqual(ok.appEnv, 'staging');
  assert.strictEqual(extractSupabaseProjectRef(MOCK_STAGING_URL), MOCK_STAGING_REF);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cess-staging-guard-'));
  const tmpEnvFile = path.join(tmpDir, '.env.staging');
  try {
    fs.writeFileSync(
      tmpEnvFile,
      [
        'APP_ENV=staging',
        'NODE_ENV=test',
        `EXPECTED_STAGING_PROJECT_REF=${MOCK_STAGING_REF}`,
        `SUPABASE_URL=${MOCK_STAGING_URL}`,
        `SUPABASE_SERVICE_ROLE_KEY=${MOCK_SECRET}`,
      ].join('\n'),
      'utf8'
    );
    const isolatedEnv = {};
    const initRes = initializeStagingTestEnvironment({ envPath: tmpEnvFile, targetEnv: isolatedEnv });
    assert.strictEqual(initRes.envFileLoaded, true);
    assert.strictEqual(initRes.projectRef, MOCK_STAGING_REF);
    assert.strictEqual(
      isolatedEnv.SUPABASE_SECRET_KEY,
      MOCK_SECRET,
      'Loader must pin SUPABASE_SECRET_KEY to staging key to prevent backend/.env leakage'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('PASS 10: Correct staging configuration and .env.staging loader pass with key-leakage protection.');

  // 11. Guard blocks PB-03 and PB-04 BEFORE any Supabase client or DB/Auth mutation occurs
  const backendDir = path.resolve(__dirname, '..');
  const nonexistentEnvFile = path.join(os.tmpdir(), `cess-nonexistent-staging-env-${Date.now()}`);
  for (const script of ['tests/test-pb03-password-reset-security.js', 'tests/test-pb04-session-remember-me.js']) {
    // Run in an isolated child process with an unsafe/production-like env and explicit nonexistent
    // STAGING_ENV_FILE so a real local backend/.env.staging cannot mask the unsafe shell config.
    const proc = spawnSync(process.execPath, [script], {
      cwd: backendDir,
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        STAGING_ENV_FILE: nonexistentEnvFile,
        APP_ENV: 'development',
        NODE_ENV: 'test',
        EXPECTED_STAGING_PROJECT_REF: MOCK_STAGING_REF,
        SUPABASE_URL: MOCK_PROD_URL,
        SUPABASE_SERVICE_ROLE_KEY: MOCK_SECRET,
      },
      encoding: 'utf8',
    });

    assert.notStrictEqual(proc.status, 0, `${script} must exit non-zero when guard rejects env`);
    const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
    assert(
      combinedOutput.includes('Staging guard blocked execution'),
      `${script} must fail inside stagingSafetyGuard before any DB/Auth code runs. Got:\n${combinedOutput}`
    );
    assert(
      !combinedOutput.includes('Provisioned verified test accounts'),
      `${script} must NEVER reach account provisioning when blocked`
    );
    assert(!combinedOutput.includes(MOCK_PROD_URL), `${script} output must NOT leak URL`);
    assert(!combinedOutput.includes(MOCK_SECRET), `${script} output must NOT leak secret`);
  }
  console.log('PASS 11: Guard blocks both PB-03 and PB-04 before any Supabase client init or DB/Auth mutation.');

  // 12. Shell-only staging configuration (no .env.staging file) isolates credentials against pre-existing prod SUPABASE_SECRET_KEY
  const nonExistentStagingPath = path.join(os.tmpdir(), `missing-env-staging-${Date.now()}`);
  const shellOnlyEnv = {
    APP_ENV: 'staging',
    NODE_ENV: 'test',
    EXPECTED_STAGING_PROJECT_REF: MOCK_STAGING_REF,
    SUPABASE_URL: MOCK_STAGING_URL,
    SUPABASE_SERVICE_ROLE_KEY: MOCK_SECRET,
    // Simulate a pre-existing production SUPABASE_SECRET_KEY already in the shell
    SUPABASE_SECRET_KEY: 'prod-secret-key-must-not-win',
  };
  const shellInit = initializeStagingTestEnvironment({
    envPath: nonExistentStagingPath,
    targetEnv: shellOnlyEnv,
  });
  assert.strictEqual(shellInit.envFileLoaded, false, 'Should operate in shell-only mode when .env.staging does not exist');
  assert.strictEqual(shellInit.projectRef, MOCK_STAGING_REF);
  assert.strictEqual(
    shellOnlyEnv.SUPABASE_SECRET_KEY,
    MOCK_SECRET,
    'Shell-only mode must pin SUPABASE_SECRET_KEY to staging SUPABASE_SERVICE_ROLE_KEY'
  );
  assert.strictEqual(shellOnlyEnv.SUPABASE_PUBLISHABLE_KEY, '', 'Unset publishable key must be blanked to block backend/.env leakage');
  assert.strictEqual(shellOnlyEnv.SUPABASE_ANON_KEY, '', 'Unset anon key must be blanked to block backend/.env leakage');
  console.log('PASS 12: Shell-only staging config (no .env.staging) pins privileged key and blocks prod SUPABASE_SECRET_KEY override.');

  // 13. Pre-existing production anon/publishable keys in shell cannot leak when .env.staging omits them
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cess-staging-iso-'));
  const tmpEnvFile2 = path.join(tmpDir2, '.env.staging');
  try {
    fs.writeFileSync(
      tmpEnvFile2,
      [
        'APP_ENV=staging',
        'NODE_ENV=test',
        `EXPECTED_STAGING_PROJECT_REF=${MOCK_STAGING_REF}`,
        `SUPABASE_URL=${MOCK_STAGING_URL}`,
        `SUPABASE_SERVICE_ROLE_KEY=${MOCK_SECRET}`,
      ].join('\n'),
      'utf8'
    );
    const pollutedShellEnv = {
      SUPABASE_SECRET_KEY: 'prod-secret-must-be-overwritten',
      SUPABASE_ANON_KEY: 'prod-anon-must-be-cleared',
      SUPABASE_PUBLISHABLE_KEY: 'prod-publishable-must-be-cleared',
    };
    initializeStagingTestEnvironment({ envPath: tmpEnvFile2, targetEnv: pollutedShellEnv });
    assert.strictEqual(pollutedShellEnv.SUPABASE_SECRET_KEY, MOCK_SECRET);
    assert.strictEqual(pollutedShellEnv.SUPABASE_ANON_KEY, '', 'Pre-existing prod anon key must be cleared');
    assert.strictEqual(pollutedShellEnv.SUPABASE_PUBLISHABLE_KEY, '', 'Pre-existing prod publishable key must be cleared');
  } finally {
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  }
  console.log('PASS 13: Pre-existing production secret, anon, and publishable keys cannot leak when .env.staging omits them.');

  // 14. Explicit staging public/anon keys remain usable when configured in .env.staging or shell
  const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cess-staging-pub-'));
  const tmpEnvFile3 = path.join(tmpDir3, '.env.staging');
  try {
    fs.writeFileSync(
      tmpEnvFile3,
      [
        'APP_ENV=staging',
        'NODE_ENV=test',
        `EXPECTED_STAGING_PROJECT_REF=${MOCK_STAGING_REF}`,
        `SUPABASE_URL=${MOCK_STAGING_URL}`,
        `SUPABASE_SERVICE_ROLE_KEY=${MOCK_SECRET}`,
        'SUPABASE_ANON_KEY=staging-explicit-anon-key',
        'SUPABASE_PUBLISHABLE_KEY=staging-explicit-pub-key',
      ].join('\n'),
      'utf8'
    );
    const explicitPubEnv = {};
    initializeStagingTestEnvironment({ envPath: tmpEnvFile3, targetEnv: explicitPubEnv });
    assert.strictEqual(explicitPubEnv.SUPABASE_ANON_KEY, 'staging-explicit-anon-key');
    assert.strictEqual(explicitPubEnv.SUPABASE_PUBLISHABLE_KEY, 'staging-explicit-pub-key');
  } finally {
    fs.rmSync(tmpDir3, { recursive: true, force: true });
  }
  console.log('PASS 14: Explicit staging anon and publishable keys remain intact and usable.');

  // 15. FORBIDDEN_PRODUCTION_PROJECT_REF blocks production ref even if EXPECTED_STAGING_PROJECT_REF was mistakenly set to prod ref
  assertBlocksWithoutLeakingSecrets(
    () =>
      assertStagingEnvironment(
        validEnv({
          SUPABASE_URL: MOCK_PROD_URL,
          EXPECTED_STAGING_PROJECT_REF: MOCK_PROD_REF,
          FORBIDDEN_PRODUCTION_PROJECT_REF: MOCK_PROD_REF,
        })
      ),
    'FORBIDDEN_PRODUCTION_PROJECT_REF',
    'FORBIDDEN_PRODUCTION_PROJECT_REF denylist'
  );
  console.log('PASS 15: FORBIDDEN_PRODUCTION_PROJECT_REF blocks production project independently of EXPECTED_STAGING_PROJECT_REF.');

  // 16. A different staging project reference passes when FORBIDDEN_PRODUCTION_PROJECT_REF is set to prod ref
  const denylistOk = assertStagingEnvironment(
    validEnv({
      FORBIDDEN_PRODUCTION_PROJECT_REF: MOCK_PROD_REF,
    })
  );
  assert.strictEqual(denylistOk.projectRef, MOCK_STAGING_REF);
  console.log('PASS 16: Legitimate staging project passes when FORBIDDEN_PRODUCTION_PROJECT_REF is configured.');

  // 17. Explicit nonexistent STAGING_ENV_FILE never falls back to backend/.env.staging and rejects unsafe shell env
  const unsafeShellWithOverride = {
    STAGING_ENV_FILE: nonexistentEnvFile,
    APP_ENV: 'development',
    NODE_ENV: 'test',
    EXPECTED_STAGING_PROJECT_REF: MOCK_STAGING_REF,
    SUPABASE_URL: MOCK_PROD_URL,
    SUPABASE_SERVICE_ROLE_KEY: MOCK_SECRET,
  };
  assertBlocksWithoutLeakingSecrets(
    () => initializeStagingTestEnvironment({ targetEnv: unsafeShellWithOverride }),
    'APP_ENV',
    'STAGING_ENV_FILE nonexistent path must not fall back to backend/.env.staging'
  );
  console.log('PASS 17: Explicit nonexistent STAGING_ENV_FILE does not fall back to backend/.env.staging and rejects unsafe shell env.');

  console.log('\nALL 17 STAGING SAFETY GUARD TESTS PASSED!');
}

runTests();
