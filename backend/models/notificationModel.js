const supabase = require('../config/database');
const { redactSensitiveText, sanitizeErrorForLog } = require('../utils/logSanitizer');

const prefCache = new Map(); // userId -> { user_id, receive_email, receive_in_system }
const userClearedMap = new Map(); // userId -> Set of cleared notification_ids
const emailRetryContext = new Map(); // notificationId -> { to, subject, text, html, recipientId, documentId, notificationType, allowRetry }
const retryAuditMap = new Map(); // notificationId -> { retryCount, lastRetriedAt, retriedBy, lastRetryResult }
const RETENTION_DAYS = 90; // Default 90-day retention policy (SRS 3.10)

const WORKFLOW_NOTIFICATION_TYPES = new Set([
  'Reminder_3_Days',
  'Return_Alert',
  'Reject_Alert',
  'Release_Alert',
  'Notice_Minutes_Alert',
]);

const EVENT_LABELS = {
  Reminder_3_Days: 'Automated Pending Reminder',
  Return_Alert: 'Document Returned Notice',
  Reject_Alert: 'Document Rejected Notice',
  Release_Alert: 'Document Ready / Released Notice',
  Notice_Minutes_Alert: 'Notice & Minutes Alert',
};

function normalizeAuditLog(row) {
  if (!row) return null;

  const isWorkflow =
    Boolean(row.document_id) || WORKFLOW_NOTIFICATION_TYPES.has(row.notification_type);
  const isSystemEmail =
    row.delivery_method === 'Email' || row.delivery_method === 'Both';
  const category = isWorkflow
    ? 'workflow'
    : isSystemEmail
      ? 'system_email'
      : 'personal_in_system';

  const rawTitle = row.title || '';
  const rawMessage = row.message || '';

  const errMatch = rawMessage.match(/\[Delivery Error:\s*([^\]]+)\]/i);
  const extractedError = errMatch ? sanitizeErrorForLog(errMatch[1]) : null;
  const safeError =
    extractedError || (row.status === 'Failed' ? 'Email delivery failed.' : null);

  const cleanTitle = redactSensitiveText(rawTitle);
  const cleanMessage = redactSensitiveText(rawMessage);

  const isPasswordOrOtpEmail =
    /password\s+reset|verification\s+code|recovery\s+link|temporary\s+password/i.test(
      `${cleanTitle} ${cleanMessage}`
    );

  const retryCtx = emailRetryContext.get(row.notification_id);
  const retryAudit = retryAuditMap.get(row.notification_id) || {
    retryCount: 0,
    lastRetriedAt: null,
    retriedBy: null,
    lastRetryResult: null,
  };

  const allowRetry =
    retryCtx !== undefined
      ? retryCtx.allowRetry !== false
      : !isPasswordOrOtpEmail;

  const recipientObj = row.recipient || null;
  const recipientName = recipientObj
    ? `${recipientObj.first_name || ''} ${recipientObj.last_name || ''}`.trim() ||
      recipientObj.university_email
    : null;

  let eventLabel = EVENT_LABELS[row.notification_type];
  if (!eventLabel) {
    eventLabel = row.document_id
      ? 'Document Workflow Update'
      : 'System Account / Service Email';
  }

  return {
    ...row,
    title: cleanTitle,
    message: cleanMessage,
    event: eventLabel,
    category,
    isSystemEmail,
    isWorkflow,
    visibleToSecretary: isSystemEmail || isWorkflow,
    timestamp: row.sent_at || row.created_at,
    result: row.status,
    safeError,
    recipientSummary: {
      userId: row.recipient_id,
      name: recipientName || 'Unknown Recipient',
      email: recipientObj?.university_email || null,
      department: recipientObj?.department_or_office || null,
    },
    documentSummary: row.document_id
      ? {
          documentId: row.document_id,
          controlNumber: row.document?.control_number || null,
          title: row.document?.title || null,
          currentStatus: row.document?.current_status || null,
        }
      : null,
    retryCount: retryAudit.retryCount,
    lastRetriedAt: retryAudit.lastRetriedAt,
    retriedBy: retryAudit.retriedBy,
    lastRetryResult: retryAudit.lastRetryResult,
    retryable:
      row.status !== 'Sent' && isSystemEmail && allowRetry,
  };
}

function mapPreferenceRow(row = {}) {
  const receiveEmail = row.receive_email !== false;
  const receiveInSystem = row.receive_in_system !== false;

  let preference = 'both';
  let deliveryMethod = 'Both';
  const channels = [];

  if (receiveEmail && receiveInSystem) {
    preference = 'both';
    deliveryMethod = 'Both';
    channels.push('email', 'in_system');
  } else if (receiveEmail) {
    preference = 'email_only';
    deliveryMethod = 'Email';
    channels.push('email');
  } else if (receiveInSystem) {
    preference = 'in_system_only';
    deliveryMethod = 'In_System';
    channels.push('in_system');
  } else {
    preference = 'both';
    deliveryMethod = 'Both';
    channels.push('email', 'in_system');
  }

  return {
    userId: row.user_id,
    preference,
    deliveryMethod,
    receive_email: receiveEmail,
    receive_in_system: receiveInSystem,
    channels,
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

const NotificationModel = {
  RETENTION_DAYS,

  /**
   * PB-05: Get user's notification preferences (backed by `notification_preference` table)
   */
  async getPreference(userId) {
    if (!userId) return mapPreferenceRow();

    if (prefCache.has(userId)) {
      return mapPreferenceRow(prefCache.get(userId));
    }

    const { data, error } = await supabase
      .from('notification_preference')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      const fallback = { user_id: userId, receive_email: true, receive_in_system: true };
      prefCache.set(userId, fallback);
      return mapPreferenceRow(fallback);
    }

    prefCache.set(userId, data);
    return mapPreferenceRow(data);
  },

  /**
   * PB-05: Update user's notification preferences
   */
  async updatePreference(userId, input = {}) {
    let receive_email = true;
    let receive_in_system = true;

    if (typeof input.preference === 'string') {
      const p = input.preference.toLowerCase();
      if (p === 'email_only' || p === 'email') {
        receive_email = true;
        receive_in_system = false;
      } else if (p === 'in_system_only' || p === 'in_system') {
        receive_email = false;
        receive_in_system = true;
      } else {
        receive_email = true;
        receive_in_system = true;
      }
    } else {
      if (input.receive_email !== undefined) receive_email = Boolean(input.receive_email);
      if (input.receive_in_system !== undefined) receive_in_system = Boolean(input.receive_in_system);
    }

    const payload = {
      user_id: userId,
      receive_email,
      receive_in_system,
      updated_at: new Date().toISOString(),
    };

    prefCache.set(userId, payload);

    const { data, error } = await supabase
      .from('notification_preference')
      .upsert(
        {
          user_id: userId,
          receive_email,
          receive_in_system,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      return mapPreferenceRow(payload);
    }

    return mapPreferenceRow(data || payload);
  },

  /**
   * PB-06 & PB-42: Create a notification log record in `notification_log`
   */
  async createLog({
    recipientId,
    documentId = null,
    notificationType = 'Status_Update',
    deliveryMethod = 'Both',
    title,
    message,
    status = 'Sent',
    sentAt = new Date().toISOString(),
  }) {
    const validTypes = [
      'Status_Update',
      'Reminder_3_Days',
      'Return_Alert',
      'Reject_Alert',
      'Release_Alert',
      'Notice_Minutes_Alert',
    ];
    const safeType = validTypes.includes(notificationType) ? notificationType : 'Status_Update';

    const validMethods = ['Email', 'In_System', 'Both'];
    const safeMethod = validMethods.includes(deliveryMethod) ? deliveryMethod : 'Both';

    const validStatuses = ['Pending', 'Sent', 'Failed'];
    const safeStatus = validStatuses.includes(status) ? status : 'Sent';

    const sanitizedTitle = redactSensitiveText(title || 'Notification').slice(0, 255);
    const sanitizedMessage = redactSensitiveText(message || '');

    const logRow = {
      recipient_id: recipientId,
      document_id: documentId || null,
      notification_type: safeType,
      delivery_method: safeMethod,
      title: sanitizedTitle,
      message: sanitizedMessage,
      is_read: false,
      status: safeStatus,
      sent_at: sentAt,
    };

    const { data, error } = await supabase
      .from('notification_log')
      .insert(logRow)
      .select()
      .single();

    if (error) {
      return {
        notification_id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...logRow,
        created_at: new Date().toISOString(),
      };
    }

    return data;
  },

  /**
   * PB-06: Get user's in-system notifications (filtered by recipient, read status, documentId)
   * Enriches records with relatedRequest details and filters out user-cleared items.
   */
  async getNotificationsForUser(recipientId, options = {}) {
    let query = supabase
      .from('notification_log')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false });

    if (options.documentId) {
      query = query.eq('document_id', options.documentId);
    }

    if (options.unreadOnly) {
      query = query.eq('is_read', false);
    }

    // Active retention filter: default to RETENTION_DAYS (90 days)
    const retentionDays = options.retentionDays !== undefined ? options.retentionDays : RETENTION_DAYS;
    if (retentionDays > 0) {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', cutoffDate);
    }

    if (options.limit) {
      query = query.limit(Number(options.limit));
    }

    const { data, error } = await query;
    if (error) return [];
    let list = data || [];

    // Filter out notifications cleared from personal inbox view
    const cleared = userClearedMap.get(recipientId);
    if (cleared && cleared.size > 0) {
      list = list.filter((n) => !cleared.has(n.notification_id));
    }

    // AC 1: Enrich with relatedRequest details if document_id is present
    const docIds = [...new Set(list.map((n) => n.document_id).filter(Boolean))];
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from('document_request')
        .select('document_id, control_number, title, current_status')
        .in('document_id', docIds);

      const docMap = new Map();
      if (docs) {
        for (const d of docs) {
          docMap.set(d.document_id, {
            documentId: d.document_id,
            controlNumber: d.control_number,
            title: d.title,
            status: d.current_status,
          });
        }
      }

      list = list.map((n) => ({
        ...n,
        relatedRequest: n.document_id ? (docMap.get(n.document_id) || { documentId: n.document_id }) : null,
      }));
    } else {
      list = list.map((n) => ({ ...n, relatedRequest: null }));
    }

    return list;
  },

  /**
   * PB-06: Count unread in-system notifications for user badge
   */
  async getUnreadCount(recipientId) {
    const notifications = await this.getNotificationsForUser(recipientId, { unreadOnly: true });
    return notifications.length;
  },

  /**
   * PB-06 & PB-49: Mark notification as read (with recipient ownership validation)
   */
  async markAsRead(notificationId, recipientId) {
    const { data: existing, error: findErr } = await supabase
      .from('notification_log')
      .select('*')
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (findErr || !existing) {
      const err = new Error('Notification not found.');
      err.status = 404;
      throw err;
    }

    if (existing.recipient_id !== recipientId) {
      const err = new Error('Forbidden: You can only mark your own notifications as read.');
      err.status = 403;
      throw err;
    }

    const { data, error } = await supabase
      .from('notification_log')
      .update({ is_read: true })
      .eq('notification_id', notificationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * PB-06: Mark all notifications as read for current user
   */
  async markAllAsRead(recipientId) {
    const { error } = await supabase
      .from('notification_log')
      .update({ is_read: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false);

    if (error) throw error;
    return { success: true };
  },

  /**
   * PB-06: Clear a single notification from caller's inbox
   */
  async clearNotification(notificationId, recipientId) {
    const { data: existing, error: findErr } = await supabase
      .from('notification_log')
      .select('*')
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (findErr || !existing) {
      const err = new Error('Notification not found.');
      err.status = 404;
      throw err;
    }

    if (existing.recipient_id !== recipientId) {
      const err = new Error('Forbidden: You can only clear your own notifications.');
      err.status = 403;
      throw err;
    }

    if (!userClearedMap.has(recipientId)) {
      userClearedMap.set(recipientId, new Set());
    }
    userClearedMap.get(recipientId).add(notificationId);

    return {
      success: true,
      message: 'Notification cleared from inbox.',
      notificationId,
    };
  },

  /**
   * PB-06: Clear all read notifications for user
   */
  async clearAllReadNotifications(recipientId) {
    const { data: readList, error } = await supabase
      .from('notification_log')
      .select('notification_id')
      .eq('recipient_id', recipientId)
      .eq('is_read', true);

    if (error) throw error;

    if (!userClearedMap.has(recipientId)) {
      userClearedMap.set(recipientId, new Set());
    }
    const set = userClearedMap.get(recipientId);
    let clearedCount = 0;
    for (const item of (readList || [])) {
      if (!set.has(item.notification_id)) {
        set.add(item.notification_id);
        clearedCount++;
      }
    }

    return {
      success: true,
      clearedCount,
      message: 'All read notifications have been cleared from your inbox.',
    };
  },

  /**
   * PB-06: Purge expired notifications past retention window (System maintenance)
   */
  async purgeExpiredNotifications(retentionDays = RETENTION_DAYS) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from('notification_log')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate);

    if (error) return 0;
    return count || 0;
  },

  /**
   * Reset in-memory caches (for clean integration test runs)
   */
  clearCache() {
    userClearedMap.clear();
    prefCache.clear();
  },

  recordEmailRetryContext(notificationId, payload) {
    if (!notificationId || !payload) return;
    emailRetryContext.set(notificationId, { ...payload });
  },

  getEmailRetryContext(notificationId) {
    return emailRetryContext.get(notificationId) || null;
  },

  recordRetryAttempt(notificationId, { success, retriedBy }) {
    const prev = retryAuditMap.get(notificationId) || { retryCount: 0 };
    const updated = {
      retryCount: prev.retryCount + 1,
      lastRetriedAt: new Date().toISOString(),
      retriedBy: retriedBy || 'College Secretary',
      lastRetryResult: success ? 'Sent' : 'Failed',
    };
    retryAuditMap.set(notificationId, updated);
    return updated;
  },

  async updateLogStatus(notificationId, { status, message, sentAt, title }) {
    const updates = {};
    if (status) updates.status = status;
    if (sentAt) updates.sent_at = sentAt;
    if (title !== undefined) updates.title = redactSensitiveText(title).slice(0, 255);
    if (message !== undefined) updates.message = redactSensitiveText(message);

    const { data, error } = await supabase
      .from('notification_log')
      .update(updates)
      .eq('notification_id', notificationId)
      .select(`
        *,
        recipient:recipient_id (
          user_id,
          first_name,
          last_name,
          university_email,
          department_or_office
        )
      `)
      .single();

    if (error) return null;
    return normalizeAuditLog(data);
  },

  /**
   * PB-42: Inspect single notification audit log entry (Secretary only)
   */
  async getLogById(notificationId) {
    let { data, error } = await supabase
      .from('notification_log')
      .select(`
        *,
        recipient:recipient_id (
          user_id,
          first_name,
          last_name,
          university_email,
          department_or_office
        ),
        document:document_id (
          document_id,
          control_number,
          title,
          current_status
        )
      `)
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (error) {
      const fallback = await supabase
        .from('notification_log')
        .select(`
          *,
          recipient:recipient_id (
            user_id,
            first_name,
            last_name,
            university_email,
            department_or_office
          )
        `)
        .eq('notification_id', notificationId)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      data = fallback.data;
    }

    return data ? normalizeAuditLog(data) : null;
  },

  /**
   * PB-42 & PB-49: List system emails and workflow notification logs (Secretary only).
   * PO Note: Secretary sees all system emails and only workflow notifications.
   */
  async getAllLogs(options = {}) {
    const buildQuery = (withDocJoin) => {
      const selectClause = withDocJoin
        ? `
          *,
          recipient:recipient_id (
            user_id,
            first_name,
            last_name,
            university_email,
            department_or_office
          ),
          document:document_id (
            document_id,
            control_number,
            title,
            current_status
          )
        `
        : `
          *,
          recipient:recipient_id (
            user_id,
            first_name,
            last_name,
            university_email,
            department_or_office
          )
        `;

      let query = supabase
        .from('notification_log')
        .select(selectClause)
        .order('created_at', { ascending: false });

      if (options.status) {
        query = query.eq('status', options.status);
      }
      if (options.deliveryMethod) {
        query = query.eq('delivery_method', options.deliveryMethod);
      }
      if (options.notificationType) {
        query = query.eq('notification_type', options.notificationType);
      }
      if (options.documentId) {
        query = query.eq('document_id', options.documentId);
      }
      if (options.recipientId) {
        query = query.eq('recipient_id', options.recipientId);
      }
      if (options.dateFrom) {
        query = query.gte('created_at', new Date(options.dateFrom).toISOString());
      }
      if (options.dateTo) {
        const end = new Date(options.dateTo);
        if (!Number.isNaN(end.getTime())) {
          // Include entire end date if YYYY-MM-DD was provided
          if (String(options.dateTo).length <= 10) {
            end.setUTCHours(23, 59, 59, 999);
          }
          query = query.lte('created_at', end.toISOString());
        }
      }
      return query;
    };

    let { data, error } = await buildQuery(true);
    if (error) {
      const fallback = await buildQuery(false);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return {
        total: 0,
        sent: 0,
        failed: 0,
        pending: 0,
        workflowCount: 0,
        systemEmailCount: 0,
        limit: Number(options.limit) || 50,
        offset: Number(options.offset) || 0,
        logs: [],
      };
    }

    let normalized = (data || []).map(normalizeAuditLog);

    // PO Note visibility enforcement: Secretary sees all system emails and only workflow notifications
    if (options.includeAllRaw !== true) {
      normalized = normalized.filter((item) => item.visibleToSecretary);
    }

    // Category / scope filter ('all' | 'workflow' | 'system_email' | 'email')
    const catFilter = String(options.category || options.scope || '').trim().toLowerCase();
    if (catFilter === 'workflow') {
      normalized = normalized.filter((item) => item.isWorkflow);
    } else if (catFilter === 'system_email' || catFilter === 'email') {
      normalized = normalized.filter((item) => item.isSystemEmail);
    }

    // Full-text search across sanitized metadata
    if (options.search && String(options.search).trim()) {
      const q = String(options.search).trim().toLowerCase();
      normalized = normalized.filter((item) => {
        const haystack = [
          item.event,
          item.title,
          item.message,
          item.safeError,
          item.notification_type,
          item.recipientSummary?.name,
          item.recipientSummary?.email,
          item.documentSummary?.controlNumber,
          item.documentSummary?.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    const total = normalized.length;
    const sentCount = normalized.filter((l) => l.status === 'Sent').length;
    const failedCount = normalized.filter((l) => l.status === 'Failed').length;
    const pendingCount = normalized.filter((l) => l.status === 'Pending').length;
    const workflowCount = normalized.filter((l) => l.isWorkflow).length;
    const systemEmailCount = normalized.filter((l) => l.isSystemEmail).length;

    const limit = Math.max(1, Number(options.limit) || 50);
    const offset = Math.max(0, Number(options.offset) || 0);
    const paginatedLogs = normalized.slice(offset, offset + limit);

    return {
      total,
      sent: sentCount,
      failed: failedCount,
      pending: pendingCount,
      workflowCount,
      systemEmailCount,
      scope: catFilter || 'system_emails_and_workflow',
      limit,
      offset,
      logs: paginatedLogs,
    };
  },
};

module.exports = NotificationModel;
