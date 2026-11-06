const NotificationModel = require('../models/notificationModel');
const EmailService = require('../services/emailService');
const { isConfigured, host, port, user: smtpUser } = require('../config/mailer');

const NotificationController = {
  /**
   * PB-05: Get user's notification preferences
   */
  async getPreferences(req, res, next) {
    try {
      const preference = await NotificationModel.getPreference(req.user.id);
      res.json({ preference });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-05: Update user's notification preferences (both, email_only, in_system_only)
   */
  async updatePreferences(req, res, next) {
    try {
      const updated = await NotificationModel.updatePreference(req.user.id, req.body);
      res.json({
        message: 'Notification preferences updated successfully.',
        preference: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06: In-System Notification Center — List current user's notifications
   */
  async getNotifications(req, res, next) {
    try {
      const unreadOnly = req.query.unread === 'true' || req.query.unreadOnly === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const documentId = req.query.documentId || null;

      const [notifications, unreadCount] = await Promise.all([
        NotificationModel.getNotificationsForUser(req.user.id, { unreadOnly, limit, documentId }),
        NotificationModel.getUnreadCount(req.user.id),
      ]);

      res.json({
        count: notifications.length,
        unreadCount,
        notifications,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06: Count unread notifications for navigation badge
   */
  async getUnreadCount(req, res, next) {
    try {
      const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
      res.json({ unreadCount });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06 & PB-49: Mark single notification as read (with recipient ownership validation)
   */
  async markAsRead(req, res, next) {
    try {
      const updated = await NotificationModel.markAsRead(req.params.id, req.user.id);
      res.json({
        message: 'Notification marked as read.',
        notification: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06: Mark all notifications as read for current user
   */
  async markAllAsRead(req, res, next) {
    try {
      await NotificationModel.markAllAsRead(req.user.id);
      res.json({
        message: 'All notifications marked as read.',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-42 & PB-49: System-wide Email & Notification Logs (College Secretary / Admin only)
   */
  async getNotificationLogs(req, res, next) {
    try {
      const result = await NotificationModel.getAllLogs({
        status: req.query.status,
        deliveryMethod: req.query.deliveryMethod,
        notificationType: req.query.notificationType,
        limit: req.query.limit,
        offset: req.query.offset,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-52: Deployment & Recovery Readiness Check for Email and Notification System
   */
  async getReadiness(req, res, next) {
    try {
      const isSmtpReady = await EmailService.verifySmtp();
      res.json({
        status: isSmtpReady ? 'ready' : 'degraded',
        service: 'CESS-DocuFlow Notification & Mailer Subsystem',
        smtp: {
          configured: isConfigured,
          host,
          port,
          user: smtpUser,
          connection: isSmtpReady ? 'connected' : 'offline',
        },
        deliveryChannels: ['email', 'in_system', 'hybrid_both'],
        features: {
          accountVerificationAlerts: true,
          passwordResetMailer: true,
          submissionConfirmation: true,
          notificationPreferences: true,
          inSystemNotificationCenter: true,
          auditNotificationLogs: true,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = NotificationController;
