const AccessControlService = require('../services/accessControlService');

const DocumentController = {
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
   * PB-02: Submit new document request (Requesters only)
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
};

module.exports = DocumentController;

