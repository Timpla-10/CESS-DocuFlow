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

      // Merge any Secretary-managed standalone subjects (including unassigned subjects)
      const standaloneSubjects = await DirectoryModel.getStandaloneManagedSubjects();
      for (const sMeta of standaloneSubjects) {
        const codeKey = String(sMeta.code || '').toUpperCase().trim();
        if (!codeKey || subjectMap.has(codeKey)) continue;
        const sUnit = getFacultyUnit({ unit: sMeta.unit, department: sMeta.department });
        if (filterUnit && sUnit !== filterUnit) continue;
        if (!filterUnit && !allowedUnits.includes(sUnit)) continue;

        subjectMap.set(codeKey, {
          subjectId: sMeta.subjectId,
          code: sMeta.code,
          title: sMeta.title,
          description: sMeta.description || null,
          department: sMeta.department,
          unit: sUnit,
          origin: sUnit,
          assignedFaculty: [],
        });
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
        const standaloneSubjects = await DirectoryModel.getStandaloneManagedSubjects();
        const standaloneMatch = standaloneSubjects.find(
          (s) =>
            String(s.code || '').toUpperCase() === codeTarget ||
            String(s.subjectId) === String(req.params.code)
        );
        if (standaloneMatch) {
          const sUnit = getFacultyUnit({ unit: standaloneMatch.unit, department: standaloneMatch.department });
          if (!canViewDirectoryUnit(req.user, sUnit)) {
            return res.status(403).json({
              error: `Forbidden: Your role (${req.user.roleLabel || req.user.role}) cannot access ${sUnit} subjects.`,
            });
          }
          return res.json({
            subject: {
              subjectId: standaloneMatch.subjectId,
              code: standaloneMatch.code,
              title: standaloneMatch.title,
              description: standaloneMatch.description || null,
              department: standaloneMatch.department,
              unit: sUnit,
              origin: sUnit,
              assignedFaculty: [],
            },
          });
        }
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
        overwrite,
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
        uploadedByUserId: req.user.id,
        overwrite: overwrite !== false && overwrite !== 'false',
      });

      return res.status(201).json({
        message: saved.overwritten ? 'Syllabus replaced successfully (previous version archived).' : 'Syllabus saved successfully.',
        syllabus: {
          ...saved,
          facultyId: targetFaculty.id,
          facultyName: targetFaculty.name,
          unit: getFacultyUnit(targetFaculty),
        },
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ error: err.message, code: err.code || 'SYLLABUS_ALREADY_EXISTS' });
      }
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
   * GET /api/directory/template/download (PB-40)
   * Future downloads always resolve to the current official template version.
   */
  async downloadTemplate(req, res) {
    try {
      const payload = DirectoryModel.getTemplateDownloadPayload();
      const wantsFileStream =
        String(req.query.download || '').toLowerCase() === 'true' ||
        req.query.download === '1' ||
        req.query.raw === '1';

      if (wantsFileStream) {
        res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
        res.setHeader('X-Template-Version', String(payload.version || 1));
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(
          `MSU-Naawan CESS Official Syllabus Template\n` +
            `Version: v${payload.version}\n` +
            `File Name: ${payload.fileName}\n` +
            `Academic Term: ${payload.academicTerm || 'Current'}\n` +
            `Effective Date: ${payload.effectiveDate || ''}\n` +
            `Updated By: ${payload.uploadedBy}\n` +
            `Updated At: ${payload.updatedAt}\n` +
            `Reference URL: ${payload.resolvedUrl}\n`
        );
      }

      return res.json({
        message: 'Current official syllabus template ready for download.',
        template: payload,
        downloadUrl: payload.resolvedUrl,
        fileName: payload.fileName,
        version: payload.version,
        downloadedAt: payload.downloadedAt,
      });
    } catch (err) {
      console.error('downloadTemplate error:', err);
      return res.status(500).json({ error: 'Failed to resolve official syllabus template download.' });
    }
  },

  /**
   * GET /api/directory/template/history (PB-40)
   */
  async getTemplateHistory(req, res) {
    try {
      const history = DirectoryModel.getTemplateHistory();
      const current = DirectoryModel.getOfficialTemplate();
      return res.json({
        currentVersion: current.version,
        total: history.length,
        history,
      });
    } catch (err) {
      console.error('getTemplateHistory error:', err);
      return res.status(500).json({ error: 'Failed to load template version history.' });
    }
  },

  /**
   * PUT / POST /api/directory/template (PB-40: Secretary-only, versioned, non-overwriting, auto-announces change)
   */
  async updateTemplate(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_syllabus_template')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update the official syllabus template.',
        });
      }

      const {
        fileName,
        fileUrl,
        fileSize,
        description,
        academicTerm,
        effectiveDate,
        changeNotes,
        announcementTitle,
        announcementContent,
        targetAudience,
      } = req.body || {};

      if (!fileName || !String(fileName).trim()) {
        return res.status(400).json({ error: 'fileName is required.' });
      }

      // Verify existing faculty syllabi remain completely untouched
      const catalog = await DirectoryModel.getRawCatalog();
      const unaffectedSyllabiCount = catalog.reduce(
        (sum, fac) => sum + (fac.subjects || []).filter((s) => Boolean(s.syllabus)).length,
        0
      );

      const { template, previousTemplate, historyEntry } = DirectoryModel.updateOfficialTemplate({
        fileName,
        fileUrl,
        fileSize,
        description,
        academicTerm,
        effectiveDate,
        changeNotes,
        uploadedBy: `${req.user.name} (${req.user.roleLabel || 'College Secretary'})`,
        uploadedByUserId: req.user.id,
      });

      // PB-40 PO Note: Syllabus-template management needs announcement after being changed or replaced
      const defaultAnnTitle = `Official Syllabus Template Updated (v${template.version})`;
      const defaultAnnContent =
        `The College Secretary has updated the official CESS course syllabus template from ` +
        `v${previousTemplate.version} (${previousTemplate.fileName}) to v${template.version} (${template.fileName}). ` +
        `All future downloads now serve the updated template (${template.downloadUrl}). ` +
        `Previously uploaded faculty syllabi remain preserved and unaffected.` +
        (changeNotes ? ` Notes: ${String(changeNotes).trim()}` : '');

      const announcement = await DirectoryModel.createAnnouncement({
        title: announcementTitle ? String(announcementTitle).trim() : defaultAnnTitle,
        content: announcementContent ? String(announcementContent).trim() : defaultAnnContent,
        publishedBy: req.user.id,
        publishedByName: req.user.name,
        targetAudience: targetAudience || 'Faculty',
        isPublished: true,
        category: 'syllabus_template',
        metadata: {
          templateVersion: template.version,
          previousVersion: previousTemplate.version,
          fileName: template.fileName,
          fileUrl: template.fileUrl,
        },
      });

      return res.json({
        message: 'Official syllabus template updated and announcement published.',
        template,
        previousTemplate,
        historyEntry,
        announcement,
        existingSyllabiOverwritten: false,
        unaffectedSyllabiCount,
      });
    } catch (err) {
      console.error('updateTemplate error:', err);
      return res.status(500).json({ error: 'Failed to update official syllabus template.' });
    }
  },

  /**
   * GET /api/directory/announcements (PB-40)
   */
  async listAnnouncements(req, res) {
    try {
      const onlyPublished = req.query.includeUnpublished === 'true' && req.user.role === ROLES.SECRETARY ? false : true;
      const announcements = await DirectoryModel.listAnnouncements({
        targetAudience: req.query.audience || null,
        onlyPublished,
        category: req.query.category || null,
      });
      return res.json({
        total: announcements.length,
        announcements,
      });
    } catch (err) {
      console.error('listAnnouncements error:', err);
      return res.status(500).json({ error: 'Failed to fetch directory announcements.' });
    }
  },

  /**
   * POST /api/directory/announcements (Secretary-only)
   */
  async createAnnouncement(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may publish directory announcements.',
        });
      }
      const { title, content, targetAudience, isPublished, category } = req.body || {};
      if (!title || !String(title).trim() || !content || !String(content).trim()) {
        return res.status(400).json({ error: 'title and content are required.' });
      }
      const announcement = await DirectoryModel.createAnnouncement({
        title: String(title).trim(),
        content: String(content).trim(),
        publishedBy: req.user.id,
        publishedByName: req.user.name,
        targetAudience: targetAudience || 'Faculty',
        isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
        category: category || 'directory',
      });
      return res.status(201).json({
        message: 'Announcement published.',
        announcement,
      });
    } catch (err) {
      console.error('createAnnouncement error:', err);
      return res.status(500).json({ error: 'Failed to create announcement.' });
    }
  },

  /**
   * DELETE /api/directory/announcements/:id (Secretary-only)
   */
  async deleteAnnouncement(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may remove announcements.',
        });
      }
      await DirectoryModel.deleteAnnouncement(req.params.id);
      return res.json({ message: 'Announcement removed.' });
    } catch (err) {
      console.error('deleteAnnouncement error:', err);
      return res.status(500).json({ error: 'Failed to delete announcement.' });
    }
  },

  /**
   * GET /api/directory/audit-logs (PB-40 Traceability - Secretary-only)
   */
  async getAuditLogs(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may inspect template and directory listing audit logs.',
        });
      }
      const logs = DirectoryModel.getListingAuditLogs(req.query.limit || 100);
      return res.json({
        total: logs.length,
        logs,
      });
    } catch (err) {
      console.error('getAuditLogs error:', err);
      return res.status(500).json({ error: 'Failed to fetch directory audit logs.' });
    }
  },

  /**
   * POST /api/directory/faculty (PB-40: Secretary creates approved faculty listing)
   */
  async createFacultyListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may manage approved faculty directory listings.',
        });
      }
      const { userId, name, email, department, unit, position, biography, consultationHours, displayPictureUrl } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Faculty name is required.' });
      }
      const created = await DirectoryModel.createFacultyListing({
        userId,
        name,
        email,
        department,
        unit,
        position,
        biography,
        consultationHours,
        displayPictureUrl,
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      return res.status(201).json({
        message: 'Approved faculty directory listing created.',
        faculty: sanitizeFacultyForViewer(req.user, created),
      });
    } catch (err) {
      console.error('createFacultyListing error:', err);
      return res.status(500).json({ error: 'Failed to create faculty directory listing.' });
    }
  },

  /**
   * PUT /api/directory/faculty/:id (PB-40: Secretary updates approved faculty listing)
   */
  async updateFacultyListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update approved faculty directory listings.',
        });
      }
      const updated = await DirectoryModel.updateFacultyListing(req.params.id, req.body || {}, {
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Faculty directory listing not found.' });
      }
      return res.json({
        message: 'Approved faculty directory listing updated.',
        faculty: sanitizeFacultyForViewer(req.user, updated),
      });
    } catch (err) {
      console.error('updateFacultyListing error:', err);
      return res.status(500).json({ error: 'Failed to update faculty directory listing.' });
    }
  },

  /**
   * DELETE /api/directory/faculty/:id (PB-40: Secretary removes approved faculty listing)
   */
  async deleteFacultyListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may remove faculty directory listings.',
        });
      }
      const removed = await DirectoryModel.deleteFacultyListing(req.params.id, {
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      if (!removed) {
        return res.status(404).json({ error: 'Faculty directory listing not found.' });
      }
      return res.json({
        message: 'Faculty listing removed from approved directory.',
        removedId: removed.id,
      });
    } catch (err) {
      console.error('deleteFacultyListing error:', err);
      return res.status(500).json({ error: 'Failed to remove faculty directory listing.' });
    }
  },

  /**
   * POST /api/directory/subjects (PB-40: Secretary creates approved subject listing)
   */
  async createSubjectListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may create approved subject listings.',
        });
      }
      const { subjectCode, code, subjectName, title, description, department, unit, assignedFacultyId } = req.body || {};
      const resolvedCode = subjectCode || code;
      const resolvedName = subjectName || title;
      if (!resolvedCode || !String(resolvedCode).trim() || !resolvedName || !String(resolvedName).trim()) {
        return res.status(400).json({ error: 'subjectCode and subjectName are required.' });
      }
      const subject = await DirectoryModel.createSubjectListing({
        subjectCode: resolvedCode,
        subjectName: resolvedName,
        description,
        department,
        unit,
        assignedFacultyId,
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      return res.status(201).json({
        message: 'Approved subject listing created.',
        subject,
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      console.error('createSubjectListing error:', err);
      return res.status(500).json({ error: 'Failed to create subject listing.' });
    }
  },

  /**
   * PUT /api/directory/subjects/:code (PB-40: Secretary updates approved subject listing)
   */
  async updateSubjectListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may update approved subject listings.',
        });
      }
      const updated = await DirectoryModel.updateSubjectListing(req.params.code, {
        subjectName: req.body?.subjectName || req.body?.title,
        description: req.body?.description,
        department: req.body?.department,
        unit: req.body?.unit,
        assignedFacultyId: req.body?.assignedFacultyId,
      }, {
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Subject listing not found.' });
      }
      return res.json({
        message: 'Approved subject listing updated.',
        subject: updated,
      });
    } catch (err) {
      console.error('updateSubjectListing error:', err);
      return res.status(500).json({ error: 'Failed to update subject listing.' });
    }
  },

  /**
   * DELETE /api/directory/subjects/:code (PB-40: Secretary removes subject listing)
   */
  async deleteSubjectListing(req, res) {
    try {
      if (!canPerformAction(req.user, 'manage_directory_listings')) {
        return res.status(403).json({
          error: 'Forbidden: Only the College Secretary may remove subject listings.',
        });
      }
      const removed = await DirectoryModel.deleteSubjectListing(req.params.code, {
        actorName: req.user.name,
        actorUserId: req.user.id,
      });
      if (!removed) {
        return res.status(404).json({ error: 'Subject listing not found.' });
      }
      return res.json({
        message: 'Subject listing removed from approved directory.',
        removedCode: removed.code,
      });
    } catch (err) {
      console.error('deleteSubjectListing error:', err);
      return res.status(500).json({ error: 'Failed to remove subject listing.' });
    }
  },

  /**
   * PUT /api/directory/syllabi/:syllabusId (PB-40: Explicit syllabus update with version traceability)
   */
  async updateSyllabus(req, res) {
    try {
      const { syllabusId } = req.params;
      const found = await DirectoryModel.findSyllabusById(syllabusId);
      if (!found) {
        return res.status(404).json({ error: 'Syllabus not found.' });
      }

      const managePerm = canManageSyllabus(req.user, found.faculty);
      if (!managePerm.allowed) {
        return res.status(403).json({
          error: managePerm.reason || 'Forbidden: You may only update your own syllabi or act as College Secretary.',
        });
      }

      const { fileUrl, fileName, academicYear, semester, changeNotes } = req.body || {};
      if (!fileUrl && !fileName && !academicYear && !semester) {
        return res.status(400).json({
          error: 'Provide at least one updated field (fileName, fileUrl, academicYear, or semester).',
        });
      }

      const updated = await DirectoryModel.updateSyllabusById(syllabusId, {
        fileUrl,
        fileName,
        academicYear,
        semester,
        changeNotes,
        actorName: req.user.name,
        actorUserId: req.user.id,
      });

      return res.json({
        message: 'Syllabus updated successfully (previous version archived).',
        syllabus: {
          ...updated,
          facultyId: found.faculty.id,
          facultyName: found.faculty.name,
          unit: getFacultyUnit(found.faculty),
        },
        history: DirectoryModel.getSyllabusHistory(syllabusId),
      });
    } catch (err) {
      console.error('updateSyllabus error:', err);
      return res.status(500).json({ error: 'Failed to update syllabus.' });
    }
  },

  /**
   * GET /api/directory/syllabi/:syllabusId/history (PB-40)
   */
  async getSyllabusHistory(req, res) {
    try {
      const { syllabusId } = req.params;
      const found = await DirectoryModel.findSyllabusById(syllabusId);
      if (!found) {
        return res.status(404).json({ error: 'Syllabus not found.' });
      }
      const viewPerm = canViewSyllabus(req.user, found.faculty, found.subject);
      if (!viewPerm.allowed) {
        return res.status(403).json({
          error: viewPerm.reason || 'Forbidden: Not permitted to view syllabus history.',
        });
      }
      const history = DirectoryModel.getSyllabusHistory(syllabusId);
      return res.json({
        syllabusId: found.syllabus.id,
        current: found.syllabus,
        history,
      });
    } catch (err) {
      console.error('getSyllabusHistory error:', err);
      return res.status(500).json({ error: 'Failed to load syllabus version history.' });
    }
  },
};

module.exports = DirectoryController;

