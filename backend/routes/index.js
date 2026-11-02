const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const documentRoutes = require('./documentRoutes');
const DocumentController = require('../controllers/documentController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CESS-DocuFlow Backend API',
    ticket: 'PB-10 Browse Available Document Types & PB-11 Required Forms & PB-02 RBAC',
  });
});

// PB-10 & PB-11: Alias /api/document-types for direct client access
router.get('/document-types', verifyUser, DocumentController.listDocumentTypes);
router.get('/document-types/:id', verifyUser, DocumentController.getDocumentType);
router.get('/document-types/:id/requirements', verifyUser, DocumentController.getDocumentTypeRequirements);
router.post('/document-types/:id/requirements', verifyUser, requireAction('manage_requirements'), DocumentController.createDocumentTypeRequirement);
router.put('/document-types/:id/requirements/:formId', verifyUser, requireAction('manage_requirements'), DocumentController.updateDocumentTypeRequirement);
router.delete('/document-types/:id/requirements/:formId', verifyUser, requireAction('manage_requirements'), DocumentController.deleteDocumentTypeRequirement);

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);

module.exports = router;
