const AccessControlService = require('../services/accessControlService');
const DocumentTypeModel = require('../models/documentTypeModel');

const DocumentController = {
  /**
   * GET /api/documents/types or GET /api/document-types
   * PB-10: Browse available document types filtered by authenticated user's role and origin
   */
  async listDocumentTypes(req, res, next) {
    try {
      const types = await DocumentTypeModel.findEligibleForRole(req.user.role, req.user.origin);
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
   */
  async listDocuments(req, res, next) {
    try {
      const docs = await AccessControlService.getVisibleDocumentsForUser(req.user);
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
   * GET /api/documents/:id
   * PB-02: Enforces role-based view permission on single document record
   */
  async getDocument(req, res, next) {
    try {
      const doc = await AccessControlService.getDocumentByIdForUser(req.user, req.params.id);
      res.json({ document: doc });
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
   * PB-02: Completeness check (Secretary only)
   */
  async checkRequirements(req, res, next) {
    try {
      const updated = await AccessControlService.checkRequirements(
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
   * POST /api/documents/:id/review
   * PB-02: Review decision — endorse/approve/return/reject (Assigned Reviewer only)
   */
  async reviewDocument(req, res, next) {
    try {
      const updated = await AccessControlService.reviewDocument(
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
};

module.exports = DocumentController;
