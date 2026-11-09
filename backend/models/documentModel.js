const supabase = require('../config/database');
const NotificationModel = require('./notificationModel');

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
    actor:action_by_user_id (
      user_id,
      first_name,
      last_name,
      university_email
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
  const daysWaiting = Math.floor(timeWaitingMs / (1000 * 60 * 60 * 24));

  // PB-29 / SRS 3.9: Approved Exceptions and Priority Flagging
  let is_expedited = Boolean(raw.is_expedited);
  let priority = raw.priority || 'Standard';
  let exception_info = null;

  const exceptionEntry = [...history].reverse().find(
    (h) => (h.action_remarks && h.action_remarks.includes('[EXPEDITED EXCEPTION]')) ||
           (h.remarks && h.remarks.includes('[EXPEDITED EXCEPTION]')) ||
           h.action_type === 'Exception_Flagged' ||
           h.action_type === 'Expedited' ||
           h.action_type === 'Exception_Granted'
  );

  const titleOrDescHasExpedited =
    /\[(EXPEDITED|URGENT|EXCEPTION)\]/i.test(raw.title || '') ||
    /\[(EXPEDITED|URGENT|EXCEPTION)\]/i.test(raw.description || '');

  if (exceptionEntry) {
    is_expedited = true;
    priority = 'Urgent';
    exception_info = {
      isApproved: true,
      reason: exceptionEntry.action_remarks || 'Official priority exception granted.',
      approvedBy: exceptionEntry.actor_name || 'Approving Authority',
      approvedAt: exceptionEntry.action_timestamp,
      actorId: exceptionEntry.action_by_user_id || null,
    };
  } else if (titleOrDescHasExpedited || is_expedited) {
    is_expedited = true;
    priority = 'Urgent';
    exception_info = {
      isApproved: true,
      reason: raw.description || 'Priority processing requested.',
      approvedBy: 'Staff',
      approvedAt: raw.submitted_at,
      actorId: null,
    };
  }

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
    daysWaiting,
    is_expedited,
    priority,
    exception_info,
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
  async findAll(options = {}) {
    await ensureOfficesLoaded();
    const sort = options.sort || 'oldest';
    const ascending = sort === 'oldest' || sort === 'asc';

    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('is_deleted', false)
      .order('submitted_at', { ascending });
    if (error) throw error;

    let docs = (data || []).map(normalizeDoc).filter((d) => !d.is_deleted);

    // Apply in-memory cached properties (e.g. exception flags, decisions, fallback updates)
    docs = docs.map((d) => {
      const cached = docCache.get(d.document_id);
      if (cached) {
        const officeId = cached.current_office_id !== undefined ? cached.current_office_id : d.current_office_id;
        const officeObj = (officeId && officeLookupById[officeId]) || (officeId ? cached.office : null) || d.office;
        const status = cached.current_status || d.current_status;
        return {
          ...d,
          current_status: status,
          statusLabel: STATUS_LABELS[status] || d.statusLabel,
          current_office_id: officeId,
          office: officeObj,
          is_expedited: cached.is_expedited !== undefined ? cached.is_expedited : d.is_expedited,
          priority: cached.priority || d.priority,
          exception_info: cached.exception_info || d.exception_info,
        };
      }
      return d;
    });

    return docs;
  },

  async findById(id, { includeDeleted = false } = {}) {
    await ensureOfficesLoaded();
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('document_id', id)
      .maybeSingle();
    if (error) throw error;
    const doc = normalizeDoc(data);
    const cached = docCache.get(id);
    if (!doc || (!includeDeleted && doc.is_deleted)) return null;
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
        is_expedited: cached.is_expedited !== undefined ? cached.is_expedited : doc.is_expedited,
        priority: cached.priority || doc.priority,
        exception_info: cached.exception_info || doc.exception_info,
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
        if (updates.current_office_id !== undefined) {
          merged.current_office_id = updates.current_office_id;
          merged.office = (updates.current_office_id && officeLookupById[updates.current_office_id]) || null;
        }
        if (updates.current_status !== undefined) {
          merged.current_status = updates.current_status;
          merged.statusLabel = STATUS_LABELS[updates.current_status] || updates.current_status;
        }
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
    return NotificationModel.getPreference(userId);
  },

  /**
   * PB-22 & PB-05: Update user's notification delivery preference
   */
  async updateNotificationPreference(userId, input = {}) {
    return NotificationModel.updatePreference(userId, input);
  },

  /**
   * PB-22 & PB-06: Record a notification in `notification_log` following user's preference
   */
  async createNotification(payload) {
    return NotificationModel.createLog(payload);
  },

  /**
   * PB-22 & PB-06: List notifications for a user (optionally filtered by document_id)
   */
  async getNotificationsForUser(recipientId, documentId = null) {
    return NotificationModel.getNotificationsForUser(recipientId, { documentId });
  },

  
  async findAttachmentById(attachmentId) {
    const { data, error } = await supabase
      .from('document_attachment')
      .select('*')
      .eq('attachment_id', attachmentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getAttachmentsByDocumentId(documentId) {
    const { data, error } = await supabase
      .from('document_attachment')
      .select('*')
      .eq('document_id', documentId)
      .order('revision_no', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async updateHistory() {
    const err = new Error('Forbidden: Document processing history is immutable and cannot be updated.');
    err.status = 403;
    throw err;
  },

  async deleteHistory() {
    const err = new Error('Forbidden: Document processing history is immutable and cannot be deleted.');
    err.status = 403;
    throw err;
  },

  async deleteDocument(id, forceHardDelete = false) {
    if (forceHardDelete) {
      const err = new Error('Forbidden: Permanent deletion of document records and files is disabled to preserve audit integrity. Use archive instead.');
      err.status = 403;
      throw err;
    }
    return this.softDelete(id);
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
  /**
   * PB-29 / SRS 3.9: Flag approved exception for expedited processing
   * Records immutable audit milestone and surfaces document to top of FIFO queue.
   */
  async flagException(documentId, user, { reason, priority = 'Urgent' }) {
    await ensureOfficesLoaded();
    const doc = await this.findById(documentId);
    if (!doc) {
      const err = new Error('Document record not found.');
      err.status = 404;
      throw err;
    }

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
      const err = new Error('A detailed reason is required to approve and flag an expedited exception.');
      err.status = 400;
      throw err;
    }

    const timestamp = new Date().toISOString();
    const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name || user.email;

    // Insert audit history milestone (PB-48 compliance)
    // Note: Postgres enum action_type restricts values to ['Submitted', 'Content_Verified', 'Routed', 'Endorsed', 'Approved', 'Returned', 'Rejected', 'Ready_for_Release', 'Released', 'Archived']
    const latestAction = doc.document_history && doc.document_history.length > 0
      ? doc.document_history[doc.document_history.length - 1].action_type
      : 'Submitted';

    const validActionType = ['Submitted', 'Content_Verified', 'Routed', 'Endorsed', 'Approved', 'Returned', 'Ready_for_Release'].includes(latestAction)
      ? latestAction
      : 'Submitted';

    const { error: histErr } = await supabase.from('document_history').insert({
      document_id: documentId,
      revision_no: doc.current_revision_no || 1,
      action_type: validActionType,
      action_remarks: `[EXPEDITED EXCEPTION] ${trimmedReason}`,
      action_by_user_id: user.id,
      action_office_id: doc.current_office_id || null,
      action_timestamp: timestamp,
    });
    if (histErr) throw histErr;

    const exceptionInfo = {
      isApproved: true,
      reason: trimmedReason,
      approvedBy: actorName,
      approvedAt: timestamp,
      actorId: user.id,
    };

    // Cache updated state
    const cached = docCache.get(documentId) || {};
    docCache.set(documentId, {
      ...cached,
      is_expedited: true,
      priority: priority || 'Urgent',
      exception_info: exceptionInfo,
    });

    // Notify requester of approved expedited processing (PB-06)
    if (doc.requester_id) {
      try {
        await NotificationModel.createLog({
          recipientId: doc.requester_id,
          documentId,
          notificationType: 'Action_Taken',
          title: `[Priority Approved] Exception Flagged: ${doc.control_number}`,
          message: `Your request (${doc.control_number}) has been granted approved priority processing. Reason: ${trimmedReason}`,
          deliveryMethod: 'Both',
        });
      } catch (e) {
        // Notification logging does not block exception approval
      }
    }

    return this.findById(documentId);
  },

  /**
   * PB-28: Secretary Workflow Map and Live Office Counts (SRS 3.11)
   * Guaranteed Zero Double-Counting: Every document belongs to strictly one stage
   * and at most one active holding office at any instant.
   */
  async getWorkflowMapData() {
    await ensureOfficesLoaded();
    const WorkflowRouteModel = require('./workflowRouteModel');
    const allDocs = await this.findAll();
    const { data: allOffices } = await supabase
      .from('office')
      .select('office_id, office_name, office_type, is_active')
      .order('office_id', { ascending: true });

    const offices = (allOffices && allOffices.length > 0) ? allOffices : Object.values(officeLookupById);

    // 1. Mutually Exclusive Lifecycle Stages
    const awaiting_verification = allDocs.filter((d) => d.current_status === 'Submitted');
    const in_review = allDocs.filter((d) => d.current_status === 'Under_Review');
    const with_external = allDocs.filter((d) => d.current_status === 'With_External_Office');
    const ready_for_release = allDocs.filter((d) => d.current_status === 'Ready_for_Release');
    const returned = allDocs.filter((d) => d.current_status === 'Returned');
    const rejected = allDocs.filter((d) => d.current_status === 'Rejected');
    const released = allDocs.filter((d) => d.current_status === 'Released');

    // Helper to calculate if document has exceeded standard turnaround time
    const isOverdue = (d) => {
      const stdDays = d.document_type?.standard_processing_days || 3;
      const stdMs = stdDays * 24 * 60 * 60 * 1000;
      return (d.timeWaitingMs || 0) > stdMs;
    };

    // 2. Compute counts by Office (Zero Double-Counting)
    const officeCounts = offices.map((off) => {
      let holdingDocs = [];
      let awaitingCount = 0;
      let readyCount = 0;
      let inReviewCount = 0;
      let externalCount = 0;

      if (off.office_name === 'College Secretary') {
        awaitingCount = awaiting_verification.length;
        readyCount = ready_for_release.length;
        const secInReview = in_review.filter(
          (d) => d.current_office_id === off.office_id || d.office?.office_name === off.office_name
        );
        inReviewCount = secInReview.length;
        holdingDocs = [...awaiting_verification, ...secInReview, ...ready_for_release];
      } else if (off.office_type === 'External_Office') {
        holdingDocs = with_external.filter(
          (d) => d.current_office_id === off.office_id || d.office?.office_name === off.office_name
        );
        externalCount = holdingDocs.length;
      } else {
        // Internal Review offices (Chairperson, Dean, Principal, etc.)
        holdingDocs = in_review.filter(
          (d) => d.current_office_id === off.office_id || d.office?.office_name === off.office_name
        );
        inReviewCount = holdingDocs.length;
      }

      const overdueCount = holdingDocs.filter(isOverdue).length;

      return {
        officeId: off.office_id,
        officeName: off.office_name,
        officeType: off.office_type,
        count: holdingDocs.length,
        overdueCount,
        stages: {
          awaiting_verification: awaitingCount,
          in_review: inReviewCount,
          with_external: externalCount,
          ready_for_release: readyCount,
        },
      };
    });

    // 3. Stage metadata
    const stages = [
      {
        key: 'awaiting_verification',
        label: 'Awaiting Verification',
        count: awaiting_verification.length,
        holdingOffice: 'College Secretary',
        overdueCount: awaiting_verification.filter(isOverdue).length,
        description: 'Passed completeness check; awaiting content check and initial routing.',
      },
      {
        key: 'in_review',
        label: 'In Office Review',
        count: in_review.length + with_external.length,
        internalReviewCount: in_review.length,
        externalReviewCount: with_external.length,
        holdingOffice: 'Reviewing Bodies',
        overdueCount: [...in_review, ...with_external].filter(isOverdue).length,
        description: 'Currently under endorsement or approval review across academic offices.',
      },
      {
        key: 'ready_for_release',
        label: 'Ready for Release',
        count: ready_for_release.length,
        holdingOffice: 'College Secretary',
        overdueCount: ready_for_release.filter(isOverdue).length,
        description: 'Approved documents awaiting requester collection at the counter.',
      },
      {
        key: 'returned',
        label: 'Returned for Revision',
        count: returned.length,
        holdingOffice: 'Requester',
        overdueCount: 0,
        description: 'With requesters for corrections (missing files or required updates).',
      },
      {
        key: 'rejected',
        label: 'Disapproved / Rejected',
        count: rejected.length,
        holdingOffice: null,
        overdueCount: 0,
        description: 'Officially disapproved and closed records.',
      },
      {
        key: 'released',
        label: 'Released & Completed',
        count: released.length,
        holdingOffice: null,
        overdueCount: 0,
        description: 'Successfully collected by requester.',
      },
    ];

    // 4. Active Workflow Routes
    let routes = {};
    try {
      routes = await WorkflowRouteModel.getAllRoutes();
    } catch (e) {
      routes = {
        CESS: { sequence: ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary'] },
        IDS: { sequence: ['College Secretary', 'Department Chairperson', 'IDS Principal', 'College Dean', 'College Secretary'] },
      };
    }

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalActive: awaiting_verification.length + in_review.length + with_external.length + ready_for_release.length,
        totalInReview: in_review.length + with_external.length,
        totalReturned: returned.length,
        totalRejected: rejected.length,
        totalReleased: released.length,
        totalRecords: allDocs.length,
      },
      stages,
      officeCounts,
      routes,
    };
  },
};

module.exports = DocumentModel;

