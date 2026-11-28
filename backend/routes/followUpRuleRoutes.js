const express = require('express');
const router = express.Router();
const FollowUpRuleController = require('../controllers/followUpRuleController');
const { verifyUser, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

/**
 * PB-46: Configure Automated Follow-Up Rules (College Secretary only)
 */
router.use(verifyUser, requireRole(ROLES.SECRETARY));

router.get('/', FollowUpRuleController.getRules);
router.put('/', FollowUpRuleController.updateRules);
router.get('/history', FollowUpRuleController.getHistory);
router.get('/candidates', FollowUpRuleController.previewCandidates);
router.post('/run', FollowUpRuleController.runFollowUpEvaluation);

module.exports = router;
