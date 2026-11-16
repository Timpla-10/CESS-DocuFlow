const crypto = require('crypto');
const supabase = require('../config/database');
const UserModel = require('./userModel');
const { getFacultyUnit } = require('../utils/roles');

const BASELINE_FACULTY = [
  {
    id: 'fac-1',
    profileId: 'fac-1',
    userId: null,
    name: 'Prof. Ana Lim',
    email: 'ana.lim@msunaawan.edu.ph',
    department: 'Department of Secondary and Elementary Education',
    unit: 'CESS',
    origin: 'CESS',
    position: 'Assistant Professor',
    biography: 'Specializes in child and adolescent development and outcomes-based assessment.',
    consultationHours: 'MWF 10:00 AM - 12:00 PM',
    displayPictureUrl: null,
    subjects: [
      {
        subjectId: 'subj-educ-101',
        code: 'EDUC 101',
        title: 'The Child and Adolescent Learner',
        description: 'Foundational developmental psychology for pre-service teachers.',
        department: 'Department of Secondary and Elementary Education',
        unit: 'CESS',
        syllabus: {
          id: 'syl-educ-101',
          fileName: 'EDUC101_Syllabus_2026.pdf',
          fileUrl: '/syllabi/EDUC101_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Ana Lim',
        },
      },
      {
        subjectId: 'subj-educ-205',
        code: 'EDUC 205',
        title: 'Assessment in Learning 1',
        description: 'Principles and construction of valid classroom assessments.',
        department: 'Department of Secondary and Elementary Education',
        unit: 'CESS',
        syllabus: {
          id: 'syl-educ-205',
          fileName: 'EDUC205_Syllabus_2026.pdf',
          fileUrl: '/syllabi/EDUC205_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Ana Lim',
        },
      },
    ],
  },
  {
    id: 'fac-2',
    profileId: 'fac-2',
    userId: null,
    name: 'Prof. Ben Aquino',
    email: 'ben.aquino@msunaawan.edu.ph',
    department: 'Department of Social Sciences and Humanities',
    unit: 'CESS',
    origin: 'CESS',
    position: 'Instructor',
    biography: 'Teaches Philippine historiography and qualitative social research methods.',
    consultationHours: 'TTh 1:00 PM - 3:00 PM',
    displayPictureUrl: null,
    subjects: [
      {
        subjectId: 'subj-socsci-110',
        code: 'SOCSCI 110',
        title: 'Philippine History',
        description: 'Survey of Philippine history, historiography, and heritage.',
        department: 'Department of Social Sciences and Humanities',
        unit: 'CESS',
        syllabus: {
          id: 'syl-socsci-110',
          fileName: 'SOCSCI110_Syllabus_2026.pdf',
          fileUrl: '/syllabi/SOCSCI110_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Ben Aquino',
        },
      },
      {
        subjectId: 'subj-socsci-220',
        code: 'SOCSCI 220',
        title: 'Research Methods in the Social Sciences',
        description: 'Quantitative and qualitative research design for social inquiry.',
        department: 'Department of Social Sciences and Humanities',
        unit: 'CESS',
        syllabus: {
          id: 'syl-socsci-220',
          fileName: 'SOCSCI220_Syllabus_2026.pdf',
          fileUrl: '/syllabi/SOCSCI220_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Ben Aquino',
        },
      },
    ],
  },
  {
    id: 'fac-3',
    profileId: 'fac-3',
    userId: null,
    name: 'Dr. Liza Fernandez',
    email: 'cess.chair@msunaawan.edu.ph',
    department: 'Department of Secondary and Elementary Education',
    unit: 'CESS',
    origin: 'CESS',
    position: 'Department Chairperson',
    biography: 'Department Chairperson overseeing curriculum planning and instructional quality.',
    consultationHours: 'MWF 2:00 PM - 4:00 PM',
    displayPictureUrl: null,
    subjects: [
      {
        subjectId: 'subj-educ-310',
        code: 'EDUC 310',
        title: 'Curriculum Development',
        description: 'Curriculum foundations, design models, and CHED alignment.',
        department: 'Department of Secondary and Elementary Education',
        unit: 'CESS',
        syllabus: {
          id: 'syl-educ-310',
          fileName: 'EDUC310_Syllabus_2026.pdf',
          fileUrl: '/syllabi/EDUC310_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Dr. Liza Fernandez',
        },
      },
    ],
  },
  {
    id: 'fac-4',
    profileId: 'fac-4',
    userId: null,
    name: 'Prof. Rhea Mendez',
    email: 'rhea.mendez@msunaawan.edu.ph',
    department: 'Department of Secondary and Elementary Education',
    unit: 'CESS',
    origin: 'CESS',
    position: 'Assistant Professor',
    biography: 'Language and literature pedagogy specialist.',
    consultationHours: 'TTh 9:00 AM - 11:00 AM',
    displayPictureUrl: null,
    subjects: [
      {
        subjectId: 'subj-eng-102',
        code: 'ENG 102',
        title: 'Purposive Communication',
        description: 'Writing, speaking, and presenting to diverse audiences.',
        department: 'Department of Secondary and Elementary Education',
        unit: 'CESS',
        syllabus: {
          id: 'syl-eng-102',
          fileName: 'ENG102_Syllabus_2026.pdf',
          fileUrl: '/syllabi/ENG102_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Rhea Mendez',
        },
      },
      {
        subjectId: 'subj-eng-215',
        code: 'ENG 215',
        title: 'Teaching Literature',
        description: 'Approaches and strategies in secondary literature instruction.',
        department: 'Department of Secondary and Elementary Education',
        unit: 'CESS',
        syllabus: {
          id: 'syl-eng-215',
          fileName: 'ENG215_Syllabus_2026.pdf',
          fileUrl: '/syllabi/ENG215_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Prof. Rhea Mendez',
        },
      },
    ],
  },
  {
    id: 'fac-5',
    profileId: 'fac-5',
    userId: null,
    name: 'Mr. Jose Dela Cruz',
    email: 'jose.delacruz@msunaawan.edu.ph',
    department: 'Integrated Developmental School',
    unit: 'IDS',
    origin: 'IDS',
    position: 'Teacher III',
    biography: 'Integrated Developmental School STEM and environmental science faculty.',
    consultationHours: 'MWF 3:00 PM - 4:30 PM',
    displayPictureUrl: null,
    subjects: [
      {
        subjectId: 'subj-sci-10',
        code: 'SCI 10',
        title: 'Integrated Science and Environmental Studies',
        description: 'Secondary integrated science laboratory and ecological inquiry.',
        department: 'Integrated Developmental School',
        unit: 'IDS',
        syllabus: {
          id: 'syl-sci-10',
          fileName: 'SCI10_Syllabus_2026.pdf',
          fileUrl: '/syllabi/SCI10_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Mr. Jose Dela Cruz',
        },
      },
      {
        subjectId: 'subj-math-10',
        code: 'MATH 10',
        title: 'Advanced Algebra and Trigonometry',
        description: 'Senior high preparatory mathematics for IDS learners.',
        department: 'Integrated Developmental School',
        unit: 'IDS',
        syllabus: {
          id: 'syl-math-10',
          fileName: 'MATH10_Syllabus_2026.pdf',
          fileUrl: '/syllabi/MATH10_Syllabus_2026.pdf',
          academicYear: '2026-2027',
          semester: '1st Semester',
          uploadedAt: '2026-08-01T08:00:00.000Z',
          uploadedBy: 'Mr. Jose Dela Cruz',
        },
      },
    ],
  },
];

// Mutable overlay state for baseline items, official syllabus template, announcements & Secretary-managed listings
const INITIAL_TEMPLATE_SNAPSHOT = {
  version: 1,
  previousVersion: null,
  fileName: 'CESS_Official_Course_Syllabus_Template_2026.docx',
  fileUrl: '/templates/CESS_Official_Course_Syllabus_Template_2026.docx',
  downloadUrl: '/api/directory/template/download',
  description: 'Standard MSU-Naawan CESS Outcomes-Based Education (OBE) course syllabus template.',
  academicTerm: '2026-2027 (1st Semester)',
  effectiveDate: '2026-03-01',
  updatedAt: '2026-03-01T08:00:00.000Z',
  uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
  uploadedByUserId: null,
  fileSize: '142 KB',
  changeNotes: 'Initial institutional baseline template release.',
};

const memoryState = {
  baselineOverrides: new Map(), // key: `${facultyId}::${code}` -> syllabus object | null
  deletedBaselineSyllabusIds: new Set(),
  officialTemplate: { ...INITIAL_TEMPLATE_SNAPSHOT },
  templateHistory: [
    {
      ...INITIAL_TEMPLATE_SNAPSHOT,
      action: 'INITIAL_TEMPLATE_BASELINE',
    },
  ],
  syllabusHistory: new Map(), // syllabusId/key -> Array of historical snapshots
  managedFacultyOverrides: new Map(), // key: String(id) -> faculty entry override / custom faculty
  deletedFacultyIds: new Set(), // Set<string>
  managedSubjects: new Map(), // key: SUBJECT_CODE -> subject metadata & assignment overlay
  deletedSubjectCodes: new Set(), // Set<string>
  announcements: [], // Fallback announcements + metadata cache
  deletedAnnouncementIds: new Set(),
  listingAuditLogs: [], // Traceable history for template & directory listing changes
};

function recordListingAudit({ action, entityType, entityId, actorName, actorUserId, summary, before = null, after = null }) {
  memoryState.listingAuditLogs.unshift({
    auditId: `dir-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    entityType,
    entityId: entityId !== undefined && entityId !== null ? String(entityId) : null,
    actorName: actorName || 'College Secretary',
    actorUserId: actorUserId || null,
    summary,
    before,
    after,
    timestamp: new Date().toISOString(),
  });
  if (memoryState.listingAuditLogs.length > 200) {
    memoryState.listingAuditLogs.length = 200;
  }
}

function isUuid(val) {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function isDbSerialId(val) {
  return (typeof val === 'number' && Number.isInteger(val) && val > 0) ||
    (typeof val === 'string' && /^\d+$/.test(val.trim()));
}

function deriveFileName(fileUrl, fallbackCode = 'Syllabus') {
  if (!fileUrl) return `${String(fallbackCode).replace(/\s+/g, '')}_Syllabus.pdf`;
  const parts = String(fileUrl).split('/');
  return parts[parts.length - 1] || String(fileUrl);
}

function cloneBaselineCatalog() {
  return BASELINE_FACULTY.map((entry) => ({
    ...entry,
    source: 'catalog',
    subjects: entry.subjects.map((subj) => {
      const overrideKey = `${entry.id}::${subj.code.toUpperCase()}`;
      let syllabus = subj.syllabus ? { ...subj.syllabus } : null;
      if (syllabus && memoryState.deletedBaselineSyllabusIds.has(syllabus.id)) {
        syllabus = null;
      }
      if (memoryState.baselineOverrides.has(overrideKey)) {
        const over = memoryState.baselineOverrides.get(overrideKey);
        syllabus = over ? { ...over } : null;
      }
      return {
        ...subj,
        syllabus,
      };
    }),
  }));
}

function inferSubjectDepartment(subjectRow, facultyEntry) {
  const code = String(subjectRow?.subject_code || '').toUpperCase();
  if (facultyEntry?.department) return facultyEntry.department;
  if (code.startsWith('SOCSCI')) return 'Department of Social Sciences and Humanities';
  if (code.startsWith('SCI') || code.startsWith('MATH')) return 'Integrated Developmental School';
  return 'Department of Secondary and Elementary Education';
}

const DirectoryModel = {
  getOfficialTemplate() {
    return {
      ...memoryState.officialTemplate,
      downloadUrl: '/api/directory/template/download',
    };
  },

  updateOfficialTemplate({
    fileName,
    fileUrl,
    fileSize,
    description,
    academicTerm,
    effectiveDate,
    changeNotes,
    uploadedBy,
    uploadedByUserId,
  }) {
    const cleanName = String(fileName || '').trim();
    const prev = { ...memoryState.officialTemplate };
    const nextVersion = (Number(prev.version) || 1) + 1;
    const nowIso = new Date().toISOString();

    const updatedTemplate = {
      version: nextVersion,
      previousVersion: Number(prev.version) || 1,
      fileName: cleanName,
      fileUrl: fileUrl || `/templates/${cleanName}`,
      downloadUrl: '/api/directory/template/download',
      description: description !== undefined ? String(description).trim() : prev.description,
      academicTerm: academicTerm !== undefined ? String(academicTerm).trim() : prev.academicTerm,
      effectiveDate: effectiveDate || nowIso.slice(0, 10),
      updatedAt: nowIso,
      uploadedBy: uploadedBy || 'College Secretary',
      uploadedByUserId: uploadedByUserId || null,
      fileSize: fileSize || '145 KB',
      changeNotes: changeNotes ? String(changeNotes).trim() : `Updated official syllabus template to v${nextVersion}.`,
    };

    memoryState.officialTemplate = updatedTemplate;

    const historyEntry = {
      ...updatedTemplate,
      action: 'TEMPLATE_REPLACED',
    };
    memoryState.templateHistory.push(historyEntry);

    recordListingAudit({
      action: 'TEMPLATE_REPLACED',
      entityType: 'syllabus_template',
      entityId: `v${nextVersion}`,
      actorName: updatedTemplate.uploadedBy,
      actorUserId: uploadedByUserId,
      summary: `Replaced official syllabus template from v${prev.version} (${prev.fileName}) to v${nextVersion} (${cleanName}).`,
      before: { version: prev.version, fileName: prev.fileName, fileUrl: prev.fileUrl },
      after: { version: nextVersion, fileName: cleanName, fileUrl: updatedTemplate.fileUrl },
    });

    return {
      template: this.getOfficialTemplate(),
      previousTemplate: prev,
      historyEntry,
    };
  },

  getTemplateHistory() {
    return [...memoryState.templateHistory].reverse();
  },

  getTemplateDownloadPayload() {
    const current = this.getOfficialTemplate();
    return {
      ...current,
      resolvedUrl: current.fileUrl,
      downloadedAt: new Date().toISOString(),
    };
  },

  /**
   * PB-40 PO Note: Create an announcement (stored in `announcement` table with resilient fallback).
   */
  async createAnnouncement({
    title,
    content,
    publishedBy = null,
    publishedByName = 'College Secretary',
    targetAudience = 'Faculty',
    isPublished = true,
    category = 'syllabus_template',
    metadata = null,
  }) {
    const audienceRaw = String(targetAudience || 'Faculty').trim();
    const dbAudience = /^all$/i.test(audienceRaw)
      ? 'All'
      : /^student/i.test(audienceRaw)
        ? 'Student'
        : 'Faculty';

    const nowIso = new Date().toISOString();
    let insertedRow = null;

    try {
      const { data, error } = await supabase
        .from('announcement')
        .insert({
          title: String(title || 'Announcement').slice(0, 255),
          content: String(content || ''),
          published_by: isUuid(publishedBy) ? publishedBy : null,
          target_audience: dbAudience,
          is_published: Boolean(isPublished),
          updated_at: nowIso,
        })
        .select('*')
        .single();

      if (!error && data) {
        insertedRow = data;
      }
    } catch {
      // Fall back cleanly if DB insert is unavailable
    }

    const normalized = {
      announcement_id: insertedRow?.announcement_id || `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      id: insertedRow?.announcement_id || `ann-${Date.now()}`,
      title: insertedRow?.title || String(title || 'Announcement'),
      content: insertedRow?.content || String(content || ''),
      published_by: insertedRow?.published_by || (isUuid(publishedBy) ? publishedBy : null),
      publishedByName,
      target_audience: insertedRow?.target_audience || dbAudience,
      is_published: insertedRow ? Boolean(insertedRow.is_published) : Boolean(isPublished),
      category,
      metadata,
      created_at: insertedRow?.created_at || nowIso,
      updated_at: insertedRow?.updated_at || nowIso,
      persistedInDb: Boolean(insertedRow),
    };

    if (insertedRow?.announcement_id) {
      normalized.id = insertedRow.announcement_id;
    }

    // Store overlay / fallback
    memoryState.announcements.unshift(normalized);
    return normalized;
  },

  async listAnnouncements({ targetAudience = null, onlyPublished = true, category = null } = {}) {
    const combined = [];
    const seenIds = new Set();

    try {
      const { data, error } = await supabase
        .from('announcement')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (memoryState.deletedAnnouncementIds.has(String(row.announcement_id))) continue;
          const memMatch = memoryState.announcements.find(
            (m) => String(m.announcement_id) === String(row.announcement_id)
          );
          seenIds.add(String(row.announcement_id));
          combined.push({
            ...row,
            id: row.announcement_id,
            publishedByName: memMatch?.publishedByName || 'College Secretary',
            category: memMatch?.category || 'general',
            metadata: memMatch?.metadata || null,
            persistedInDb: true,
          });
        }
      }
    } catch {
      // Fallback to in-memory announcements below
    }

    for (const mem of memoryState.announcements) {
      const key = String(mem.announcement_id);
      if (seenIds.has(key) || memoryState.deletedAnnouncementIds.has(key)) continue;
      seenIds.add(key);
      combined.push(mem);
    }

    let result = combined;
    if (onlyPublished) {
      result = result.filter((a) => a.is_published !== false);
    }
    if (category) {
      result = result.filter((a) => String(a.category || '').toLowerCase() === String(category).toLowerCase());
    }
    if (targetAudience && String(targetAudience).toLowerCase() !== 'all') {
      const targetLower = String(targetAudience).toLowerCase();
      result = result.filter((a) => {
        const aud = String(a.target_audience || 'All').toLowerCase();
        return aud === 'all' || aud === targetLower;
      });
    }

    result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return result;
  },

  async deleteAnnouncement(announcementId) {
    const target = String(announcementId || '').trim();
    memoryState.deletedAnnouncementIds.add(target);
    memoryState.announcements = memoryState.announcements.filter((a) => String(a.announcement_id) !== target);
    if (isDbSerialId(target)) {
      await supabase.from('announcement').delete().eq('announcement_id', Number(target));
    }
    return true;
  },

  getListingAuditLogs(limit = 100) {
    return memoryState.listingAuditLogs.slice(0, Math.max(1, Number(limit) || 100));
  },

  getSyllabusHistory(syllabusId) {
    return [...(memoryState.syllabusHistory.get(String(syllabusId)) || [])].reverse();
  },

  async fetchDatabaseTables() {
    const [profilesRes, subjectsRes, syllabiRes, users] = await Promise.all([
      supabase.from('faculty_profile').select('*').order('updated_at', { ascending: false }),
      supabase.from('subject').select('*').order('subject_code', { ascending: true }),
      supabase.from('syllabus').select('*').order('uploaded_at', { ascending: false }),
      UserModel.findAll().catch(() => []),
    ]);

    return {
      profiles: profilesRes.error ? [] : profilesRes.data || [],
      subjects: subjectsRes.error ? [] : subjectsRes.data || [],
      syllabi: syllabiRes.error ? [] : syllabiRes.data || [],
      users: Array.isArray(users) ? users : [],
    };
  },

  async getRawCatalog() {
    const { profiles, subjects, syllabi, users } = await this.fetchDatabaseTables();

    const userById = new Map(users.map((u) => [u.id, u]));
    const userByEmail = new Map(users.map((u) => [String(u.email || '').toLowerCase(), u]));
    const subjectById = new Map(subjects.map((s) => [s.subject_id, s]));

    // Group DB syllabi by faculty_profile.profile_id
    const syllabiByFacultyId = new Map();
    for (const syl of syllabi) {
      if (!syllabiByFacultyId.has(syl.faculty_id)) {
        syllabiByFacultyId.set(syl.faculty_id, []);
      }
      syllabiByFacultyId.get(syl.faculty_id).push(syl);
    }

    const catalog = cloneBaselineCatalog();

    // Link baseline entries to live DB users if their institutional emails exist in User table
    for (const entry of catalog) {
      const matchedUser = userByEmail.get(String(entry.email || '').toLowerCase());
      if (matchedUser) {
        entry.userId = matchedUser.id;
      }
    }

    // Build DB faculty entries from faculty_profile rows
    for (const prof of profiles) {
      const user = userById.get(prof.user_id) || null;
      const unit = getFacultyUnit({
        origin: user?.origin,
        department: user?.department,
      });

      const profSyllabi = syllabiByFacultyId.get(prof.profile_id) || [];
      const subjectMap = new Map();

      for (const syl of profSyllabi) {
        const subjRow = subjectById.get(syl.subject_id);
        if (!subjRow) continue;
        const codeKey = String(subjRow.subject_code).toUpperCase().trim();
        const dept = inferSubjectDepartment(subjRow, { department: user?.department });
        const subjUnit = getFacultyUnit({ unit, department: dept });

        // Keep most recent syllabus per subject code on the main card, plus track all versions if needed
        if (!subjectMap.has(codeKey)) {
          subjectMap.set(codeKey, {
            subjectId: subjRow.subject_id,
            code: subjRow.subject_code,
            title: subjRow.subject_name,
            description: subjRow.description || null,
            department: dept,
            unit: subjUnit,
            syllabus: {
              id: syl.syllabus_id,
              fileName: deriveFileName(syl.file_url, subjRow.subject_code),
              fileUrl: syl.file_url,
              academicYear: syl.academic_year,
              semester: syl.semester,
              uploadedAt: syl.uploaded_at,
              uploadedBy: user?.name || 'Faculty',
            },
          });
        }
      }

      const dbEntry = {
        id: prof.profile_id,
        profileId: prof.profile_id,
        userId: prof.user_id,
        name: user?.name || 'Faculty Member',
        email: user?.email || null,
        department:
          user?.department ||
          (unit === 'IDS'
            ? 'Integrated Developmental School'
            : 'Department of Secondary and Elementary Education'),
        unit,
        origin: unit,
        position: user?.position || (unit === 'IDS' ? 'IDS Faculty' : 'CESS Faculty'),
        biography: prof.biography || null,
        consultationHours: prof.consultation_hours || null,
        displayPictureUrl: prof.display_picture_url || null,
        source: 'database',
        subjects: Array.from(subjectMap.values()),
      };

      // Replace matching baseline entry by userId or email, otherwise append
      const existingIdx = catalog.findIndex(
        (c) =>
          (c.userId && dbEntry.userId && c.userId === dbEntry.userId) ||
          (c.email && dbEntry.email && c.email.toLowerCase() === dbEntry.email.toLowerCase())
      );

      if (existingIdx !== -1) {
        const baseSubjects = catalog[existingIdx].subjects || [];
        for (const bs of baseSubjects) {
          if (!dbEntry.subjects.some((ds) => ds.code.toUpperCase() === bs.code.toUpperCase())) {
            dbEntry.subjects.push(bs);
          }
        }
        catalog[existingIdx] = dbEntry;
      } else {
        catalog.push(dbEntry);
      }
    }

    // Apply Secretary-managed faculty deletions & overrides / additions (PB-40)
    const filteredCatalog = [];
    const presentFacultyIds = new Set();

    for (const entry of catalog) {
      const idCandidates = [entry.id, entry.profileId, entry.userId].filter(Boolean).map(String);
      if (idCandidates.some((cid) => memoryState.deletedFacultyIds.has(cid))) {
        continue;
      }

      const override =
        memoryState.managedFacultyOverrides.get(String(entry.id)) ||
        (entry.profileId ? memoryState.managedFacultyOverrides.get(String(entry.profileId)) : null) ||
        (entry.userId ? memoryState.managedFacultyOverrides.get(String(entry.userId)) : null);

      const merged = override
        ? {
            ...entry,
            ...override,
            subjects: override.subjects !== undefined ? override.subjects : entry.subjects,
          }
        : entry;

      // Filter/update subjects by Secretary-managed subject overrides & deletions
      const nextSubjects = [];
      for (const subj of merged.subjects || []) {
        const codeKey = String(subj.code || '').toUpperCase().trim();
        if (memoryState.deletedSubjectCodes.has(codeKey)) continue;

        const subjOver = memoryState.managedSubjects.get(codeKey);
        if (subjOver && !subjOver.deleted) {
          nextSubjects.push({
            ...subj,
            code: subjOver.code || subj.code,
            title: subjOver.title || subj.title,
            description: subjOver.description !== undefined ? subjOver.description : subj.description,
            department: subjOver.department || subj.department,
            unit: subjOver.unit || subj.unit,
          });
        } else {
          nextSubjects.push(subj);
        }
      }

      // Attach any newly Secretary-assigned subjects targeting this faculty member
      for (const [codeKey, subjOver] of memoryState.managedSubjects.entries()) {
        if (subjOver.deleted || memoryState.deletedSubjectCodes.has(codeKey)) continue;
        if (
          subjOver.assignedFacultyIds &&
          idCandidates.some((cid) => subjOver.assignedFacultyIds.has(cid)) &&
          !nextSubjects.some((s) => String(s.code || '').toUpperCase() === codeKey)
        ) {
          nextSubjects.push({
            subjectId: subjOver.subjectId,
            code: subjOver.code,
            title: subjOver.title,
            description: subjOver.description || null,
            department: subjOver.department || merged.department,
            unit: subjOver.unit || merged.unit,
            syllabus: null,
          });
        }
      }

      merged.subjects = nextSubjects;
      idCandidates.forEach((cid) => presentFacultyIds.add(cid));
      filteredCatalog.push(merged);
    }

    // Append custom Secretary-added faculty entries that weren't in baseline/DB yet
    for (const [key, customFac] of memoryState.managedFacultyOverrides.entries()) {
      if (!customFac || customFac.deleted || memoryState.deletedFacultyIds.has(String(key))) continue;
      if (presentFacultyIds.has(String(customFac.id))) continue;

      const customSubjects = [...(customFac.subjects || [])].filter(
        (s) => !memoryState.deletedSubjectCodes.has(String(s.code || '').toUpperCase().trim())
      );

      for (const [codeKey, subjOver] of memoryState.managedSubjects.entries()) {
        if (subjOver.deleted || memoryState.deletedSubjectCodes.has(codeKey)) continue;
        if (
          subjOver.assignedFacultyIds &&
          subjOver.assignedFacultyIds.has(String(customFac.id)) &&
          !customSubjects.some((s) => String(s.code || '').toUpperCase() === codeKey)
        ) {
          customSubjects.push({
            subjectId: subjOver.subjectId,
            code: subjOver.code,
            title: subjOver.title,
            description: subjOver.description || null,
            department: subjOver.department || customFac.department,
            unit: subjOver.unit || customFac.unit,
            syllabus: null,
          });
        }
      }

      filteredCatalog.push({
        ...customFac,
        subjects: customSubjects,
      });
    }

    return filteredCatalog;
  },

  async getStandaloneManagedSubjects() {
    const { subjects } = await this.fetchDatabaseTables();
    const list = [];
    const seenCodes = new Set();

    for (const s of subjects || []) {
      const codeKey = String(s.subject_code || '').toUpperCase().trim();
      if (!codeKey || memoryState.deletedSubjectCodes.has(codeKey)) continue;
      seenCodes.add(codeKey);
      const over = memoryState.managedSubjects.get(codeKey);
      if (over?.deleted) continue;
      list.push({
        subjectId: s.subject_id,
        code: s.subject_code,
        title: over?.title || s.subject_name,
        description: over?.description !== undefined ? over.description : s.description || null,
        department: over?.department || inferSubjectDepartment(s, null),
        unit: over?.unit || getFacultyUnit({ department: over?.department || inferSubjectDepartment(s, null) }),
      });
    }

    for (const [codeKey, over] of memoryState.managedSubjects.entries()) {
      if (seenCodes.has(codeKey) || over.deleted || memoryState.deletedSubjectCodes.has(codeKey)) continue;
      list.push({
        subjectId: over.subjectId,
        code: over.code,
        title: over.title,
        description: over.description || null,
        department: over.department,
        unit: over.unit,
      });
    }

    return list;
  },

  async findFacultyById(identifier) {
    const target = String(identifier || '').trim();
    const catalog = await this.getRawCatalog();
    return (
      catalog.find(
        (f) =>
          String(f.id) === target ||
          String(f.profileId) === target ||
          (f.userId && String(f.userId) === target)
      ) || null
    );
  },

  async findSyllabusById(syllabusId) {
    const target = String(syllabusId || '').trim();
    const catalog = await this.getRawCatalog();
    for (const fac of catalog) {
      for (const subj of fac.subjects || []) {
        if (subj.syllabus && String(subj.syllabus.id) === target) {
          return {
            syllabus: subj.syllabus,
            subject: subj,
            faculty: fac,
          };
        }
      }
    }
    return null;
  },

  async ensureFacultyProfile({ userId, biography, displayPictureUrl, consultationHours }) {
    if (!userId || !isUuid(userId)) {
      throw new Error('Valid userId (UUID) is required to create a database faculty profile.');
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('faculty_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (existing) {
      if (biography !== undefined || consultationHours !== undefined || displayPictureUrl !== undefined) {
        const { data: updated, error: updErr } = await supabase
          .from('faculty_profile')
          .update({
            ...(biography !== undefined ? { biography } : {}),
            ...(consultationHours !== undefined ? { consultation_hours: consultationHours } : {}),
            ...(displayPictureUrl !== undefined ? { display_picture_url: displayPictureUrl } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('profile_id', existing.profile_id)
          .select('*')
          .single();
        if (updErr) throw updErr;
        return updated;
      }
      return existing;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('faculty_profile')
      .insert({
        user_id: userId,
        biography: biography || null,
        display_picture_url: displayPictureUrl || null,
        consultation_hours: consultationHours || 'By appointment',
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insErr) throw insErr;
    return inserted;
  },

  async ensureSubject({ subjectCode, subjectName, description }) {
    const cleanCode = String(subjectCode || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('subjectCode is required.');
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('subject')
      .select('*')
      .ilike('subject_code', cleanCode)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (existing) return existing;

    const { data: inserted, error: insErr } = await supabase
      .from('subject')
      .insert({
        subject_code: cleanCode,
        subject_name: String(subjectName || cleanCode).trim(),
        description: description || null,
      })
      .select('*')
      .single();

    if (insErr) throw insErr;
    return inserted;
  },

  async upsertSyllabus({
    faculty,
    subjectCode,
    subjectName,
    description,
    academicYear = '2026-2027',
    semester = '1st Semester',
    fileUrl,
    fileName,
    uploadedBy,
    uploadedByUserId = null,
    overwrite = true,
  }) {
    const cleanCode = String(subjectCode || '').trim().toUpperCase();
    const resolvedFileName = fileName || deriveFileName(fileUrl, cleanCode);
    const resolvedFileUrl = fileUrl || `/syllabi/${resolvedFileName}`;

    // If faculty is backed by a real DB User UUID, persist into Supabase `faculty_profile`, `subject`, `syllabus`
    if (faculty?.userId && isUuid(faculty.userId)) {
      const profile = await this.ensureFacultyProfile({ userId: faculty.userId });
      const subj = await this.ensureSubject({
        subjectCode: cleanCode,
        subjectName: subjectName || cleanCode,
        description,
      });

      const { data: existingSyl, error: sylFetchErr } = await supabase
        .from('syllabus')
        .select('*')
        .eq('subject_id', subj.subject_id)
        .eq('faculty_id', profile.profile_id)
        .eq('academic_year', academicYear)
        .eq('semester', semester)
        .maybeSingle();

      if (sylFetchErr) throw sylFetchErr;

      if (existingSyl) {
        if (overwrite === false) {
          const conflictErr = new Error(
            `A syllabus already exists for ${cleanCode} (${academicYear}, ${semester}). Pass overwrite=true or use PUT /api/directory/syllabi/${existingSyl.syllabus_id} to explicitly update it.`
          );
          conflictErr.status = 409;
          conflictErr.code = 'SYLLABUS_ALREADY_EXISTS';
          throw conflictErr;
        }

        const prevSnap = {
          id: existingSyl.syllabus_id,
          fileUrl: existingSyl.file_url,
          fileName: deriveFileName(existingSyl.file_url, subj.subject_code),
          academicYear: existingSyl.academic_year,
          semester: existingSyl.semester,
          uploadedAt: existingSyl.uploaded_at,
          replacedAt: new Date().toISOString(),
          replacedBy: uploadedBy || faculty.name,
        };
        const histKey = String(existingSyl.syllabus_id);
        if (!memoryState.syllabusHistory.has(histKey)) memoryState.syllabusHistory.set(histKey, []);
        memoryState.syllabusHistory.get(histKey).push(prevSnap);

        const { data: updated, error: updErr } = await supabase
          .from('syllabus')
          .update({
            file_url: resolvedFileUrl,
            uploaded_at: new Date().toISOString(),
          })
          .eq('syllabus_id', existingSyl.syllabus_id)
          .select('*')
          .single();

        if (updErr) throw updErr;

        recordListingAudit({
          action: 'SYLLABUS_REPLACED',
          entityType: 'syllabus',
          entityId: updated.syllabus_id,
          actorName: uploadedBy || faculty.name,
          actorUserId: uploadedByUserId,
          summary: `Replaced syllabus for ${subj.subject_code} (${academicYear} ${semester}).`,
          before: { fileUrl: existingSyl.file_url },
          after: { fileUrl: updated.file_url },
        });

        return {
          id: updated.syllabus_id,
          subjectId: subj.subject_id,
          facultyProfileId: profile.profile_id,
          code: subj.subject_code,
          title: subj.subject_name,
          fileName: deriveFileName(updated.file_url, subj.subject_code),
          fileUrl: updated.file_url,
          academicYear: updated.academic_year,
          semester: updated.semester,
          uploadedAt: updated.uploaded_at,
          uploadedBy: uploadedBy || faculty.name,
          overwritten: true,
          previousVersion: prevSnap,
        };
      }

      const { data: inserted, error: insErr } = await supabase
        .from('syllabus')
        .insert({
          subject_id: subj.subject_id,
          faculty_id: profile.profile_id,
          academic_year: academicYear,
          semester,
          file_url: resolvedFileUrl,
          uploaded_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insErr) throw insErr;

      recordListingAudit({
        action: 'SYLLABUS_CREATED',
        entityType: 'syllabus',
        entityId: inserted.syllabus_id,
        actorName: uploadedBy || faculty.name,
        actorUserId: uploadedByUserId,
        summary: `Uploaded syllabus for ${subj.subject_code} (${academicYear} ${semester}).`,
        after: { fileUrl: inserted.file_url },
      });

      return {
        id: inserted.syllabus_id,
        subjectId: subj.subject_id,
        facultyProfileId: profile.profile_id,
        code: subj.subject_code,
        title: subj.subject_name,
        fileName: deriveFileName(inserted.file_url, subj.subject_code),
        fileUrl: inserted.file_url,
        academicYear: inserted.academic_year,
        semester: inserted.semester,
        uploadedAt: inserted.uploaded_at,
        uploadedBy: uploadedBy || faculty.name,
        overwritten: false,
      };
    }

    // Baseline / in-memory fallback entry update
    const overrideKey = `${faculty.id}::${cleanCode}`;
    const existingMem =
      memoryState.baselineOverrides.get(overrideKey) ||
      (faculty.subjects || []).find((s) => String(s.code || '').toUpperCase() === cleanCode)?.syllabus ||
      null;

    if (existingMem && overwrite === false) {
      const conflictErr = new Error(
        `A syllabus already exists for ${cleanCode} (${academicYear}, ${semester}). Explicit replacement is required so existing syllabi are not silently overwritten.`
      );
      conflictErr.status = 409;
      conflictErr.code = 'SYLLABUS_ALREADY_EXISTS';
      throw conflictErr;
    }

    const sylId = existingMem?.id || `syl-${cleanCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    if (existingMem) {
      const histKey = String(sylId);
      if (!memoryState.syllabusHistory.has(histKey)) memoryState.syllabusHistory.set(histKey, []);
      memoryState.syllabusHistory.get(histKey).push({
        ...existingMem,
        replacedAt: new Date().toISOString(),
        replacedBy: uploadedBy || faculty.name,
      });
    }

    const newSyl = {
      id: sylId,
      fileName: resolvedFileName,
      fileUrl: resolvedFileUrl,
      academicYear,
      semester,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || faculty.name,
    };
    memoryState.baselineOverrides.set(overrideKey, newSyl);

    recordListingAudit({
      action: existingMem ? 'SYLLABUS_REPLACED' : 'SYLLABUS_CREATED',
      entityType: 'syllabus',
      entityId: sylId,
      actorName: uploadedBy || faculty.name,
      actorUserId: uploadedByUserId,
      summary: `${existingMem ? 'Replaced' : 'Created'} syllabus for ${cleanCode} (${academicYear} ${semester}).`,
      before: existingMem ? { fileUrl: existingMem.fileUrl, fileName: existingMem.fileName } : null,
      after: { fileUrl: resolvedFileUrl, fileName: resolvedFileName },
    });

    return {
      ...newSyl,
      code: cleanCode,
      title: subjectName || cleanCode,
      overwritten: Boolean(existingMem),
    };
  },

  async updateSyllabusById(syllabusId, { fileUrl, fileName, academicYear, semester, changeNotes, actorName, actorUserId }) {
    const found = await this.findSyllabusById(syllabusId);
    if (!found) return null;

    const current = found.syllabus;
    const nextFileName = fileName || (fileUrl ? deriveFileName(fileUrl, found.subject.code) : current.fileName);
    const nextFileUrl = fileUrl || `/syllabi/${nextFileName}`;
    const nextYear = academicYear || current.academicYear || '2026-2027';
    const nextSemester = semester || current.semester || '1st Semester';
    const nowIso = new Date().toISOString();

    const histKey = String(current.id);
    if (!memoryState.syllabusHistory.has(histKey)) memoryState.syllabusHistory.set(histKey, []);
    memoryState.syllabusHistory.get(histKey).push({
      ...current,
      replacedAt: nowIso,
      replacedBy: actorName || 'College Secretary',
      changeNotes: changeNotes || 'Explicit syllabus update.',
    });

    if (isDbSerialId(syllabusId)) {
      const { data: updated, error } = await supabase
        .from('syllabus')
        .update({
          file_url: nextFileUrl,
          academic_year: nextYear,
          semester: nextSemester,
          uploaded_at: nowIso,
        })
        .eq('syllabus_id', Number(syllabusId))
        .select('*')
        .single();
      if (error) throw error;

      recordListingAudit({
        action: 'SYLLABUS_UPDATED',
        entityType: 'syllabus',
        entityId: syllabusId,
        actorName: actorName || 'College Secretary',
        actorUserId,
        summary: `Updated syllabus #${syllabusId} (${found.subject.code}).`,
        before: { fileUrl: current.fileUrl, academicYear: current.academicYear, semester: current.semester },
        after: { fileUrl: updated.file_url, academicYear: updated.academic_year, semester: updated.semester },
      });

      return {
        ...current,
        id: updated.syllabus_id,
        fileName: deriveFileName(updated.file_url, found.subject.code),
        fileUrl: updated.file_url,
        academicYear: updated.academic_year,
        semester: updated.semester,
        uploadedAt: updated.uploaded_at,
        uploadedBy: actorName || current.uploadedBy,
      };
    }

    const overrideKey = `${found.faculty.id}::${String(found.subject.code).toUpperCase()}`;
    const updatedMem = {
      ...current,
      fileName: nextFileName,
      fileUrl: nextFileUrl,
      academicYear: nextYear,
      semester: nextSemester,
      uploadedAt: nowIso,
      uploadedBy: actorName || current.uploadedBy,
    };
    memoryState.baselineOverrides.set(overrideKey, updatedMem);

    recordListingAudit({
      action: 'SYLLABUS_UPDATED',
      entityType: 'syllabus',
      entityId: syllabusId,
      actorName: actorName || 'College Secretary',
      actorUserId,
      summary: `Updated syllabus ${syllabusId} (${found.subject.code}).`,
      before: { fileUrl: current.fileUrl },
      after: { fileUrl: nextFileUrl },
    });

    return updatedMem;
  },

  /**
   * PB-40: Secretary creates an approved faculty directory listing.
   */
  async createFacultyListing({
    userId = null,
    name,
    email,
    department,
    unit = 'CESS',
    position = null,
    biography = null,
    consultationHours = 'Mon-Fri 1:00 PM - 3:00 PM',
    displayPictureUrl = null,
    actorName = 'College Secretary',
    actorUserId = null,
  }) {
    const resolvedUnit = String(unit || 'CESS').toUpperCase() === 'IDS' ? 'IDS' : 'CESS';
    const resolvedDept =
      department ||
      (resolvedUnit === 'IDS'
        ? 'Integrated Developmental School'
        : 'Department of Secondary and Elementary Education');

    let dbProfile = null;
    if (userId && isUuid(userId)) {
      dbProfile = await this.ensureFacultyProfile({
        userId,
        biography,
        consultationHours,
        displayPictureUrl,
      });
    }

    const listingId = dbProfile ? dbProfile.profile_id : `fac-dir-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id: listingId,
      profileId: dbProfile ? dbProfile.profile_id : listingId,
      userId: userId || null,
      name: String(name || 'Faculty Member').trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      department: resolvedDept,
      unit: resolvedUnit,
      origin: resolvedUnit,
      position: position || `${resolvedUnit} Faculty`,
      biography,
      consultationHours,
      displayPictureUrl,
      source: dbProfile ? 'database' : 'secretary_listing',
      isApprovedListing: true,
      subjects: [],
    };

    memoryState.deletedFacultyIds.delete(String(listingId));
    memoryState.managedFacultyOverrides.set(String(listingId), entry);

    recordListingAudit({
      action: 'FACULTY_LISTING_CREATED',
      entityType: 'faculty',
      entityId: listingId,
      actorName,
      actorUserId,
      summary: `Created approved faculty directory listing for ${entry.name} (${entry.unit}).`,
      after: { id: entry.id, name: entry.name, email: entry.email, unit: entry.unit, department: entry.department },
    });

    return this.findFacultyById(listingId);
  },

  /**
   * PB-40: Secretary updates an existing approved faculty directory listing.
   */
  async updateFacultyListing(identifier, updates = {}, { actorName = 'College Secretary', actorUserId = null } = {}) {
    const existing = await this.findFacultyById(identifier);
    if (!existing) return null;

    if (existing.userId && isUuid(existing.userId)) {
      await this.ensureFacultyProfile({
        userId: existing.userId,
        biography: updates.biography !== undefined ? updates.biography : existing.biography,
        consultationHours: updates.consultationHours !== undefined ? updates.consultationHours : existing.consultationHours,
        displayPictureUrl: updates.displayPictureUrl !== undefined ? updates.displayPictureUrl : existing.displayPictureUrl,
      });
    }

    const resolvedUnit = updates.unit ? (String(updates.unit).toUpperCase() === 'IDS' ? 'IDS' : 'CESS') : existing.unit;
    const nextEntry = {
      ...existing,
      name: updates.name !== undefined ? String(updates.name).trim() : existing.name,
      email: updates.email !== undefined ? String(updates.email).trim().toLowerCase() : existing.email,
      department: updates.department !== undefined ? String(updates.department).trim() : existing.department,
      unit: resolvedUnit,
      origin: resolvedUnit,
      position: updates.position !== undefined ? updates.position : existing.position,
      biography: updates.biography !== undefined ? updates.biography : existing.biography,
      consultationHours: updates.consultationHours !== undefined ? updates.consultationHours : existing.consultationHours,
      displayPictureUrl: updates.displayPictureUrl !== undefined ? updates.displayPictureUrl : existing.displayPictureUrl,
      isApprovedListing: updates.isApprovedListing !== undefined ? Boolean(updates.isApprovedListing) : true,
    };

    memoryState.managedFacultyOverrides.set(String(existing.id), nextEntry);

    recordListingAudit({
      action: 'FACULTY_LISTING_UPDATED',
      entityType: 'faculty',
      entityId: existing.id,
      actorName,
      actorUserId,
      summary: `Updated approved faculty directory listing for ${nextEntry.name} (${existing.id}).`,
      before: { name: existing.name, department: existing.department, unit: existing.unit, position: existing.position },
      after: { name: nextEntry.name, department: nextEntry.department, unit: nextEntry.unit, position: nextEntry.position },
    });

    return this.findFacultyById(existing.id);
  },

  async deleteFacultyListing(identifier, { actorName = 'College Secretary', actorUserId = null } = {}) {
    const existing = await this.findFacultyById(identifier);
    if (!existing) return null;

    [existing.id, existing.profileId, existing.userId]
      .filter(Boolean)
      .forEach((cid) => memoryState.deletedFacultyIds.add(String(cid)));
    memoryState.managedFacultyOverrides.delete(String(existing.id));

    recordListingAudit({
      action: 'FACULTY_LISTING_REMOVED',
      entityType: 'faculty',
      entityId: existing.id,
      actorName,
      actorUserId,
      summary: `Removed faculty listing for ${existing.name} (${existing.id}) from approved directory.`,
      before: { id: existing.id, name: existing.name, unit: existing.unit },
    });

    return existing;
  },

  /**
   * PB-40: Secretary creates / assigns / updates / deletes approved subject listings.
   */
  async createSubjectListing({
    subjectCode,
    subjectName,
    description = null,
    department = null,
    unit = 'CESS',
    assignedFacultyId = null,
    actorName = 'College Secretary',
    actorUserId = null,
  }) {
    const cleanCode = String(subjectCode || '').trim().toUpperCase();
    const cleanName = String(subjectName || cleanCode).trim();
    const resolvedUnit = String(unit || 'CESS').toUpperCase() === 'IDS' ? 'IDS' : 'CESS';
    const resolvedDept = department || inferSubjectDepartment({ subject_code: cleanCode }, null);

    // Check if code already exists cleanly
    const { data: existingDb } = await supabase
      .from('subject')
      .select('*')
      .ilike('subject_code', cleanCode)
      .maybeSingle();

    const rawCatalog = await this.getRawCatalog();
    const existsInCatalog = rawCatalog.some((f) =>
      (f.subjects || []).some((s) => String(s.code || '').toUpperCase() === cleanCode)
    );

    if ((existingDb && !memoryState.deletedSubjectCodes.has(cleanCode)) || existsInCatalog) {
      const err = new Error(`Subject ${cleanCode} already exists in the approved directory.`);
      err.status = 409;
      throw err;
    }

    const dbSubject = await this.ensureSubject({
      subjectCode: cleanCode,
      subjectName: cleanName,
      description,
    });

    const assignedSet = new Set();
    if (assignedFacultyId) {
      const targetFac = await this.findFacultyById(assignedFacultyId);
      if (targetFac) {
        assignedSet.add(String(targetFac.id));
        if (targetFac.profileId) assignedSet.add(String(targetFac.profileId));
        if (targetFac.userId) assignedSet.add(String(targetFac.userId));
      } else {
        assignedSet.add(String(assignedFacultyId));
      }
    }

    memoryState.deletedSubjectCodes.delete(cleanCode);
    const subjRecord = {
      subjectId: dbSubject.subject_id,
      code: cleanCode,
      title: cleanName,
      description: description || null,
      department: resolvedDept,
      unit: resolvedUnit,
      assignedFacultyIds: assignedSet,
      deleted: false,
    };
    memoryState.managedSubjects.set(cleanCode, subjRecord);

    recordListingAudit({
      action: 'SUBJECT_LISTING_CREATED',
      entityType: 'subject',
      entityId: cleanCode,
      actorName,
      actorUserId,
      summary: `Created approved subject listing ${cleanCode} - ${cleanName} (${resolvedUnit}).`,
      after: { subjectId: dbSubject.subject_id, code: cleanCode, title: cleanName, unit: resolvedUnit },
    });

    return {
      subjectId: subjRecord.subjectId,
      code: subjRecord.code,
      title: subjRecord.title,
      description: subjRecord.description,
      department: subjRecord.department,
      unit: subjRecord.unit,
      assignedFacultyIds: Array.from(assignedSet),
    };
  },

  async updateSubjectListing(codeOrId, updates = {}, { actorName = 'College Secretary', actorUserId = null } = {}) {
    const cleanTarget = decodeURIComponent(String(codeOrId || '')).trim().toUpperCase();
    const standalone = await this.getStandaloneManagedSubjects();
    const catalog = await this.getRawCatalog();

    let foundMeta = standalone.find(
      (s) => String(s.code).toUpperCase() === cleanTarget || String(s.subjectId) === String(codeOrId)
    );
    if (!foundMeta) {
      for (const f of catalog) {
        const match = (f.subjects || []).find(
          (s) => String(s.code).toUpperCase() === cleanTarget || String(s.subjectId) === String(codeOrId)
        );
        if (match) {
          foundMeta = match;
          break;
        }
      }
    }
    if (!foundMeta) return null;

    const codeKey = String(foundMeta.code).toUpperCase();
    if (isDbSerialId(foundMeta.subjectId)) {
      await supabase
        .from('subject')
        .update({
          ...(updates.subjectName !== undefined ? { subject_name: String(updates.subjectName).trim() } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
        })
        .eq('subject_id', Number(foundMeta.subjectId));
    }

    const prevOver = memoryState.managedSubjects.get(codeKey);
    const assignedSet = new Set(prevOver?.assignedFacultyIds ? Array.from(prevOver.assignedFacultyIds) : []);
    if (updates.assignedFacultyId) {
      const targetFac = await this.findFacultyById(updates.assignedFacultyId);
      if (targetFac) {
        assignedSet.add(String(targetFac.id));
        if (targetFac.profileId) assignedSet.add(String(targetFac.profileId));
        if (targetFac.userId) assignedSet.add(String(targetFac.userId));
      } else {
        assignedSet.add(String(updates.assignedFacultyId));
      }
    }

    const nextOver = {
      subjectId: foundMeta.subjectId,
      code: codeKey,
      title: updates.subjectName !== undefined ? String(updates.subjectName).trim() : foundMeta.title,
      description: updates.description !== undefined ? updates.description : foundMeta.description,
      department: updates.department !== undefined ? updates.department : foundMeta.department,
      unit: updates.unit ? (String(updates.unit).toUpperCase() === 'IDS' ? 'IDS' : 'CESS') : foundMeta.unit,
      assignedFacultyIds: assignedSet,
      deleted: false,
    };
    memoryState.managedSubjects.set(codeKey, nextOver);

    recordListingAudit({
      action: 'SUBJECT_LISTING_UPDATED',
      entityType: 'subject',
      entityId: codeKey,
      actorName,
      actorUserId,
      summary: `Updated subject listing ${codeKey} (${nextOver.title}).`,
      before: { title: foundMeta.title, description: foundMeta.description, unit: foundMeta.unit },
      after: { title: nextOver.title, description: nextOver.description, unit: nextOver.unit },
    });

    return {
      subjectId: nextOver.subjectId,
      code: nextOver.code,
      title: nextOver.title,
      description: nextOver.description,
      department: nextOver.department,
      unit: nextOver.unit,
      assignedFacultyIds: Array.from(assignedSet),
    };
  },

  async deleteSubjectListing(codeOrId, { actorName = 'College Secretary', actorUserId = null } = {}) {
    const cleanTarget = decodeURIComponent(String(codeOrId || '')).trim().toUpperCase();
    const standalone = await this.getStandaloneManagedSubjects();
    const catalog = await this.getRawCatalog();

    let foundMeta = standalone.find(
      (s) => String(s.code).toUpperCase() === cleanTarget || String(s.subjectId) === String(codeOrId)
    );
    if (!foundMeta) {
      for (const f of catalog) {
        const match = (f.subjects || []).find(
          (s) => String(s.code).toUpperCase() === cleanTarget || String(s.subjectId) === String(codeOrId)
        );
        if (match) {
          foundMeta = match;
          break;
        }
      }
    }
    if (!foundMeta) return null;

    const codeKey = String(foundMeta.code).toUpperCase();
    memoryState.deletedSubjectCodes.add(codeKey);
    memoryState.managedSubjects.set(codeKey, { ...foundMeta, deleted: true });

    recordListingAudit({
      action: 'SUBJECT_LISTING_REMOVED',
      entityType: 'subject',
      entityId: codeKey,
      actorName,
      actorUserId,
      summary: `Removed subject listing ${codeKey} (${foundMeta.title}) from approved directory.`,
      before: { code: codeKey, title: foundMeta.title },
    });

    return foundMeta;
  },

  async deleteSyllabus(syllabusId) {
    const found = await this.findSyllabusById(syllabusId);
    if (!found) return null;

    if (isDbSerialId(syllabusId)) {
      const { error } = await supabase
        .from('syllabus')
        .delete()
        .eq('syllabus_id', Number(syllabusId));
      if (error) throw error;
      return found;
    }

    memoryState.deletedBaselineSyllabusIds.add(syllabusId);
    const overrideKey = `${found.faculty.id}::${found.subject.code.toUpperCase()}`;
    memoryState.baselineOverrides.set(overrideKey, null);
    return found;
  },

  async cleanupTestRecords({ syllabusIds = [], subjectIds = [], profileIds = [], announcementIds = [] } = {}) {
    for (const id of syllabusIds) {
      if (isDbSerialId(id)) {
        await supabase.from('syllabus').delete().eq('syllabus_id', Number(id));
      }
    }
    for (const id of profileIds) {
      if (isDbSerialId(id)) {
        await supabase.from('syllabus').delete().eq('faculty_id', Number(id));
        await supabase.from('faculty_profile').delete().eq('profile_id', Number(id));
      }
    }
    for (const id of subjectIds) {
      if (isDbSerialId(id)) {
        await supabase.from('syllabus').delete().eq('subject_id', Number(id));
        await supabase.from('subject').delete().eq('subject_id', Number(id));
      }
    }
    for (const id of announcementIds) {
      await this.deleteAnnouncement(id);
    }
  },
};

module.exports = DirectoryModel;

