const FollowUpRuleModel = require('../models/followUpRuleModel');
const FollowUpService = require('../services/followUpService');
const { canPerformAction } = require('../utils/roles');

const FollowUpRuleController = {
  /**
   * GET /api/follow-up-rules (PB-46: Secretary-only)
   */
  async getRules(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_follow_up_rules')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may view or configure automated follow-up rules.',
        });
      }

      const rule = FollowUpRuleModel.getRule();
      res.json({
        rule,
        allowedStatuses: FollowUpRuleModel.ALLOWED_ELIGIBLE_STATUSES,
        allowedOrigins: FollowUpRuleModel.ALLOWED_ORIGINS,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/follow-up-rules (PB-46: Secretary configures interval & conditions with audit trail)
   */
  async updateRules(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_follow_up_rules')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may configure automated follow-up rules.',
        });
      }

      const result = FollowUpRuleModel.validateAndUpdateRule(req.body || {}, {
        updatedBy: req.user.name || 'College Secretary',
        updatedByEmail: req.user.email || null,
      });

      res.json({
        message: 'Automated follow-up rules updated.',
        ...result,
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({
          error: err.message,
          validationErrors: err.validationErrors || [err.message],
        });
      }
      next(err);
    }
  },

  /**
   * GET /api/follow-up-rules/history (PB-46: Admin visibility into rule change history & execution runs)
   */
  async getHistory(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_follow_up_rules')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may view follow-up rule change history.',
        });
      }

      const limit = req.query.limit || 50;
      const history = FollowUpRuleModel.getConfigHistory(limit);
      const runs = FollowUpRuleModel.getRunHistory(limit);
      res.json({
        currentVersion: FollowUpRuleModel.getRule().version,
        totalChanges: history.length,
        history,
        recentRuns: runs,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/follow-up-rules/candidates (PB-46: Preview pending documents matching rule without sending)
   */
  async previewCandidates(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_follow_up_rules')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may inspect follow-up candidates.',
        });
      }

      const documentIds = req.query.documentId ? [req.query.documentId] : null;
      const preview = await FollowUpService.evaluateAndDispatch({
        dryRun: true,
        documentIds,
        asOf: req.query.asOf || null,
        triggeredBy: req.user.name || 'College Secretary',
      });

      res.json(preview);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/follow-up-rules/run (PB-46 / REQ-NOT-3: Evaluate & dispatch pending-review reminders)
   */
  async runFollowUpEvaluation(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_follow_up_rules')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may run automated follow-up reminders.',
        });
      }

      const { dryRun = false, documentIds = null, asOf = null } = req.body || {};
      const result = await FollowUpService.evaluateAndDispatch({
        dryRun: Boolean(dryRun),
        documentIds: Array.isArray(documentIds) ? documentIds : null,
        asOf: asOf || null,
        triggeredBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
      });

      res.json({
        message: result.dryRun
          ? 'Follow-up rule dry-run evaluation completed.'
          : !result.enabled
            ? 'Automated follow-up rules are currently disabled; no reminders sent.'
            : 'Automated follow-up evaluation and reminder dispatch completed.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = FollowUpRuleController;

