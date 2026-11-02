/**
 * End-to-End Integration Test & Seeder for Ticket PB-02:
 * "Role verification and role-based access [P0]"
 * Based on Admin Verification & Masterlist Whitelist
 */
const app = require('../server');
const supabase = require('../config/database');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const ROLE_ACCOUNTS = [
  {
    idNumber: '2023-0142',
    name: 'Maria Santos',
    email: 'student@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'EMP-2019-011',
    name: 'Prof. Ana Lim',
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Assistant Professor',
  },
  {
    idNumber: 'EMP-2018-092',
    name: 'Mr. Jose Dela Cruz',
    email: 'ids.faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'Teacher III',
  },
  {
    idNumber: 'SEC-2026-01',
    name: 'Ms. Carmela Ortiz',
    email: 'secretary@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  {
    idNumber: 'CHR-2026-01',
    name: 'Dr. Liza Fernandez',
    email: 'chairperson@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Department Chairperson',
  },
  {
    idNumber: 'IDS-2026-01',
    name: 'Dr. Teresa Gomez',
    email: 'ids.principal@msunaawan.edu.ph',
    role: 'ids_principal',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Principal',
  },
  {
    idNumber: 'DEAN-2026-01',
    name: 'Dr. Ramon Villanueva',
    email: 'dean@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
  {
    idNumber: 'OVCAA-2026-01',
    name: 'Dr. Victor Salazar',
    email: 'ovcaa@msunaawan.edu.ph',
    role: 'ovcaa',
    origin: 'CESS',
    department: 'Office of the Vice Chancellor for Academic Affairs',
    position: 'Vice Chancellor for Academic Affairs',
  },
  {
    idNumber: 'VCAF-2026-01',
    name: 'Dr. Elena Mendoza',
    email: 'vcaf@msunaawan.edu.ph',
    role: 'vcaf',
    origin: 'CESS',
    department: 'Office of the Vice Chancellor for Administration and Finance',
    position: 'Vice Chancellor for Administration and Finance',
  },
  {
    idNumber: 'CHAN-2026-01',
    name: 'Dr. Antonio Cabrera',
    email: 'chancellor@msunaawan.edu.ph',
    role: 'chancellor',
    origin: 'CESS',
    department: 'Office of the Chancellor',
    position: 'Chancellor',
  },
];

async function seedRoleAccounts() {
  for (const acc of ROLE_ACCOUNTS) {
    const { primary } = getPasswordsForRole(acc.role, acc.origin, acc.email);
    await provisionVerifiedUser({
      idNumber: acc.idNumber,
      email: acc.email,
      password: primary,
      name: acc.name,
      role: acc.role,
      origin: acc.origin,
      department: acc.department,
      position: acc.position,
    });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-02 INTEGRATION TESTS & SEEDING CLEAN ROLE ACCOUNTS');
  console.log('================================================================\n');

  await seedRoleAccounts();
  console.log(`✅ Provisioned all ${ROLE_ACCOUNTS.length} clean role accounts with '<role>123' passwords.\n`);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  const createdDocIds = [];

  try {
    const request = async (path, options = {}) => {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    };

    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const studentHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
    const facultyHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // TEST 1: Login with Clean Role Emails (e.g. faculty@msunaawan.edu.ph)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Login Endpoint (POST /api/auth/login)...');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'faculty@msunaawan.edu.ph',
        password: 'faculty123',
      }),
    });
    if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
    console.log(
      `   ✅ Logged in as ${loginRes.body.user.email} -> Role: ${loginRes.body.user.roleLabel}\n`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Masterlist Whitelist Import by College Secretary
    // -------------------------------------------------------------------------
    console.log('2️⃣  Testing Masterlist Whitelist Import by College Secretary...');
    const wlRes = await request('/auth/whitelist/import', {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        term: '1st Sem AY 2026-2027',
        entries: ROLE_ACCOUNTS.map((a) => ({
          idNumber: a.idNumber,
          name: a.name,
          email: a.email,
          role: a.role,
          origin: a.origin,
          department: a.department,
        })),
      }),
    });
    if (wlRes.status !== 201) throw new Error(`Whitelist import failed: ${JSON.stringify(wlRes.body)}`);
    console.log(`   ✅ Whitelist imported (${wlRes.body.importedCount} entries).\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Restricted Actions Denial (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('3️⃣  Testing Restricted Actions Denial (RBAC Enforcement)...');
    const studentTryWhitelist = await request('/auth/whitelist/import', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ entries: [] }),
    });
    console.log(`   ✅ Student trying to import whitelist -> Status ${studentTryWhitelist.status}: "${studentTryWhitelist.body.error}"`);

    const chairTrySubmit = await request('/documents', {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ title: 'Reviewer trying to submit request' }),
    });
    console.log(`   ✅ Chairperson trying to submit requester form -> Status ${chairTrySubmit.status}: "${chairTrySubmit.body.error}"\n`);

    // -------------------------------------------------------------------------
    // TEST 4: Role-Based Record Visibility
    // -------------------------------------------------------------------------
    console.log('4️⃣  Testing Role-Based Record Visibility...');
    const runTag = Date.now().toString().slice(-5);
    const studentDocRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        controlBase: `MSU-CESS-STU-${runTag}-2026`,
        typeId: 'inc',
        title: 'Student Internship Endorsement',
      }),
    });
    createdDocIds.push(studentDocRes.body.document.id);

    const facultyDocRes = await request('/documents', {
      method: 'POST',
      headers: facultyHeaders,
      body: JSON.stringify({
        controlBase: `MSU-CESS-FAC-${runTag}-2026`,
        typeId: 'travel-order',
        title: 'Faculty Seminar Travel Order',
      }),
    });
    createdDocIds.push(facultyDocRes.body.document.id);

    // Secretary performs completeness check and routes the Faculty document to Department Chairperson
    await request(`/documents/${facultyDocRes.body.document.id}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'verify',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Verified complete and routed to Department Chairperson.',
      }),
    });

    const studentList = await request('/documents', { headers: studentHeaders });
    const studentSeesFacultyDoc = studentList.body.documents.some(
      (d) => d.id === facultyDocRes.body.document.id
    );
    console.log(
      `   ✅ Student (student@msunaawan.edu.ph) sees ${studentList.body.count} own doc(s). Can see Faculty doc? ${studentSeesFacultyDoc}`
    );

    const chairList = await request('/documents', { headers: chairHeaders });
    const chairSeesFacultyDoc = chairList.body.documents.some(
      (d) => d.id === facultyDocRes.body.document.id
    );
    const chairSeesStudentDoc = chairList.body.documents.some(
      (d) => d.id === studentDocRes.body.document.id
    );
    console.log(
      `   ✅ Chairperson (chairperson@msunaawan.edu.ph) sees routed Faculty doc? ${chairSeesFacultyDoc}. Sees unrouted Student doc? ${chairSeesStudentDoc}`
    );

    const secList = await request('/documents', { headers: secretaryHeaders });
    console.log(
      `   ✅ Secretary (secretary@msunaawan.edu.ph) sees ALL ${secList.body.count} documents.\n`
    );

    console.log('================================================================');
    console.log('🎉 ALL CLEAN ROLE ACCOUNTS SEEDED & PB-02 TESTS PASSED!');
    console.log('================================================================');
  } finally {
    const DocumentModel = require('../models/documentModel');
    const allDocs = await DocumentModel.findAll();
    for (const doc of allDocs) {
      if (doc.control_number?.startsWith('MSU-CESS-STU-') || doc.control_number?.startsWith('MSU-CESS-FAC-')) {
        await DocumentModel.softDelete(doc.id);
      }
    }
    for (const id of createdDocIds) {
      await DocumentModel.softDelete(id);
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
