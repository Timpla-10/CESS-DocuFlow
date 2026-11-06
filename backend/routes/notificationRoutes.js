const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { verifyUser, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

// PB-52: Readiness check for notification & mailer subsystem
router.get('/readiness', NotificationController.getReadiness);

// PB-05: User notification delivery preferences
router.get('/preferences', verifyUser, NotificationController.getPreferences);
router.put('/preferences', verifyUser, NotificationController.updatePreferences);

// PB-06: In-System Notification Center
router.get('/', verifyUser, NotificationController.getNotifications);
router.get('/unread-count', verifyUser, NotificationController.getUnreadCount);
router.patch('/:id/read', verifyUser, NotificationController.markAsRead);
router.put('/:id/read', verifyUser, NotificationController.markAsRead);
router.post('/mark-all-read', verifyUser, NotificationController.markAllAsRead);

// PB-42 & PB-49: System-wide Email & Notification Logs (College Secretary only)
router.get('/logs', verifyUser, requireRole(ROLES.SECRETARY), NotificationController.getNotificationLogs);

module.exports = router;

