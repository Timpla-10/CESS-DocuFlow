const express = require('express');
const router = express.Router();
const DocumentController = require('../controllers/documentController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

// All document routes require role verification
router.use(verifyUser);

// PB-10 & PB-44: Browse and manage document types (Role-filtered / Admin-managed)
router.get('/types', DocumentController.listDocumentTypes);
router.post('/types', requireAction('manage_requirements'), DocumentController.createDocumentType);
router.get('/types/:id', DocumentController.getDocumentType);
router.put('/types/:id', requireAction('manage_requirements'), DocumentController.updateDocumentType);
router.delete('/types/:id', requireAction('manage_requirements'), DocumentController.deleteDocumentType);

// PB-44 / REQ-REQT-9,10: Document Type Template management
router.get('/types/:id/template', DocumentController.getDocumentTypeTemplate);
router.put('/types/:id/template', requireAction('manage_requirements'), DocumentController.replaceDocumentTypeTemplate);

// PB-11: Show required forms, attachments, and source office
router.get('/types/:id/requirements', DocumentController.getDocumentTypeRequirements);
router.post('/types/:id/requirements', requireAction('manage_requirements'), DocumentController.createDocumentTypeRequirement);
router.put('/types/:id/requirements/:formId', requireAction('manage_requirements'), DocumentController.updateDocumentTypeRequirement);
router.delete('/types/:id/requirements/:formId', requireAction('manage_requirements'), DocumentController.deleteDocumentTypeRequirement);

// PB-02: Role-filtered document listing (Requester -> own, Reviewer -> routed, Secretary -> all)
router.get('/', DocumentController.listDocuments);

// PB-20 / SRS 3.11: Secretary Verification Queue & Workstation (Agreed states & exact counts)
router.get('/queues', DocumentController.getSecretaryQueues);

// PB-22 & PB-05 / PB-06: Notification preferences and notification log
router.get('/preferences', DocumentController.getNotificationPreference);
router.put('/preferences', DocumentController.updateNotificationPreference);
router.get('/notifications', DocumentController.getNotifications);

// PB-02 & PB-24: Role-verified single document retrieval with permitted office actions
router.get('/:id', DocumentController.getDocument);

// PB-24: Retrieve permitted actions for caller's office at current stage
router.get('/:id/actions', DocumentController.getPermittedActions);

// PB-19 / PB-22 / PB-26 / SRS 3.4 REQ-REC-4 & SRS 3.6: Processing history, return reason & versioned attachments
router.get('/:id/history', DocumentController.getDocumentHistory);

// PB-26 / SRS 3.4 REQ-REC-4: Processing history is immutable; ordinary users cannot edit or delete history
router.all('/:id/history', (req, res, next) => {
  if (req.method === 'GET') return next();
  return res.status(405).json({
    error: 'Method Not Allowed: Document processing history is immutable and cannot be edited or deleted.',
  });
});
router.all('/:id/history/:historyId', (req, res) => {
  return res.status(405).json({
    error: 'Method Not Allowed: Document processing history is immutable and cannot be edited or deleted.',
  });
});

// PB-25 / SRS 3.5: Inspect configured route, current step, and completed step history based on origin
router.get('/:id/route', DocumentController.getDocumentRoute);

// PB-02 & PB-10: Submit document (Requesters only: Student, CESS Faculty, IDS Faculty)
router.post('/', requireAction('submit_document'), DocumentController.submitDocument);

// PB-02 & PB-22: Completeness check (Secretary only)
router.post('/:id/check', requireAction('check_requirements'), DocumentController.checkRequirements);

// PB-02, PB-22, PB-23 & PB-24: Record endorsement, approval, and office decision (Reviewers only)
router.post('/:id/review', DocumentController.reviewDocument);
router.post('/:id/decision', DocumentController.reviewDocument);

// PB-22: Dedicated return endpoint with required reason (Assigned Reviewer or Secretary)
router.post('/:id/return', DocumentController.returnDocument);

// PB-23: Dedicated reject/disapprove endpoint with required reason (Permitted Reviewer or Secretary at their stage)
router.post('/:id/reject', DocumentController.rejectDocument);

// PB-23: Approved reopen path for rejected documents (College Secretary or College Dean only)
router.post('/:id/reopen', DocumentController.reopenDocument);

// PB-18 / REQ-SUB-7: Prevent editing while in process; edit allowed only when Returned
router.put('/:id', DocumentController.editDocument);

// PB-18 / REQ-SUB-8: Resubmit returned document with new revision
router.post('/:id/resubmit', requireAction('resubmit_document'), DocumentController.resubmitDocument);

module.exports = router;
