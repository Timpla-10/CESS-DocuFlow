const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PRODUCTION_FRONTEND_URL = 'https://cess-docu-flow.vercel.app';
const LOCAL_FRONTEND_URL = 'http://localhost:5173';
const VERCEL_PREVIEW_ORIGIN_RE = /^https:\/\/cess-docu-flow-[a-z0-9-]+\.vercel\.app$/i;
const LOCAL_DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function normalizeOrigin(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function getAllowedFrontendOrigins() {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.CLIENT_URL,
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return Array.from(
    new Set([
      PRODUCTION_FRONTEND_URL,
      LOCAL_FRONTEND_URL,
      'http://localhost:8080',
      ...envOrigins,
    ])
  );
}

function isTrustedFrontendOrigin(rawOrigin) {
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return false;
  if (getAllowedFrontendOrigins().includes(origin)) return true;
  if (VERCEL_PREVIEW_ORIGIN_RE.test(origin)) return true;
  if (!isProductionRuntime() && LOCAL_DEV_ORIGIN_RE.test(origin)) return true;
  return false;
}

function getDefaultFrontendUrl() {
  const configured = normalizeOrigin(
    process.env.FRONTEND_URL || process.env.APP_URL || process.env.CLIENT_URL
  );
  if (configured) return configured;
  return isProductionRuntime() ? PRODUCTION_FRONTEND_URL : LOCAL_FRONTEND_URL;
}

function resolveFrontendBaseUrl({ redirectTo, origin, referer } = {}) {
  for (const candidate of [redirectTo, origin, referer]) {
    const candidateOrigin = normalizeOrigin(candidate);
    if (candidateOrigin && isTrustedFrontendOrigin(candidateOrigin)) {
      return candidateOrigin;
    }
  }
  return getDefaultFrontendUrl();
}

function buildPasswordResetUrl({ email, token, redirectTo, origin, referer } = {}) {
  const baseOrigin = resolveFrontendBaseUrl({ redirectTo, origin, referer });

  let targetPath = '/forgot-password';
  if (redirectTo && typeof redirectTo === 'string') {
    try {
      const parsed = new URL(redirectTo.trim());
      if (isTrustedFrontendOrigin(parsed.origin)) {
        const cleanPath = parsed.pathname.replace(/\/+$/, '');
        if (cleanPath && cleanPath !== '/' && cleanPath !== '/reset-password') {
          targetPath = cleanPath;
        }
      }
    } catch {
      // Fallback to /forgot-password
    }
  }

  const url = new URL(targetPath, baseOrigin);
  if (email) url.searchParams.set('email', email);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  PRODUCTION_FRONTEND_URL,
  LOCAL_FRONTEND_URL,
  normalizeOrigin,
  isProductionRuntime,
  getAllowedFrontendOrigins,
  isTrustedFrontendOrigin,
  getDefaultFrontendUrl,
  resolveFrontendBaseUrl,
  buildPasswordResetUrl,
};
