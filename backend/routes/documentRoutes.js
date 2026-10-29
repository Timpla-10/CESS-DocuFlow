const express = require('express');
const router = express.Router();
const DocumentController = require('../controllers/documentController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

// All document routes require role verification
router.use(verifyUser);

// PB-02: Role-filtered document listing (Requester -> own, Reviewer -> routed, Secretary -> all)
router.get('/', DocumentController.listDocuments);

// PB-02: Role-verified single document retrieval
router.get('/:id', DocumentController.getDocument);

// PB-02: Submit document (Requesters only: Student, CESS Faculty, IDS Faculty)
router.post('/', requireAction('submit_document'), DocumentController.submitDocument);

// PB-02: Completeness check (Secretary only)
router.post('/:id/check', requireAction('check_requirements'), DocumentController.checkRequirements);

// PB-02: Review decision (Reviewers only: Chairperson, IDS Principal, Dean, OVCAA, VCAF, Chancellor)
router.post('/:id/review', DocumentController.reviewDocument);

module.exports = router;

