/**
 * workflowRouteRoutes.js
 * PB-45: Routes for configuring workflow routes and inspecting audit history
 */
const express = require('express');
const router = express.Router();
const WorkflowRouteController = require('../controllers/workflowRouteController');
const { verifyUser, requireAction } = require('../middleware/authMiddleware');

// Route inspection is accessible to authenticated users
router.get('/', verifyUser, WorkflowRouteController.getRoutes);

// Route audit log requires manage_requirements action (Secretary/Admin)
router.get('/history', verifyUser, requireAction('manage_requirements'), WorkflowRouteController.getRouteAuditLog);

// Route configuration updates require manage_requirements action (Secretary/Admin)
router.put('/:origin', verifyUser, requireAction('manage_requirements'), WorkflowRouteController.updateRoute);

module.exports = router;
