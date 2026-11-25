/**
 * stagingSafetyGuard.js
 *
 * Shared fail-closed safety guard for destructive/live backend integration tests
 * (PB-02..PB-49, notification tests, etc.). Must be invoked BEFORE importing `../server`,
 * `../config/database`, or any module that initializes a Supabase client.
 *
 * Guarantees:
 *  - Never loads `backend/.env` (only optionally loads gitignored `backend/.env.staging`).
 *  - Isolates privileged and public/anon Supabase keys in BOTH `.env.staging` and shell-only modes
 *    so `backend/.env` or pre-existing production shell keys cannot override staging credentials.
 *  - Requires `APP_ENV=staging`, non-production `NODE_ENV`, valid `https://<ref>.supabase.co` URL,
 *    and exact match between extracted URL project ref and `EXPECTED_STAGING_PROJECT_REF`.
 *  - Supports optional `FORBIDDEN_PRODUCTION_PROJECT_REF` denylist (recommended before running
 *    any staging integration test) checked independently of `EXPECTED_STAGING_PROJECT_REF`.
 *  - Never prints Supabase URLs, project references, API keys, passwords, or tokens in error messages.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_STAGING_ENV_PATH = path.resolve(__dirname, '../.env.staging');
const SUPABASE_HOST_REGEX = /^([a-z0-9-]+)\.supabase\.co$/i;
const PROJECT_REF_REGEX = /^[a-z0-9-]+$/i;

/**
 * Extracts and validates the Supabase cloud project reference from a URL.
 * Rejects non-HTTPS, localhost, IP addresses, malformed URLs, and non-Supabase domains.
 * Never includes the raw URL in thrown errors.
 *
 * @param {string} rawUrl
 * @returns {string} lowercased project reference
 */
function extractSupabaseProjectRef(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Staging guard blocked execution: SUPABASE_URL is missing.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Staging guard blocked execution: SUPABASE_URL is malformed.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Staging guard blocked execution: SUPABASE_URL must use HTTPS.');
  }

  const host = (parsed.hostname || '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    throw new Error('Staging guard blocked execution: localhost or IP-based URLs are not permitted.');
  }

  const match = host.match(SUPABASE_HOST_REGEX);
  if (!match) {
    throw new Error('Staging guard blocked execution: SUPABASE_URL must be a valid *.supabase.co project URL.');
  }

  return match[1].toLowerCase();
}

/**
 * Isolates Supabase credentials in `targetEnv` so:
 *  - A pre-existing production `SUPABASE_SECRET_KEY` or `backend/.env` fallback can NEVER override
 *    the staging privileged key (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`).
 *  - Pre-existing production `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` cannot leak into
 *    staging when not explicitly supplied by staging, while explicit staging public keys remain usable.
 *
 * @param {Object} targetEnv
 * @param {Object|null} parsedStagingEnv Parsed key-value map from `.env.staging`, or null in shell-only mode
 */
function isolateStagingCredentials(targetEnv, parsedStagingEnv = null) {
  if (parsedStagingEnv) {
    // Prefer the key explicitly configured in .env.staging so a pre-existing shell
    // SUPABASE_SECRET_KEY can never override .env.staging's SUPABASE_SERVICE_ROLE_KEY.
    const explicitSecret = String(parsedStagingEnv.SUPABASE_SECRET_KEY || '').trim();
    const explicitServiceRole = String(parsedStagingEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const stagingPrivilegedKey = explicitServiceRole || explicitSecret;

    if (stagingPrivilegedKey) {
      targetEnv.SUPABASE_SERVICE_ROLE_KEY = stagingPrivilegedKey;
      targetEnv.SUPABASE_SECRET_KEY = stagingPrivilegedKey;
    } else {
      targetEnv.SUPABASE_SERVICE_ROLE_KEY = '';
      targetEnv.SUPABASE_SECRET_KEY = '';
    }

    // Clear pre-existing shell public/anon keys unless explicitly supplied in .env.staging
    targetEnv.SUPABASE_PUBLISHABLE_KEY = Object.prototype.hasOwnProperty.call(
      parsedStagingEnv,
      'SUPABASE_PUBLISHABLE_KEY'
    )
      ? parsedStagingEnv.SUPABASE_PUBLISHABLE_KEY
      : '';

    targetEnv.SUPABASE_ANON_KEY = Object.prototype.hasOwnProperty.call(
      parsedStagingEnv,
      'SUPABASE_ANON_KEY'
    )
      ? parsedStagingEnv.SUPABASE_ANON_KEY
      : '';
    return;
  }

  // Shell-only mode (no .env.staging file):
  // If SUPABASE_SERVICE_ROLE_KEY is provided, pin SUPABASE_SECRET_KEY to it so neither a stale
  // shell SUPABASE_SECRET_KEY nor backend/.env's dotenv.config() can override the staging key.
  const shellServiceRole = String(targetEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const shellSecret = String(targetEnv.SUPABASE_SECRET_KEY || '').trim();
  const stagingPrivilegedKey = shellServiceRole || shellSecret;

  if (stagingPrivilegedKey) {
    targetEnv.SUPABASE_SERVICE_ROLE_KEY = stagingPrivilegedKey;
    targetEnv.SUPABASE_SECRET_KEY = stagingPrivilegedKey;
  }

  // Ensure unset public/anon keys are explicitly blanked so backend/.env cannot inject them later.
  if (!Object.prototype.hasOwnProperty.call(targetEnv, 'SUPABASE_PUBLISHABLE_KEY') || !targetEnv.SUPABASE_PUBLISHABLE_KEY) {
    targetEnv.SUPABASE_PUBLISHABLE_KEY = '';
  }
  if (!Object.prototype.hasOwnProperty.call(targetEnv, 'SUPABASE_ANON_KEY') || !targetEnv.SUPABASE_ANON_KEY) {
    targetEnv.SUPABASE_ANON_KEY = '';
  }
}

/**
 * Loads `backend/.env.staging` into `targetEnv` if present (never reads `backend/.env`).
 *
 * @param {Object} [options]
 * @param {string} [options.envPath]
 * @param {Object} [options.targetEnv]
 * @returns {{ loaded: boolean, path: string, parsed: Object|null }}
 */
function loadStagingEnv({ envPath = DEFAULT_STAGING_ENV_PATH, targetEnv = process.env } = {}) {
  if (!fs.existsSync(envPath)) {
    isolateStagingCredentials(targetEnv, null);
    return { loaded: false, path: envPath, parsed: null };
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const parsed = dotenv.parse(raw);

  for (const [key, value] of Object.entries(parsed)) {
    targetEnv[key] = value;
  }

  isolateStagingCredentials(targetEnv, parsed);

  return { loaded: true, path: envPath, parsed };
}

/**
 * Validates that the runtime environment is explicitly and unambiguously configured
 * for the isolated staging Supabase project. Fails closed with a non-sensitive error.
 *
 * @param {Object} [env=process.env]
 * @returns {{ projectRef: string, appEnv: string, nodeEnv: string }}
 */
function assertStagingEnvironment(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Staging guard blocked execution: destructive integration tests cannot run when NODE_ENV=production.');
  }

  const appEnv = String(env.APP_ENV || '').trim().toLowerCase();
  if (appEnv !== 'staging') {
    throw new Error('Staging guard blocked execution: APP_ENV must be explicitly set to "staging".');
  }

  const expectedRef = String(env.EXPECTED_STAGING_PROJECT_REF || '').trim().toLowerCase();
  if (!expectedRef || !PROJECT_REF_REGEX.test(expectedRef)) {
    throw new Error('Staging guard blocked execution: EXPECTED_STAGING_PROJECT_REF is missing or invalid.');
  }

  const actualRef = extractSupabaseProjectRef(env.SUPABASE_URL);

  // Independent production project reference denylist (checked even if EXPECTED_STAGING_PROJECT_REF matches)
  const forbiddenProdRef = String(env.FORBIDDEN_PRODUCTION_PROJECT_REF || '').trim().toLowerCase();
  if (forbiddenProdRef && actualRef === forbiddenProdRef) {
    throw new Error(
      'Staging guard blocked execution: target Supabase project matches FORBIDDEN_PRODUCTION_PROJECT_REF.'
    );
  }

  if (actualRef !== expectedRef) {
    throw new Error(
      'Staging guard blocked execution: SUPABASE_URL project reference does not match EXPECTED_STAGING_PROJECT_REF.'
    );
  }

  const privilegedKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim();
  if (!privilegedKey) {
    throw new Error(
      'Staging guard blocked execution: a staging SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is required.'
    );
  }

  return {
    projectRef: actualRef,
    appEnv,
    nodeEnv: nodeEnv || 'test',
  };
}

/**
 * Convenience entry point for staging integration test scripts.
 * Must be called BEFORE requiring `../server` or `../config/database`.
 *
 * @param {Object} [options]
 * @returns {{ projectRef: string, appEnv: string, nodeEnv: string, envFileLoaded: boolean }}
 */
function initializeStagingTestEnvironment(options = {}) {
  const targetEnv = options.targetEnv || process.env;
  const resolvedEnvPath =
    options.envPath !== undefined
      ? options.envPath
      : typeof targetEnv.STAGING_ENV_FILE === 'string' && targetEnv.STAGING_ENV_FILE.trim()
        ? targetEnv.STAGING_ENV_FILE.trim()
        : DEFAULT_STAGING_ENV_PATH;

  const loadResult = loadStagingEnv({
    envPath: resolvedEnvPath,
    targetEnv,
  });
  const verified = assertStagingEnvironment(targetEnv);
  return {
    ...verified,
    envFileLoaded: loadResult.loaded,
  };
}

module.exports = {
  DEFAULT_STAGING_ENV_PATH,
  extractSupabaseProjectRef,
  isolateStagingCredentials,
  loadStagingEnv,
  assertStagingEnvironment,
  initializeStagingTestEnvironment,
};
