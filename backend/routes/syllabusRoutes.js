/**
 * PB-56: Course Syllabus Routes
 *
 * Dedicated router for course syllabi, separate from regular document requests.
 */

const express = require('express');
const router = express.Router();
const SyllabusController = require('../controllers/syllabusController');
const { verifyUser } = require('../middleware/authMiddleware');

// All syllabus routes require authentication
router.use(verifyUser);

// Template management (before :id wildcard)
router.get('/template', SyllabusController.getTemplate);
router.put('/template', SyllabusController.updateTemplate);

// Catalog listing and retrieval
router.get('/', SyllabusController.listSyllabi);
router.get('/:id', SyllabusController.getSyllabus);

// Faculty self-service syllabus upload, modification, and deletion
router.post('/', SyllabusController.createSyllabus);
router.put('/:id', SyllabusController.updateSyllabus);
router.delete('/:id', SyllabusController.deleteSyllabus);

module.exports = router;
