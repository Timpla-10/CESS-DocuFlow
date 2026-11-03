const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const documentRoutes = require('./documentRoutes');
const workflowRouteRoutes = require('./workflowRouteRoutes');
const DocumentController = require('../controllers/documentController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CESS-DocuFlow Backend API',
    ticket: 'PB-10 Browse Available Document Types & PB-11 Required Forms & PB-02 RBAC',
  });
});

// PB-10, PB-11 & PB-44: Alias /api/document-types for direct client access
router.get('/document-types', verifyUser, DocumentController.listDocumentTypes);
router.post('/document-types', verifyUser, requireAction('manage_requirements'), DocumentController.createDocumentType);
router.get('/document-types/:id', verifyUser, DocumentController.getDocumentType);
router.put('/document-types/:id', verifyUser, requireAction('manage_requirements'), DocumentController.updateDocumentType);
router.delete('/document-types/:id', verifyUser, requireAction('manage_requirements'), DocumentController.deleteDocumentType);
router.get('/document-types/:id/template', verifyUser, DocumentController.getDocumentTypeTemplate);
router.put('/document-types/:id/template', verifyUser, requireAction('manage_requirements'), DocumentController.replaceDocumentTypeTemplate);
router.get('/document-types/:id/requirements', verifyUser, DocumentController.getDocumentTypeRequirements);
router.post('/document-types/:id/requirements', verifyUser, requireAction('manage_requirements'), DocumentController.createDocumentTypeRequirement);
router.put('/document-types/:id/requirements/:formId', verifyUser, requireAction('manage_requirements'), DocumentController.updateDocumentTypeRequirement);
router.delete('/document-types/:id/requirements/:formId', verifyUser, requireAction('manage_requirements'), DocumentController.deleteDocumentTypeRequirement);

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);
router.use('/workflow/routes', workflowRouteRoutes);
router.use('/routes', workflowRouteRoutes);

module.exports = router;
