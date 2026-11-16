/**
 * Integration Test Suite for Ticket PB-47:
 * "Maintain homepage and college information [P2]" (SRS 2.2, 3.13 REQ-INFO-1)
 *
 * Acceptance Criteria Verified:
 *   1. Approved information and logos display correctly (publicly accessible without login)
 *   2. Only authorized Secretary can update homepage copy, office info, and logos
 *   3. Restricted data (drafts, internal notes, users/emails/passwords/SMTP/faculty-only notices) is NEVER exposed
 */
const assert = require('assert');
const app = require('../server');
const HomepageModel = require('../models/homepageModel');
const DirectoryModel = require('../models/directoryModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const ACCOUNTS = [
  { idNumber: '2023-0142', name: 'Maria Santos', email: 'student@msunaawan.edu.ph', role: 'student', origin: 'CESS', department: 'BSEd English, 3rd Year', position: 'Student' },
  { idNumber: 'EMP-2019-011', name: 'Prof. Ana Lim', email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', department: 'Department of Secondary and Elementary Education', position: 'Assistant Professor' },
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
  console.log('🧪 RUNNING PB-47 TESTS: HOMEPAGE & COLLEGE INFORMATION');
  console.log('================================================================\n');

  await seedAccounts();
  const server = app.listen(0);
  const baseUrl = `http://localhost:${server.address().port}/api`;
  const createdAnnouncementIds = [];

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
  const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

  try {
    // 1. Public visibility of approved information & logos (AC 1)
    console.log('1️⃣  Testing Public Homepage & Official Logos Accessibility...');
    const pubHome = await request('/homepage');
    assert.strictEqual(pubHome.status, 200);
    assert.strictEqual(pubHome.body.homepage.approvalStatus, 'Approved');
    assert.ok(pubHome.body.homepage.collegeName.includes('CESS'));
    assert.ok(pubHome.body.homepage.logos.universityLogo?.url);
    assert.ok(pubHome.body.homepage.logos.collegeLogo?.url);

    const pubLogos = await request('/homepage/logos');
    assert.strictEqual(pubLogos.status, 200);
    assert.strictEqual(pubLogos.body.approvalStatus, 'Approved');
    assert.ok(pubLogos.body.activeCount >= 2);
    console.log('   ✅ Public endpoints render approved college info & logos cleanly without login.\n');

    // 2. Authorization boundaries (AC 2)
    console.log('2️⃣  Testing Secretary-Only Update & Management Controls...');
    assert.strictEqual((await request('/homepage/manage')).status, 401);
    assert.strictEqual((await request('/homepage', { method: 'PUT', body: JSON.stringify({ tagline: 'Unauth' }) })).status, 401);
    for (const hdr of [stuHeaders, facHeaders, deanHeaders]) {
      assert.strictEqual((await request('/homepage/manage', { headers: hdr })).status, 403);
      assert.strictEqual((await request('/homepage/history', { headers: hdr })).status, 403);
      assert.strictEqual(
        (await request('/homepage', { method: 'PUT', headers: hdr, body: JSON.stringify({ tagline: 'Unauthorized' }) })).status,
        403
      );
      assert.strictEqual(
        (await request('/homepage/logos', {
          method: 'PUT',
          headers: hdr,
          body: JSON.stringify({ collegeLogo: { name: 'Bad', url: '/bad.png' } }),
        })).status,
        403
      );
    }
    console.log('   ✅ Non-Secretary users strictly blocked (401/403).\n');

    // 3. Draft staging vs Approved publication + Logo validation + Restricted Data Protection (AC 1, 2, 3)
    console.log('3️⃣  Testing Approved vs Draft Isolation, Logo Updates & Restricted Data Guard...');
    const secretDraftMarker = 'INTERNAL_UNAPPROVED_DRAFT_ONLY_99';
    const restrictedSecret = 'SECRET_INTERNAL_STAFF_PASSWORD_XYZ';

    // Stage draft (publish: false) + inject restricted keys that must NEVER reach public view
    const stageRes = await request('/homepage', {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        tagline: secretDraftMarker,
        publish: false,
        internalNotes: restrictedSecret,
        users: ['leaked@msunaawan.edu.ph'],
        password: restrictedSecret,
        smtp: restrictedSecret,
        reason: 'Drafting new AY slogan pending Dean signoff.',
      }),
    });
    assert.strictEqual(stageRes.status, 200);
    assert.strictEqual(stageRes.body.published, false);

    // Public view must NOT show unapproved draft or restricted fields
    const pubWhileDraft = await request('/homepage');
    assert.strictEqual(pubWhileDraft.status, 200);
    const pubJson = JSON.stringify(pubWhileDraft.body);
    assert.strictEqual(pubJson.includes(secretDraftMarker), false, 'Unapproved draft leaked to public /api/homepage!');
    assert.strictEqual(pubJson.includes(restrictedSecret), false, 'Restricted payload leaked to public /api/homepage!');
    assert.strictEqual(pubWhileDraft.body.homepage.draft, undefined);
    assert.strictEqual(pubWhileDraft.body.homepage.internalNotes, undefined);

    // Seed an unpublished announcement and a Faculty-only announcement -> must NOT appear on public homepage
    const facOnlyAnn = await DirectoryModel.createAnnouncement({
      title: 'FACULTY_PRIVATE_MEETING_NOTICE',
      content: 'Internal faculty deliberation agenda.',
      targetAudience: 'Faculty',
      isPublished: true,
    });
    createdAnnouncementIds.push(facOnlyAnn.announcement_id);

    const draftAnn = await DirectoryModel.createAnnouncement({
      title: 'UNPUBLISHED_SECRET_NOTICE',
      content: 'Should not appear on public page.',
      targetAudience: 'All',
      isPublished: false,
    });
    createdAnnouncementIds.push(draftAnn.announcement_id);

    const pubCheckAnnouncements = JSON.stringify(await request('/homepage'));
    assert.strictEqual(pubCheckAnnouncements.includes('FACULTY_PRIVATE_MEETING_NOTICE'), false, 'Faculty-only announcement leaked publicly!');
    assert.strictEqual(pubCheckAnnouncements.includes('UNPUBLISHED_SECRET_NOTICE'), false, 'Unpublished announcement leaked publicly!');

    // Now approve & publish draft
    const publishRes = await request('/homepage/publish', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ reason: 'Approved by Dean and Secretary.' }),
    });
    assert.strictEqual(publishRes.status, 200);
    assert.strictEqual(publishRes.body.homepage.tagline, secretDraftMarker);

    // Reject unsafe XSS javascript: logo URL
    const xssLogoRes = await request('/homepage/logos', {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        collegeLogo: { name: 'Bad Logo', url: 'javascript:alert(1)' },
      }),
    });
    assert.strictEqual(xssLogoRes.status, 400);

    // Valid logo update reflects cleanly on /api/homepage/logos
    const logoUpdRes = await request('/homepage/logos', {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        collegeLogo: {
          id: 'logo-cess-v2',
          name: 'CESS Centennial Emblem',
          url: '/assets/logos/cess-centennial.png',
          altText: 'CESS Centennial Emblem',
          isApproved: true,
          isActive: true,
        },
      }),
    });
    assert.strictEqual(logoUpdRes.status, 200);

    const latestLogos = await request('/homepage/logos');
    assert.strictEqual(latestLogos.body.collegeLogo.url, '/assets/logos/cess-centennial.png');

    // Traceable history available only to Secretary
    const histRes = await request('/homepage/history', { headers: secHeaders });
    assert.strictEqual(histRes.status, 200);
    assert.ok(histRes.body.history.length >= 4);
    console.log('   ✅ Approved vs draft separation, logo XSS guard, and restricted-data stripping verified.\n');

    console.log('================================================================');
    console.log('🎉 ALL PB-47 TESTS PASSED!');
    console.log('================================================================');
  } finally {
    HomepageModel.resetToDefaults();
    await DirectoryModel.cleanupTestRecords({ announcementIds: createdAnnouncementIds }).catch(() => null);
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ PB-47 TEST FAILED:', err);
  process.exit(1);
});

