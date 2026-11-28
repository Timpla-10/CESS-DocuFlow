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
      const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
      res.json({
        message: 'Notification marked as read.',
        notification: updated,
        unreadCount,
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
        success: true,
        message: 'All notifications marked as read.',
        unreadCount: 0,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06: Clear a single notification from personal inbox
   */
  async clearNotification(req, res, next) {
    try {
      const result = await NotificationModel.clearNotification(req.params.id, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-06: Clear all read notifications from personal inbox
   */
  async clearReadNotifications(req, res, next) {
    try {
      const result = await NotificationModel.clearAllReadNotifications(req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-42 & PB-49: System-wide Email & Notification Logs (College Secretary / Admin only)
   * PO Note: Secretary sees all system emails and only workflow notifications.
   */
  async getNotificationLogs(req, res, next) {
    try {
      const result = await NotificationModel.getAllLogs({
        status: req.query.status,
        deliveryMethod: req.query.deliveryMethod,
        notificationType: req.query.notificationType,
        category: req.query.category,
        scope: req.query.scope,
        search: req.query.search,
        documentId: req.query.documentId,
        recipientId: req.query.recipientId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        limit: req.query.limit,
        offset: req.query.offset,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-42: Inspect single email / workflow notification log detail (Secretary only)
   */
  async getNotificationLogById(req, res, next) {
    try {
      const log = await NotificationModel.getLogById(req.params.id);
      if (!log) {
        return res.status(404).json({ error: 'Notification log entry not found.' });
      }
      if (!log.visibleToSecretary) {
        return res.status(403).json({
          error: 'Forbidden: Only system emails and workflow notifications are visible in this log.',
        });
      }
      res.json({ log });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PB-42 / SRS REQ-NOT-4: Retry failed email delivery safely (Secretary only)
   */
  async retryNotificationLog(req, res, next) {
    try {
      const log = await NotificationModel.getLogById(req.params.id);
      if (!log) {
        return res.status(404).json({ error: 'Notification log entry not found.' });
      }
      if (!log.visibleToSecretary) {
        return res.status(403).json({
          error: 'Forbidden: Only system emails and workflow notifications can be managed here.',
        });
      }
      if (log.delivery_method === 'In_System') {
        return res.status(400).json({
          error: 'Cannot retry email delivery for an in-system-only notification.',
        });
      }
      if (log.status === 'Sent') {
        return res.status(400).json({
          error: 'Notification has already been delivered successfully.',
        });
      }
      if (!log.retryable) {
        return res.status(400).json({
          error: 'Sensitive authentication/OTP emails cannot be automatically retried from audit logs.',
        });
      }

      const retryCtx = NotificationModel.getEmailRetryContext(log.notification_id);
      const targetEmail = retryCtx?.to || log.recipientSummary?.email;
      if (!targetEmail) {
        return res.status(400).json({
          error: 'Recipient email address is unavailable for retry.',
        });
      }

      const cleanBodyText = String(retryCtx?.text || log.message || '')
        .replace(/\n?\[Delivery Error:[^\]]+\]/gi, '')
        .trim();
      const subjectLine = retryCtx?.subject || log.title || '[CESS DocuFlow] Notification';

      const dispatchResult = await EmailService.sendMail({
        to: targetEmail,
        subject: subjectLine,
        text: cleanBodyText,
        html:
          retryCtx?.html ||
          `<p>${cleanBodyText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
        recipientId: log.recipient_id,
        documentId: log.document_id,
        notificationType: log.notification_type,
        skipCreateLog: true,
      });

      const auditInfo = NotificationModel.recordRetryAttempt(log.notification_id, {
        success: dispatchResult.success,
        retriedBy: req.user?.name || req.user?.email || 'College Secretary',
      });

      const nowIso = new Date().toISOString();
      const updatedMessage = dispatchResult.success
        ? `${cleanBodyText}\n[Retried and delivered at ${nowIso}]`.trim()
        : `${cleanBodyText}\n[Delivery Error: ${dispatchResult.error || 'Email delivery failed.'}]`.trim();

      const updatedLog = await NotificationModel.updateLogStatus(log.notification_id, {
        status: dispatchResult.success ? 'Sent' : 'Failed',
        sentAt: nowIso,
        message: updatedMessage,
      });

      return res.json({
        retried: true,
        delivered: Boolean(dispatchResult.success),
        message: dispatchResult.success
          ? 'Email delivery retry succeeded.'
          : 'Email delivery retry failed; request state remains intact.',
        safeError: dispatchResult.success ? null : dispatchResult.error || 'Email delivery failed.',
        retryAudit: auditInfo,
        log: updatedLog || (await NotificationModel.getLogById(log.notification_id)),
      });
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
