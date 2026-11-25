const express = require('express');
const router = express.Router();
const HomepageController = require('../controllers/homepageController');
const { verifyUser, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

/**
 * PB-47: Maintain Homepage and College Information
 * - Public routes return strictly approved public information and logos (no auth needed).
 * - Management & update routes are restricted exclusively to College Secretary.
 */
router.get('/', HomepageController.getPublicHomepage);
router.get('/public', HomepageController.getPublicHomepage);
router.get('/logos', HomepageController.getPublicLogos);

// Secretary-only management endpoints
router.get('/manage', verifyUser, requireRole(ROLES.SECRETARY), HomepageController.getManagementView);
router.get('/history', verifyUser, requireRole(ROLES.SECRETARY), HomepageController.getHistory);
router.put('/', verifyUser, requireRole(ROLES.SECRETARY), HomepageController.updateHomepageInfo);
router.put('/logos', verifyUser, requireRole(ROLES.SECRETARY), HomepageController.updateLogos);
router.post('/publish', verifyUser, requireRole(ROLES.SECRETARY), HomepageController.publishHomepage);

module.exports = router;
