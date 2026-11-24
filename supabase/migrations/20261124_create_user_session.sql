-- ============================================================================
-- Migration: 20261124_create_user_session.sql
-- Purpose:   Persistent authentication session storage for Vercel Serverless
--            Functions (PB-04 / SRS 3.1 REQ-AUTH-14).
-- Security:  Stores only SHA-256 hashes of opaque `sess_` bearer tokens.
--            Row Level Security (RLS) is enabled with NO anon/authenticated
--            policies so only the backend service-role connection can access
--            session records.
-- Note:      Additive migration only. Does not alter or drop existing tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_session (
    session_id     TEXT PRIMARY KEY,
    token_hash     TEXT UNIQUE NOT NULL,
    user_id        UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    email          VARCHAR(255) NOT NULL,
    role           VARCHAR(50) NOT NULL,
    origin         VARCHAR(20) NOT NULL DEFAULT 'CESS',
    remember_me    BOOLEAN NOT NULL DEFAULT TRUE,
    ttl_ms         BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    is_revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at     TIMESTAMPTZ
);

-- Fast lookup of active sessions for a user (cascade revocation on password reset / deactivation)
CREATE INDEX IF NOT EXISTS idx_user_session_user_active
    ON user_session (user_id, is_revoked);

-- Fast expiration sweeps / cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_session_expires_at
    ON user_session (expires_at);

-- Deny all direct client (anon / authenticated) access; backend uses service-role client only
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;

-- Grant required SessionModel operations strictly to backend service_role (never anon or authenticated)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_session TO service_role;
