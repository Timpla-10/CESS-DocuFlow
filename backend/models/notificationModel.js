const supabase = require('../config/database');

const prefCache = new Map(); // userId -> { user_id, receive_email, receive_in_system }

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

    const logRow = {
      recipient_id: recipientId,
      document_id: documentId || null,
      notification_type: safeType,
      delivery_method: safeMethod,
      title: (title || 'Notification').slice(0, 255),
      message: message || '',
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

    if (options.limit) {
      query = query.limit(Number(options.limit));
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  },

  /**
   * PB-06: Count unread in-system notifications for user badge
   */
  async getUnreadCount(recipientId) {
    const { count, error } = await supabase
      .from('notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
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
   * PB-42 & PB-49: List all email/notification logs (Secretary / Admin only)
   */
  async getAllLogs(options = {}) {
    let query = supabase
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
      `, { count: 'exact' })
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

    const limit = Number(options.limit) || 50;
    const offset = Number(options.offset) || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      return { total: 0, sent: 0, failed: 0, logs: [] };
    }

    const logs = data || [];
    const sentCount = logs.filter((l) => l.status === 'Sent').length;
    const failedCount = logs.filter((l) => l.status === 'Failed').length;

    return {
      total: count || logs.length,
      sent: sentCount,
      failed: failedCount,
      limit,
      offset,
      logs,
    };
  },
};

module.exports = NotificationModel;

