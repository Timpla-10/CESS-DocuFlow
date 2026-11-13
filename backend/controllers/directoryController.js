const DirectoryModel = require('../models/directoryModel');
const {
  ROLES,
  normalizeUnit,
  getFacultyUnit,
  getAllowedDirectoryUnits,
  canViewDirectoryUnit,
  canViewSyllabus,
  canManageSyllabus,
  canPerformAction,
} = require('../utils/roles');

function sanitizeFacultyForViewer(viewer, facultyEntry) {
  const unit = getFacultyUnit(facultyEntry);
  const managePerm = canManageSyllabus(viewer, facultyEntry);

  const sanitizedSubjects = (facultyEntry.subjects || []).map((subj) => {
    const viewPerm = canViewSyllabus(viewer, facultyEntry, subj);
    const hasSyllabus = Boolean(subj.syllabus);
    return {
      subjectId: subj.subjectId,
      code: subj.code,
      title: subj.title,
      description: subj.description || null,
      department: subj.department || facultyEntry.department,
      unit: getFacultyUnit({ unit, department: subj.department || facultyEntry.department }),
      syllabusAvailable: hasSyllabus,
      canViewSyllabus: viewPerm.allowed,
      canManageSyllabus: managePerm.allowed,
      syllabusHidden: hasSyllabus && !viewPerm.allowed,
      syllabusRestrictionReason: viewPerm.allowed ? null : viewPerm.reason,
      syllabus: viewPerm.allowed && subj.syllabus ? { ...subj.syllabus } : null,
    };
  });

  return {
    id: facultyEntry.id,
    profileId: facultyEntry.profileId,
    userId: facultyEntry.userId || null,
    name: facultyEntry.name,
    email: facultyEntry.email || null,
    department: facultyEntry.department,
    unit,
    origin: unit,
    position: facultyEntry.position || null,
    biography: facultyEntry.biography || null,
    consultationHours: facultyEntry.consultationHours || null,
    displayPictureUrl: facultyEntry.displayPictureUrl || null,
    isSelf: Boolean(facultyEntry.userId && viewer?.id && facultyEntry.userId === viewer.id),
    canManageSyllabi: managePerm.allowed,
    subjects: sanitizedSubjects,
  };
}

function matchesSearch(faculty, searchTerm) {
  if (!searchTerm) return true;
  const q = String(searchTerm).trim().toLowerCase();
  if (!q) return true;

  if (
    String(faculty.name || '').toLowerCase().includes(q) ||
    String(faculty.department || '').toLowerCase().includes(q) ||
    String(faculty.unit || '').toLowerCase().includes(q)
  ) {
    return true;
  }

  return (faculty.subjects || []).some(
    (s) =>
      String(s.code || '').toLowerCase().includes(q) ||
      String(s.title || '').toLowerCase().includes(q)
  );
}

const DirectoryController = {
  /**
   * GET /api/directory & GET /api/directory/faculty
   * Browse faculty, assigned subjects, CESS/IDS distinction, and role-scoped syllabus visibility.
   */
  async browseDirectory(req, res) {
    try {
      const requestedUnitRaw = req.query.unit || req.query.origin;
      const requestedDept = req.query.department ? String(req.query.department).trim().toLowerCase() : null;
      const requestedSubjectCode = req.query.subjectCode ? String(req.query.subjectCode).trim().toUpperCase() : null;
      const searchTerm = req.query.search || req.query.q || '';

      const allowedUnits = getAllowedDirectoryUnits(req.user);

      let filterUnit = null;
      if (requestedUnitRaw && String(requestedUnitRaw).toLowerCase() !== 'all') {
        filterUnit = normalizeUnit(requestedUnitRaw);
        if (!filterUnit) {
          return res.status(400).json({
            error: `Invalid unit filter '${requestedUnitRaw}'. Permitted values: CESS, IDS, or all.`,
          });
        }
        if (!canViewDirectoryUnit(req.user, filterUnit)) {
          return res.status(403).json({
            error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) is not permitted to browse ${filterUnit} directory records.`,
          });
        }
      }

      const rawCatalog = await DirectoryModel.getRawCatalog();

      const scoped = rawCatalog
        .map((entry) => sanitizeFacultyForViewer(req.user, entry))
        .filter((fac) => {
          if (filterUnit && fac.unit !== filterUnit) return false;
          if (!filterUnit && !allowedUnits.includes(fac.unit)) return false;
          if (requestedDept && !String(fac.department || '').toLowerCase().includes(requestedDept)) {
            return false;
          }
          if (requestedSubjectCode) {
            const hasCode = (fac.subjects || []).some(
              (s) => String(s.code || '').toUpperCase() === requestedSubjectCode
            );
            if (!hasCode) return false;
          }
          if (!matchesSearch(fac, searchTerm)) return false;
          return true;
        });

      const cessList = scoped.filter((f) => f.unit === 'CESS');
      const idsList = scoped.filter((f) => f.unit === 'IDS');

      return res.json({
        viewerRole: req.user.role,
        viewerUnit: req.user.origin || 'CESS',
        allowedUnits,
        counts: {
          total: scoped.length,
          CESS: cessList.length,
          IDS: idsList.length,
        },
        units: {
          CESS: cessList,
          IDS: idsList,
        },
        faculty: scoped,
        officialTemplate: DirectoryModel.getOfficialTemplate(),
      });
    } catch (err) {
      console.error('browseDirectory error:', err);
      return res.status(500).json({ error: 'Failed to retrieve faculty and syllabus directory.' });
    }
  },

  /**
   * GET /api/directory/faculty/:id
   */
  async getFacultyDetail(req, res) {
    try {
      const { id } = req.params;
      const found = await DirectoryModel.findFacultyById(id);
      if (!found) {
        return res.status(404).json({ error: 'Faculty profile not found.' });
      }

      const facUnit = getFacultyUnit(found);
      if (!canViewDirectoryUnit(req.user, facUnit)) {
        return res.status(403).json({
          error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) cannot access ${facUnit} faculty directory entries.`,
        });
      }

      return res.json({
        faculty: sanitizeFacultyForViewer(req.user, found),
      });
    } catch (err) {
      console.error('getFacultyDetail error:', err);
      return res.status(500).json({ error: 'Failed to retrieve faculty detail.' });
    }
  },

  /**
   * GET /api/directory/subjects
   */
  async listSubjects(req, res) {
    try {
      const requestedUnitRaw = req.query.unit || req.query.origin;
      const searchTerm = String(req.query.search || req.query.q || '').trim().toLowerCase();
      const allowedUnits = getAllowedDirectoryUnits(req.user);

      let filterUnit = null;
      if (requestedUnitRaw && String(requestedUnitRaw).toLowerCase() !== 'all') {
        filterUnit = normalizeUnit(requestedUnitRaw);
        if (!filterUnit) {
          return res.status(400).json({
            error: `Invalid unit filter '${requestedUnitRaw}'. Permitted values: CESS, IDS, or all.`,
          });
        }
        if (!canViewDirectoryUnit(req.user, filterUnit)) {
          return res.status(403).json({
            error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) cannot access ${filterUnit} subjects.`,
          });
        }
      }

      const rawCatalog = await DirectoryModel.getRawCatalog();
      const subjectMap = new Map();

      for (const fac of rawCatalog) {
        const facUnit = getFacultyUnit(fac);
        if (filterUnit && facUnit !== filterUnit) continue;
        if (!filterUnit && !allowedUnits.includes(facUnit)) continue;

        for (const subj of fac.subjects || []) {
          const codeKey = String(subj.code || '').toUpperCase().trim();
          const subjUnit = getFacultyUnit({ unit: facUnit, department: subj.department || fac.department });
          const perm = canViewSyllabus(req.user, fac, subj);

          if (!subjectMap.has(codeKey)) {
            subjectMap.set(codeKey, {
              subjectId: subj.subjectId,
              code: subj.code,
              title: subj.title,
              description: subj.description || null,
              department: subj.department || fac.department,
              unit: subjUnit,
              origin: subjUnit,
              assignedFaculty: [],
            });
          }

          subjectMap.get(codeKey).assignedFaculty.push({
            facultyId: fac.id,
            facultyUserId: fac.userId || null,
            name: fac.name,
            department: fac.department,
            unit: facUnit,
            syllabusAvailable: Boolean(subj.syllabus),
            canViewSyllabus: perm.allowed,
            syllabusHidden: Boolean(subj.syllabus) && !perm.allowed,
            syllabusRestrictionReason: perm.allowed ? null : perm.reason,
            syllabus: perm.allowed && subj.syllabus ? { ...subj.syllabus } : null,
          });
        }
      }

      let subjects = Array.from(subjectMap.values());
      if (searchTerm) {
        subjects = subjects.filter(
          (s) =>
            String(s.code || '').toLowerCase().includes(searchTerm) ||
            String(s.title || '').toLowerCase().includes(searchTerm) ||
            String(s.department || '').toLowerCase().includes(searchTerm) ||
            s.assignedFaculty.some((f) => String(f.name || '').toLowerCase().includes(searchTerm))
        );
      }

      return res.json({
        allowedUnits,
        counts: {
          total: subjects.length,
          CESS: subjects.filter((s) => s.unit === 'CESS').length,
          IDS: subjects.filter((s) => s.unit === 'IDS').length,
        },
        units: {
          CESS: subjects.filter((s) => s.unit === 'CESS'),
          IDS: subjects.filter((s) => s.unit === 'IDS'),
        },
        subjects,
      });
    } catch (err) {
      console.error('listSubjects error:', err);
      return res.status(500).json({ error: 'Failed to retrieve subjects directory.' });
    }
  },

  /**
   * GET /api/directory/subjects/:code
   */
  async getSubjectDetail(req, res) {
    try {
      const codeTarget = decodeURIComponent(req.params.code || '').trim().toUpperCase();
      const rawCatalog = await DirectoryModel.getRawCatalog();

      const matches = [];
      let matchedMeta = null;

      for (const fac of rawCatalog) {
        for (const subj of fac.subjects || []) {
          if (
            String(subj.code || '').toUpperCase() === codeTarget ||
            subj.subjectId === req.params.code
          ) {
            const facUnit = getFacultyUnit(fac);
            matchedMeta = matchedMeta || {
              subjectId: subj.subjectId,
              code: subj.code,
              title: subj.title,
              description: subj.description || null,
              department: subj.department || fac.department,
              unit: facUnit,
              origin: facUnit,
            };
            matches.push({ fac, subj, facUnit });
          }
        }
      }

      if (!matchedMeta) {
        return res.status(404).json({ error: 'Subject not found in directory.' });
      }

      const permittedEntries = matches.filter(({ facUnit }) => canViewDirectoryUnit(req.user, facUnit));
      if (permittedEntries.length === 0) {
        return res.status(403).json({
          error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) cannot access ${matchedMeta.unit} subjects.`,
        });
      }

      const assignedFaculty = permittedEntries.map(({ fac, subj, facUnit }) => {
        const perm = canViewSyllabus(req.user, fac, subj);
        return {
          facultyId: fac.id,
          facultyUserId: fac.userId || null,
          name: fac.name,
          department: fac.department,
          unit: facUnit,
          syllabusAvailable: Boolean(subj.syllabus),
          canViewSyllabus: perm.allowed,
          syllabusHidden: Boolean(subj.syllabus) && !perm.allowed,
          syllabusRestrictionReason: perm.allowed ? null : perm.reason,
          syllabus: perm.allowed && subj.syllabus ? { ...subj.syllabus } : null,
        };
      });

      return res.json({
        subject: {
          ...matchedMeta,
          assignedFaculty,
        },
      });
    } catch (err) {
      console.error('getSubjectDetail error:', err);
      return res.status(500).json({ error: 'Failed to retrieve subject details.' });
    }
  },

  /**
   * GET /api/directory/syllabi
   * Returns only syllabi that the authenticated caller is permitted to view.
   */
  async listSyllabi(req, res) {
    try {
      const requestedUnitRaw = req.query.unit || req.query.origin;
      const allowedUnits = getAllowedDirectoryUnits(req.user);

      let filterUnit = null;
      if (requestedUnitRaw && String(requestedUnitRaw).toLowerCase() !== 'all') {
        filterUnit = normalizeUnit(requestedUnitRaw);
        if (!filterUnit) {
          return res.status(400).json({
            error: `Invalid unit filter '${requestedUnitRaw}'. Permitted values: CESS, IDS, or all.`,
          });
        }
        if (!canViewDirectoryUnit(req.user, filterUnit)) {
          return res.status(403).json({
            error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) is not permitted to list ${filterUnit} syllabi.`,
          });
        }
      }

      const rawCatalog = await DirectoryModel.getRawCatalog();
      const syllabi = [];
      let hiddenByPermissionsCount = 0;

      for (const fac of rawCatalog) {
        const facUnit = getFacultyUnit(fac);
        if (filterUnit && facUnit !== filterUnit) continue;
        if (!filterUnit && !allowedUnits.includes(facUnit)) continue;

        for (const subj of fac.subjects || []) {
          if (!subj.syllabus) continue;
          const perm = canViewSyllabus(req.user, fac, subj);
          if (perm.allowed) {
            syllabi.push({
              ...subj.syllabus,
              subjectId: subj.subjectId,
              subjectCode: subj.code,
              subjectTitle: subj.title,
              facultyId: fac.id,
              facultyUserId: fac.userId || null,
              facultyName: fac.name,
              department: fac.department,
              unit: facUnit,
              origin: facUnit,
            });
          } else {
            hiddenByPermissionsCount += 1;
          }
        }
      }

      return res.json({
        viewerRole: req.user.role,
        allowedUnits,
        summary: {
          accessibleCount: syllabi.length,
          hiddenByPermissionsCount,
        },
        syllabi,
      });
    } catch (err) {
      console.error('listSyllabi error:', err);
      return res.status(500).json({ error: 'Failed to retrieve available syllabi.' });
    }
  },

  /**
   * GET /api/directory/syllabi/:syllabusId
   * Enforces strict role & permission checks before returning syllabus download metadata.
   */
  async getSyllabusDetail(req, res) {
    try {
      const { syllabusId } = req.params;
      const found = await DirectoryModel.findSyllabusById(syllabusId);
      if (!found) {
        return res.status(404).json({ error: 'Syllabus not found.' });
      }

      const perm = canViewSyllabus(req.user, found.faculty, found.subject);
      if (!perm.allowed) {
        return res.status(403).json({
          error: perm.reason || 'Forbidden: You are not permitted to access this syllabus.',
        });
      }

      const unit = getFacultyUnit(found.faculty);
      return res.json({
        syllabus: {
          ...found.syllabus,
          subjectId: found.subject.subjectId,
          subjectCode: found.subject.code,
          subjectTitle: found.subject.title,
          facultyId: found.faculty.id,
          facultyUserId: found.faculty.userId || null,
          facultyName: found.faculty.name,
          department: found.faculty.department,
          unit,
          origin: unit,
        },
      });
    } catch (err) {
      console.error('getSyllabusDetail error:', err);
      return res.status(500).json({ error: 'Failed to retrieve syllabus details.' });
    }
  },

  /**
   * POST /api/directory/syllabi
   * Faculty (own subjects) or College Secretary may upload/replace a course syllabus.
   */
  async uploadOrReplaceSyllabus(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_own_syllabus')) {
        return res.status(403).json({
          error: 'Forbidden: Only faculty members (for their own load) or the College Secretary may upload or replace syllabi.',
        });
      }

      const {
        facultyId,
        subjectCode,
        subjectName,
        description,
        academicYear,
        semester,
        fileUrl,
        fileName,
      } = req.body || {};

      if (!subjectCode || (!fileUrl && !fileName)) {
        return res.status(400).json({
          error: 'subjectCode and fileName (or fileUrl) are required to upload a syllabus.',
        });
      }

      // Resolve target faculty profile
      let targetFaculty = null;
      if (facultyId) {
        targetFaculty = await DirectoryModel.findFacultyById(facultyId);
      } else if (req.user.role === ROLES.FACULTY) {
        targetFaculty = await DirectoryModel.findFacultyById(req.user.id);
        if (!targetFaculty) {
          // Ensure a DB faculty_profile exists for this faculty user on first upload
          const profile = await DirectoryModel.ensureFacultyProfile({ userId: req.user.id });
          targetFaculty = {
            id: profile.profile_id,
            profileId: profile.profile_id,
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email,
            department: req.user.department,
            unit: req.user.origin || 'CESS',
          };
        }
      }

      if (!targetFaculty) {
        return res.status(404).json({ error: 'Target faculty profile not found.' });
      }

      const managePerm = canManageSyllabus(req.user, targetFaculty);
      if (!managePerm.allowed) {
        return res.status(403).json({
          error: managePerm.reason || 'Forbidden: Not permitted to manage syllabi for this faculty member.',
        });
      }

      const saved = await DirectoryModel.upsertSyllabus({
        faculty: targetFaculty,
        subjectCode,
        subjectName,
        description,
        academicYear: academicYear || '2026-2027',
        semester: semester || '1st Semester',
        fileUrl,
        fileName,
        uploadedBy: req.user.name,
      });

      return res.status(201).json({
        message: 'Syllabus saved successfully.',
        syllabus: {
          ...saved,
          facultyId: targetFaculty.id,
          facultyName: targetFaculty.name,
          unit: getFacultyUnit(targetFaculty),
        },
      });
    } catch (err) {
      console.error('uploadOrReplaceSyllabus error:', err);
      return res.status(500).json({ error: 'Failed to save syllabus.' });
    }
  },

  /**
   * DELETE /api/directory/syllabi/:syllabusId
   */
  async deleteSyllabus(req, res) {
    try {
      const { syllabusId } = req.params;
      const found = await DirectoryModel.findSyllabusById(syllabusId);
      if (!found) {
        return res.status(404).json({ error: 'Syllabus not found.' });
      }

      const managePerm = canManageSyllabus(req.user, found.faculty);
      if (!managePerm.allowed) {
        return res.status(403).json({
          error: managePerm.reason || 'Forbidden: You may only remove your own syllabi.',
        });
      }

      await DirectoryModel.deleteSyllabus(syllabusId);
      return res.json({
        message: 'Syllabus removed successfully.',
        deletedSyllabusId: syllabusId,
      });
    } catch (err) {
      console.error('deleteSyllabus error:', err);
      return res.status(500).json({ error: 'Failed to remove syllabus.' });
    }
  },

  /**
   * GET /api/directory/template
   */
  async getTemplate(req, res) {
    return res.json({
      template: DirectoryModel.getOfficialTemplate(),
    });
  },

  /**
   * PUT /api/directory/template
   * Secretary-only official syllabus template replacement.
   */
  async updateTemplate(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_syllabus_template')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update the official syllabus template.',
        });
      }

      const { fileName, fileUrl, fileSize } = req.body || {};
      if (!fileName || !String(fileName).trim()) {
        return res.status(400).json({ error: 'fileName is required.' });
      }

      const template = DirectoryModel.updateOfficialTemplate({
        fileName,
        fileUrl,
        fileSize,
        uploadedBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
      });

      return res.json({
        message: 'Official syllabus template updated.',
        template,
      });
    } catch (err) {
      console.error('updateTemplate error:', err);
      return res.status(500).json({ error: 'Failed to update official syllabus template.' });
    }
  },
};

module.exports = DirectoryController;

