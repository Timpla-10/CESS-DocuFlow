const express = require('express');
const router = express.Router();
const DocumentController = require('../controllers/documentController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

// All document routes require role verification
router.use(verifyUser);

// PB-10: Browse available document types (Role-filtered)
router.get('/types', DocumentController.listDocumentTypes);
router.get('/types/:id', DocumentController.getDocumentType);

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

// PB-02: Role-verified single document retrieval
router.get('/:id', DocumentController.getDocument);

// PB-19 / PB-22 / SRS 3.6: Processing history, return reason & versioned attachments
router.get('/:id/history', DocumentController.getDocumentHistory);

// PB-02 & PB-10: Submit document (Requesters only: Student, CESS Faculty, IDS Faculty)
router.post('/', requireAction('submit_document'), DocumentController.submitDocument);

// PB-02 & PB-22: Completeness check (Secretary only)
router.post('/:id/check', requireAction('check_requirements'), DocumentController.checkRequirements);

// PB-02 & PB-22: Review decision (Reviewers only: Chairperson, IDS Principal, Dean, OVCAA, VCAF, Chancellor)
router.post('/:id/review', DocumentController.reviewDocument);

// PB-22: Dedicated return endpoint with required reason (Assigned Reviewer or Secretary)
router.post('/:id/return', DocumentController.returnDocument);

// PB-18 / REQ-SUB-7: Prevent editing while in process; edit allowed only when Returned
router.put('/:id', DocumentController.editDocument);

// PB-18 / REQ-SUB-8: Resubmit returned document with new revision
router.post('/:id/resubmit', requireAction('resubmit_document'), DocumentController.resubmitDocument);

module.exports = router;
