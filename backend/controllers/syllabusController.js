/**
 * PB-56: Course Syllabus Controller
 *
 * Provides RESTful API endpoints for:
 *   - Browsing and filtering course syllabi (separate from general document requests)
 *   - Faculty self-service syllabus uploads for own courses
 *   - Updating and deleting course syllabi with strict ownership checks
 *   - Retrieving and downloading course syllabi
 *   - Managing official institutional syllabus template (Secretary only)
 */

const SyllabusModel = require('../models/syllabusModel');
const { ROLES } = require('../utils/roles');

const SyllabusController = {
  /**
   * GET /api/syllabi
   * List all course syllabi with optional filters.
   * Accessible to all authenticated university roles.
   */
  async listSyllabi(req, res, next) {
    try {
      const user = req.user;
      if (user && user.role === ROLES.STUDENT) {
        return res.status(403).json({
          error: 'Forbidden: Students are not authorized to view or access course syllabi.',
        });
      }

      const filters = {
        academicYear: req.query.academicYear,
        semester: req.query.semester,
        department: req.query.department,
        facultyUserId: req.query.facultyUserId,
        q: req.query.q,
      };

      const syllabi = await SyllabusModel.findAll(filters);

      res.json({
        count: syllabi.length,
        syllabi,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/syllabi/:id
   * Retrieve a specific syllabus record.
   */
  async getSyllabus(req, res, next) {
    try {
      const user = req.user;
      if (user && user.role === ROLES.STUDENT) {
        return res.status(403).json({
          error: 'Forbidden: Students are not authorized to view or access course syllabi.',
        });
      }

      const syllabus = await SyllabusModel.findById(req.params.id);
      if (!syllabus) {
        return res.status(404).json({ error: 'Course syllabus not found.' });
      }
      res.json({ syllabus });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/syllabi
   * Upload / create a new course syllabus record.
   * Permitted roles: Faculty (for own courses) or College Secretary.
   * Students and unauthorized roles are blocked (403).
   */
  async createSyllabus(req, res, next) {
    try {
      const user = req.user;

      // Role check: Only Faculty and College Secretary can upload syllabi
      if (user.role === ROLES.STUDENT) {
        return res.status(403).json({
          error: 'Forbidden: Students are not permitted to upload course syllabi.',
        });
      }

      const {
        subjectCode,
        subjectTitle,
        academicYear,
        semester,
        fileName,
        fileUrl,
        department,
        description,
      } = req.body;

      if (!subjectCode || !subjectCode.trim()) {
        return res.status(400).json({ error: 'Course code is required (e.g. EDUC 101).' });
      }
      if (!subjectTitle || !subjectTitle.trim()) {
        return res.status(400).json({ error: 'Course title is required.' });
      }
      if (!fileName && !fileUrl) {
        return res.status(400).json({ error: 'Syllabus file is required (.pdf or .docx).' });
      }

      const created = await SyllabusModel.create({
        subjectCode,
        subjectTitle,
        academicYear: academicYear || '2026-2027',
        semester: semester || '1st Semester',
        fileName: fileName || fileUrl,
        fileUrl: fileUrl || fileName,
        facultyUserId: user.id,
        facultyName: user.name,
        department: department || user.department,
        description: description || '',
      });

      res.status(201).json({
        message: 'Course syllabus uploaded successfully.',
        syllabus: created,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/syllabi/:id
   * Update an existing course syllabus.
   * Strictly enforces that only the assigned instructor or Secretary can edit.
   */
  async updateSyllabus(req, res, next) {
    try {
      const user = req.user;
      const syllabus = await SyllabusModel.findById(req.params.id);

      if (!syllabus) {
        return res.status(404).json({ error: 'Course syllabus not found.' });
      }

      const isOwner = syllabus.facultyUserId === user.id;
      const isSecretary = user.role === ROLES.SECRETARY;

      if (!isOwner && !isSecretary) {
        return res.status(403).json({
          error: 'Forbidden: Only the assigned instructor or College Secretary can modify this course syllabus.',
        });
      }

      const updated = await SyllabusModel.update(req.params.id, req.body);
      res.json({
        message: 'Course syllabus updated successfully.',
        syllabus: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/syllabi/:id
   * Remove a course syllabus file.
   * Only the owner instructor or College Secretary can delete.
   */
  async deleteSyllabus(req, res, next) {
    try {
      const user = req.user;
      const syllabus = await SyllabusModel.findById(req.params.id);

      if (!syllabus) {
        return res.status(404).json({ error: 'Course syllabus not found.' });
      }

      const isOwner = syllabus.facultyUserId === user.id;
      const isSecretary = user.role === ROLES.SECRETARY;

      if (!isOwner && !isSecretary) {
        return res.status(403).json({
          error: 'Forbidden: Only the assigned instructor or College Secretary can delete this course syllabus.',
        });
      }

      await SyllabusModel.delete(req.params.id);
      res.json({ message: 'Course syllabus removed successfully.' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/syllabi/template
   * Retrieve official institutional syllabus template metadata.
   */
  async getTemplate(req, res, next) {
    try {
      const user = req.user;
      if (user && user.role === ROLES.STUDENT) {
        return res.status(403).json({
          error: 'Forbidden: Students are not authorized to access official course syllabus templates.',
        });
      }

      const template = SyllabusModel.getTemplate();
      res.json({ template });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/syllabi/template
   * Update the official syllabus template.
   * College Secretary only.
   */
  async updateTemplate(req, res, next) {
    try {
      const user = req.user;
      if (user.role !== ROLES.SECRETARY) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary can update the official syllabus template.',
        });
      }

      const updated = SyllabusModel.updateTemplate({
        fileName: req.body.fileName,
        uploadedBy: `${user.name} (College Secretary)`,
        fileSize: req.body.fileSize || '150 KB',
      });

      res.json({
        message: 'Official course syllabus template updated successfully.',
        template: updated,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = SyllabusController;
