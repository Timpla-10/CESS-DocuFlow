const AccessControlService = require('../services/accessControlService');
const DocumentTypeModel = require('../models/documentTypeModel');
const DocumentModel = require('../models/documentModel');

const DocumentController = {
  /**
   * GET /api/documents/types or GET /api/document-types
   * PB-10 & PB-44: Browse available document types filtered by authenticated user's role and origin
   */
  async listDocumentTypes(req, res, next) {
    try {
      const includeInactive = req.query.includeInactive === 'true' || req.query.all === 'true';
      const types = await DocumentTypeModel.findEligibleForRole(req.user.role, req.user.origin, { includeInactive });
      res.json({
        role: req.user.role,
        origin: req.user.origin,
        roleLabel: req.user.roleLabel,
        count: types.length,
        documentTypes: types,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/types or POST /api/document-types
   * PB-44 / REQ-REQT-1: Admin (College Secretary) adds a new document type
   */
  async createDocumentType(req, res, next) {
    try {
      const created = await DocumentTypeModel.createDocumentType(req.body);
      res.status(201).json({
        message: 'Document type created successfully.',
        documentType: created,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/documents/types/:id or PUT /api/document-types/:id
   * PB-44 / REQ-REQT-1: Admin (College Secretary) updates an existing document type
   */
  async updateDocumentType(req, res, next) {
    try {
      const updated = await DocumentTypeModel.updateDocumentType(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Document type not found.' });
      }
      res.json({
        message: 'Document type updated successfully.',
        documentType: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/documents/types/:id or DELETE /api/document-types/:id
   * PB-44 / REQ-REQT-1: Admin (College Secretary) disables/deactivates a document type
   * Soft-deactivates so existing requests remain intact
   */
  async deleteDocumentType(req, res, next) {
    try {
      const deactivated = await DocumentTypeModel.deleteDocumentType(req.params.id);
      if (!deactivated) {
        return res.status(404).json({ error: 'Document type not found.' });
      }
      res.json({
        message: 'Document type successfully deactivated. Existing requests remain intact.',
        documentType: deactivated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/documents/types/:id/template or PUT /api/document-types/:id/template
   * PB-44 / REQ-REQT-10: Admin replaces downloadable form template
   */
  async replaceDocumentTypeTemplate(req, res, next) {
    try {
      const templateUrl = req.body.template_url || req.body.templateUrl;
      if (!templateUrl) {
        return res.status(400).json({ error: 'template_url is required.' });
      }
      const updated = await DocumentTypeModel.replaceTemplate(req.params.id, templateUrl, req.body.formId);
      res.json({
        message: 'Document template updated successfully.',
        documentType: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/types/:id/template or GET /api/document-types/:id/template
   * PB-44 / REQ-REQT-9: Retrieve or download active blank template
   */
  async getDocumentTypeTemplate(req, res, next) {
    try {
      const docType = await DocumentTypeModel.findById(req.params.id);
      if (!docType) {
        return res.status(404).json({ error: 'Document type not found.' });
      }
      res.json({
        docTypeId: docType.doc_type_id,
        name: docType.name,
        templateUrl: docType.template_url,
        template_url: docType.template_url,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/types/:id
   * PB-10: Single document type details with required forms and templates (PB-11, PB-12)
   */
  async getDocumentType(req, res, next) {
    try {
      const docType = await DocumentTypeModel.findById(req.params.id);
      if (!docType) {
        return res.status(404).json({ error: 'Document type not found.' });
      }
      res.json({ documentType: docType });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/document-types/:id/requirements or GET /api/documents/types/:id/requirements
   * PB-11: Shows required forms, attachments, and source office
   */
  async getDocumentTypeRequirements(req, res, next) {
    try {
      const requirements = await DocumentTypeModel.getRequirementsByDocTypeId(req.params.id);
      if (!requirements) {
        return res.status(404).json({ error: 'Document type not found.' });
      }
      res.json({
        docTypeId: req.params.id,
        count: requirements.length,
        requirements,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/document-types/:id/requirements
   * PB-11 / REQ-REQT-1: Secretary/Admin adds a required form
   */
  async createDocumentTypeRequirement(req, res, next) {
    try {
      const created = await DocumentTypeModel.createRequirement(req.params.id, req.body);
      res.status(201).json({ requirement: created });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/document-types/:id/requirements/:formId
   * PB-11 / REQ-REQT-1: Secretary/Admin updates a required form
   */
  async updateDocumentTypeRequirement(req, res, next) {
    try {
      const updated = await DocumentTypeModel.updateRequirement(req.params.formId, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Requirement not found.' });
      }
      res.json({ requirement: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/document-types/:id/requirements/:formId
   * PB-11 / REQ-REQT-1: Secretary/Admin removes a required form
   */
  async deleteDocumentTypeRequirement(req, res, next) {
    try {
      const deleted = await DocumentTypeModel.deleteRequirement(req.params.formId);
      if (!deleted) {
        return res.status(404).json({ error: 'Requirement not found.' });
      }
      res.json({
        message: 'Requirement successfully removed.',
        requirement: deleted,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents
   * PB-02: Returns only documents visible to the authenticated user's role:
   * - Student / CESS Faculty / IDS Faculty -> own requests only
   * - Reviewers (Chairperson, IDS Principal, Dean, OVCAA, VCAF, Chancellor) -> routed records only
   * - Secretary -> all records
   * PB-20: Supports ?queue= filtering (awaiting_verification, in_review, ready_for_release, returned, rejected, ids_handoff)
   */
  async listDocuments(req, res, next) {
    try {
      const filters = {
        queue: req.query.queue,
        stage: req.query.stage,
        office: req.query.office,
        officeId: req.query.officeId,
        overdue: req.query.overdue,
        origin: req.query.origin,
        sort: req.query.sort,
        priority: req.query.priority,
        is_expedited: req.query.is_expedited || req.query.expedited,
        view: req.query.view,
        archived: req.query.archived,
        docTypeId: req.query.docTypeId || req.query.typeId || req.query.doc_type_id,
        category: req.query.category || req.query.type || req.query.typeName,
        status: req.query.status,
        search: req.query.search || req.query.q,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        includeEmpty: req.query.includeEmpty,
      };

      if (req.query.groupBy || req.query.group_by) {
        const repo = await AccessControlService.getRepository(req.user, {
          ...filters,
          groupBy: req.query.groupBy || req.query.group_by,
          view: filters.view || 'all',
        });
        return res.json({
          viewer: repo.viewer,
          count: repo.documents.length,
          view: repo.view,
          groupBy: repo.groupBy,
          summary: repo.summary,
          categories: repo.categories,
          groups: repo.groups,
          documents: repo.documents,
        });
      }

      const docs = await AccessControlService.getVisibleDocumentsForUser(req.user, filters);
      res.json({
        viewer: {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
          origin: req.user.origin,
          roleLabel: req.user.roleLabel,
        },
        count: docs.length,
        documents: docs,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/repository
   * PB-35: Central repository grouped by type/category with distinct active & archived views
   */
  async getRepository(req, res, next) {
    try {
      const repo = await AccessControlService.getRepository(req.user, {
        view: req.query.view || 'active',
        groupBy: req.query.groupBy || req.query.group_by || 'type',
        origin: req.query.origin,
        status: req.query.status,
        stage: req.query.stage,
        office: req.query.office,
        officeId: req.query.officeId,
        priority: req.query.priority,
        is_expedited: req.query.is_expedited || req.query.expedited,
        docTypeId: req.query.docTypeId || req.query.typeId || req.query.doc_type_id,
        category: req.query.category || req.query.type || req.query.typeName,
        search: req.query.search || req.query.q,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        sort: req.query.sort,
        includeEmpty: req.query.includeEmpty,
      });
      res.json(repo);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/archive
   * PB-35: Distinct archived repository view (Released, Rejected, Archived)
   */
  async getArchive(req, res, next) {
    try {
      const repo = await AccessControlService.getRepository(req.user, {
        view: 'archived',
        groupBy: req.query.groupBy || req.query.group_by || 'type',
        origin: req.query.origin,
        status: req.query.status,
        docTypeId: req.query.docTypeId || req.query.typeId || req.query.doc_type_id,
        category: req.query.category || req.query.type || req.query.typeName,
        search: req.query.search || req.query.q,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        sort: req.query.sort || 'newest',
        includeEmpty: req.query.includeEmpty,
      });
      res.json(repo);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/workflow-map
   * PB-28: Secretary Workflow Map & Live Office Counts (SRS 3.11)
   */
  async getWorkflowMap(req, res, next) {
    try {
      const mapData = await AccessControlService.getWorkflowMap(req.user);
      res.json({
        viewer: {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
          origin: req.user.origin,
          roleLabel: req.user.roleLabel,
        },
        ...mapData,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/queues
   * PB-20: Returns Secretary Workstation Queues categorized into 6 agreed states with exact counts
   */
  async getSecretaryQueues(req, res, next) {
    try {
      const queuesData = await AccessControlService.getSecretaryQueues(req.user);
      res.json({
        viewer: {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
          origin: req.user.origin,
          roleLabel: req.user.roleLabel,
        },
        ...queuesData,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/preferences
   * PB-22 & PB-05: Get current user's notification preferences
   */
  async getNotificationPreference(req, res, next) {
    try {
      const pref = await AccessControlService.getNotificationPreference(req.user);
      res.json({ preference: pref });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/documents/preferences
   * PB-22 & PB-05: Update current user's notification preferences
   */
  async updateNotificationPreference(req, res, next) {
    try {
      const pref = await AccessControlService.updateNotificationPreference(req.user, req.body);
      res.json({ preference: pref });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/notifications
   * PB-22 & PB-06: List notifications for current user
   */
  async getNotifications(req, res, next) {
    try {
      const notifications = await AccessControlService.getNotifications(
        req.user,
        req.query.documentId || null
      );
      res.json({
        count: notifications.length,
        notifications,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id
   * PB-02 & PB-24: Enforces role-based view permission and includes office-permitted actions
   */
  async getDocument(req, res, next) {
    try {
      const doc = await AccessControlService.getDocumentByIdForUser(req.user, req.params.id);
      res.json({
        document: doc,
        metadata: doc.metadata || null,
        attachments: doc.attachments || [],
        history: doc.history || [],
        permittedActions: doc.permittedActions || [],
        permittedOptions: doc.permittedOptions || [],
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/actions
   * PB-24: Returns only the permitted actions for the caller's office on this document
   */
  async getPermittedActions(req, res, next) {
    try {
      const result = await AccessControlService.getPermittedActionsForDocument(
        req.user,
        req.params.id
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents
   * PB-02 & PB-10: Submit new document request with role eligibility check
   */
  async submitDocument(req, res, next) {
    try {
      const created = await AccessControlService.submitDocument(req.user, req.body);
      res.status(201).json({ document: created });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/check
   * PB-02 & PB-22: Completeness check (Secretary only)
   */
  async checkRequirements(req, res, next) {
    try {
      const updated = await AccessControlService.checkRequirements(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        document: updated,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/flag-exception
   * PB-29 / SRS 3.9: Flag approved exception for expedited processing
   */
  async flagException(req, res, next) {
    try {
      const updated = await AccessControlService.flagDocumentException(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        message: 'Approved exception flagged successfully. Document prioritized in queue.',
        document: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/review & POST /api/documents/:id/decision
   * PB-02, PB-22, PB-23 & PB-24: Record endorsement, approval, and office decision (Assigned Reviewer only)
   */
  async reviewDocument(req, res, next) {
    try {
      const updated = await AccessControlService.reviewDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        document: updated,
        decision: updated?.recordedDecision || updated?.lastDecision || null,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/return
   * PB-22: Return a request with required reason (Assigned Reviewer or Secretary)
   */
  async returnDocument(req, res, next) {
    try {
      const updated = await AccessControlService.returnDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        document: updated,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/reject
   * PB-23: Reject/disapprove a request with required reason (Permitted Reviewer or Secretary at their stage)
   */
  async rejectDocument(req, res, next) {
    try {
      const updated = await AccessControlService.rejectDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        document: updated,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/reopen
   * PB-23: Approved reopen path for a rejected document (College Secretary or College Dean only)
   */
  async reopenDocument(req, res, next) {
    try {
      const reopened = await AccessControlService.reopenDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({ document: reopened });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/ready
   * PB-33: Mark a processed document ready for release (College Secretary only)
   */
  async markReady(req, res, next) {
    try {
      const updated = await AccessControlService.markReady(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        message: 'Document successfully marked ready for release.',
        document: updated,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/release
   * PB-33: Record document release to requester (College Secretary only)
   */
  async recordRelease(req, res, next) {
    try {
      const updated = await AccessControlService.recordRelease(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        message: 'Document release successfully recorded.',
        document: updated,
        releaseInfo: updated?.releaseInfo || null,
        notification: updated?.notification || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/archive
   * PB-35: Archive a document record into the central archive vault (Secretary only)
   */
  async archiveDocument(req, res, next) {
    try {
      const archived = await AccessControlService.archiveDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({
        message: 'Document archived in central repository.',
        document: archived,
        archiveInfo: archived?.archiveInfo || null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/documents/:id
   * PB-18 / REQ-SUB-7: Prevent editing while request is in process.
   * Only allowed when current_status === 'Returned'.
   */
  async editDocument(req, res, next) {
    try {
      const updated = await AccessControlService.editDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({ document: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/resubmit
   * PB-18 / REQ-SUB-8: Resubmit returned document with new revision and corrected files.
   */
  async resubmitDocument(req, res, next) {
    try {
      const resubmitted = await AccessControlService.resubmitDocument(
        req.user,
        req.params.id,
        req.body
      );
      res.json({ document: resubmitted });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/history
   * PB-19 / PB-22 / SRS 3.6: Get complete processing history, return reason & versioned attachments
   */
  async getDocumentHistory(req, res, next) {
    try {
      const historyData = await AccessControlService.getDocumentHistory(
        req.user,
        req.params.id
      );
      if (!historyData) {
        return res.status(404).json({ error: 'Document not found or access denied.' });
      }
      res.json(historyData);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/route
   * PB-25 / SRS 3.5: Inspect configured route, current step, and completed steps based on origin
   */
  async getDocumentRoute(req, res, next) {
    try {
      const routeData = await AccessControlService.getDocumentRoute(
        req.user,
        req.params.id
      );
      res.json(routeData);
    } catch (err) {
      next(err);
    }
  },
  /**
   * DELETE /api/documents/:id
   * PB-48 AC 3: Permanent hard deletion is blocked; records and files are preserved via soft-delete / archive
   */
  async deleteDocument(req, res, next) {
    try {
      const isHard = req.query.hard === 'true' || req.body?.hard === true;
      if (isHard) {
        return res.status(403).json({
          error: 'Forbidden: Permanent deletion of document records and files is prohibited. Records must be preserved for audit trail and compliance (PB-48).',
        });
      }
      await DocumentModel.softDelete(req.params.id);
      res.json({
        message: 'Document successfully archived. Audit trail and file attachments remain preserved.',
        documentId: req.params.id,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/attachments
   * PB-49 AC 2 / PB-37: Direct URL access & unauthorized file access protection
   */
  async getDocumentAttachments(req, res, next) {
    try {
      const data = await AccessControlService.getDocumentAttachments(
        req.user,
        req.params.id
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/attachments/:attachmentId
   * PB-49 AC 2 / PB-37: Direct access to single attachment metadata with authorization check
   */
  async getAttachmentById(req, res, next) {
    try {
      const data = await AccessControlService.getAttachmentById(
        req.user,
        req.params.id,
        req.params.attachmentId
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/documents/:id/attachments/:attachmentId/download
   * PB-49 AC 2 / PB-37: Download attachment with authorization and private URL security
   */
  async downloadAttachment(req, res, next) {
    try {
      const data = await AccessControlService.getAttachmentDownload(
        req.user,
        req.params.id,
        req.params.attachmentId
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/attachments
   * PB-49 AC 2 & 3: Attach a file to an existing document with file validation (20 MB limit & format check)
   */
  async addAttachment(req, res, next) {
    try {
      const added = await AccessControlService.addAttachment(
        req.user,
        req.params.id,
        req.body
      );
      res.status(201).json({
        message: 'Attachment successfully added.',
        attachment: added,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = DocumentController;
