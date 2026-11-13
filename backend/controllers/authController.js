const AuthService = require('../services/authService');
const UserModel = require('../models/userModel');
const { getRoleLabel } = require('../utils/roles');

const AuthController = {
  /** POST /api/auth/login — Sign In with Email & Password */
  async login(req, res, next) {
    try {
      const { email, password, rememberMe } = req.body;
      const result = await AuthService.loginUser(email, password, rememberMe);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/google — Sign In with University Google Workspace */
  async loginGoogle(req, res, next) {
    try {
      const { email, rememberMe } = req.body;
      const result = await AuthService.loginWithGoogle(email, rememberMe);
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

  /** POST /api/auth/logout — Explicit logout ending the session (PB-04) */
  async logout(req, res, next) {
    try {
      const token = req.headers.authorization || req.headers['x-session-token'];
      const result = await AuthService.logoutUser(token, req.user);
      res.json(result);
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

  /** GET /api/auth/whitelist — List pre-registered / activated whitelist with optional filters (Secretary only, PB-43) */
  async getWhitelist(req, res, next) {
    try {
      let list = await UserModel.getAllWhitelist();
      const { role, origin, status, search } = req.query || {};
      if (role && role !== 'all') {
        list = list.filter((u) => u.role === String(role).toLowerCase());
      }
      if (origin && origin !== 'all') {
        list = list.filter((u) => String(u.origin || 'CESS').toUpperCase() === String(origin).toUpperCase());
      }
      if (status && status !== 'all') {
        const s = String(status).toLowerCase();
        list = list.filter((u) =>
          s === 'active' ? u.active : s === 'inactive' ? !u.active : String(u.account_status || '').toLowerCase() === s
        );
      }
      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        list = list.filter(
          (u) =>
            String(u.name || '').toLowerCase().includes(q) ||
            String(u.email || '').toLowerCase().includes(q) ||
            String(u.department || '').toLowerCase().includes(q)
        );
      }
      res.json({ count: list.length, whitelist: list });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/whitelist — Add a single entry to approved whitelist (duplicate prevented, PB-43) */
  async addWhitelistEntry(req, res, next) {
    try {
      const saved = await AuthService.addWhitelistEntry(req.user, req.body || {});
      res.status(201).json({ user: saved });
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

  /** DELETE /api/auth/whitelist/:id — Remove whitelist entry & revoke access (Secretary only, PB-43) */
  async deleteWhitelist(req, res, next) {
    try {
      const reason = req.body?.reason || req.query?.reason || null;
      const updated = await AuthService.removeWhitelistEntry(req.user, req.params.id, reason);
      res.json({ deleted: true, user: updated });
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

  /** GET /api/auth/users — List all users with role/origin/status filters (Secretary only, PB-43) */
  async getAllUsers(req, res, next) {
    try {
      const users = await UserModel.findAll();
      let formatted = users.map((u) => ({
        ...u,
        roleLabel: getRoleLabel(u.role, u.origin),
      }));

      const { role, origin, status, search } = req.query || {};
      if (role && role !== 'all') {
        formatted = formatted.filter((u) => u.role === String(role).toLowerCase());
      }
      if (origin && origin !== 'all') {
        formatted = formatted.filter(
          (u) => String(u.origin || 'CESS').toUpperCase() === String(origin).toUpperCase()
        );
      }
      if (status && status !== 'all') {
        const s = String(status).toLowerCase();
        formatted = formatted.filter((u) => {
          if (s === 'active') return u.active;
          if (s === 'inactive') return u.account_status === 'Inactive' || !u.active;
          if (s === 'pending') return u.account_status === 'Pending_Verification';
          return String(u.account_status || '').toLowerCase() === s;
        });
      }
      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        formatted = formatted.filter(
          (u) =>
            String(u.name || '').toLowerCase().includes(q) ||
            String(u.email || '').toLowerCase().includes(q) ||
            String(u.department || '').toLowerCase().includes(q) ||
            String(u.roleLabel || '').toLowerCase().includes(q)
        );
      }

      res.json({ count: formatted.length, users: formatted });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/users/:id — Inspect single user account & role (Secretary only, PB-43) */
  async getUserById(req, res, next) {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User account not found.' });
      }
      res.json({
        user: {
          ...user,
          roleLabel: getRoleLabel(user.role, user.origin),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/users — Direct Admin User creation with duplicate prevention (Secretary only, PB-43) */
  async saveUser(req, res, next) {
    try {
      const saved = await AuthService.saveUserAccount(req.user, req.body);
      res.status(201).json({ user: saved });
    } catch (err) {
      next(err);
    }
  },

  /** PUT/PATCH /api/auth/users/:id — Update user profile/role/status (Secretary only, PB-43) */
  async updateUser(req, res, next) {
    try {
      const updated = await AuthService.updateUserAccount(req.user, req.params.id, req.body || {});
      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/auth/users/:id/role — Assign/change verified role (Secretary only, PB-43) */
  async updateUserRole(req, res, next) {
    try {
      const updated = await AuthService.updateUserRole(req.user, req.params.id, req.body || {});
      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/auth/users/:id/status — Activate or deactivate account (Secretary only, PB-43) */
  async updateUserStatus(req, res, next) {
    try {
      const updated = await AuthService.updateUserStatus(req.user, req.params.id, req.body || {});
      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/audit-logs — Traceable user/role/whitelist change logs (Secretary only, PB-43) */
  async getUserManagementAuditLogs(req, res, next) {
    try {
      const { action, targetUserId, targetEmail, limit } = req.query || {};
      const logs = AuthService.getUserManagementAuditLogs({
        action,
        targetUserId,
        targetEmail,
        limit,
      });
      res.json({ count: logs.length, logs });
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
