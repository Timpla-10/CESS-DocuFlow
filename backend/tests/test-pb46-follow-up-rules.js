/**
 * Integration Test Suite for Ticket PB-46 + OpenAPI Swagger Validation:
 * "Configure automated follow-up rules [P1]" (SRS 3.10 REQ-NOT-3)
 *
 * Acceptance Criteria Verified:
 *   1. Authorized admin sets agreed reminder interval and conditions (validation + persistence)
 *   2. Duplicate reminders are controlled (cooldown / stage deduplication prevents spam)
 *   3. User notification preferences are respected ('both', 'email_only', 'in_system_only')
 *   4. Configuration changes are visible to admins (history + before/after audit log)
 *   5. Non-Secretary access strictly rejected (401/403)
 *   6. All PB-42, PB-40, PB-47, PB-46 routes documented in Swagger (/api-docs.json)
 */
const assert = require('assert');
const app = require('../server');
const supabase = require('../config/database');
const mailer = require('../config/mailer');
const DocumentModel = require('../models/documentModel');
const NotificationModel = require('../models/notificationModel');
const FollowUpRuleModel = require('../models/followUpRuleModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const ACCOUNTS = [
  { idNumber: '2023-0142', name: 'Maria Santos', email: 'student@msunaawan.edu.ph', role: 'student', origin: 'CESS', department: 'BSEd English, 3rd Year', position: 'Student' },
  { idNumber: 'EMP-2019-011', name: 'Prof. Ana Lim', email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', department: 'Department of Secondary and Elementary Education', position: 'Assistant Professor' },
  { idNumber: 'CHR-2026-01', name: 'Dr. Liza Fernandez', email: 'chairperson@msunaawan.edu.ph', role: 'chairperson', origin: 'CESS', department: 'Department of Secondary and Elementary Education', position: 'Department Chairperson' },
  { idNumber: 'DEAN-2026-01', name: 'Dr. Ramon Villanueva', email: 'dean@msunaawan.edu.ph', role: 'dean', origin: 'CESS', department: 'College of Education and Social Sciences', position: 'College Dean' },
  { idNumber: 'SEC-2026-01', name: 'Ms. Carmela Ortiz', email: 'secretary@msunaawan.edu.ph', role: 'secretary', origin: 'CESS', department: 'College of Education and Social Sciences', position: 'College Secretary' },
];

async function seedAccounts() {
  for (const acc of ACCOUNTS) {
    const { primary } = getPasswordsForRole(acc.role, acc.origin, acc.email);
    await provisionVerifiedUser({ ...acc, password: primary, accountStatus: 'Active', isWhitelisted: true });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-46 & SWAGGER VALIDATION TESTS');
  console.log('================================================================\n');

  await seedAccounts();
  const chairUser = await UserModel.findByEmail('chairperson@msunaawan.edu.ph');
  const deanUser = await UserModel.findByEmail('dean@msunaawan.edu.ph');
  assert.ok(chairUser?.id && deanUser?.id);

  // Save original notification preferences to restore in finally
  const origChairPref = await NotificationModel.getPreference(chairUser.id);
  const origDeanPref = await NotificationModel.getPreference(deanUser.id);

  const server = app.listen(0);
  const baseUrl = `http://localhost:${server.address().port}/api`;
  const docsUrl = `http://localhost:${server.address().port}/api-docs.json`;

  const origSendMail = mailer.transporter.sendMail.bind(mailer.transporter);
  const origIsConfigured = mailer.isConfigured;

  const createdDocIds = [];
  const sentEmails = [];

  const request = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  const secHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
  const stuHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
  const facHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
  const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
  const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

  try {
    // 1. Authorization & Default Rule Inspection
    console.log('1️⃣  Testing RBAC & Rule Validation...');
    assert.strictEqual((await request('/follow-up-rules')).status, 401);
    for (const hdr of [stuHeaders, facHeaders, chairHeaders, deanHeaders]) {
      assert.strictEqual((await request('/follow-up-rules', { headers: hdr })).status, 403);
      assert.strictEqual((await request('/follow-up-rules', { method: 'PUT', headers: hdr, body: JSON.stringify({ reminderIntervalDays: 2 }) })).status, 403);
      assert.strictEqual((await request('/follow-up-rules/run', { method: 'POST', headers: hdr })).status, 403);
    }

    const defaultRes = await request('/follow-up-rules', { headers: secHeaders });
    assert.strictEqual(defaultRes.status, 200);
    assert.strictEqual(defaultRes.body.rule.reminderIntervalDays, 3, 'Expected default 3-day reminder interval per SRS REQ-NOT-3');

    // Invalid interval/conditions rejected
    assert.strictEqual(
      (await request('/follow-up-rules', { method: 'PUT', headers: secHeaders, body: JSON.stringify({ reminderIntervalDays: 0 }) })).status,
      400
    );
    assert.strictEqual(
      (await request('/follow-up-rules', { method: 'PUT', headers: secHeaders, body: JSON.stringify({ eligibleStatuses: ['Released'] }) })).status,
      400
    );

    // Valid configuration update + Admin History Visibility (AC 1 & AC 4)
    const updRes = await request('/follow-up-rules', {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        reminderIntervalDays: 2,
        cooldownHours: 48,
        maxRemindersPerStage: 2,
        eligibleStatuses: ['Submitted', 'Under_Review'],
        notifyHoldingOffice: true,
        notifyRequester: false,
        notifySecretaryOnOverdue: false,
        reason: 'Accelerate CESS pending reviews from 3 to 2 days.',
      }),
    });
    assert.strictEqual(updRes.status, 200);
    assert.strictEqual(updRes.body.rule.reminderIntervalDays, 2);
    assert.ok(updRes.body.changedFields.includes('reminderIntervalDays'));

    const histRes = await request('/follow-up-rules/history', { headers: secHeaders });
    assert.strictEqual(histRes.status, 200);
    assert.ok(histRes.body.history.length >= 2);
    assert.strictEqual(histRes.body.history[0].before.reminderIntervalDays, 3);
    assert.strictEqual(histRes.body.history[0].after.reminderIntervalDays, 2);
    assert.strictEqual(histRes.body.history[0].reason, 'Accelerate CESS pending reviews from 3 to 2 days.');
    console.log('   ✅ Validation, configuration updates, and admin history verified.\n');

    // 2. Real Pending Document Aging, User Preferences & Duplicate Suppression (AC 2 & AC 3)
    console.log('2️⃣  Testing Reminder Triggering, Preference Enforcement & Duplicate Cooldown...');
    mailer.isConfigured = true;
    mailer.transporter.sendMail = async (mailOptions) => {
      sentEmails.push(mailOptions.to);
      return { messageId: `pb46-mock-${Date.now()}-${sentEmails.length}` };
    };

    // Configure distinct user preferences via real PB-05 API endpoint:
    // Chairperson -> in_system_only (must get In_System log ONLY, zero email)
    // Dean -> email_only (must get Email ONLY, zero In_System log)
    const prefChairRes = await request('/notifications/preferences', {
      method: 'PUT',
      headers: chairHeaders,
      body: JSON.stringify({ preference: 'in_system_only' }),
    });
    assert.strictEqual(prefChairRes.status, 200);

    const prefDeanRes = await request('/notifications/preferences', {
      method: 'PUT',
      headers: deanHeaders,
      body: JSON.stringify({ preference: 'email_only' }),
    });
    assert.strictEqual(prefDeanRes.status, 200);

    // Create Document A: routed to Chairperson, backdated 4 days
    const docARes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: JSON.stringify({
        title: 'PB-46 Aged Chairperson Pending Doc',
        document_type: 'Endorsement Letter',
        description: 'Aged pending request for Chairperson preference test.',
        attachments: [{ name: 'ReqA.pdf', url: '/uploads/reqA.pdf', sizeKb: 90 }],
      }),
    });
    assert.strictEqual(docARes.status, 201);
    const docAId = (docARes.body.document || docARes.body).document_id;
    createdDocIds.push(docAId);

    const routeA = await request(`/documents/${docAId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Verified complete for Chairperson.',
      }),
    });
    assert.strictEqual(routeA.status, 200);

    // Create Document B: routed to Chairperson then endorsed to Dean, backdated 4 days
    const docBRes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: JSON.stringify({
        title: 'PB-46 Aged Dean Pending Doc',
        document_type: 'Endorsement Letter',
        description: 'Aged pending request for Dean email_only preference test.',
        attachments: [{ name: 'ReqB.pdf', url: '/uploads/reqB.pdf', sizeKb: 90 }],
      }),
    });
    assert.strictEqual(docBRes.status, 201);
    const docBId = (docBRes.body.document || docBRes.body).document_id;
    createdDocIds.push(docBId);

    const routeB = await request(`/documents/${docBId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Verified for Chairperson -> Dean test.',
      }),
    });
    assert.strictEqual(routeB.status, 200);

    const endorseB = await request(`/documents/${docBId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'endorse', remarks: 'Endorsed to Dean.' }),
    });
    assert.strictEqual(endorseB.status, 200);

    // Create Document C: Fresh 0-day pending doc (must NOT match 2-day rule)
    const docCRes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: JSON.stringify({
        title: 'PB-46 Fresh Non-Overdue Doc',
        document_type: 'Endorsement Letter',
        description: 'Fresh submission < 1h old.',
        attachments: [{ name: 'ReqC.pdf', url: '/uploads/reqC.pdf', sizeKb: 50 }],
      }),
    });
    assert.strictEqual(docCRes.status, 201);
    const docCId = (docCRes.body.document || docCRes.body).document_id;
    createdDocIds.push(docCId);

    // Create Document D directly with genuine 4-day-old DB timestamp to verify real wall-clock aging without asOf
    const fourDaysAgoIso = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const { data: chairOfficeRow } = await supabase
      .from('office')
      .select('office_id')
      .eq('office_name', 'Department Chairperson')
      .single();
    const studentUser = await UserModel.findByEmail('student@msunaawan.edu.ph');
    const docTypeId = await DocumentModel.getDefaultDocTypeId('CESS');
    const agedDoc = await DocumentModel.create({
      control_number: `MSU-CESS-PB46-${Date.now().toString().slice(-6)}`,
      requester_id: studentUser.id,
      doc_type_id: docTypeId,
      origin: 'CESS',
      title: 'PB-46 Real Wall-Clock 4-Day Aged DB Document',
      description: 'Backdated submitted_at row with zero newer history rows.',
      current_status: 'Under_Review',
      current_office_id: chairOfficeRow.office_id,
      submitted_at: fourDaysAgoIso,
      last_updated_at: fourDaysAgoIso,
    });
    const docAgedDbId = agedDoc.document_id;
    createdDocIds.push(docAgedDbId);

    // Batch 1: Real wall-clock evaluation (docAgedDbId = 4 days old, docCId = 0 days old)
    const realCandRes = await request(`/follow-up-rules/candidates?documentId=${docAgedDbId}`, { headers: secHeaders });
    assert.strictEqual(realCandRes.status, 200);
    assert.strictEqual(realCandRes.body.matchedDocumentsCount, 1);

    const freshCandRes = await request(`/follow-up-rules/candidates?documentId=${docCId}`, { headers: secHeaders });
    assert.strictEqual(freshCandRes.status, 200);
    assert.strictEqual(freshCandRes.body.matchedDocumentsCount, 0, 'Fresh 0-day doc must NOT match 2-day rule!');

    const realWallClockRun = await request('/follow-up-rules/run', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ documentIds: [docAgedDbId, docCId] }),
    });
    assert.strictEqual(realWallClockRun.status, 200);
    assert.strictEqual(realWallClockRun.body.matchedDocumentsCount, 1, 'Only aged DB doc matches under real wall clock!');
    const realAgedDetail = realWallClockRun.body.details.find((d) => d.documentId === docAgedDbId);
    assert.ok(realAgedDetail, 'Aged DB doc missing from run details');
    const chairRealOutcome = realAgedDetail.recipients.find((r) => r.recipientId === chairUser.id);
    assert.ok(chairRealOutcome, 'Canonical Chairperson missing from aged doc recipients');
    assert.strictEqual(chairRealOutcome.preference, 'in_system_only');
    assert.strictEqual(chairRealOutcome.inSystemSent, true, 'Chairperson in_system_only pref receives In_System notice!');
    assert.strictEqual(chairRealOutcome.emailSent, false, 'Chairperson in_system_only pref receives zero email!');
    assert.strictEqual(sentEmails.includes(chairUser.email), false, 'No email may be sent to in_system_only Chairperson!');

    // Immediate duplicate run on docAgedDbId must be suppressed for ALL recipients
    const realDupRun = await request('/follow-up-rules/run', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ documentIds: [docAgedDbId] }),
    });
    assert.strictEqual(realDupRun.status, 200);
    assert.strictEqual(realDupRun.body.sentCount, 0);
    assert.strictEqual(realDupRun.body.skippedDuplicateCount, realAgedDetail.recipients.length);

    // Batch 2: Multi-stage routed lifecycle docs (docA -> Chairperson in_system_only, docB -> Dean email_only) at +4 days
    const fourDaysFutureIso = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const sentBeforeBatch2 = sentEmails.length;

    const run1Res = await request('/follow-up-rules/run', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ documentIds: [docAId, docBId], asOf: fourDaysFutureIso }),
    });
    assert.strictEqual(run1Res.status, 200);
    assert.strictEqual(run1Res.body.matchedDocumentsCount, 2, 'Both aged routed documents (docA & docB) must match!');

    const docADetail = run1Res.body.details.find((d) => d.documentId === docAId);
    const docBDetail = run1Res.body.details.find((d) => d.documentId === docBId);
    assert.ok(docADetail && docBDetail);

    const chairOutcomeA = docADetail.recipients.find((r) => r.recipientId === chairUser.id);
    assert.strictEqual(chairOutcomeA?.preference, 'in_system_only');
    assert.strictEqual(chairOutcomeA?.inSystemSent, true);
    assert.strictEqual(chairOutcomeA?.emailSent, false);

    const deanOutcomeB = docBDetail.recipients.find((r) => r.recipientId === deanUser.id);
    assert.strictEqual(deanOutcomeB?.preference, 'email_only');
    assert.strictEqual(deanOutcomeB?.inSystemSent, false, 'Dean email_only pref must NOT receive In_System notice!');
    assert.strictEqual(deanOutcomeB?.emailSent, true, 'Dean email_only pref must receive Email dispatch!');

    assert.strictEqual(sentEmails.slice(sentBeforeBatch2).includes(deanUser.email), true, 'Dean should receive reminder email');
    assert.strictEqual(sentEmails.slice(sentBeforeBatch2).includes(chairUser.email), false, 'Chairperson is in_system_only and must NOT receive email!');

    // Run evaluation a SECOND time immediately -> duplicate guard MUST block all reminders!
    const expectedSkipped = docADetail.recipients.length + docBDetail.recipients.length;
    const sentBeforeSecondRun = sentEmails.length;
    const run2Res = await request('/follow-up-rules/run', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ documentIds: [docAId, docBId], asOf: fourDaysFutureIso }),
    });
    assert.strictEqual(run2Res.status, 200);
    assert.strictEqual(run2Res.body.sentCount, 0, 'Duplicate run must not resend reminders within cooldown!');
    assert.strictEqual(run2Res.body.skippedDuplicateCount, expectedSkipped, 'All recipients must be skipped as duplicates!');
    assert.strictEqual(sentEmails.length, sentBeforeSecondRun);
    console.log('   ✅ Preferences (in_system_only / email_only), aging cutoff, and duplicate suppression verified.\n');

    // 3. Swagger OpenAPI Specification Verification
    console.log('3️⃣  Verifying Swagger OpenAPI Spec (/api-docs.json) for All 4 PBs...');
    const swaggerJsonRes = await fetch(docsUrl);
    assert.strictEqual(swaggerJsonRes.status, 200);
    const spec = await swaggerJsonRes.json();
    const requiredPaths = [
      '/api/notifications/logs',
      '/api/notifications/logs/{id}',
      '/api/notifications/logs/{id}/retry',
      '/api/directory/template',
      '/api/directory/template/download',
      '/api/directory/template/history',
      '/api/directory/announcements',
      '/api/directory/audit-logs',
      '/api/directory/faculty',
      '/api/directory/faculty/{id}',
      '/api/directory/subjects',
      '/api/directory/subjects/{code}',
      '/api/directory/syllabi/{syllabusId}/history',
      '/api/homepage',
      '/api/homepage/logos',
      '/api/homepage/manage',
      '/api/homepage/publish',
      '/api/homepage/history',
      '/api/follow-up-rules',
      '/api/follow-up-rules/history',
      '/api/follow-up-rules/candidates',
      '/api/follow-up-rules/run',
    ];
    for (const p of requiredPaths) {
      assert.ok(spec.paths[p], `Missing required PB endpoint from Swagger spec: ${p}`);
    }
    console.log(`   ✅ All ${requiredPaths.length} PB-42/PB-40/PB-47/PB-46 endpoints verified in /api-docs.json.\n`);

    console.log('================================================================');
    console.log('🎉 ALL PB-46 & SWAGGER VALIDATION TESTS PASSED!');
    console.log('================================================================');
  } finally {
    mailer.transporter.sendMail = origSendMail;
    mailer.isConfigured = origIsConfigured;
    FollowUpRuleModel.resetToDefaults();
    await NotificationModel.updatePreference(chairUser.id, { preference: origChairPref.preference }).catch(() => null);
    await NotificationModel.updatePreference(deanUser.id, { preference: origDeanPref.preference }).catch(() => null);
    for (const docId of createdDocIds) {
      await supabase.from('notification_log').delete().eq('document_id', docId);
      await DocumentModel.softDelete(docId);
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ PB-46 TEST FAILED:', err);
  process.exit(1);
});

