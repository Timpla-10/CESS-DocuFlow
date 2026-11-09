/**
 * Integration Test Suite for Ticket PB-06:
 * "In-system notification center [P1]" (SRS 3.10; Epic E4)
 *
 * User Story:
 *   As a user, I want to view notifications inside the system.
 *
 * Acceptance Criteria:
 *   1. Users see intended notifications with event and related request where applicable
 *   2. Read/unread state is clear (badge counter & mark-as-read behavior)
 *   3. Other users' notifications are hidden (strict privacy isolation)
 *   4. PO Note: Add mark-read, clear and retention behavior
 */
const assert = require('assert');
const app = require('../server');
const supabase = require('../config/database');
const NotificationModel = require('../models/notificationModel');
const { getPasswordsForRole, provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = {
  student: {
    idNumber: 'STU-2026-PB06',
    name: 'Maria Santos (PB06 Student)',
    email: 'student.pb06@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    position: 'Student',
  },
  faculty: {
    idNumber: 'FAC-2026-PB06',
    name: 'Prof. Juan Dela Cruz (PB06 Faculty)',
    email: 'faculty.pb06@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Secondary Education',
    position: 'Faculty',
  },
  secretary: {
    idNumber: 'SEC-2026-PB06',
    name: 'Ms. Carmela Ortiz (PB06 Secretary)',
    email: 'secretary.pb06@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
};

let userIds = {};

async function seedTestAccounts() {
  for (const [key, acc] of Object.entries(TEST_USERS)) {
    const { primary } = getPasswordsForRole(acc.role, acc.origin, acc.email);
    const user = await provisionVerifiedUser({
      idNumber: acc.idNumber,
      email: acc.email,
      password: primary,
      name: acc.name,
      role: acc.role,
      origin: acc.origin,
      department: acc.department,
      position: acc.position,
      accountStatus: 'Active',
      isWhitelisted: true,
    });
    userIds[key] = user.id;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-06 INTEGRATION TESTS: IN-SYSTEM NOTIFICATION CENTER');
  console.log('================================================================\n');

  await seedTestAccounts();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  // Reset in-memory cache for clean test run
  NotificationModel.clearCache();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

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

    const studentHeaders = { 'x-user-email': TEST_USERS.student.email };
    const facultyHeaders = { 'x-user-email': TEST_USERS.faculty.email };
    const secHeaders = { 'x-user-email': TEST_USERS.secretary.email };

    // -------------------------------------------------------------
    // Setup: Create a real test document request for relatedRequest
    // -------------------------------------------------------------
    const docSubmitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1, // INC Form
        title: 'Completion of Incomplete Grade (ENG 201)',
        description: 'Submitting signed completion slip for 1st sem INC.',
        files: [{ name: 'INC_Form_PB06.pdf', size: 1024, type: 'application/pdf' }],
      }),
    });
    assert.strictEqual(docSubmitRes.status, 201, 'Document submission should succeed');
    const testDoc = docSubmitRes.body.document || docSubmitRes.body;
    const testDocId = testDoc.id || testDoc.document_id || testDoc.documentId;
    const testControlNumber = testDoc.control_number || testDoc.trackingNumber || testDoc.controlNumber;
    assert(testDocId, 'testDocId must be present');

    // Allow background submission confirmation email dispatch to settle cleanly
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // -------------------------------------------------------------
    // Test Case 1: In-System Notification with Related Request Details (AC 1)
    // -------------------------------------------------------------
    console.log('1️⃣  Testing In-System Notification with Related Request Details (AC 1)...');
    // Create two test in-system notifications for student
    const notif1 = await NotificationModel.createLog({
      recipientId: userIds.student,
      documentId: testDocId,
      notificationType: 'Status_Update',
      deliveryMethod: 'Both',
      title: 'Document Verified and Routed',
      message: `Your document ${testControlNumber} has been verified and routed to Department Chairperson.`,
    });

    const notif2 = await NotificationModel.createLog({
      recipientId: userIds.student,
      documentId: testDocId,
      notificationType: 'Return_Alert',
      deliveryMethod: 'Both',
      title: '[Action Required] Request Returned for Revision',
      message: `Your request (${testControlNumber}) was returned for revision by Chairperson. Reason: Missing grade slip.`,
    });

    const listRes = await request('/notifications', {
      method: 'GET',
      headers: studentHeaders,
    });

    assert.strictEqual(listRes.status, 200, 'GET /notifications must return 200 OK');
    assert(listRes.body.notifications.length >= 2, 'Must return at least 2 notifications for student');

    const matchedNotif = listRes.body.notifications.find((n) => n.notification_id === notif2.notification_id);
    assert(matchedNotif, 'Created return alert notification must be in list');
    assert.strictEqual(matchedNotif.title, '[Action Required] Request Returned for Revision');
    assert.strictEqual(matchedNotif.is_read, false, 'Default notification state must be unread (false)');

    // AC 1 Verification: relatedRequest must be enriched with document details
    assert(matchedNotif.relatedRequest, 'Notification must contain relatedRequest object');
    assert.strictEqual(matchedNotif.relatedRequest.documentId, testDocId, 'relatedRequest.documentId must match test document');
    assert.strictEqual(matchedNotif.relatedRequest.controlNumber, testControlNumber, 'relatedRequest.controlNumber must match');
    assert(matchedNotif.relatedRequest.title.includes('ENG 201'), 'relatedRequest.title must contain document title');
    console.log(`   ✅ Notification retrieved with enriched relatedRequest: Control No [${testControlNumber}]`);

    // -------------------------------------------------------------
    // Test Case 2: Unread Count Badge Endpoint (AC 2)
    // -------------------------------------------------------------
    console.log('\n2️⃣  Testing Unread Count Endpoint for Navigation Badge (AC 2)...');
    const unreadCountRes = await request('/notifications/unread-count', {
      method: 'GET',
      headers: studentHeaders,
    });

    assert.strictEqual(unreadCountRes.status, 200, 'GET /notifications/unread-count must return 200 OK');
    assert(typeof unreadCountRes.body.unreadCount === 'number', 'unreadCount must be a number');
    assert(unreadCountRes.body.unreadCount >= 2, 'unreadCount must be at least 2');
    console.log(`   ✅ Navigation badge unreadCount accurate: ${unreadCountRes.body.unreadCount}`);

    // -------------------------------------------------------------
    // Test Case 3: Mark Single Notification As Read (AC 2 & PO Note)
    // -------------------------------------------------------------
    console.log('\n3️⃣  Testing Mark Single Notification As Read (PATCH /api/notifications/:id/read)...');
    const initialUnreadCount = unreadCountRes.body.unreadCount;

    const markReadRes = await request(`/notifications/${notif1.notification_id}/read`, {
      method: 'PATCH',
      headers: studentHeaders,
    });

    assert.strictEqual(markReadRes.status, 200, 'PATCH /notifications/:id/read must return 200 OK');
    assert.strictEqual(markReadRes.body.notification.is_read, true, 'is_read must now be true');
    assert.strictEqual(markReadRes.body.unreadCount, initialUnreadCount - 1, 'unreadCount must be decremented by 1');

    // Query with ?unread=true to verify it is filtered out
    const unreadOnlyRes = await request('/notifications?unread=true', {
      method: 'GET',
      headers: studentHeaders,
    });
    const stillInUnread = unreadOnlyRes.body.notifications.some((n) => n.notification_id === notif1.notification_id);
    assert.strictEqual(stillInUnread, false, 'Read notification must not appear in unread-only list');
    console.log('   ✅ Single notification marked as read; unread count decremented and unread filter verified.');

    // -------------------------------------------------------------
    // Test Case 4: Mark All Notifications As Read (AC 2 & PO Note)
    // -------------------------------------------------------------
    console.log('\n4️⃣  Testing Mark All Notifications As Read (POST /api/notifications/mark-all-read)...');
    const markAllRes = await request('/notifications/mark-all-read', {
      method: 'POST',
      headers: studentHeaders,
    });

    assert.strictEqual(markAllRes.status, 200, 'POST /notifications/mark-all-read must return 200 OK');
    assert.strictEqual(markAllRes.body.success, true, 'Body must indicate success');
    assert.strictEqual(markAllRes.body.unreadCount, 0, 'unreadCount must be 0 after mark-all-read');

    const postMarkAllBadgeRes = await request('/notifications/unread-count', {
      method: 'GET',
      headers: studentHeaders,
    });
    assert.strictEqual(postMarkAllBadgeRes.body.unreadCount, 0, 'Badge counter must now be 0');
    console.log('   ✅ All notifications marked as read; badge counter updated to 0.');

    // -------------------------------------------------------------
    // Test Case 5: Strict Privacy Isolation (AC 3)
    // -------------------------------------------------------------
    console.log('\n5️⃣  Testing Strict Privacy Isolation — Other Users Notifications Hidden (AC 3)...');
    // Create a distinct notification for faculty
    const facultyNotif = await NotificationModel.createLog({
      recipientId: userIds.faculty,
      documentId: null,
      notificationType: 'Notice_Minutes_Alert',
      deliveryMethod: 'Both',
      title: 'College Assembly Minutes Available',
      message: 'Minutes for CESS College Faculty Meeting are now available.',
    });

    // Faculty queries notifications
    const facultyListRes = await request('/notifications', {
      method: 'GET',
      headers: facultyHeaders,
    });
    const seesStudentNotif = facultyListRes.body.notifications.some((n) => n.notification_id === notif2.notification_id);
    assert.strictEqual(seesStudentNotif, false, 'Faculty must NEVER see student notifications (AC 3)');

    // Faculty attempts to mark student's notification as read
    const crossUserReadRes = await request(`/notifications/${notif2.notification_id}/read`, {
      method: 'PATCH',
      headers: facultyHeaders,
    });
    assert.strictEqual(crossUserReadRes.status, 403, 'Cross-user mark-read must be denied with 403 Forbidden');
    assert(
      crossUserReadRes.body.error.toLowerCase().includes('forbidden'),
      'Error message must indicate forbidden access'
    );

    // Faculty attempts to delete/clear student's notification
    const crossUserClearRes = await request(`/notifications/${notif2.notification_id}`, {
      method: 'DELETE',
      headers: facultyHeaders,
    });
    assert.strictEqual(crossUserClearRes.status, 403, 'Cross-user delete must be denied with 403 Forbidden');
    console.log('   ✅ Privacy enforced: user B cannot view, mark-as-read, or clear user A notifications (403 Forbidden).');

    // -------------------------------------------------------------
    // Test Case 6: Clear Single Notification from Inbox (PO Note)
    // -------------------------------------------------------------
    console.log('\n6️⃣  Testing Clear Single Notification from Inbox (DELETE /api/notifications/:id)...');
    const clearRes = await request(`/notifications/${notif1.notification_id}`, {
      method: 'DELETE',
      headers: studentHeaders,
    });

    assert.strictEqual(clearRes.status, 200, 'DELETE /notifications/:id must return 200 OK');
    assert.strictEqual(clearRes.body.success, true, 'Body must indicate success');

    // Verify it is no longer returned in student's inbox
    const postClearListRes = await request('/notifications', {
      method: 'GET',
      headers: studentHeaders,
    });
    const stillInList = postClearListRes.body.notifications.some((n) => n.notification_id === notif1.notification_id);
    assert.strictEqual(stillInList, false, 'Cleared notification must be removed from student active inbox');
    console.log('   ✅ Single notification cleared successfully from user inbox view.');

    // -------------------------------------------------------------
    // Test Case 7: Clear All Read Notifications from Inbox (PO Note)
    // -------------------------------------------------------------
    console.log('\n7️⃣  Testing Clear All Read Notifications (DELETE /api/notifications/clear-read)...');
    const clearReadRes = await request('/notifications/clear-read', {
      method: 'DELETE',
      headers: studentHeaders,
    });

    assert.strictEqual(clearReadRes.status, 200, 'DELETE /notifications/clear-read must return 200 OK');
    assert.strictEqual(clearReadRes.body.success, true, 'Body must indicate success');
    assert(clearReadRes.body.clearedCount >= 1, 'clearedCount must be at least 1');

    // Verify inbox is now clean of read items
    const postClearReadListRes = await request('/notifications', {
      method: 'GET',
      headers: studentHeaders,
    });
    const anyReadRemaining = postClearReadListRes.body.notifications.some((n) => n.is_read === true);
    assert.strictEqual(anyReadRemaining, false, 'No read notifications should remain in active inbox');
    console.log(`   ✅ Clear all read notifications succeeded (cleared: ${clearReadRes.body.clearedCount} items).`);

    // -------------------------------------------------------------
    // Test Case 8: Administrative Audit Retention (PO Note & PB-42/PB-48)
    // -------------------------------------------------------------
    console.log('\n8️⃣  Testing Administrative Audit Trail Retention (PB-42 & PB-48 compliance)...');
    // Secretary queries system-wide logs
    const secLogsRes = await request('/notifications/logs', {
      method: 'GET',
      headers: secHeaders,
    });

    assert.strictEqual(secLogsRes.status, 200, 'Secretary GET /notifications/logs must return 200 OK');
    assert(secLogsRes.body.total > 0, 'Total audit logs must be greater than 0');

    // Verify that the notification cleared by student STILL exists in master audit log
    const auditRecord = secLogsRes.body.logs.find((l) => l.notification_id === notif1.notification_id);
    assert(auditRecord, 'Cleared notification must remain permanently preserved in Secretary audit log');
    assert.strictEqual(auditRecord.recipient_id, userIds.student, 'Audit record recipient must be preserved');
    assert.strictEqual(auditRecord.document_id, testDocId, 'Audit record document linkage must be preserved');
    console.log('   ✅ Master compliance audit log retains historical notifications with zero data destruction.');

    console.log('\n================================================================');
    console.log('🎉 ALL 8 PB-06 IN-SYSTEM NOTIFICATION CENTER TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-06 Test suite failed with error:', err);
  process.exit(1);
});
