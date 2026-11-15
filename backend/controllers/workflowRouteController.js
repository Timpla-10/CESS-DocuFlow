/**
 * workflowRouteController.js
 * PB-45 / SRS 3.5: Controller for workflow routes, sequence configuration, and audit history.
 */
const WorkflowRouteModel = require('../models/workflowRouteModel');

const WorkflowRouteController = {
  /**
   * GET /api/workflow/routes or GET /api/routes
   * PB-45: Fetch currently configured active routes for CESS and IDS
   */
  async getRoutes(req, res, next) {
    try {
      const routes = await WorkflowRouteModel.getAllRoutes();
      res.json({
        service: 'CESS-DocuFlow Workflow Routing Engine',
        routes,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/workflow/routes/:origin or PUT /api/routes/:origin
   * PB-45 / SRS 3.5: Secretary updates approved route sequence for CESS or IDS
   */
  async updateRoute(req, res, next) {
    try {
      const origin = req.params.origin;
      const sequence = req.body.sequence || req.body.route;
      const reason = req.body.reason || '';

      if (!sequence) {
        return res.status(400).json({
          error: "Missing 'sequence' array. Please provide the ordered list of reviewing offices.",
        });
      }

      const result = await WorkflowRouteModel.updateRoute(origin, sequence, req.user, reason);
      res.json({
        message: `Workflow route for ${origin.toUpperCase()} successfully updated to Version ${result.route.version}.`,
        route: result.route,
        auditEntry: result.auditEntry,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/workflow/routes/history or GET /api/routes/history
   * PB-45: Fetch audit trail of workflow route modifications
   */
  async getRouteAuditLog(req, res, next) {
    try {
      const history = await WorkflowRouteModel.getAuditLog();
      res.json({
        count: history.length,
        history,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = WorkflowRouteController;
