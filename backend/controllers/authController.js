const AuthService = require('../services/authService');
const UserModel = require('../models/userModel');
const { getRoleLabel } = require('../utils/roles');

const AuthController = {
  /** POST /api/auth/login — Sign In with Email & Password */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.loginUser(email, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/google — Sign In with University Google Workspace */
  async loginGoogle(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.loginWithGoogle(email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/register — Register via Whitelist Auto-Verify or Admin Approval Queue */
  async register(req, res, next) {
    try {
      const result = await AuthService.registerUser(req.body);
      const statusCode = result.status === 'activated' ? 201 : 202;
      res.status(statusCode).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/me — Verify current user session, role, and permissions */
  async me(req, res) {
    res.json({
      verified: true,
      user: req.user,
    });
  },

  /** GET /api/auth/whitelist — List pre-registered / activated whitelist (Secretary only) */
  async getWhitelist(req, res, next) {
    try {
      const list = await UserModel.getAllWhitelist();
      res.json({ count: list.length, whitelist: list });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/whitelist/import — Import masterlist entries (Secretary only) */
  async importWhitelist(req, res, next) {
    try {
      const { entries, term } = req.body;
      const result = await AuthService.importWhitelist(req.user, entries, term);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /api/auth/whitelist/:id — Remove whitelist entry (Secretary only) */
  async deleteWhitelist(req, res, next) {
    try {
      await UserModel.deleteWhitelistById(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/pending — List pending registration requests (Secretary only) */
  async getPendingRegistrations(req, res, next) {
    try {
      const pending = await UserModel.getAllPendingRegistrations();
      res.json({ count: pending.length, pendingRegistrations: pending });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/pending/:id/approve — Approve pending registration & assign role (Secretary only) */
  async approveRegistration(req, res, next) {
    try {
      const result = await AuthService.approvePendingRegistration(
        req.user,
        req.params.id,
        req.body
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/pending/:id/reject — Reject pending registration (Secretary only) */
  async rejectRegistration(req, res, next) {
    try {
      const result = await AuthService.rejectPendingRegistration(
        req.user,
        req.params.id,
        req.body.reason
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/users — List all users (Secretary only) */
  async getAllUsers(req, res, next) {
    try {
      const users = await UserModel.findAll();
      const formatted = users.map((u) => ({
        ...u,
        roleLabel: getRoleLabel(u.role, u.origin),
      }));
      res.json({ count: formatted.length, users: formatted });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/users — Direct Admin User creation/update (Secretary only) */
  async saveUser(req, res, next) {
    try {
      const saved = await AuthService.saveUserAccount(req.user, req.body);
      res.status(201).json({ user: saved });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/forgot-password — Request password reset via registered university email (PB-03) */
  async requestPasswordReset(req, res, next) {
    try {
      const { email, redirectTo } = req.body || {};
      const result = await AuthService.requestPasswordReset(email, { redirectTo });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/reset-password — Confirm password reset with recovery token & new password (PB-03) */
  async confirmPasswordReset(req, res, next) {
    try {
      const result = await AuthService.confirmPasswordReset(req.body || {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/change-password — Signed-in user changes account password (PB-03) */
  async changePassword(req, res, next) {
    try {
      const result = await AuthService.changePassword(req.user, req.body || {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/security-logs — Inspect sanitized account security logs (Secretary only, PB-03) */
  async getSecurityLogs(req, res, next) {
    try {
      const logs = AuthService.getSecurityLogs();
      res.json({ count: logs.length, logs });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AuthController;
