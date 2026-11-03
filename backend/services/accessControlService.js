const DocumentModel = require('../models/documentModel');
const DocumentTypeModel = require('../models/documentTypeModel');
const UserModel = require('../models/userModel');
const {
  ROLES,
  REVIEWER_ROLES,
  FINAL_APPROVAL_ROLES,
  ROLE_TO_OFFICE_NAME,
  canViewDocument,
  canPerformAction,
  getRoleLabel,
  getApprovedRoute,
  getDefaultNextOfficeForEndorsement,
  validateRouteTransition,
  getPermittedActions,
} = require('../utils/roles');

const AccessControlService = {
  /**
   * PB-02 Acceptance Criteria:
   * - Requester (Student, CESS Faculty, IDS Faculty) sees own requests
   * - Reviewers (IDS Principal, Chairperson, Dean, OVCAA, VCAF, Chancellor) see routed records
   * - Secretary sees all
   * PB-20: Supports queue filtering (?queue=awaiting_verification, in_review, etc.)
   */
  async getVisibleDocumentsForUser(user, options = {}) {
    let docs;
    if (user.role === ROLES.STUDENT || user.role === ROLES.FACULTY) {
      docs = await DocumentModel.findByRequester(user.id);
    } else {
      const allDocs = await DocumentModel.findAll();
      docs = user.role === ROLES.SECRETARY ? allDocs : allDocs.filter((doc) => canViewDocument(user, doc));
    }

    if (options.queue) {
      const q = String(options.queue).toLowerCase();
      if (q === 'awaiting_verification' || q === 'submitted') {
        docs = docs.filter((d) => d.current_status === 'Submitted');
      } else if (q === 'in_review' || q === 'under_review') {
        docs = docs.filter((d) => d.current_status === 'Under_Review');
      } else if (q === 'ready_for_release' || q === 'ready') {
        docs = docs.filter((d) => d.current_status === 'Ready_for_Release');
      } else if (q === 'returned') {
        docs = docs.filter((d) => d.current_status === 'Returned');
      } else if (q === 'rejected') {
        docs = docs.filter((d) => d.current_status === 'Rejected');
      } else if (q === 'ids_handoff' || q === 'ids') {
        docs = docs.filter((d) => d.origin === 'IDS');
      }
    }

    return docs;
  },

  /**
   * PB-20: Secretary Verification Queue & Workstation
   * Separates documents into 6 agreed states:
   * 1. awaiting_verification: 'Submitted'
   * 2. in_review: 'Under_Review'
   * 3. ready_for_release: 'Ready_for_Release'
   * 4. returned: 'Returned'
   * 5. rejected: 'Rejected'
   * 6. ids_handoff: origin === 'IDS'
   */
  async getSecretaryQueues(user) {
    if (user.role !== ROLES.SECRETARY) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' is not authorized to access the Secretary Workstation.`
      );
      err.status = 403;
      throw err;
    }

    const allDocs = await DocumentModel.findAll();

    const awaiting_verification = allDocs.filter((d) => d.current_status === 'Submitted');
    const in_review = allDocs.filter((d) => d.current_status === 'Under_Review');
    const ready_for_release = allDocs.filter((d) => d.current_status === 'Ready_for_Release');
    const returned = allDocs.filter((d) => d.current_status === 'Returned');
    const rejected = allDocs.filter((d) => d.current_status === 'Rejected');
    const ids_handoff = allDocs.filter((d) => d.origin === 'IDS');

    return {
      counts: {
        awaiting_verification: awaiting_verification.length,
        in_review: in_review.length,
        ready_for_release: ready_for_release.length,
        returned: returned.length,
        rejected: rejected.length,
        ids_handoff: ids_handoff.length,
        total: allDocs.length,
      },
      queues: {
        awaiting_verification,
        in_review,
        ready_for_release,
        returned,
        rejected,
        ids_handoff,
      },
    };
  },

  async getDocumentByIdForUser(user, docId) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document record not found.');
      err.status = 404;
      throw err;
    }

    if (!canViewDocument(user, doc)) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' is not authorized to view document ${doc.control_number}.`
      );
      err.status = 403;
      throw err;
    }

    const permitted = getPermittedActions(user, doc);
    return {
      ...doc,
      permittedActions: permitted.actions,
      permittedOptions: permitted.options,
    };
  },

  /**
   * PB-24: Retrieve only the permitted actions for the caller's office on a document
   */
  async getPermittedActionsForDocument(user, docId) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document record not found.');
      err.status = 404;
      throw err;
    }

    const permitted = getPermittedActions(user, doc);
    return {
      documentId: doc.document_id,
      controlNumber: doc.control_number,
      status: doc.current_status,
      statusLabel: doc.statusLabel,
      currentOffice: doc.office?.office_name || null,
      actorRole: user.role,
      actorOffice: ROLE_TO_OFFICE_NAME[user.role] || getRoleLabel(user.role, user.origin),
      isFinalAuthority: FINAL_APPROVAL_ROLES.includes(user.role),
      permittedActions: permitted.actions,
      options: permitted.options,
    };
  },

  /**
   * PB-02 & PB-10: Submit a new document request
   * Validates requester action & verifies that the document type is eligible for the user's role.
   */
  async submitDocument(user, input) {
    if (!canPerformAction(user, 'submit_document')) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' cannot submit requester documents.`
      );
      err.status = 403;
      throw err;
    }

    const origin = user.origin || input.origin || 'CESS';
    let docTypeId = input.docTypeId;

    if (!docTypeId && input.typeId) {
      const resolved = await DocumentTypeModel.findById(input.typeId);
      if (resolved && resolved.audience === user.role) {
        docTypeId = resolved.doc_type_id;
      }
    }

    if (!docTypeId) {
      const eligibleList = await DocumentTypeModel.findEligibleForRole(user.role, origin);
      docTypeId = eligibleList[0]?.doc_type_id || (await DocumentModel.getDefaultDocTypeId(origin));
    }

    // PB-10 Acceptance Criterion: Server-side eligibility enforcement
    const eligibility = await DocumentTypeModel.isRoleEligible(docTypeId, user.role, origin);
    if (!eligibility.eligible) {
      const err = new Error(`Forbidden: ${eligibility.reason}`);
      err.status = 403;
      throw err;
    }

    const targetOfficeName = input.targetOfficeName || 'College Secretary';
    const currentOfficeId = await UserModel.getOfficeIdByName(targetOfficeName);

    const created = await DocumentModel.create({
      control_number:
        input.controlBase ||
        input.controlNumber ||
        `MSU-CESS-${Date.now().toString().slice(-6)}-2026`,
      current_revision_no: 1,
      requester_id: user.id,
      doc_type_id: docTypeId,
      title: input.title,
      description: input.description || '',
      origin,
      current_status: 'Submitted',
      current_office_id: currentOfficeId,
    });

    await DocumentModel.addHistory({
      document_id: created.document_id,
      revision_no: 1,
      action_by_user_id: user.id,
      action_office_id: currentOfficeId,
      action_type: 'Submitted',
      action_remarks: 'Submitted document request.',
    });

    // PB-19 / SRS 3.2: Persist initial Revision 1 attachments
    const initialFiles = Array.isArray(input.attachments)
      ? input.attachments
      : Array.isArray(input.files)
      ? input.files
      : [];

    if (initialFiles.length > 0) {
      for (const f of initialFiles) {
        await DocumentModel.addAttachment({
          document_id: created.document_id,
          form_id: f.form_id || f.formId || null,
          revision_no: 1,
          file_name: f.file_name || f.name || 'Initial_Attachment.pdf',
          file_url: f.file_url || f.url || `/uploads/${created.document_id}_rev1_${Date.now()}.pdf`,
          file_type: f.file_type || f.type || 'application/pdf',
          file_size_kb: f.file_size_kb || f.sizeKb || 100,
        });
      }
    }

    return DocumentModel.findById(created.document_id);
  },

  /**
   * PB-02, PB-22 & PB-23: Completeness check (Secretary only)
   * Enforces stage eligibility, required reason when returning or rejecting a request,
   * stops normal routing on rejection, and dispatches notification per preference.
   */
  async checkRequirements(user, docId, payload = {}) {
    if (!canPerformAction(user, 'check_requirements')) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' cannot perform completeness checks. Only the College Secretary is permitted.`
      );
      err.status = 403;
      throw err;
    }

    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    // PB-23 Acceptance Criterion: Normal routing stops when a request is rejected unless reopened
    if (doc.current_status === 'Rejected') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' has been rejected/disapproved. Normal routing has stopped unless reopened through an approved reopen path.`
      );
      err.status = 403;
      throw err;
    }

    // PB-23 Acceptance Criterion: Only permitted roles can reject/act at their stage (Secretary stage is 'Submitted')
    if (doc.current_status !== 'Submitted') {
      const err = new Error(
        `Forbidden: The College Secretary can only verify, return, or reject a request while it is in 'Submitted' status at the completeness verification stage (current status: '${doc.current_status}').`
      );
      err.status = 403;
      throw err;
    }

    const decision = String(payload.decision || payload.action || 'complete').toLowerCase();
    const isReturn = decision === 'return' || decision === 'returned';
    const isReject =
      decision === 'reject' ||
      decision === 'rejected' ||
      decision === 'disapprove' ||
      decision === 'disapproved';
    const rawRemarks = payload.reason ?? payload.remarks ?? payload.reasons ?? '';
    const cleanRemarks = String(rawRemarks).trim();

    // PB-22 Acceptance Criterion: Reason is required when returning a document
    if (isReturn && !cleanRemarks) {
      const err = new Error(
        'Reason is required when returning a document for revision. Please explain what needs to be corrected.'
      );
      err.status = 400;
      throw err;
    }

    // PB-23 Acceptance Criterion: Reason is required when rejecting/disapproving a document
    if (isReject && !cleanRemarks) {
      const err = new Error(
        'Reason is required when disapproving or rejecting a document. Please record why the request is being rejected.'
      );
      err.status = 400;
      throw err;
    }

    const isTerminalOrReturn = isReturn || isReject;
    if (!isTerminalOrReturn) {
      const routeCheck = validateRouteTransition(doc, user.role, 'complete', payload.nextOfficeName);
      if (!routeCheck.valid) {
        const err = new Error(routeCheck.error);
        err.status = routeCheck.status || 400;
        throw err;
      }
    }

    const targetOffice = isTerminalOrReturn ? null : payload.nextOfficeName || 'Department Chairperson';
    const nextOfficeId = isTerminalOrReturn ? null : await UserModel.getOfficeIdByName(targetOffice);
    const secOfficeId = await UserModel.getOfficeIdByName('College Secretary');

    await DocumentModel.update(docId, {
      current_status: isReject ? 'Rejected' : isReturn ? 'Returned' : 'Under_Review',
      current_office_id: nextOfficeId,
    });

    await DocumentModel.addHistory({
      document_id: docId,
      revision_no: doc.current_revision_no,
      action_by_user_id: user.id,
      action_office_id: isTerminalOrReturn ? secOfficeId : nextOfficeId,
      action_type: isReject ? 'Rejected' : isReturn ? 'Returned' : 'Routed',
      action_remarks: isTerminalOrReturn
        ? cleanRemarks
        : cleanRemarks || 'Requirements verified complete and routed.',
    });

    let notification = null;
    if (isReturn || isReject) {
      const pref = await DocumentModel.getNotificationPreference(doc.requester_id);
      const rawNotif = await DocumentModel.createNotification({
        recipientId: doc.requester_id,
        documentId: docId,
        notificationType: isReturn ? 'Return_Alert' : 'Reject_Alert',
        deliveryMethod: pref.deliveryMethod,
        title: isReturn
          ? `Action needed: ${doc.title} was returned for revision`
          : `Update: ${doc.title} was rejected / disapproved`,
        message: isReturn
          ? `Your request (${doc.control_number}) was returned for revision by the College Secretary. Reason: ${cleanRemarks}`
          : `Your request (${doc.control_number}) was rejected by the College Secretary. Reason: ${cleanRemarks}`,
      });
      notification = {
        ...rawNotif,
        preference: pref.preference,
        channels: pref.channels,
        reason: cleanRemarks,
        ...(isReturn
          ? { returnedByOffice: 'College Secretary' }
          : { rejectedByOffice: 'College Secretary' }),
      };
    }

    const updatedDoc = await DocumentModel.findById(docId);
    return notification ? { ...updatedDoc, notification } : updatedDoc;
  },

  /**
   * PB-02, PB-22, PB-23 & PB-24: Review decision — Endorse / Approve / Return / Reject (Reviewers only)
   * PB-24 Acceptance Criteria:
   * - Only permitted actions appear and can be recorded by the reviewer's office
   * - Action, remarks, actor and timestamp are saved in Document_History
   * - System does not make decisions automatically (explicit human decision required)
   * - Final authority remains with designated personnel (College Dean / Chancellor)
   */
  async reviewDocument(user, docId, payload = {}) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    // PB-24 Acceptance Criterion: System does not make decisions automatically
    if (payload.auto === true || payload.automated === true || payload.systemGenerated === true) {
      const err = new Error(
        'Forbidden: The system does not make review decisions automatically. Decisions must be explicitly recorded by designated personnel.'
      );
      err.status = 403;
      throw err;
    }

    const providedAction = payload.action ?? payload.kind ?? payload.decision ?? '';
    const rawAction = String(providedAction).trim().toLowerCase();
    if (!rawAction) {
      const err = new Error(
        'Explicit office decision (endorse, approve, return, or reject) is required. The system does not make decisions automatically.'
      );
      err.status = 400;
      throw err;
    }

    // PB-23 Acceptance Criterion: Normal routing stops when a document is rejected
    if (doc.current_status === 'Rejected') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' has been rejected/disapproved. Normal routing has stopped unless reopened through an approved reopen path.`
      );
      err.status = 403;
      throw err;
    }

    // PB-23 & PB-24 Acceptance Criterion: Only permitted reviewing roles can act, and never on their own request
    const requesterId = doc.requester_id || doc.requesterId;
    if (!REVIEWER_ROLES.includes(user.role) || requesterId === user.id) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' is not permitted to review or record office decisions on this document.`
      );
      err.status = 403;
      throw err;
    }

    // PB-23 & PB-24 Acceptance Criterion: Only permitted roles can act at their stage
    if (doc.current_status !== 'Under_Review' || !canPerformAction(user, 'review_document', doc)) {
      const currentStageLabel = doc.office?.office_name || doc.current_status;
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' cannot act on document '${doc.control_number}' because it is not currently at their review stage (current stage: '${currentStageLabel}').`
      );
      err.status = 403;
      throw err;
    }

    const actorOfficeName = ROLE_TO_OFFICE_NAME[user.role] || getRoleLabel(user.role, user.origin);
    const permitted = getPermittedActions(user, doc);

    let canonicalAction = null;
    let dbAction = null;

    if (rawAction === 'return' || rawAction === 'returned') {
      canonicalAction = 'return';
      dbAction = 'Returned';
    } else if (
      rawAction === 'reject' ||
      rawAction === 'rejected' ||
      rawAction === 'disapprove' ||
      rawAction === 'disapproved'
    ) {
      canonicalAction = 'reject';
      dbAction = 'Rejected';
    } else if (rawAction === 'approve' || rawAction === 'approved') {
      canonicalAction = 'approve';
      dbAction = 'Approved';
    } else if (rawAction === 'endorse_higher') {
      canonicalAction = 'endorse_higher';
      dbAction = 'Endorsed';
    } else if (rawAction === 'endorse' || rawAction === 'endorsed') {
      canonicalAction = 'endorse';
      dbAction = 'Endorsed';
    } else {
      const err = new Error(
        `Invalid office decision '${rawAction}'. Permitted actions for ${actorOfficeName}: ${permitted.actions.join(', ')}.`
      );
      err.status = 400;
      throw err;
    }

    // PB-24 Acceptance Criterion: Final authority remains with designated personnel (College Dean / Chancellor)
    if (canonicalAction === 'approve' && !FINAL_APPROVAL_ROLES.includes(user.role)) {
      const err = new Error(
        `Forbidden: Office '${actorOfficeName}' (${getRoleLabel(user.role, user.origin)}) is an endorsing office and cannot record final approval. Final authority remains with designated personnel (College Dean or Chancellor).`
      );
      err.status = 403;
      throw err;
    }

    // PB-24 Acceptance Criterion: Only permitted actions for this office are allowed
    if (!permitted.actions.includes(canonicalAction)) {
      const err = new Error(
        `Forbidden: Action '${canonicalAction}' is not permitted for '${actorOfficeName}' at this stage. Permitted actions: ${permitted.actions.join(', ')}.`
      );
      err.status = 403;
      throw err;
    }

    const rawRemarks = payload.reason ?? payload.remarks ?? payload.reasons ?? '';
    const cleanRemarks = String(rawRemarks).trim();

    // PB-22 Acceptance Criterion: Reason is required when returning a request
    if (dbAction === 'Returned' && !cleanRemarks) {
      const err = new Error(
        'Reason is required when returning a document for revision. Please explain what needs to be corrected.'
      );
      err.status = 400;
      throw err;
    }

    // PB-23 Acceptance Criterion: Reason is required when rejecting/disapproving a request
    if (dbAction === 'Rejected' && !cleanRemarks) {
      const err = new Error(
        'Reason is required when disapproving or rejecting a document. Please record why the request is being rejected.'
      );
      err.status = 400;
      throw err;
    }

    // PB-25 / SRS 3.5: Fetch requester profile to handle self-submission exception
    const requesterUser = doc.requester_id ? await UserModel.findById(doc.requester_id) : null;
    const requesterRole = requesterUser?.role || null;

    // PB-25 Acceptance Criterion: Invalid transitions are blocked (REQ-ROUTE-7) & IDS Principal required (REQ-ROUTE-3)
    const transitionValidation = validateRouteTransition(
      doc,
      user.role,
      canonicalAction,
      payload.nextOfficeName,
      requesterRole
    );
    if (!transitionValidation.valid) {
      const err = new Error(transitionValidation.error);
      err.status = transitionValidation.status || 400;
      throw err;
    }

    const isTerminalOrReturn = dbAction === 'Returned' || dbAction === 'Rejected';
    const defaultNextOffice =
      dbAction === 'Approved'
        ? 'College Secretary'
        : getDefaultNextOfficeForEndorsement(user.role, doc.origin, requesterRole, canonicalAction);
    const targetOffice = isTerminalOrReturn ? null : (transitionValidation.targetOffice || payload.nextOfficeName || defaultNextOffice);
    const nextOfficeId = isTerminalOrReturn ? null : await UserModel.getOfficeIdByName(targetOffice);
    const actorOfficeId = await UserModel.getOfficeIdByName(actorOfficeName);

    await DocumentModel.update(docId, {
      current_status:
        dbAction === 'Returned'
          ? 'Returned'
          : dbAction === 'Rejected'
          ? 'Rejected'
          : 'Under_Review',
      current_office_id: isTerminalOrReturn ? null : nextOfficeId,
    });

    const finalRemarks =
      cleanRemarks ||
      `${dbAction} by ${getRoleLabel(user.role, user.origin)} (${actorOfficeName}).`;

    // PB-24 Acceptance Criterion: Action, remarks, actor and timestamp are saved in Document_History
    const historyEntry = await DocumentModel.addHistory({
      document_id: docId,
      revision_no: doc.current_revision_no,
      action_by_user_id: user.id,
      action_office_id: actorOfficeId,
      action_type: dbAction,
      action_remarks: finalRemarks,
    });

    const recordedDecision = {
      historyId: historyEntry.history_id,
      action: dbAction,
      remarks: finalRemarks,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      officeId: actorOfficeId,
      office: actorOfficeName,
      timestamp: historyEntry.action_timestamp,
      revisionNo: doc.current_revision_no,
      nextOffice: isTerminalOrReturn ? null : targetOffice,
    };

    let notification = null;
    if (dbAction === 'Returned' || dbAction === 'Rejected') {
      const pref = await DocumentModel.getNotificationPreference(doc.requester_id);
      const isReturned = dbAction === 'Returned';
      const rawNotif = await DocumentModel.createNotification({
        recipientId: doc.requester_id,
        documentId: docId,
        notificationType: isReturned ? 'Return_Alert' : 'Reject_Alert',
        deliveryMethod: pref.deliveryMethod,
        title: isReturned
          ? `Action needed: ${doc.title} was returned for revision`
          : `Update: ${doc.title} was rejected / disapproved`,
        message: isReturned
          ? `Your request (${doc.control_number}) was returned for revision by ${actorOfficeName}. Reason: ${cleanRemarks}`
          : `Your request (${doc.control_number}) was rejected by ${actorOfficeName}. Reason: ${cleanRemarks}`,
      });

      notification = {
        ...rawNotif,
        preference: pref.preference,
        channels: pref.channels,
        reason: cleanRemarks,
        ...(isReturned
          ? { returnedByOffice: actorOfficeName }
          : { rejectedByOffice: actorOfficeName }),
      };
    }

    const updatedDoc = await DocumentModel.findById(docId);
    const nextPermitted = getPermittedActions(user, updatedDoc);
    return {
      ...updatedDoc,
      permittedActions: nextPermitted.actions,
      permittedOptions: nextPermitted.options,
      recordedDecision,
      ...(notification ? { notification } : {}),
    };
  },

  /**
   * PB-22: Dedicated method for returning a document with a required reason
   */
  async returnDocument(user, docId, payload = {}) {
    if (user.role === ROLES.SECRETARY) {
      return this.checkRequirements(user, docId, { ...payload, decision: 'return' });
    }
    return this.reviewDocument(user, docId, { ...payload, action: 'returned' });
  },

  /**
   * PB-23: Dedicated method for rejecting/disapproving a document with a required reason
   */
  async rejectDocument(user, docId, payload = {}) {
    if (user.role === ROLES.SECRETARY) {
      return this.checkRequirements(user, docId, { ...payload, decision: 'reject' });
    }
    return this.reviewDocument(user, docId, { ...payload, action: 'rejected' });
  },

  /**
   * PB-23: Approved reopen path for a rejected document (College Secretary or College Dean only).
   * Without invoking this approved reopen path, normal routing remains stopped on rejected requests.
   */
  async reopenDocument(user, docId, payload = {}) {
    if (user.role !== ROLES.SECRETARY && user.role !== ROLES.DEAN) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' is not authorized to reopen a rejected document. Only the College Secretary or College Dean may approve reopening.`
      );
      err.status = 403;
      throw err;
    }

    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    if (doc.current_status !== 'Rejected') {
      const err = new Error(
        `Bad Request: Only rejected documents can be reopened (current status: '${doc.current_status}').`
      );
      err.status = 400;
      throw err;
    }

    const rawReason = payload.reason ?? payload.remarks ?? payload.reasons ?? '';
    const cleanReason = String(rawReason).trim();
    if (!cleanReason) {
      const err = new Error(
        'Reason is required when reopening a rejected document.'
      );
      err.status = 400;
      throw err;
    }

    const secOfficeId = await UserModel.getOfficeIdByName('College Secretary');

    await DocumentModel.update(docId, {
      current_status: 'Returned',
      current_office_id: null,
    });

    await DocumentModel.addHistory({
      document_id: docId,
      revision_no: doc.current_revision_no,
      action_by_user_id: user.id,
      action_office_id: secOfficeId,
      action_type: 'Returned',
      action_remarks: `Approved Reopen (${getRoleLabel(user.role, user.origin)}): ${cleanReason}`,
    });

    return DocumentModel.findById(docId);
  },

  /**
   * PB-18 / REQ-SUB-7 & PB-23: Prevent editing while request is in process or rejected.
   * Only documents in 'Returned' status can be modified by the requester.
   */
  async editDocument(user, docId, updates = {}) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    const requesterId = doc.requester_id || doc.requesterId;
    if (requesterId !== user.id) {
      const err = new Error(
        `Forbidden: Only the document requester can edit this request.`
      );
      err.status = 403;
      throw err;
    }

    if (doc.current_status === 'Rejected') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' was rejected/disapproved and normal routing has stopped. Rejected requests cannot be edited unless reopened through an approved reopen path.`
      );
      err.status = 403;
      throw err;
    }

    // REQ-SUB-7: The system shall not allow a requester to change a submitted request unless it has been returned.
    if (doc.current_status !== 'Returned') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' is currently '${doc.current_status}' and cannot be edited. Edits are only permitted when a document is returned for corrections.`
      );
      err.status = 403;
      throw err;
    }

    const allowedUpdates = {};
    if (updates.title) allowedUpdates.title = updates.title.trim();
    if (updates.description !== undefined) allowedUpdates.description = updates.description.trim();

    const updated = await DocumentModel.update(docId, allowedUpdates);
    return updated;
  },

  /**
   * PB-18, REQ-SUB-8 & PB-23: Resubmit a returned document under the same Control Number
   * with an incremented Revision Number, keeping earlier files and history.
   * Rejected documents cannot be resubmitted unless reopened through an approved reopen path.
   */
  async resubmitDocument(user, docId, input = {}) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    const requesterId = doc.requester_id || doc.requesterId;
    if (requesterId !== user.id) {
      const err = new Error(
        `Forbidden: Only the document requester can resubmit this request.`
      );
      err.status = 403;
      throw err;
    }

    if (doc.current_status === 'Rejected') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' was rejected/disapproved and normal routing has stopped. Rejected documents cannot be resubmitted unless reopened through an approved reopen path.`
      );
      err.status = 403;
      throw err;
    }

    if (doc.current_status !== 'Returned') {
      const err = new Error(
        `Forbidden: Document '${doc.control_number}' is not waiting for corrections (status: '${doc.current_status}'). Only returned documents can be resubmitted.`
      );
      err.status = 403;
      throw err;
    }

    const newRevisionNo = (doc.current_revision_no || 1) + 1;
    const secOfficeId = await UserModel.getOfficeIdByName('College Secretary');

    const updatePayload = {
      current_status: 'Submitted',
      current_revision_no: newRevisionNo,
      current_office_id: secOfficeId,
    };
    if (input.title) updatePayload.title = input.title.trim();
    if (input.description !== undefined) updatePayload.description = input.description.trim();

    await DocumentModel.update(docId, updatePayload);

    // If corrected files attached, persist them under the new revision
    const incomingFiles = Array.isArray(input.files)
      ? input.files
      : Array.isArray(input.attachments)
      ? input.attachments
      : [];

    if (incomingFiles.length > 0) {
      for (const f of incomingFiles) {
        await DocumentModel.addAttachment({
          document_id: docId,
          form_id: f.form_id || f.formId || null,
          revision_no: newRevisionNo,
          file_name: f.file_name || f.name || 'Corrected_Attachment.pdf',
          file_url: f.file_url || f.url || `/uploads/${docId}_rev${newRevisionNo}_${Date.now()}.pdf`,
          file_type: f.file_type || f.type || 'application/pdf',
          file_size_kb: f.file_size_kb || f.sizeKb || 100,
        });
      }
    }

    await DocumentModel.addHistory({
      document_id: docId,
      revision_no: newRevisionNo,
      action_by_user_id: user.id,
      action_office_id: secOfficeId,
      action_type: 'Submitted',
      action_remarks: input.remarks || input.note || input.notes || `Resubmitted with corrections (Revision ${newRevisionNo}).`,
    });

    return DocumentModel.findById(docId);
  },

  /**
   * PB-19 / PB-22 / SRS 3.6: Get complete processing history, return reason & versioned attachments
   */
  async getDocumentHistory(user, docId) {
    const doc = await this.getDocumentByIdForUser(user, docId);
    if (!doc) return null;

    const notifications = await DocumentModel.getNotificationsForUser(doc.requester_id, docId);

    return {
      documentId: doc.document_id,
      controlNumber: doc.control_number,
      title: doc.title,
      origin: doc.origin,
      currentRevision: doc.current_revision_no,
      status: doc.current_status,
      statusLabel: doc.statusLabel,
      currentOffice: doc.office?.office_name || null,
      officeSince: doc.officeSince || null,
      timeWaitingMs: doc.timeWaitingMs || 0,
      returnReason: doc.returnReason,
      returnInfo: doc.returnInfo,
      rejectionReason: doc.rejectionReason,
      rejectionInfo: doc.rejectionInfo,
      history: doc.document_history || [],
      timeline: doc.document_history || [],
      attachments: doc.document_attachment || doc.attachments || [],
      notifications,
    };
  },

  /**
   * PB-25 / SRS 3.5: Inspect configured route, current step, and completed step history based on origin
   */
  async getDocumentRoute(user, docId) {
    const doc = await this.getDocumentByIdForUser(user, docId);
    if (!doc) {
      const err = new Error('Document not found or access denied.');
      err.status = 404;
      throw err;
    }

    const requesterUser = doc.requester_id ? await UserModel.findById(doc.requester_id) : null;
    const requesterRole = requesterUser?.role || null;
    const baseRoute = getApprovedRoute(doc.origin, doc.doc_type_id, requesterRole);

    // Check if higher approval (OVCAA / Chancellor) was invoked in history
    const history = doc.document_history || [];
    const hasHigherApproval = history.some(
      (h) =>
        h.action_remarks?.toLowerCase().includes('higher approval') ||
        h.action_remarks?.toLowerCase().includes('ovcaa') ||
        h.office?.office_name === 'OVCAA' ||
        h.office?.office_name === 'Office of the Chancellor'
    );

    const fullRoute = [...baseRoute];
    if (hasHigherApproval) {
      const releaseIdx = fullRoute.lastIndexOf('College Secretary');
      if (releaseIdx !== -1 && !fullRoute.includes('OVCAA')) {
        fullRoute.splice(releaseIdx, 0, 'OVCAA', 'Office of the Chancellor');
      }
    }

    // Determine current step index
    let currentStepIndex = 0;
    if (doc.current_status === 'Submitted') {
      currentStepIndex = 0; // Secretary completeness check
    } else if (doc.current_status === 'Ready_for_Release' || doc.current_status === 'Released') {
      currentStepIndex = fullRoute.length - 1;
    } else if (doc.office?.office_name) {
      const idx = fullRoute.findIndex(
        (officeName, i) => i > 0 && officeName === doc.office.office_name
      );
      currentStepIndex = idx !== -1 ? idx : 1;
    }

    const steps = fullRoute.map((officeName, idx) => {
      let stepStatus = 'pending';
      if (idx < currentStepIndex) {
        stepStatus = 'completed';
      } else if (idx === currentStepIndex) {
        stepStatus =
          doc.current_status === 'Returned'
            ? 'returned'
            : doc.current_status === 'Rejected'
            ? 'rejected'
            : 'current';
      }

      return {
        stepOrder: idx + 1,
        office: officeName,
        status: stepStatus,
      };
    });

    return {
      documentId: doc.document_id,
      controlNumber: doc.control_number,
      title: doc.title,
      origin: doc.origin,
      currentStatus: doc.current_status,
      currentOffice: doc.office?.office_name || null,
      route: fullRoute,
      steps,
      currentStepIndex,
      totalSteps: fullRoute.length,
      isIdsRoute: doc.origin === 'IDS',
      requiresIdsPrincipal: doc.origin === 'IDS' && requesterRole !== ROLES.IDS_PRINCIPAL,
    };
  },

  /**
   * PB-22 & PB-05: Get & update user notification preferences
   */
  async getNotificationPreference(user) {
    return DocumentModel.getNotificationPreference(user.id);
  },

  async updateNotificationPreference(user, payload) {
    return DocumentModel.updateNotificationPreference(user.id, payload);
  },

  async getNotifications(user, documentId = null) {
    return DocumentModel.getNotificationsForUser(user.id, documentId);
  },
};

module.exports = AccessControlService;
