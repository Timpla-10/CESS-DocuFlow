const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { verifyUser, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

// Public endpoints: Login, University Google Login, Registration, and Password Reset (PB-03)
router.post('/login', AuthController.login);
router.post('/google', AuthController.loginGoogle);
router.post('/register', AuthController.register);
router.post('/forgot-password', AuthController.requestPasswordReset);
router.post('/password-reset/request', AuthController.requestPasswordReset);
router.post('/reset-password', AuthController.confirmPasswordReset);
router.post('/password-reset/confirm', AuthController.confirmPasswordReset);

// Authenticated endpoints: Verify current role & profile, and Change Password (PB-03)
router.post('/logout', verifyUser, AuthController.logout);
router.get('/me', verifyUser, AuthController.me);
router.post('/change-password', verifyUser, AuthController.changePassword);
router.put('/password', verifyUser, AuthController.changePassword);

// Secretary (System Admin) restricted endpoints for Whitelist, Admin Verification, User/Role Management & Audit Logs
router.get('/security-logs', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getSecurityLogs);
router.get('/audit-logs', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getUserManagementAuditLogs);
router.get('/whitelist', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getWhitelist);
router.post('/whitelist', verifyUser, requireRole(ROLES.SECRETARY), AuthController.addWhitelistEntry);
router.post('/whitelist/import', verifyUser, requireRole(ROLES.SECRETARY), AuthController.importWhitelist);
router.delete('/whitelist/:id', verifyUser, requireRole(ROLES.SECRETARY), AuthController.deleteWhitelist);

router.get('/pending', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getPendingRegistrations);
router.post('/pending/:id/approve', verifyUser, requireRole(ROLES.SECRETARY), AuthController.approveRegistration);
router.post('/pending/:id/reject', verifyUser, requireRole(ROLES.SECRETARY), AuthController.rejectRegistration);

router.get('/users/audit-logs', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getUserManagementAuditLogs);
router.get('/users', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getAllUsers);
router.get('/users/:id', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getUserById);
router.post('/users', verifyUser, requireRole(ROLES.SECRETARY), AuthController.saveUser);
router.put('/users/:id', verifyUser, requireRole(ROLES.SECRETARY), AuthController.updateUser);
router.patch('/users/:id', verifyUser, requireRole(ROLES.SECRETARY), AuthController.updateUser);
router.patch('/users/:id/role', verifyUser, requireRole(ROLES.SECRETARY), AuthController.updateUserRole);
router.patch('/users/:id/status', verifyUser, requireRole(ROLES.SECRETARY), AuthController.updateUserStatus);

module.exports = router;
