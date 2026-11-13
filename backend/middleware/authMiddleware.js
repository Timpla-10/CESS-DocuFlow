const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const SessionModel = require('../models/sessionModel');
const { getRoleLabel, canPerformAction } = require('../utils/roles');

/**
 * PB-02 & PB-04 Middleware: Authenticates the request and verifies user role & active status.
 * Supports:
 * 1. DocuFlow Session token via `Authorization: Bearer <sess_...>` or `x-session-token`
 * 2. Supabase Auth JWT token via `Authorization: Bearer <token>`
 * 3. Institutional user lookup via `x-user-id` or `x-user-email` header
 */
async function verifyUser(req, res, next) {
  try {
    let profile = null;
    const authHeader = req.headers.authorization;
    const sessionTokenHeader = req.headers['x-session-token'];
    const headerUserId = req.headers['x-user-id'];
    const headerUserEmail = req.headers['x-user-email'];

    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : null;
    const directToken = bearerToken || (sessionTokenHeader ? sessionTokenHeader.trim() : null);

    if (directToken) {
      // Check if this is a DocuFlow session token (PB-04)
      if (directToken.startsWith('sess_')) {
        const validation = SessionModel.validateSession(directToken);
        if (!validation.valid) {
          return res.status(validation.status || 401).json({
            error: `Unauthorized: ${validation.reason || 'Invalid or expired session.'}`,
          });
        }
        profile = await UserModel.findById(validation.session.userId);
        req.session = validation.session;
      } else {
        // Fallback to Supabase JWT verification
        const { data, error } = await supabase.auth.getUser(directToken);
        if (error || !data?.user) {
          return res.status(401).json({
            error: 'Unauthorized: Invalid or expired authentication token.',
          });
        }
        profile = await UserModel.findById(data.user.id);
      }
    } else if (headerUserId) {
      profile = await UserModel.findById(headerUserId);
    } else if (headerUserEmail) {
      profile = await UserModel.findByEmail(headerUserEmail);
    } else {
      return res.status(401).json({
        error: 'Unauthorized: Missing authentication credentials.',
      });
    }

    if (!profile) {
      return res.status(403).json({
        error: 'Access Denied: Account not found or pending College Secretary verification.',
      });
    }

    if (!profile.active) {
      return res.status(403).json({
        error: 'Access Denied: Your account has been deactivated by the College Secretary.',
      });
    }

    req.user = {
      ...profile,
      roleLabel: getRoleLabel(profile.role, profile.origin),
    };

    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(500).json({ error: 'Internal server error during role verification.' });
  }
}

/**
 * PB-02 Middleware: Restricts route access to specific allowed roles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No verified user in request.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Action denied for role '${req.user.roleLabel}'. Permitted roles: ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
}

/**
 * PB-02 Middleware: Checks action-level permission via canPerformAction.
 */
function requireAction(action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No verified user in request.' });
    }

    if (!canPerformAction(req.user, action)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.user.roleLabel}' is not permitted to perform '${action}'.`,
      });
    }

    next();
  };
}

module.exports = {
  verifyUser,
  requireRole,
  requireAction,
};
