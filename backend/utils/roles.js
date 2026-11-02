/**
 * PB-02: Role definitions, DB enum mappings (matching supabase/supabase_schema.sql),
 * office mappings, and role-based access rules.
 */

const ROLES = {
  STUDENT: 'student',
  FACULTY: 'faculty',
  SECRETARY: 'secretary',
  CHAIRPERSON: 'chairperson',
  IDS_PRINCIPAL: 'ids_principal',
  DEAN: 'dean',
  OVCAA: 'ovcaa',
  VCAF: 'vcaf',
  CHANCELLOR: 'chancellor',
};

const ALL_ROLES = Object.values(ROLES);
const REQUESTER_ROLES = [ROLES.STUDENT, ROLES.FACULTY];
const REVIEWER_ROLES = [
  ROLES.CHAIRPERSON,
  ROLES.IDS_PRINCIPAL,
  ROLES.DEAN,
  ROLES.OVCAA,
  ROLES.VCAF,
  ROLES.CHANCELLOR,
];

/** Maps app role + origin to supabase_schema.sql `user_role_name` enum */
function toDbRoleName(role, origin = 'CESS') {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'student') return 'Student';
  if (normalized === 'faculty' || normalized === 'cess_faculty') {
    return origin === 'IDS' ? 'IDS_Faculty' : 'CESS_Faculty';
  }
  if (normalized === 'ids_faculty') return 'IDS_Faculty';
  if (normalized === 'ids_principal') return 'IDS_Principal';
  if (normalized === 'chairperson' || normalized === 'dept_chairperson') return 'Dept_Chairperson';
  if (normalized === 'dean' || normalized === 'college_dean') return 'College_Dean';
  if (normalized === 'ovcaa') return 'OVCAA';
  if (normalized === 'vcaf') return 'VCAF';
  if (normalized === 'chancellor') return 'Chancellor';
  if (normalized === 'secretary' || normalized === 'college_secretary_admin') {
    return 'College_Secretary_Admin';
  }
  return 'Student';
}

/** Maps supabase_schema.sql `user_role_name` enum back to frontend/API `{ role, origin, roleLabel }` */
function fromDbRoleName(dbRoleName) {
  switch (dbRoleName) {
    case 'Student':
      return { role: 'student', origin: 'CESS', roleLabel: 'Student' };
    case 'CESS_Faculty':
      return { role: 'faculty', origin: 'CESS', roleLabel: 'CESS Faculty' };
    case 'IDS_Faculty':
      return { role: 'faculty', origin: 'IDS', roleLabel: 'IDS Faculty' };
    case 'IDS_Principal':
      return { role: 'ids_principal', origin: 'IDS', roleLabel: 'IDS Principal' };
    case 'Dept_Chairperson':
      return { role: 'chairperson', origin: 'CESS', roleLabel: 'Department Chairperson' };
    case 'College_Dean':
      return { role: 'dean', origin: 'CESS', roleLabel: 'College Dean' };
    case 'OVCAA':
      return { role: 'ovcaa', origin: 'CESS', roleLabel: 'OVCAA' };
    case 'VCAF':
      return { role: 'vcaf', origin: 'CESS', roleLabel: 'VCAF' };
    case 'Chancellor':
      return { role: 'chancellor', origin: 'CESS', roleLabel: 'Chancellor' };
    case 'College_Secretary_Admin':
      return { role: 'secretary', origin: 'CESS', roleLabel: 'College Secretary' };
    default:
      return { role: 'student', origin: 'CESS', roleLabel: 'Student' };
  }
}

/** Maps a role to its `office_name` in the `Office` table */
const ROLE_TO_OFFICE_NAME = {
  secretary: 'College Secretary',
  chairperson: 'Department Chairperson',
  ids_principal: 'IDS Principal',
  dean: 'College Dean',
  ovcaa: 'OVCAA',
  vcaf: 'VCAF',
  chancellor: 'Office of the Chancellor',
};

const ROLE_OFFICE = {
  secretary: 'secretary',
  chairperson: 'chairperson',
  ids_principal: 'ids_principal',
  dean: 'dean',
  ovcaa: 'ovcaa',
  vcaf: 'vcaf',
  chancellor: 'chancellor',
};

function getRoleLabel(role, origin) {
  if (role === ROLES.FACULTY) {
    return origin === 'IDS' ? 'IDS Faculty' : 'CESS Faculty';
  }
  const labels = {
    student: 'Student',
    secretary: 'College Secretary',
    chairperson: 'Department Chairperson',
    ids_principal: 'IDS Principal',
    dean: 'College Dean',
    ovcaa: 'OVCAA',
    vcaf: 'VCAF',
    chancellor: 'Chancellor',
  };
  return labels[role] || role;
}

function isInstitutionalEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^@\s]+@msunaawan\.edu\.ph$/i.test(email.trim());
}

/**
 * PB-02 Acceptance Criteria:
 * - Secretary sees all records
 * - Requester sees own requests
 * - Reviewers see routed records
 */
function canViewDocument(user, doc) {
  if (!user || !doc) return false;

  if (user.role === ROLES.SECRETARY) {
    return true;
  }

  const requesterId = doc.requester_id || doc.requesterId;
  if (requesterId === user.id) {
    return true;
  }

  // Reviewer check by office_id or office_name
  if (user.officeIds && Array.isArray(user.officeIds) && doc.current_office_id) {
    if (user.officeIds.includes(doc.current_office_id)) return true;
  }

  const expectedOfficeName = ROLE_TO_OFFICE_NAME[user.role];
  if (expectedOfficeName && doc.office?.office_name === expectedOfficeName) {
    return true;
  }

  return false;
}

/**
 * PB-02 Acceptance Criteria:
 * Restricted actions are denied based on role and document state.
 */
function canPerformAction(user, action, doc = null) {
  if (!user || !user.active) return false;

  switch (action) {
    case 'manage_users':
    case 'manage_whitelist':
    case 'verify_registration':
    case 'check_requirements':
    case 'manage_requirements':
    case 'send_external':
    case 'mark_ready':
    case 'release_document':
    case 'encode_walk_in':
      return user.role === ROLES.SECRETARY;

    case 'submit_document':
      return REQUESTER_ROLES.includes(user.role);

    case 'resubmit_document': {
      if (!REQUESTER_ROLES.includes(user.role)) return false;
      if (!doc) return true;
      const requesterId = doc.requester_id || doc.requesterId;
      return REQUESTER_ROLES.includes(user.role) && requesterId === user.id;
    }

    case 'review_document': {
      if (!REVIEWER_ROLES.includes(user.role)) return false;
      if (!doc) return true;
      const requesterId = doc.requester_id || doc.requesterId;
      if (requesterId === user.id) return false;
      return canViewDocument(user, doc);
    }

    default:
      return false;
  }
}

module.exports = {
  ROLES,
  ALL_ROLES,
  REQUESTER_ROLES,
  REVIEWER_ROLES,
  ROLE_OFFICE,
  ROLE_TO_OFFICE_NAME,
  toDbRoleName,
  fromDbRoleName,
  getRoleLabel,
  isInstitutionalEmail,
  canViewDocument,
  canPerformAction,
};
