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
router.post('/faculty', DirectoryController.createFacultyListing);
router.get('/faculty/:id', DirectoryController.getFacultyDetail);
router.put('/faculty/:id', DirectoryController.updateFacultyListing);
router.delete('/faculty/:id', DirectoryController.deleteFacultyListing);

// Subjects directory
router.get('/subjects', DirectoryController.listSubjects);
router.post('/subjects', DirectoryController.createSubjectListing);
router.get('/subjects/:code', DirectoryController.getSubjectDetail);
router.put('/subjects/:code', DirectoryController.updateSubjectListing);
router.delete('/subjects/:code', DirectoryController.deleteSubjectListing);

// Official course syllabus template (Secretary-managed, PB-40)
router.get('/template/download', DirectoryController.downloadTemplate);
router.get('/template/history', DirectoryController.getTemplateHistory);
router.get('/template', DirectoryController.getTemplate);
router.put('/template', DirectoryController.updateTemplate);
router.post('/template', DirectoryController.updateTemplate);

// PB-40 Announcements & Traceable Audit History
router.get('/announcements', DirectoryController.listAnnouncements);
router.post('/announcements', DirectoryController.createAnnouncement);
router.delete('/announcements/:id', DirectoryController.deleteAnnouncement);
router.get('/audit-logs', DirectoryController.getAuditLogs);

// Syllabi listing, detail, upload/replace, update, history, and removal
router.get('/syllabi', DirectoryController.listSyllabi);
router.get('/syllabi/:syllabusId/history', DirectoryController.getSyllabusHistory);
router.get('/syllabi/:syllabusId', DirectoryController.getSyllabusDetail);
router.post('/syllabi', DirectoryController.uploadOrReplaceSyllabus);
router.put('/syllabi/:syllabusId', DirectoryController.updateSyllabus);
router.delete('/syllabi/:syllabusId', DirectoryController.deleteSyllabus);

module.exports = router;

