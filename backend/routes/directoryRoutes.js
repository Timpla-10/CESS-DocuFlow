const express = require('express');
const router = express.Router();
const DirectoryController = require('../controllers/directoryController');
const { verifyUser } = require('../middleware/authMiddleware');

/**
 * PB-38: Faculty, Subjects, and Syllabus Directory API
 * All routes require authentication (`verifyUser`), returning 401 when unauthenticated.
 */
router.use(verifyUser);

// Overview & Faculty directory
router.get('/', DirectoryController.browseDirectory);
router.get('/faculty', DirectoryController.browseDirectory);
router.get('/faculty/:id', DirectoryController.getFacultyDetail);

// Subjects directory
router.get('/subjects', DirectoryController.listSubjects);
router.get('/subjects/:code', DirectoryController.getSubjectDetail);

// Official course syllabus template (Secretary-managed)
router.get('/template', DirectoryController.getTemplate);
router.put('/template', DirectoryController.updateTemplate);

// Syllabi listing, detail, upload/replace, and removal
router.get('/syllabi', DirectoryController.listSyllabi);
router.get('/syllabi/:syllabusId', DirectoryController.getSyllabusDetail);
router.post('/syllabi', DirectoryController.uploadOrReplaceSyllabus);
router.delete('/syllabi/:syllabusId', DirectoryController.deleteSyllabus);

module.exports = router;

