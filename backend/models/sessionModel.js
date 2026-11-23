/**
 * sessionModel.js
 * PB-04 / SRS 3.1 REQ-AUTH-14: Session handling, Remember-Me, and Inactivity Policy (7 days)
 */
const crypto = require('crypto');

// 7 days in milliseconds: 7 * 24 * 60 * 60 * 1000 = 604,800,000 ms
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// 24 hours in milliseconds (for non-remember-me sessions) = 86,400,000 ms
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// In-memory session store (Map: token -> SessionObject)
const sessionStore = new Map();

function generateSessionToken() {
  return 'sess_' + crypto.randomBytes(32).toString('hex');
}

const SessionModel = {
  SEVEN_DAYS_MS,
  ONE_DAY_MS,

  /**
   * Creates a new user session with Remember-Me lifecycle
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.email
   * @param {string} params.role
   * @param {string} params.origin
   * @param {boolean} [params.rememberMe=true]
   */
  createSession({ userId, email, role, origin, rememberMe = true }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const token = generateSessionToken();
    const sessionId = 'sid_' + crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const ttl = rememberMe ? SEVEN_DAYS_MS : ONE_DAY_MS;
    const expiresAt = new Date(now + ttl).toISOString();

    const session = {
      sessionId,
      userId,
      email: cleanEmail,
      role,
      origin: origin || 'CESS',
      token,
      rememberMe: Boolean(rememberMe),
      ttlMs: ttl,
      createdAt: nowIso,
      lastActiveAt: nowIso,
      expiresAt,
      isRevoked: false,
    };

    sessionStore.set(token, session);
    return session;
  },

  /**
   * Validates session token and enforces the 7-day inactivity policy (REQ-AUTH-14)
   * @param {string} token
   * @returns {{ valid: boolean, session?: Object, reason?: string, status?: number }}
   */
  validateSession(token) {
    if (!token) {
      return { valid: false, status: 401, reason: 'Missing authentication credentials.' };
    }

    const session = sessionStore.get(token);
    if (!session) {
      return { valid: false, status: 401, reason: 'Invalid or unrecognized session token.' };
    }

    if (session.isRevoked) {
      return { valid: false, status: 401, reason: 'Session has been terminated. Please sign in again.' };
    }

    const now = Date.now();
    const lastActiveTime = new Date(session.lastActiveAt).getTime();
    const inactiveDuration = now - lastActiveTime;

    // PB-04 Acceptance Criterion: Inactive sessions expire per agreed policy (7 days)
    if (inactiveDuration > SEVEN_DAYS_MS) {
      session.isRevoked = true;
      return {
        valid: false,
        status: 401,
        reason: 'Session expired due to 7 days of inactivity. Please sign in again.',
      };
    }

    // Check overall max expiration
    if (now > new Date(session.expiresAt).getTime()) {
      session.isRevoked = true;
      return {
        valid: false,
        status: 401,
        reason: 'Session lifetime has expired. Please sign in again.',
      };
    }

    // Touch activity timestamp (rolling inactivity window)
    session.lastActiveAt = new Date(now).toISOString();
    return { valid: true, session };
  },

  /**
   * PB-04 Acceptance Criterion: Logout ends the session
   * @param {string} token
   * @returns {boolean}
   */
  revokeSession(token) {
    if (!token) return false;
    const session = sessionStore.get(token);
    if (session) {
      session.isRevoked = true;
      session.revokedAt = new Date().toISOString();
      return true;
    }
    return false;
  },

  /**
   * Revokes all active sessions for a user (e.g., upon password reset)
   * @param {string} userId
   */
  revokeAllUserSessions(userId) {
    let count = 0;
    for (const session of sessionStore.values()) {
      if (session.userId === userId && !session.isRevoked) {
        session.isRevoked = true;
        session.revokedAt = new Date().toISOString();
        count++;
      }
    }
    return count;
  },

  /**
   * Helper to retrieve session by token
   */
  getSession(token) {
    return sessionStore.get(token) || null;
  },

  /**
   * Clear all sessions (for unit/integration testing)
   */
  clear() {
    sessionStore.clear();
  },
};

module.exports = SessionModel;
