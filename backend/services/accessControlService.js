const DocumentModel = require('../models/documentModel');
const DocumentTypeModel = require('../models/documentTypeModel');
const UserModel = require('../models/userModel');
const {
  ROLES,
  ROLE_TO_OFFICE_NAME,
  canViewDocument,
  canPerformAction,
  getRoleLabel,
} = require('../utils/roles');

const AccessControlService = {
  /**
   * PB-02 Acceptance Criteria:
   * - Requester (Student, CESS Faculty, IDS Faculty) sees own requests
   * - Reviewers (IDS Principal, Chairperson, Dean, OVCAA, VCAF, Chancellor) see routed records
   * - Secretary sees all
   */
  async getVisibleDocumentsForUser(user) {
    if (user.role === ROLES.STUDENT || user.role === ROLES.FACULTY) {
      return DocumentModel.findByRequester(user.id);
    }

    const allDocs = await DocumentModel.findAll();

    if (user.role === ROLES.SECRETARY) {
      return allDocs;
    }

    return allDocs.filter((doc) => canViewDocument(user, doc));
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

    return doc;
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

    return created;
  },

  /**
   * PB-02: Completeness check (Secretary only)
   */
  async checkRequirements(user, docId, { decision, nextOfficeName, remarks }) {
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

    const isReturn = decision === 'return';
    const targetOffice = nextOfficeName || 'Department Chairperson';
    const nextOfficeId = isReturn ? null : await UserModel.getOfficeIdByName(targetOffice);
    const secOfficeId = await UserModel.getOfficeIdByName('College Secretary');

    await DocumentModel.update(docId, {
      current_status: isReturn ? 'Returned' : 'Under_Review',
      current_office_id: nextOfficeId,
    });

    await DocumentModel.addHistory({
      document_id: docId,
      revision_no: doc.current_revision_no,
      action_by_user_id: user.id,
      action_office_id: isReturn ? secOfficeId : nextOfficeId,
      action_type: isReturn ? 'Returned' : 'Routed',
      action_remarks: remarks || 'Requirements verified complete and routed.',
    });

    return DocumentModel.findById(docId);
  },

  /**
   * PB-02: Review decision — Endorse / Approve / Return / Reject (Reviewers only)
   */
  async reviewDocument(user, docId, { action, nextOfficeName, remarks }) {
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    if (!canPerformAction(user, 'review_document', doc)) {
      const err = new Error(
        `Forbidden: Role '${getRoleLabel(user.role, user.origin)}' is not permitted to review this document.`
      );
      err.status = 403;
      throw err;
    }

    const targetOffice = nextOfficeName || 'College Dean';
    const nextOfficeId = await UserModel.getOfficeIdByName(targetOffice);
    const actorOfficeName = ROLE_TO_OFFICE_NAME[user.role];
    const actorOfficeId = await UserModel.getOfficeIdByName(actorOfficeName);

    const dbAction =
      action === 'returned'
        ? 'Returned'
        : action === 'rejected'
        ? 'Rejected'
        : action === 'approved'
        ? 'Approved'
        : 'Endorsed';

    const isTerminalOrReturn = dbAction === 'Returned' || dbAction === 'Rejected';

    await DocumentModel.update(docId, {
      current_status:
        dbAction === 'Returned'
          ? 'Returned'
          : dbAction === 'Rejected'
          ? 'Rejected'
          : 'Under_Review',
      current_office_id: isTerminalOrReturn ? null : nextOfficeId,
    });

    await DocumentModel.addHistory({
      document_id: docId,
      revision_no: doc.current_revision_no,
      action_by_user_id: user.id,
      action_office_id: isTerminalOrReturn ? actorOfficeId : nextOfficeId,
      action_type: dbAction,
      action_remarks: remarks || `Reviewed by ${getRoleLabel(user.role, user.origin)}.`,
    });

    return DocumentModel.findById(docId);
  },

  /**
   * PB-18 / REQ-SUB-7: Prevent editing while request is in process.
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
   * PB-18 & REQ-SUB-8: Resubmit a returned document under the same Control Number
   * with an incremented Revision Number, keeping earlier files and history.
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
    if (Array.isArray(input.files) && input.files.length > 0) {
      for (const f of input.files) {
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
      action_remarks: input.remarks || input.note || `Resubmitted with corrections (Revision ${newRevisionNo}).`,
    });

    return DocumentModel.findById(docId);
  },
};

module.exports = AccessControlService;
