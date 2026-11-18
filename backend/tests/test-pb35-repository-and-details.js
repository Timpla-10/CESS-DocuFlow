/**
 * Integration Test Suite for Ticket PB-35:
 * "Central repository and record details [P0]"
 *
 * User Story:
 *   As an authorized user, I want to browse documents by type/category and open their details.
 *
 * Acceptance Criteria:
 *   1. Repository groups records by type/category (and supports filtering/grouping)
 *   2. Record details show complete metadata, chronological attachments, and processing history
 *   3. Active and archived views are strictly distinct (Released, Rejected, Archived vs Active)
 *   4. Permissions are strictly enforced (401 unauthenticated, 403 unauthorized, role-scoped views, Secretary-only archiving)
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const DocumentModel = require('../models/documentModel');
const DocumentTypeModel = require('../models/documentTypeModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'STU-PB35-01',
    name: 'Maria Clara PB35',
    email: 'student1.pb35@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd Science, 4th Year',
    position: 'Student',
  },
  {
    idNumber: 'STU-PB35-02',
    name: 'Third Party PB35',
    email: 'student2.pb35@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BEEd, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'FAC-PB35-01',
    name: 'Prof. Elena IDS PB35',
    email: 'ids.faculty.pb35@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Faculty',
  },
  {
    idNumber: 'SEC-PB35-01',
    name: 'Sec. Ana PB35',
    email: 'secretary.pb35@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  {
    idNumber: 'CHR-PB35-01',
    name: 'Dr. Marcos Chair PB35',
    email: 'chair.pb35@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Department Chairperson',
  },
  {
    idNumber: 'DEAN-PB35-01',
    name: 'Dr. Sofia Dean PB35',
    email: 'dean.pb35@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
  {
    idNumber: 'PRI-PB35-01',
    name: 'Dr. Ruben Principal PB35',
    email: 'principal.pb35@msunaawan.edu.ph',
    role: 'ids_principal',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Principal',
  },
];

const RUN_TAG = `PB35-${Date.now().toString().slice(-6)}`;
const seededAccounts = {};
const createdDocIds = [];
let baseUrl = '';

async function seedTestUsers() {
  for (const u of TEST_USERS) {
    let existing = await UserModel.findByEmail(u.email);
    if (!existing) {
      existing = await provisionVerifiedUser({
        ...u,
        password: 'password123',
      });
    }
    seededAccounts[u.idNumber] = existing;
  }
}

async function request(method, reqPath, { email, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${baseUrl}${reqPath}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function submitDoc(email, docTypeId, title, attachments = []) {
  const res = await request('POST', '/api/documents', {
    email,
    body: {
      docTypeId,
      title,
      description: `PB-35 integration test document: ${title}`,
      attachments,
    },
  });
  assert.strictEqual(res.status, 201, `Expected 201 submitting "${title}", got ${res.status}: ${JSON.stringify(res.body)}`);
  const docId = res.body.document.document_id;
  createdDocIds.push(docId);
  return res.body.document;
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING PB-35 INTEGRATION TESTS: CENTRAL REPOSITORY & RECORD DETAILS');
  console.log('================================================================\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  try {
    await seedTestUsers();
    console.log('✅ Test accounts ready.');

    const student1 = seededAccounts['STU-PB35-01'];
    const student2 = seededAccounts['STU-PB35-02'];
    const idsFaculty = seededAccounts['FAC-PB35-01'];
    const secretary = seededAccounts['SEC-PB35-01'];
    const chairperson = seededAccounts['CHR-PB35-01'];
    const dean = seededAccounts['DEAN-PB35-01'];
    const principal = seededAccounts['PRI-PB35-01'];

    // Lookup eligible document types for student (need at least 2 distinct types if available) and IDS faculty
    const studentTypes = await DocumentTypeModel.findEligibleForRole('student', 'CESS');
    const idsTypes = await DocumentTypeModel.findEligibleForRole('faculty', 'IDS');
    assert(studentTypes.length >= 1, 'Expected at least 1 student document type in DB');
    assert(idsTypes.length >= 1, 'Expected at least 1 IDS faculty document type in DB');

    const studentTypeA = studentTypes[0];
    const studentTypeB = studentTypes[1] || studentTypes[0];
    const idsType = idsTypes[0];

    console.log(`📚 Using Document Types -> Type A: [${studentTypeA.doc_type_id}] ${studentTypeA.type_name}, Type B: [${studentTypeB.doc_type_id}] ${studentTypeB.type_name}, IDS: [${idsType.doc_type_id}] ${idsType.type_name}`);

    // 1. Active CESS doc (Student 1 -> Checked by Secretary -> Endorsed by Chair to Dean)
    const activeDoc = await submitDoc(
      student1.email,
      studentTypeA.doc_type_id,
      `${RUN_TAG} Active Request in Dean Queue`,
      [{ name: 'pb35-active-initial.pdf', sizeKb: 256, type: 'application/pdf' }]
    );
    let r = await request('POST', `/api/documents/${activeDoc.document_id}/check`, {
      email: secretary.email,
      body: { decision: 'complete', nextOffice: 'Department Chairperson', remarks: 'PB-35 verified complete.' },
    });
    assert.strictEqual(r.status, 200, `Check failed: ${JSON.stringify(r.body)}`);

    r = await request('POST', `/api/documents/${activeDoc.document_id}/review`, {
      email: chairperson.email,
      body: { action: 'endorse', nextOffice: 'College Dean', remarks: 'PB-35 Chair endorsed to Dean.' },
    });
    assert.strictEqual(r.status, 200, `Chair endorse failed: ${JSON.stringify(r.body)}`);

    // 2. Released CESS doc (Student 1 -> Checked -> Approved by Dean -> Ready -> Released)
    const releasedDoc = await submitDoc(
      student1.email,
      studentTypeB.doc_type_id,
      `${RUN_TAG} Completed & Released Record`,
      [{ name: 'pb35-release-initial.pdf', sizeKb: 312, type: 'application/pdf' }]
    );
    r = await request('POST', `/api/documents/${releasedDoc.document_id}/check`, {
      email: secretary.email,
      body: { decision: 'complete', nextOffice: 'Department Chairperson', remarks: 'PB-35 verified for Chairperson.' },
    });
    assert.strictEqual(r.status, 200, `Released doc check failed: ${JSON.stringify(r.body)}`);
    r = await request('POST', `/api/documents/${releasedDoc.document_id}/review`, {
      email: chairperson.email,
      body: { action: 'endorse', nextOffice: 'College Dean', remarks: 'PB-35 endorsed to College Dean.' },
    });
    assert.strictEqual(r.status, 200, `Released doc Chair endorse failed: ${JSON.stringify(r.body)}`);
    r = await request('POST', `/api/documents/${releasedDoc.document_id}/review`, {
      email: dean.email,
      body: { action: 'approve', remarks: 'PB-35 final approval granted.' },
    });
    assert.strictEqual(r.status, 200, `Dean approve failed: ${JSON.stringify(r.body)}`);
    r = await request('POST', `/api/documents/${releasedDoc.document_id}/ready`, {
      email: secretary.email,
      body: { remarks: 'Claim at CESS office.' },
    });
    assert.strictEqual(r.status, 200, `Mark ready failed: ${JSON.stringify(r.body)}`);
    r = await request('POST', `/api/documents/${releasedDoc.document_id}/release`, {
      email: secretary.email,
      body: {
        receivedBy: student1.name,
        signedFile: { name: 'pb35-signed-release.pdf', sizeKb: 420, type: 'application/pdf' },
      },
    });
    assert.strictEqual(r.status, 200, `Release failed: ${JSON.stringify(r.body)}`);

    // 3. Rejected CESS doc (Student 1 -> Rejected by Secretary)
    const rejectedDoc = await submitDoc(
      student1.email,
      studentTypeA.doc_type_id,
      `${RUN_TAG} Rejected Record`,
      [{ name: 'pb35-rejected.pdf', sizeKb: 180, type: 'application/pdf' }]
    );
    r = await request('POST', `/api/documents/${rejectedDoc.document_id}/reject`, {
      email: secretary.email,
      body: { reason: 'PB-35 test rejection reason.' },
    });
    assert.strictEqual(r.status, 200, `Reject failed: ${JSON.stringify(r.body)}`);

    // 4. Manually Archived CESS doc (Student 1 -> Archived by Secretary via PB-35 endpoint)
    const toArchiveDoc = await submitDoc(
      student1.email,
      studentTypeB.doc_type_id,
      `${RUN_TAG} Manually Archived Record`,
      [{ name: 'pb35-manual-archive.pdf', sizeKb: 140, type: 'application/pdf' }]
    );
    // Before archiving, non-secretary cannot archive
    const unauthArchiveRes = await request('POST', `/api/documents/${toArchiveDoc.document_id}/archive`, {
      email: chairperson.email,
      body: { remarks: 'Unauthorized archive attempt.' },
    });
    assert.strictEqual(unauthArchiveRes.status, 403, 'Chairperson must be forbidden (403) from archiving documents');

    const secArchiveRes = await request('POST', `/api/documents/${toArchiveDoc.document_id}/archive`, {
      email: secretary.email,
      body: { remarks: 'Filed in permanent PB-35 vault.' },
    });
    assert.strictEqual(secArchiveRes.status, 200, `Secretary archive failed: ${JSON.stringify(secArchiveRes.body)}`);
    assert.strictEqual(secArchiveRes.body.document.current_status, 'Archived');
    assert.strictEqual(secArchiveRes.body.document.isArchived, true);

    // Re-archiving already-archived doc returns 400
    const doubleArchiveRes = await request('POST', `/api/documents/${toArchiveDoc.document_id}/archive`, {
      email: secretary.email,
      body: { remarks: 'Duplicate archive attempt.' },
    });
    assert.strictEqual(doubleArchiveRes.status, 400, 'Archiving an already-archived record should return 400');

    // 5. IDS Faculty Active doc (isolated from CESS student & CESS chair)
    const idsActiveDoc = await submitDoc(
      idsFaculty.email,
      idsType.doc_type_id,
      `${RUN_TAG} IDS Active Faculty Record`,
      [{ name: 'pb35-ids-faculty.pdf', sizeKb: 220, type: 'application/pdf' }]
    );

    console.log('✅ Test records created across Active, Released, Rejected, Archived, and IDS scopes.\n');

    // =========================================================================
    // TEST 1: AC1 — Repository groups records by type/category
    // =========================================================================
    console.log('▶ Test 1: Repository groups records by type/category...');
    const secRepoActive = await request('GET', '/api/documents/repository?view=active&groupBy=type', {
      email: secretary.email,
    });
    assert.strictEqual(secRepoActive.status, 200);
    assert.strictEqual(secRepoActive.body.view, 'active');
    assert.strictEqual(secRepoActive.body.groupBy, 'type');
    assert(Array.isArray(secRepoActive.body.groups), 'groups must be an array');
    assert(Array.isArray(secRepoActive.body.categories), 'categories must be an array');
    assert(secRepoActive.body.groups.length >= 1, 'Expected at least 1 active type group');

    for (const grp of secRepoActive.body.groups) {
      assert.strictEqual(grp.groupBy, 'type');
      assert(grp.label && grp.typeName, 'Group must carry type label/typeName');
      assert.strictEqual(grp.count, grp.documents.length, 'Group count must match documents.length');
      for (const doc of grp.documents) {
        assert.strictEqual(doc.isArchived, false, `Active group doc ${doc.control_number} must have isArchived=false`);
        assert.strictEqual(
          Number(doc.doc_type_id || doc.document_type?.doc_type_id),
          Number(grp.doc_type_id),
          'Every doc inside type group must match that group doc_type_id'
        );
      }
    }

    // Filter by specific docTypeId
    const typeFilteredRepo = await request(
      'GET',
      `/api/documents/repository?view=all&docTypeId=${studentTypeA.doc_type_id}&search=${RUN_TAG}`,
      { email: secretary.email }
    );
    assert.strictEqual(typeFilteredRepo.status, 200);
    assert(
      typeFilteredRepo.body.documents.some((d) => d.document_id === activeDoc.document_id),
      'Type-filtered repository should contain activeDoc'
    );
    assert(
      typeFilteredRepo.body.documents.every(
        (d) => Number(d.doc_type_id || d.document_type?.doc_type_id) === Number(studentTypeA.doc_type_id)
      ),
      'All returned docs must match docTypeId filter'
    );

    // Invalid view or groupBy rejected with 400
    const invalidViewRes = await request('GET', '/api/documents/repository?view=invalid_mode', { email: secretary.email });
    assert.strictEqual(invalidViewRes.status, 400);
    const invalidGroupRes = await request('GET', '/api/documents/repository?groupBy=invalid_dim', { email: secretary.email });
    assert.strictEqual(invalidGroupRes.status, 400);

    // GET /api/documents?groupBy=origin works as well
    const listGroupedRes = await request('GET', `/api/documents?groupBy=origin&search=${RUN_TAG}`, { email: secretary.email });
    assert.strictEqual(listGroupedRes.status, 200);
    assert(Array.isArray(listGroupedRes.body.groups), 'GET /api/documents?groupBy=origin should include groups');
    console.log('  ✅ Type/category grouping & repository filters verified.');

    // =========================================================================
    // TEST 2: AC3 — Active and Archived views are strictly distinct
    // =========================================================================
    console.log('▶ Test 2: Active and Archived views are strictly distinct...');
    const secRepoArchived = await request('GET', '/api/documents/repository?view=archived&groupBy=type', {
      email: secretary.email,
    });
    assert.strictEqual(secRepoArchived.status, 200);
    assert.strictEqual(secRepoArchived.body.view, 'archived');

    const archiveAliasRes = await request('GET', '/api/documents/archive?groupBy=type', {
      email: secretary.email,
    });
    assert.strictEqual(archiveAliasRes.status, 200);
    assert.strictEqual(archiveAliasRes.body.view, 'archived');
    assert.strictEqual(archiveAliasRes.body.documents.length, secRepoArchived.body.documents.length);

    const activeIds = new Set(secRepoActive.body.documents.map((d) => d.document_id));
    const archivedIds = new Set(secRepoArchived.body.documents.map((d) => d.document_id));

    // Zero intersection between active and archived
    for (const id of activeIds) {
      assert(!archivedIds.has(id), `Document ${id} appeared in BOTH active and archived views!`);
    }

    // Active IDs contain activeDoc + idsActiveDoc, NOT released/rejected/archived
    assert(activeIds.has(activeDoc.document_id), 'activeDoc must appear in Active view');
    assert(activeIds.has(idsActiveDoc.document_id), 'idsActiveDoc must appear in Active view');
    assert(!activeIds.has(releasedDoc.document_id), 'releasedDoc must NOT appear in Active view');
    assert(!activeIds.has(rejectedDoc.document_id), 'rejectedDoc must NOT appear in Active view');
    assert(!activeIds.has(toArchiveDoc.document_id), 'manually Archived doc must NOT appear in Active view');

    // Archived IDs contain releasedDoc + rejectedDoc + toArchiveDoc, NOT activeDoc/idsActiveDoc
    assert(archivedIds.has(releasedDoc.document_id), 'releasedDoc must appear in Archived view');
    assert(archivedIds.has(rejectedDoc.document_id), 'rejectedDoc must appear in Archived view');
    assert(archivedIds.has(toArchiveDoc.document_id), 'manually Archived doc must appear in Archived view');
    assert(!archivedIds.has(activeDoc.document_id), 'activeDoc must NOT appear in Archived view');
    assert(!archivedIds.has(idsActiveDoc.document_id), 'idsActiveDoc must NOT appear in Archived view');

    for (const d of secRepoArchived.body.documents) {
      assert.strictEqual(d.isArchived, true, `Archived doc ${d.control_number} must have isArchived=true`);
      assert.strictEqual(d.lifecycleView, 'archived');
    }

    // Also verify /api/documents?view=active vs ?view=archived
    const listActiveRes = await request('GET', `/api/documents?view=active&search=${RUN_TAG}`, { email: student1.email });
    const listArchivedRes = await request('GET', `/api/documents?view=archived&search=${RUN_TAG}`, { email: student1.email });
    assert.strictEqual(listActiveRes.status, 200);
    assert.strictEqual(listArchivedRes.status, 200);
    assert.strictEqual(listActiveRes.body.documents.length, 1);
    assert.strictEqual(listActiveRes.body.documents[0].document_id, activeDoc.document_id);
    assert.strictEqual(listArchivedRes.body.documents.length, 3);
    console.log('  ✅ Strict Active vs Archived separation verified across all endpoints.');

    // =========================================================================
    // TEST 3: AC2 — Record details show metadata, attachments, and history
    // =========================================================================
    console.log('▶ Test 3: Record details show complete metadata, attachments, and history...');
    const releasedDetailRes = await request('GET', `/api/documents/${releasedDoc.document_id}`, {
      email: student1.email,
    });
    assert.strictEqual(releasedDetailRes.status, 200);
    const detail = releasedDetailRes.body.document;
    const meta = releasedDetailRes.body.metadata || detail.metadata;
    const atts = releasedDetailRes.body.attachments || detail.attachments;
    const hist = releasedDetailRes.body.history || detail.history;

    assert(meta && meta.controlNumber === releasedDoc.control_number, 'Metadata must include controlNumber');
    assert(meta.documentType && meta.documentType.type_name === studentTypeB.type_name, 'Metadata must include documentType');
    assert(meta.requester && meta.requester.email === student1.email, 'Metadata must include requester info');
    assert.strictEqual(meta.isArchived, true);
    assert.strictEqual(meta.lifecycleView, 'archived');
    assert(meta.releaseInfo && meta.releaseInfo.receivedBy === student1.name, 'Metadata must include releaseInfo');

    assert(Array.isArray(atts) && atts.length >= 2, `Expected initial + signed attachments (>=2), got ${atts.length}`);
    assert(atts.some((a) => a.file_name === 'pb35-release-initial.pdf'), 'Initial attachment missing');
    assert(atts.some((a) => a.file_name === 'pb35-signed-release.pdf' && a.is_signed_copy === true), 'Signed release attachment missing');

    assert(Array.isArray(hist) && hist.length >= 4, 'Expected chronological history (Submitted, Checked, Approved, Ready, Released)');
    for (let i = 1; i < hist.length; i += 1) {
      const prevTs = new Date(hist[i - 1].action_timestamp || 0).getTime();
      const currTs = new Date(hist[i].action_timestamp || 0).getTime();
      assert(currTs >= prevTs, 'History must be ordered chronologically');
    }
    assert(hist.some((h) => h.action_type === 'Released'), 'History must include Released action');

    const archivedDetailRes = await request('GET', `/api/documents/${toArchiveDoc.document_id}`, {
      email: secretary.email,
    });
    assert.strictEqual(archivedDetailRes.status, 200);
    assert.strictEqual(archivedDetailRes.body.document.archiveInfo?.archivedBy !== undefined, true);
    assert(archivedDetailRes.body.history.some((h) => h.action_type === 'Archived'), 'History must include Archived entry');
    console.log('  ✅ Complete metadata, attachments, and chronological history verified.');

    // =========================================================================
    // TEST 4: AC4 — Server-side permission enforcement
    // =========================================================================
    console.log('▶ Test 4: Enforcing role & ownership permissions...');
    // 4a. Unauthenticated -> 401
    assert.strictEqual((await request('GET', '/api/documents/repository')).status, 401);
    assert.strictEqual((await request('GET', '/api/documents/archive')).status, 401);
    assert.strictEqual((await request('GET', `/api/documents/${activeDoc.document_id}`)).status, 401);
    assert.strictEqual((await request('POST', `/api/documents/${activeDoc.document_id}/archive`)).status, 401);

    // 4b. Student 2 cannot see Student 1 docs in repository or detail
    const s2RepoAll = await request('GET', '/api/documents/repository?view=all&search=PB35', { email: student2.email });
    assert.strictEqual(s2RepoAll.status, 200);
    assert.strictEqual(s2RepoAll.body.documents.length, 0, 'Third-party student must see 0 of Student 1 docs');
    const s2DetailRes = await request('GET', `/api/documents/${activeDoc.document_id}`, { email: student2.email });
    assert.strictEqual(s2DetailRes.status, 403, 'Third-party student must get 403 on Student 1 record detail');

    // 4c. Student 1 cannot open IDS Faculty doc (403) or archive own doc (403)
    assert.strictEqual(
      (await request('GET', `/api/documents/${idsActiveDoc.document_id}`, { email: student1.email })).status,
      403
    );
    assert.strictEqual(
      (await request('POST', `/api/documents/${activeDoc.document_id}/archive`, { email: student1.email })).status,
      403
    );

    // 4d. Participating Chairperson CAN view activeDoc details even after endorsing to Dean,
    //     but CANNOT view unrouted IDS Faculty doc and CANNOT review activeDoc out-of-turn
    const chairDetailRes = await request('GET', `/api/documents/${activeDoc.document_id}`, {
      email: chairperson.email,
    });
    assert.strictEqual(chairDetailRes.status, 200, 'Participating Chairperson should retain read access to endorsed doc');
    assert(
      !chairDetailRes.body.permittedActions.includes('review_document'),
      'Chairperson must NOT hold review_document while Dean is holding the doc'
    );
    assert.strictEqual(
      (await request('GET', `/api/documents/${idsActiveDoc.document_id}`, { email: chairperson.email })).status,
      403,
      'Chairperson must be denied access to unrouted IDS doc'
    );

    // 4e. IDS Principal cannot view Student 1 CESS docs
    assert.strictEqual(
      (await request('GET', `/api/documents/${activeDoc.document_id}`, { email: principal.email })).status,
      403
    );
    assert.strictEqual(
      (await request('GET', `/api/documents/${releasedDoc.document_id}`, { email: principal.email })).status,
      403
    );

    console.log('  ✅ All RBAC & permission boundaries enforced (401/403/role-scoping).');
    console.log('\n🎉 ALL PB-35 CENTRAL REPOSITORY & RECORD DETAILS TESTS PASSED!\n');
  } finally {
    console.log('🧹 Cleaning up temporary PB-35 test records...');
    for (const id of createdDocIds) {
      await DocumentModel.softDelete(id).catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PB-35 TEST SUITE FAILED:', err);
    process.exit(1);
  });

