const supabase = require('../config/database');

const DOC_SELECT = `
  *,
  office:current_office_id (
    office_id,
    office_name,
    office_type
  ),
  document_type:doc_type_id (
    doc_type_id,
    type_name,
    origin,
    standard_processing_days
  ),
  document_attachment (*),
  document_history (
    *,
    office:action_office_id (
      office_id,
      office_name,
      office_type
    ),
    user:action_by_user_id (
      user_id,
      first_name,
      last_name,
      university_email
    )
  )
`;

const ACTION_TO_STATUS = {
  Submitted: 'Submitted',
  Content_Verified: 'Under_Review',
  Routed: 'Under_Review',
  Endorsed: 'Under_Review',
  Approved: 'Under_Review',
  Returned: 'Returned',
  Rejected: 'Rejected',
  Sent_External: 'With_External_Office',
  Returned_External: 'Under_Review',
  Ready_for_Release: 'Ready_for_Release',
  Released: 'Released',
  Archived: 'Archived',
};

const STATUS_LABELS = {
  Submitted: 'Submitted',
  Under_Review: 'Under Review',
  Returned: 'Returned for Revision',
  Rejected: 'Rejected / Disapproved',
  With_External_Office: 'With External Office',
  Ready_for_Release: 'Ready for Release',
  Released: 'Released',
  Archived: 'Archived',
};

const docCache = new Map();
const prefCache = new Map();
let officeLookupByName = {};
let officeLookupById = {};

async function ensureOfficesLoaded() {
  if (Object.keys(officeLookupByName).length > 0) return;
  const { data } = await supabase.from('office').select('office_id, office_name, office_type');
  if (Array.isArray(data)) {
    for (const o of data) {
      officeLookupByName[o.office_name] = o;
      officeLookupById[o.office_id] = o;
    }
  }
}

function resolveNextOfficeFromDecision(actionType, actingOfficeName, origin = 'CESS', documentId = null) {
  if (actionType === 'Approved') {
    return officeLookupByName['College Secretary'] || null;
  }
  if (actionType === 'Endorsed') {
    if (documentId) {
      try {
        const WorkflowRouteModel = require('./workflowRouteModel');
        const route = WorkflowRouteModel.getRouteForDocument({ document_id: documentId, origin });
        if (Array.isArray(route) && route.length > 0) {
          const normActing = WorkflowRouteModel.normalizeOfficeName(actingOfficeName);
          const idx = route.findIndex((o) => o === normActing);
          if (idx !== -1 && idx < route.length - 1) {
            const nextName = route[idx + 1];
            if (officeLookupByName[nextName]) {
              return officeLookupByName[nextName];
            }
          }
        }
      } catch (e) {
        // Fallback to static sequence below
      }
    }
    if (actingOfficeName === 'Department Chairperson') {
      const targetName = origin === 'IDS' ? 'IDS Principal' : 'College Dean';
      return officeLookupByName[targetName] || null;
    }
    if (actingOfficeName === 'IDS Principal') {
      return officeLookupByName['College Dean'] || null;
    }
    if (actingOfficeName === 'College Dean') {
      return officeLookupByName['OVCAA'] || null;
    }
    if (actingOfficeName === 'OVCAA' || actingOfficeName === 'VCAF') {
      return officeLookupByName['Office of the Chancellor'] || null;
    }
  }
  return null;
}

function normalizeDoc(raw) {
  if (!raw) return null;
  const history = Array.isArray(raw.document_history)
    ? [...raw.document_history].sort(
        (a, b) => new Date(a.action_timestamp) - new Date(b.action_timestamp)
      )
    : [];

  let current_status = raw.current_status;
  let current_office_id = raw.current_office_id;
  let office = raw.office;
  let is_deleted = raw.is_deleted;

  const current_revision_no = history.reduce(
    (max, h) => Math.max(max, Number(h.revision_no) || 1),
    Number(raw.current_revision_no) || 1
  );

  let returnReason = null;
  let returnInfo = null;
  let rejectionReason = null;
  let rejectionInfo = null;
  let lastDecision = null;

  if (history.length > 0) {
    const latest = history[history.length - 1];
    if (latest.action_type === 'Archived') {
      is_deleted = true;
    }
    if (ACTION_TO_STATUS[latest.action_type]) {
      current_status = ACTION_TO_STATUS[latest.action_type];
    }
    if (latest.action_type === 'Returned' || latest.action_type === 'Rejected') {
      current_office_id = null;
      office = null;
    } else if (latest.action_type === 'Endorsed' || latest.action_type === 'Approved') {
      const actingName = latest.office?.office_name || officeLookupById[latest.action_office_id]?.office_name;
      const nextOfficeObj = resolveNextOfficeFromDecision(latest.action_type, actingName, raw.origin, raw.document_id);
      if (nextOfficeObj) {
        current_office_id = nextOfficeObj.office_id;
        office = nextOfficeObj;
      } else if (latest.action_office_id) {
        current_office_id = latest.action_office_id;
        office = latest.office || office;
      }
    } else if (latest.action_office_id) {
      current_office_id = latest.action_office_id;
      office = latest.office || office;
    }

    const decisionTypes = ['Endorsed', 'Approved', 'Returned', 'Rejected'];
    const latestDecisionEntry = [...history].reverse().find((h) => decisionTypes.includes(h.action_type));
    if (latestDecisionEntry) {
      lastDecision = {
        action: latestDecisionEntry.action_type,
        remarks: latestDecisionEntry.action_remarks || '',
        actorId: latestDecisionEntry.action_by_user_id || null,
        office: latestDecisionEntry.office?.office_name || officeLookupById[latestDecisionEntry.action_office_id]?.office_name || 'Reviewing Office',
        officeId: latestDecisionEntry.action_office_id || null,
        timestamp: latestDecisionEntry.action_timestamp,
        revisionNo: latestDecisionEntry.revision_no,
      };
    }

    if (current_status === 'Returned') {
      const latestReturn = [...history].reverse().find((h) => h.action_type === 'Returned');
      if (latestReturn) {
        returnReason = latestReturn.action_remarks || null;
        returnInfo = {
          reason: latestReturn.action_remarks || '',
          reasons: latestReturn.action_remarks || '',
          office: latestReturn.office?.office_name || 'Reviewing Office',
          officeId: latestReturn.action_office_id || null,
          byUserId: latestReturn.action_by_user_id || null,
          at: latestReturn.action_timestamp,
          revisionNo: latestReturn.revision_no,
        };
      }
    }

    if (current_status === 'Rejected') {
      const latestReject = [...history].reverse().find((h) => h.action_type === 'Rejected');
      if (latestReject) {
        rejectionReason = latestReject.action_remarks || null;
        rejectionInfo = {
          reason: latestReject.action_remarks || '',
          reasons: latestReject.action_remarks || '',
          office: latestReject.office?.office_name || 'Reviewing Office',
          officeId: latestReject.action_office_id || null,
          byUserId: latestReject.action_by_user_id || null,
          at: latestReject.action_timestamp,
          revisionNo: latestReject.revision_no,
        };
      }
    }
  }

  const cached = docCache.get(raw.document_id);
  if (cached && cached.current_office_id !== undefined && current_status === 'Under_Review') {
    current_office_id = cached.current_office_id;
    if (cached.current_office_id && officeLookupById[cached.current_office_id]) {
      office = officeLookupById[cached.current_office_id];
    }
  }

  const statusLabel = STATUS_LABELS[current_status] || current_status;

  // PB-26 / REQ-REC-4: Normalize each history milestone with actor, office, action, remarks, timestamp
  const normalizedHistory = history.map((h) => {
    const actorName = h.user
      ? `${h.user.first_name || ''} ${h.user.last_name || ''}`.trim() || h.user.university_email
      : null;
    const officeName = h.office?.office_name || officeLookupById[h.action_office_id]?.office_name || null;
    return {
      history_id: h.history_id,
      id: h.history_id,
      document_id: h.document_id,
      revision_no: Number(h.revision_no) || 1,
      action_type: h.action_type,
      action: h.action_type,
      action_remarks: h.action_remarks || '',
      remarks: h.action_remarks || '',
      action_timestamp: h.action_timestamp,
      timestamp: h.action_timestamp,
      action_by_user_id: h.action_by_user_id,
      actor_id: h.action_by_user_id,
      actor_name: actorName,
      actor: actorName,
      actor_email: h.user?.university_email || null,
      action_office_id: h.action_office_id,
      office_id: h.action_office_id,
      office_name: officeName,
      office: officeName,
    };
  });

  // PB-26 / REQ-TRK-2: Calculate office arrival timestamp (officeSince) & waiting duration (timeWaitingMs)
  let officeSince = raw.submitted_at || null;
  if (history.length > 0) {
    const latestAction = history[history.length - 1];
    officeSince = latestAction.action_timestamp || raw.submitted_at;
  }
  const officeSinceDate = officeSince ? new Date(officeSince) : new Date();
  const timeWaitingMs = Math.max(0, Date.now() - officeSinceDate.getTime());

  return {
    ...raw,
    id: raw.document_id,
    current_status,
    statusLabel,
    current_office_id,
    current_revision_no,
    office,
    officeSince,
    timeWaitingMs,
    is_deleted,
    returnReason,
    returnInfo,
    rejectionReason,
    rejectionInfo,
    lastDecision,
    document_history: normalizedHistory,
    history: normalizedHistory,
    timeline: normalizedHistory,
    document_attachment: raw.document_attachment || [],
    attachments: raw.document_attachment || [],
  };
}

function mapPreferenceRow(row) {
  const receiveEmail = row ? Boolean(row.receive_email) : true;
  const receiveInSystem = row ? Boolean(row.receive_in_system) : true;

  let deliveryMethod = 'Both';
  let preference = 'both';
  let channels = ['email', 'in_system'];

  if (receiveEmail && !receiveInSystem) {
    deliveryMethod = 'Email';
    preference = 'email_only';
    channels = ['email'];
  } else if (!receiveEmail && receiveInSystem) {
    deliveryMethod = 'In_System';
    preference = 'in_system_only';
    channels = ['in_system'];
  }

  return {
    receive_email: receiveEmail,
    receive_in_system: receiveInSystem,
    deliveryMethod,
    preference,
    channels,
  };
}

const DocumentModel = {
  async findAll() {
    await ensureOfficesLoaded();
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('is_deleted', false)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeDoc).filter((d) => !d.is_deleted);
  },

  async findById(id) {
    await ensureOfficesLoaded();
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('document_id', id)
      .maybeSingle();
    if (error) throw error;
    const doc = normalizeDoc(data);
    const cached = docCache.get(id);
    if (!doc || doc.is_deleted) return null;
    if (cached) {
      const officeId = cached.current_office_id !== undefined ? cached.current_office_id : doc.current_office_id;
      const officeObj = (officeId && officeLookupById[officeId]) || cached.office || doc.office;
      return {
        ...doc,
        ...cached,
        current_status: cached.current_status || doc.current_status,
        statusLabel: STATUS_LABELS[cached.current_status || doc.current_status] || doc.statusLabel,
        current_office_id: officeId,
        office: officeObj,
        officeSince: doc.officeSince,
        timeWaitingMs: doc.timeWaitingMs,
        returnReason: doc.returnReason,
        returnInfo: doc.returnInfo,
        rejectionReason: doc.rejectionReason,
        rejectionInfo: doc.rejectionInfo,
        lastDecision: doc.lastDecision,
        document_attachment: doc.document_attachment,
        document_history: doc.document_history,
        history: doc.history,
        timeline: doc.timeline,
        attachments: doc.attachments,
      };
    }
    return doc;
  },

  async findByRequester(requesterId) {
    await ensureOfficesLoaded();
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('requester_id', requesterId)
      .eq('is_deleted', false)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeDoc).filter((d) => !d.is_deleted);
  },

  async getDefaultDocTypeId(origin = 'CESS') {
    const { data } = await supabase
      .from('document_type')
      .select('doc_type_id')
      .eq('origin', origin)
      .limit(1)
      .maybeSingle();
    if (data?.doc_type_id) return data.doc_type_id;

    const { data: fallback } = await supabase
      .from('document_type')
      .select('doc_type_id')
      .limit(1)
      .maybeSingle();
    return fallback?.doc_type_id || 1;
  },

  async create(docPayload) {
    const { data, error } = await supabase
      .from('document_request')
      .insert(docPayload)
      .select(DOC_SELECT)
      .single();
    if (error) throw error;
    return normalizeDoc(data);
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('document_request')
      .update({ ...updates, last_updated_at: new Date().toISOString() })
      .eq('document_id', id)
      .select(DOC_SELECT)
      .single();

    if (error) {
      // Fallback if DB trigger `trg_doc_request_updated_at` references `NEW.updated_at` instead of `NEW.last_updated_at`
      if (error.code === '42703') {
        const current = await this.findById(id);
        const merged = { ...current, ...updates };
        docCache.set(id, merged);
        return merged;
      }
      throw error;
    }
    return normalizeDoc(data);
  },

  async addAttachment(attachmentEntry) {
    const { data, error } = await supabase
      .from('document_attachment')
      .insert(attachmentEntry)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addHistory(historyEntry) {
    if (historyEntry.document_id) {
      const cached = docCache.get(historyEntry.document_id);
      if (cached) {
        delete cached.document_history;
        delete cached.history;
        delete cached.timeline;
      }
    }
    const { data, error } = await supabase
      .from('document_history')
      .insert(historyEntry)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * PB-22 & PB-05: Get user's notification delivery preference
   */
  async getNotificationPreference(userId) {
    if (!userId) return mapPreferenceRow(null);
    if (prefCache.has(userId)) {
      return mapPreferenceRow(prefCache.get(userId));
    }

    const { data, error } = await supabase
      .from('notification_preference')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return mapPreferenceRow(null);
    }
    return mapPreferenceRow(data);
  },

  /**
   * PB-22 & PB-05: Update user's notification delivery preference
   */
  async updateNotificationPreference(userId, input = {}) {
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

    prefCache.set(userId, { user_id: userId, receive_email, receive_in_system });

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
      // Fallback to in-memory cache if table trigger has updated_at issue
      return mapPreferenceRow(prefCache.get(userId));
    }

    return mapPreferenceRow(data || prefCache.get(userId));
  },

  /**
   * PB-22 & PB-06: Record a notification in `notification_log` following user's preference
   */
  async createNotification({
    recipientId,
    documentId,
    notificationType = 'Return_Alert',
    deliveryMethod = 'Both',
    title,
    message,
  }) {
    const payload = {
      recipient_id: recipientId,
      document_id: documentId || null,
      notification_type: notificationType,
      delivery_method: deliveryMethod,
      title,
      message,
      is_read: false,
      status: 'Sent',
      sent_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('notification_log')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // Return synthetic notification object if insert fails
      return {
        notification_id: `notif-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
      };
    }

    return data;
  },

  /**
   * PB-22 & PB-06: List notifications for a user (optionally filtered by document_id)
   */
  async getNotificationsForUser(recipientId, documentId = null) {
    let query = supabase
      .from('notification_log')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false });

    if (documentId) {
      query = query.eq('document_id', documentId);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  },

  async softDelete(id) {
    const { error } = await supabase
      .from('document_request')
      .update({ is_deleted: true })
      .eq('document_id', id);

    if (error && error.code === '42703') {
      await supabase.from('document_history').insert({
        document_id: id,
        revision_no: 1,
        action_type: 'Archived',
        action_remarks: 'Archived test record.',
      });
    }
  },
};

module.exports = DocumentModel;
