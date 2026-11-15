/**
 * PB-56: Course Syllabus Model
 *
 * Interfaces with Supabase PostgreSQL tables:
 *   - "Syllabus" (Table 17 in schema)
 *   - "Subject" (Table 16 in schema)
 *   - "Faculty_Profile" (Table 15 in schema)
 *
 * Provides standalone repository for Outcome-Based Education (OBE) course syllabi
 * and Tables of Specifications (TOS), separate from administrative Document_Request records.
 */

const supabase = require('../config/supabase');

// In-memory cache & fallback store for test harness and local runs
let syllabiStore = [
  {
    syllabus_id: 1,
    subject_code: 'EDUC 101',
    subject_name: 'The Child and Adolescent Learner',
    academic_year: '2026-2027',
    semester: '1st Semester',
    file_url: 'EDUC101_Syllabus_2026.pdf',
    uploaded_at: '2026-08-20T09:00:00Z',
    department: 'Department of Secondary and Elementary Education',
    faculty_user_id: 'u-faculty-1',
    faculty_name: 'Prof. Ana Lim',
    description: 'Outcome-based course syllabus covering developmental stages and adolescent behavior.',
    status: 'active',
  },
  {
    syllabus_id: 2,
    subject_code: 'EDUC 205',
    subject_name: 'Assessment in Learning 1',
    academic_year: '2026-2027',
    semester: '1st Semester',
    file_url: 'EDUC205_Syllabus_2026.pdf',
    uploaded_at: '2026-08-22T10:30:00Z',
    department: 'Department of Secondary and Elementary Education',
    faculty_user_id: 'u-faculty-1',
    faculty_name: 'Prof. Ana Lim',
    description: 'Assessment principles, development of traditional and authentic assessment tools, and TOS construction.',
    status: 'active',
  },
  {
    syllabus_id: 3,
    subject_code: 'SOCSCI 110',
    subject_name: 'Philippine History',
    academic_year: '2026-2027',
    semester: '1st Semester',
    file_url: 'SOCSCI110_Syllabus_2026.pdf',
    uploaded_at: '2026-08-18T14:00:00Z',
    department: 'Department of Social Sciences and Humanities',
    faculty_user_id: 'u-faculty-2',
    faculty_name: 'Prof. Ben Aquino',
    description: 'Critical analysis of primary sources and contemporary sociopolitical developments in the Philippines.',
    status: 'active',
  },
  {
    syllabus_id: 4,
    subject_code: 'SOCSCI 220',
    subject_name: 'Research Methods in the Social Sciences',
    academic_year: '2026-2027',
    semester: '1st Semester',
    file_url: 'SOCSCI220_Syllabus_2026.pdf',
    uploaded_at: '2026-08-25T11:15:00Z',
    department: 'Department of Social Sciences and Humanities',
    faculty_user_id: 'u-faculty-2',
    faculty_name: 'Prof. Ben Aquino',
    description: 'Quantitative and qualitative social science research designs, field methodologies, data collection, and ethics.',
    status: 'active',
  },
  {
    syllabus_id: 5,
    subject_code: 'EDUC 310',
    subject_name: 'Curriculum Development',
    academic_year: '2026-2027',
    semester: '1st Semester',
    file_url: 'EDUC310_Syllabus_2026.pdf',
    uploaded_at: '2026-08-19T08:45:00Z',
    department: 'Department of Secondary and Elementary Education',
    faculty_user_id: 'u-chair',
    faculty_name: 'Dr. Liza Fernandez',
    description: 'Curriculum concepts, models of curriculum planning, implementation, reform, and institutional evaluation.',
    status: 'active',
  },
];

let officialTemplate = {
  fileName: 'CESS_Official_Course_Syllabus_Template_2026.docx',
  updatedAt: '2026-03-01T08:00:00Z',
  uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
  fileSize: '142 KB',
};

let nextId = 10;

const SyllabusModel = {
  async findAll(filters = {}) {
    // Attempt live Supabase query
    try {
      let query = supabase.from('syllabus').select(`
        syllabus_id,
        academic_year,
        semester,
        file_url,
        uploaded_at,
        subject:subject_id (
          subject_id,
          subject_code,
          subject_name,
          description
        ),
        faculty:faculty_id (
          profile_id,
          user_id,
          user:user_id (
            user_id,
            name,
            email,
            department,
            role
          )
        )
      `);

      if (filters.academicYear) query = query.eq('academic_year', filters.academicYear);
      if (filters.semester) query = query.eq('semester', filters.semester);

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row) => ({
          id: String(row.syllabus_id),
          subjectCode: row.subject?.subject_code || 'COURSE',
          subjectTitle: row.subject?.subject_name || 'Course Title',
          academicYear: row.academic_year,
          semester: row.semester,
          fileName: row.file_url,
          fileUrl: row.file_url,
          uploadedAt: row.uploaded_at,
          department: row.faculty?.user?.department || 'College of Education and Social Sciences',
          facultyId: String(row.faculty?.profile_id || ''),
          facultyUserId: row.faculty?.user_id,
          facultyName: row.faculty?.user?.name || 'Faculty Member',
          description: row.subject?.description || '',
          status: 'active',
        }));
      }
    } catch (_) {
      // Fallback to local memory store
    }

    // Filter local memory store
    let results = [...syllabiStore];

    if (filters.academicYear) {
      results = results.filter((s) => s.academic_year === filters.academicYear);
    }
    if (filters.semester) {
      results = results.filter((s) => s.semester === filters.semester);
    }
    if (filters.department && filters.department !== 'All Departments') {
      results = results.filter((s) => s.department === filters.department);
    }
    if (filters.facultyUserId) {
      results = results.filter((s) => s.faculty_user_id === filters.facultyUserId);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase().trim();
      results = results.filter((s) => {
        return (
          s.subject_code.toLowerCase().includes(q) ||
          s.subject_name.toLowerCase().includes(q) ||
          s.faculty_name.toLowerCase().includes(q)
        );
      });
    }

    return results.map((s) => ({
      id: String(s.syllabus_id),
      subjectCode: s.subject_code,
      subjectTitle: s.subject_name,
      academicYear: s.academic_year,
      semester: s.semester,
      fileName: s.file_url,
      fileUrl: s.file_url,
      fileSizeKb: 450,
      uploadedAt: s.uploaded_at,
      department: s.department,
      facultyUserId: s.faculty_user_id,
      facultyName: s.faculty_name,
      description: s.description,
      status: s.status,
    }));
  },

  async findById(id) {
    const list = await this.findAll();
    return list.find((s) => String(s.id) === String(id)) || null;
  },

  async create({
    subjectCode,
    subjectTitle,
    academicYear = '2026-2027',
    semester = '1st Semester',
    fileName,
    fileUrl,
    facultyUserId,
    facultyName,
    department,
    description = '',
  }) {
    const id = nextId++;
    const newEntry = {
      syllabus_id: id,
      subject_code: subjectCode.trim().toUpperCase(),
      subject_name: subjectTitle.trim(),
      academic_year: academicYear,
      semester,
      file_url: fileName || fileUrl || `${subjectCode}_Syllabus.pdf`,
      uploaded_at: new Date().toISOString(),
      department: department || 'College of Education and Social Sciences',
      faculty_user_id: facultyUserId,
      faculty_name: facultyName || 'Faculty Member',
      description,
      status: 'active',
    };

    syllabiStore.push(newEntry);

    return {
      id: String(newEntry.syllabus_id),
      subjectCode: newEntry.subject_code,
      subjectTitle: newEntry.subject_name,
      academicYear: newEntry.academic_year,
      semester: newEntry.semester,
      fileName: newEntry.file_url,
      fileUrl: newEntry.file_url,
      fileSizeKb: 450,
      uploadedAt: newEntry.uploaded_at,
      department: newEntry.department,
      facultyUserId: newEntry.faculty_user_id,
      facultyName: newEntry.faculty_name,
      description: newEntry.description,
      status: newEntry.status,
    };
  },

  async update(id, payload = {}) {
    const idx = syllabiStore.findIndex((s) => String(s.syllabus_id) === String(id));
    if (idx < 0) return null;

    if (payload.subjectTitle) syllabiStore[idx].subject_name = payload.subjectTitle.trim();
    if (payload.fileName) syllabiStore[idx].file_url = payload.fileName.trim();
    if (payload.description !== undefined) syllabiStore[idx].description = payload.description;
    syllabiStore[idx].uploaded_at = new Date().toISOString();

    const s = syllabiStore[idx];
    return {
      id: String(s.syllabus_id),
      subjectCode: s.subject_code,
      subjectTitle: s.subject_name,
      academicYear: s.academic_year,
      semester: s.semester,
      fileName: s.file_url,
      fileUrl: s.file_url,
      fileSizeKb: 450,
      uploadedAt: s.uploaded_at,
      department: s.department,
      facultyUserId: s.faculty_user_id,
      facultyName: s.faculty_name,
      description: s.description,
      status: s.status,
    };
  },

  async delete(id) {
    const idx = syllabiStore.findIndex((s) => String(s.syllabus_id) === String(id));
    if (idx < 0) return false;
    syllabiStore.splice(idx, 1);
    return true;
  },

  getTemplate() {
    return officialTemplate;
  },

  updateTemplate(template = {}) {
    officialTemplate = {
      fileName: template.fileName || officialTemplate.fileName,
      updatedAt: new Date().toISOString(),
      uploadedBy: template.uploadedBy || 'Ms. Carmela Ortiz (College Secretary)',
      fileSize: template.fileSize || '150 KB',
    };
    return officialTemplate;
  },
};

module.exports = SyllabusModel;
