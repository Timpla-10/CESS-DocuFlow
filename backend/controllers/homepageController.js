const HomepageModel = require('../models/homepageModel');
const { canPerformAction } = require('../utils/roles');

const HomepageController = {
  /**
   * GET /api/homepage (Public — SRS 3.13.2)
   * Returns only approved, published institutional information & logos.
   * Strictly excludes drafts, internal notes, user PII, and system logs.
   */
  async getPublicHomepage(req, res, next) {
    try {
      const homepage = await HomepageModel.getPublicHomepage();
      res.json({ homepage });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/homepage/logos (Public)
   * Returns approved institutional & college logos.
   */
  async getPublicLogos(req, res, next) {
    try {
      const logos = HomepageModel.getPublicLogos();
      res.json(logos);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/homepage/manage (Secretary-only)
   * Returns both approved public state and any unapproved draft changes.
   */
  async getManagementView(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_homepage_info')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may manage homepage and college information.',
        });
      }
      res.json(HomepageModel.getManagementView());
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/homepage (Secretary-only)
   * Updates institutional/college copy & details (either published immediately or staged as draft).
   */
  async updateHomepageInfo(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_homepage_info')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update homepage and college information.',
        });
      }

      const { publish = true, reason = null, ...infoBody } = req.body || {};
      const result = HomepageModel.updateCollegeInfo(infoBody, {
        updatedBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
        reason,
        publish: publish !== false && publish !== 'false',
      });

      const homepage = await HomepageModel.getPublicHomepage();
      res.json({
        message: result.published
          ? 'Approved homepage and college information updated and published.'
          : 'Homepage draft saved (pending Secretary publication).',
        ...result,
        homepage,
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  },

  /**
   * PUT /api/homepage/logos (Secretary-only)
   * Updates approved institutional seals & college logos.
   */
  async updateLogos(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_homepage_info')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update official college logos.',
        });
      }

      const { publish = true, reason = null, ...logoBody } = req.body || {};
      const result = HomepageModel.updateLogos(logoBody, {
        updatedBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
        reason,
        publish: publish !== false && publish !== 'false',
      });

      res.json({
        message: result.published
          ? 'Approved official logos updated and published.'
          : 'Official logo changes staged as draft.',
        ...result,
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  },

  /**
   * POST /api/homepage/publish (Secretary-only)
   */
  async publishHomepage(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_homepage_info')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may publish approved homepage information.',
        });
      }

      const result = HomepageModel.publishDraft({
        updatedBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
        reason: req.body?.reason || null,
      });
      const homepage = await HomepageModel.getPublicHomepage();
      res.json({
        message: 'Approved homepage and college information published.',
        ...result,
        homepage,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/homepage/history (Secretary-only)
   */
  async getHistory(req, res, next) {
    try {
      if (!canPerformAction(req.user, 'manage_homepage_info')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may view homepage change history.',
        });
      }
      const history = HomepageModel.getHistory(req.query.limit || 50);
      res.json({
        total: history.length,
        history,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = HomepageController;

