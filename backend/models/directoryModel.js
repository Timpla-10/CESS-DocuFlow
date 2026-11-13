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

// Mutable overlay state for baseline items & official syllabus template
const memoryState = {
  baselineOverrides: new Map(), // key: `${facultyId}::${code}` -> syllabus object | null
  deletedBaselineSyllabusIds: new Set(),
  officialTemplate: {
    fileName: 'CESS_Official_Course_Syllabus_Template_2026.docx',
    fileUrl: '/templates/CESS_Official_Course_Syllabus_Template_2026.docx',
    updatedAt: '2026-03-01T08:00:00.000Z',
    uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
    fileSize: '142 KB',
  },
};

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
    return { ...memoryState.officialTemplate };
  },

  updateOfficialTemplate({ fileName, fileUrl, fileSize, uploadedBy }) {
    const cleanName = String(fileName || '').trim();
    memoryState.officialTemplate = {
      fileName: cleanName,
      fileUrl: fileUrl || `/templates/${cleanName}`,
      updatedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || 'College Secretary',
      fileSize: fileSize || '145 KB',
    };
    return this.getOfficialTemplate();
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

    return catalog;
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
      };
    }

    // Baseline / in-memory fallback entry update
    const sylId = `syl-${cleanCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const newSyl = {
      id: sylId,
      fileName: resolvedFileName,
      fileUrl: resolvedFileUrl,
      academicYear,
      semester,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || faculty.name,
    };
    memoryState.baselineOverrides.set(`${faculty.id}::${cleanCode}`, newSyl);
    return {
      ...newSyl,
      code: cleanCode,
      title: subjectName || cleanCode,
    };
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

  async cleanupTestRecords({ syllabusIds = [], subjectIds = [], profileIds = [] }) {
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
  },
};

module.exports = DirectoryModel;

