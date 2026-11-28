/**
 * Shared Log & Notification Content Sanitizer (PB-03, PB-42, PB-47)
 * Guarantees passwords, OTP verification codes, recovery/session tokens,
 * and SMTP credentials are never exposed in logs, error details, or public payloads.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'oldpassword',
  'token',
  'resettoken',
  'recoverytoken',
  'access_token',
  'refresh_token',
  'otp',
  'code',
  'pass',
  'smtp_pass',
  'secret',
  'apikey',
  'api_key',
  'authorization',
]);

function redactSensitiveText(input, extraSecrets = []) {
  if (input === null || input === undefined) return input;
  let result = String(input);

  const secrets = (Array.isArray(extraSecrets) ? extraSecrets : [extraSecrets])
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());

  for (const sec of secrets) {
    if (result.includes(sec)) {
      result = result.split(sec).join('[REDACTED]');
    }
  }

  // Credentials in URLs like smtp://user:pass@host or https://user:pass@host
  result = result.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s/]+)@/g, '$1[REDACTED]:[REDACTED]@');

  // Bearer / auth tokens and JWTs / sess_ tokens
  result = result.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
  result = result.replace(/\bsess_[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]');
  result = result.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');

  // Key=value / JSON-like sensitive fields
  result = result.replace(
    /(["']?(?:password|currentPassword|newPassword|confirmPassword|oldPassword|smtp_pass|resetToken|recoveryToken|access_token|refresh_token|apiKey|api_key|secret)["']?\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^\s,;}\]]+))/gi,
    '$1[REDACTED]'
  );

  // Query parameters carrying tokens/OTPs/secrets
  result = result.replace(
    /([?&](?:token|reset_token|recovery_token|code|otp|access_token|refresh_token|key|password)=)([^&\s"']+)/gi,
    '$1[REDACTED]'
  );

  // 6-digit OTPs / verification codes in reset or auth messages
  result = result.replace(/(6-digit verification code\s*[:=-]?\s*)\d{4,8}\b/gi, '$1[REDACTED]');
  result = result.replace(/(verification code\s*[:=-]?\s*)\d{4,8}\b/gi, '$1[REDACTED]');
  result = result.replace(/(\bOTP\b(?:\s*code)?\s*[:=-]?\s*)\d{4,8}\b/gi, '$1[REDACTED]');

  return result;
}

function sanitizeErrorForLog(errorOrMessage, extraSecrets = []) {
  if (!errorOrMessage) return null;
  const raw =
    typeof errorOrMessage === 'string'
      ? errorOrMessage
      : errorOrMessage.response || errorOrMessage.message || String(errorOrMessage);

  // Drop Node stack traces if present
  const withoutStack = String(raw).split(/\r?\n\s*at\s+/)[0].trim();
  const redacted = redactSensitiveText(withoutStack, extraSecrets);
  if (redacted.length <= 280) return redacted;
  return `${redacted.slice(0, 277)}...`;
}

function sanitizeObjectForLog(input, extraSecrets = []) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return redactSensitiveText(input, extraSecrets);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObjectForLog(item, extraSecrets));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeObjectForLog(val, extraSecrets);
    }
  }
  return sanitized;
}

module.exports = {
  SENSITIVE_KEYS,
  redactSensitiveText,
  sanitizeErrorForLog,
  sanitizeObjectForLog,
};

