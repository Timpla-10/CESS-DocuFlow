/**
 * sessionModel.js
 * PB-04 / SRS 3.1 REQ-AUTH-14: Persistent Session Handling, Remember-Me, and Inactivity Policy (7 days)
 *
 * Persists opaque `sess_` session tokens in Supabase PostgreSQL (`user_session` table)
 * using SHA-256 token hashes so raw bearer tokens are never stored at rest and sessions
 * survive Vercel Serverless cold starts and horizontal scaling.
 */
const crypto = require('crypto');
const defaultSupabase = require('../config/database');

// 7 days in milliseconds: 7 * 24 * 60 * 60 * 1000 = 604,800,000 ms
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// 24 hours in milliseconds (for non-remember-me sessions) = 86,400,000 ms
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const TABLE = 'user_session';

// Allows unit tests to inject a mock Supabase client without creating duplicate real clients
let supabaseClient = defaultSupabase;

function generateSessionToken() {
  return 'sess_' + crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function mapRowToSession(row, rawToken = undefined) {
  if (!row) return null;
  const mapped = {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    origin: row.origin || 'CESS',
    rememberMe: Boolean(row.remember_me),
    ttlMs: Number(row.ttl_ms),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
    isRevoked: Boolean(row.is_revoked),
    revokedAt: row.revoked_at || null,
  };
  if (rawToken !== undefined) {
    mapped.token = rawToken;
  }
  return mapped;
}

const SessionModel = {
  SEVEN_DAYS_MS,
  ONE_DAY_MS,
  TABLE,

  hashToken,

  /**
   * Test-only hook to inject a mock Supabase client (never creates a second real client).
   */
  _setClient(client) {
    supabaseClient = client || defaultSupabase;
  },

  _resetClient() {
    supabaseClient = defaultSupabase;
  },

  /**
   * Creates a new persistent user session with Remember-Me lifecycle.
   * Only the SHA-256 hash of the token is stored in PostgreSQL.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.email
   * @param {string} params.role
   * @param {string} params.origin
   * @param {boolean} [params.rememberMe=true]
   * @returns {Promise<Object>}
   */
  async createSession({ userId, email, role, origin, rememberMe = true }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const sessionId = 'sid_' + crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const ttl = rememberMe ? SEVEN_DAYS_MS : ONE_DAY_MS;
    const expiresAt = new Date(now + ttl).toISOString();

    const row = {
      session_id: sessionId,
      token_hash: tokenHash,
      user_id: userId,
      email: cleanEmail,
      role,
      origin: origin || 'CESS',
      remember_me: Boolean(rememberMe),
      ttl_ms: ttl,
      created_at: nowIso,
      last_active_at: nowIso,
      expires_at: expiresAt,
      is_revoked: false,
      revoked_at: null,
    };

    const { data, error } = await supabaseClient
      .from(TABLE)
      .insert(row)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to persist user session: ${error.message}`);
    }

    return mapRowToSession(data || row, token);
  },

  /**
   * Validates session token against PostgreSQL and enforces:
   *  - existence & non-revocation
   *  - 7-day rolling inactivity expiration (REQ-AUTH-14)
   *  - absolute TTL expiration (1-day or 7-day)
   *  - race-safe conditional update so concurrent revocation can never be overwritten
   * @param {string} token
   * @returns {Promise<{ valid: boolean, session?: Object, reason?: string, status?: number }>}
   */
  async validateSession(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, status: 401, reason: 'Missing authentication credentials.' };
    }

    const tokenHash = hashToken(token);
    const { data: row, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to validate user session: ${error.message}`);
    }

    if (!row) {
      return { valid: false, status: 401, reason: 'Invalid or unrecognized session token.' };
    }

    if (row.is_revoked) {
      return { valid: false, status: 401, reason: 'Session has been terminated. Please sign in again.' };
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const lastActiveTime = new Date(row.last_active_at).getTime();
    const inactiveDuration = now - lastActiveTime;

    // PB-04 Acceptance Criterion: Inactive sessions expire per agreed policy (7 days)
    if (inactiveDuration > SEVEN_DAYS_MS) {
      await supabaseClient
        .from(TABLE)
        .update({ is_revoked: true, revoked_at: nowIso })
        .eq('token_hash', tokenHash)
        .eq('is_revoked', false);

      return {
        valid: false,
        status: 401,
        reason: 'Session expired due to 7 days of inactivity. Please sign in again.',
      };
    }

    // Check overall max expiration
    if (now > new Date(row.expires_at).getTime()) {
      await supabaseClient
        .from(TABLE)
        .update({ is_revoked: true, revoked_at: nowIso })
        .eq('token_hash', tokenHash)
        .eq('is_revoked', false);

      return {
        valid: false,
        status: 401,
        reason: 'Session lifetime has expired. Please sign in again.',
      };
    }

    // Race-condition-safe rolling activity touch:
    // Only updates if the session is STILL unrevoked and unexpired in PostgreSQL.
    const { data: updatedRow, error: touchError } = await supabaseClient
      .from(TABLE)
      .update({ last_active_at: nowIso })
      .eq('token_hash', tokenHash)
      .eq('is_revoked', false)
      .gt('expires_at', nowIso)
      .select('*')
      .maybeSingle();

    if (touchError) {
      throw new Error(`Failed to update session activity: ${touchError.message}`);
    }

    // If a concurrent logout/revoke/expiry won the race, updatedRow will be null
    if (!updatedRow || updatedRow.is_revoked) {
      return {
        valid: false,
        status: 401,
        reason: 'Session has been terminated. Please sign in again.',
      };
    }

    return { valid: true, session: mapRowToSession(updatedRow) };
  },

  /**
   * PB-04 Acceptance Criterion: Logout ends the session immediately.
   * Conditional update ensures already-revoked sessions remain idempotent.
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async revokeSession(token) {
    if (!token || typeof token !== 'string') return false;
    const tokenHash = hashToken(token);
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from(TABLE)
      .update({ is_revoked: true, revoked_at: nowIso })
      .eq('token_hash', tokenHash)
      .eq('is_revoked', false)
      .select('session_id');

    if (error) {
      throw new Error(`Failed to revoke user session: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  },

  /**
   * Revokes all active sessions for a user (e.g., upon password reset, deactivation, or role change).
   * @param {string} userId
   * @returns {Promise<number>} Number of sessions revoked
   */
  async revokeAllUserSessions(userId) {
    if (!userId) return 0;
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from(TABLE)
      .update({ is_revoked: true, revoked_at: nowIso })
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .select('session_id');

    if (error) {
      throw new Error(`Failed to revoke user sessions: ${error.message}`);
    }

    return Array.isArray(data) ? data.length : 0;
  },

  /**
   * Retrieves session metadata by raw bearer token (hashed before DB lookup).
   * Never returns a raw token from the database.
   * @param {string} token
   * @returns {Promise<Object|null>}
   */
  async getSession(token) {
    if (!token || typeof token !== 'string') return null;
    const tokenHash = hashToken(token);

    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to retrieve user session: ${error.message}`);
    }

    return mapRowToSession(data);
  },

  /**
   * Test-only helper to clear sessions in non-production environments.
   * Blocked in production to prevent accidental mass session invalidation.
   */
  async clear() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SessionModel.clear() is disabled in production.');
    }

    const { error } = await supabaseClient
      .from(TABLE)
      .delete()
      .neq('session_id', '');

    if (error) {
      throw new Error(`Failed to clear sessions: ${error.message}`);
    }
  },
};

module.exports = SessionModel;
