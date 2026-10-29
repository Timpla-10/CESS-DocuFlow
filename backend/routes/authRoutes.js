const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { verifyUser, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

// Public endpoints: Login, University Google Login, and Registration
router.post('/login', AuthController.login);
router.post('/google', AuthController.loginGoogle);
router.post('/register', AuthController.register);

// Authenticated endpoint: Verify current role & profile
router.get('/me', verifyUser, AuthController.me);

// Secretary (System Admin) restricted endpoints for Whitelist & Admin Verification
router.get('/whitelist', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getWhitelist);
router.post('/whitelist/import', verifyUser, requireRole(ROLES.SECRETARY), AuthController.importWhitelist);
router.delete('/whitelist/:id', verifyUser, requireRole(ROLES.SECRETARY), AuthController.deleteWhitelist);

router.get('/pending', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getPendingRegistrations);
router.post('/pending/:id/approve', verifyUser, requireRole(ROLES.SECRETARY), AuthController.approveRegistration);
router.post('/pending/:id/reject', verifyUser, requireRole(ROLES.SECRETARY), AuthController.rejectRegistration);

router.get('/users', verifyUser, requireRole(ROLES.SECRETARY), AuthController.getAllUsers);
router.post('/users', verifyUser, requireRole(ROLES.SECRETARY), AuthController.saveUser);

module.exports = router;
