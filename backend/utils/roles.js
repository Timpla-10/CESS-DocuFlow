/**
 * PB-02 & PB-24: Role definitions, DB enum mappings (matching supabase/supabase_schema.sql),
 * office mappings, role-based access rules, and office-permitted actions.
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

/**
 * PB-24: Final approval authority remains strictly with designated personnel
 * (College Dean for college-level requests, Chancellor for higher university-level requests).
 * Intermediate reviewers (Chairperson, IDS Principal, OVCAA, VCAF) may only endorse, return, or reject.
 */
const FINAL_APPROVAL_ROLES = [ROLES.DEAN, ROLES.CHANCELLOR];
const ENDORSE_ONLY_REVIEWER_ROLES = [
  ROLES.CHAIRPERSON,
  ROLES.IDS_PRINCIPAL,
  ROLES.OVCAA,
  ROLES.VCAF,
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

/**
 * PB-25: Approved standard review sequences by origin (SRS 3.5 REQ-ROUTE-2, REQ-ROUTE-3 & Appendix B)
 */
const CESS_BASE_ROUTE = [
  'College Secretary',
  'Department Chairperson',
  'College Dean',
  'College Secretary',
];

const IDS_BASE_ROUTE = [
  'College Secretary',
  'Department Chairperson',
  'IDS Principal',
  'College Dean',
  'College Secretary',
];

const HIGHER_APPROVAL_OFFICES = [
  'OVCAA',
  'Office of the Chancellor',
];

let WorkflowRouteModel = null;
function getWorkflowRouteModel() {
  if (!WorkflowRouteModel) {
    try {
      WorkflowRouteModel = require('../models/workflowRouteModel');
    } catch (e) {
      // Lazy load fallback
    }
  }
  return WorkflowRouteModel;
}

/**
 * Returns the approved route array of office names based on origin and requester role.
 * Includes the self-submission exception where IDS Principal requests bypass Principal review.
 * PB-45: Supports document snapshot routes and dynamically configured active routes.
 */
function getApprovedRoute(origin = 'CESS', docType = null, requesterRole = null, doc = null) {
  const model = getWorkflowRouteModel();
  if (model) {
    if (doc) {
      return model.getRouteForDocument(doc, requesterRole);
    }
    return model.getActiveRoute(origin, docType, requesterRole);
  }

  const normOrigin = String(origin || 'CESS').toUpperCase();
  if (normOrigin === 'IDS') {
    if (requesterRole === ROLES.IDS_PRINCIPAL) {
      return [...CESS_BASE_ROUTE]; // Self-submission exception: Principal cannot review own request
    }
    return [...IDS_BASE_ROUTE];
  }
  return [...CESS_BASE_ROUTE];
}

/**
 * PB-24, PB-25 & PB-45: Resolves the default next office in the routing chain when an office endorses a document.
 */
function getDefaultNextOfficeForEndorsement(role, origin = 'CESS', requesterRole = null, action = 'endorse', doc = null) {
  if (action === 'approve') {
    return 'College Secretary';
  }

  const model = getWorkflowRouteModel();
  if (model && doc) {
    const route = model.getRouteForDocument(doc, requesterRole);
    const actorOffice = ROLE_TO_OFFICE_NAME[role];
    if (actorOffice && route && route.length > 0) {
      const idx = route.findIndex((o) => o === actorOffice);
      if (idx !== -1 && idx + 1 < route.length) {
        return route[idx + 1];
      }
    }
  }

  switch (role) {
    case ROLES.SECRETARY:
      return 'Department Chairperson';
    case ROLES.CHAIRPERSON:
      if (origin === 'IDS') {
        return requesterRole === ROLES.IDS_PRINCIPAL ? 'College Dean' : 'IDS Principal';
      }
      return 'College Dean';
    case ROLES.IDS_PRINCIPAL:
      return 'College Dean';
    case ROLES.DEAN:
      return action === 'approve' ? 'College Secretary' : 'OVCAA';
    case ROLES.OVCAA:
    case ROLES.VCAF:
      return 'Office of the Chancellor';
    case ROLES.CHANCELLOR:
      return 'College Secretary';
    default:
      return 'College Secretary';
  }
}

/**
 * PB-25 / SRS 3.5 (REQ-ROUTE-1..8): Validate route transitions and block invalid transitions
 */
function validateRouteTransition(doc, actorRole, action, targetOfficeName, requesterRole = null) {
  if (!doc) {
    return { valid: false, status: 400, error: 'Document record is required for route validation.' };
  }

  const normAction = String(action || '').toLowerCase();
  const origin = String(doc.origin || 'CESS').toUpperCase();
  const assignedRoute = getApprovedRoute(origin, doc?.doc_type_id, requesterRole, doc);

  // Returns and rejections halt forwarding or transition to terminal states; no next office handoff.
  if (normAction === 'return' || normAction === 'reject') {
    return { valid: true, targetOffice: null };
  }

  // Completeness check stage (status: 'Submitted')
  if (doc.current_status === 'Submitted') {
    if (actorRole !== ROLES.SECRETARY) {
      return {
        valid: false,
        status: 403,
        error: 'Forbidden: Only the College Secretary can verify and route submitted requests.',
      };
    }
    const defaultInitialOffice = (assignedRoute && assignedRoute.length > 1) ? assignedRoute[1] : 'Department Chairperson';
    if (targetOfficeName && targetOfficeName !== defaultInitialOffice) {
      return {
        valid: false,
        status: 400,
        error: `Invalid route sequence. Submitted requests must be routed to the Department Chairperson for initial review (attempted: '${targetOfficeName}').`,
      };
    }
    return { valid: true, targetOffice: defaultInitialOffice };
  }

  // Active review stage (status: 'Under_Review')
  if (doc.current_status === 'Under_Review') {
    // Current stage guard: actor must belong to the office currently assigned to doc
    const actorOfficeName = ROLE_TO_OFFICE_NAME[actorRole];
    const currentDocOffice = doc.office?.office_name;
    if (currentDocOffice && actorOfficeName && currentDocOffice !== actorOfficeName) {
      return {
        valid: false,
        status: 403,
        error: `Forbidden: Document '${doc.control_number}' is currently assigned to '${currentDocOffice}', not '${actorOfficeName}'. Out-of-turn decisions are blocked.`,
      };
    }

    // 1. Department Chairperson
    if (actorRole === ROLES.CHAIRPERSON) {
      if (origin === 'IDS') {
        const isPrincipalRequester = requesterRole === ROLES.IDS_PRINCIPAL;
        if (isPrincipalRequester) {
          // Self-submission exception: Principal cannot endorse own request; route directly to College Dean
          if (targetOfficeName && targetOfficeName !== 'College Dean') {
            return {
              valid: false,
              status: 400,
              error: `Invalid route sequence. Chairperson endorsement for an IDS Principal self-submission must route directly to College Dean (attempted: '${targetOfficeName}').`,
            };
          }
          return { valid: true, targetOffice: 'College Dean' };
        } else {
          // Mandatory intermediate review: Chairperson MUST route to next in route (typically IDS Principal)
          const chairIdx = assignedRoute.indexOf('Department Chairperson');
          const expectedNext = (chairIdx !== -1 && chairIdx + 1 < assignedRoute.length) ? assignedRoute[chairIdx + 1] : 'IDS Principal';
          if (targetOfficeName && targetOfficeName !== expectedNext) {
            if (targetOfficeName === 'College Dean' && expectedNext === 'IDS Principal') {
              return {
                valid: false,
                status: 400,
                error: 'Invalid route sequence. IDS documents must be reviewed by the IDS Principal prior to College Dean review.',
              };
            }
            return {
              valid: false,
              status: 400,
              error: `Invalid route sequence. Department Chairperson endorsements for IDS documents must route to ${expectedNext} (attempted: '${targetOfficeName}').`,
            };
          }
          return { valid: true, targetOffice: expectedNext };
        }
      } else {
        // CESS origin: MUST NOT route to IDS Principal
        if (targetOfficeName === 'IDS Principal') {
          return {
            valid: false,
            status: 400,
            error: 'Invalid route sequence. CESS documents do not route through the IDS Principal.',
          };
        }
        const chairIdx = assignedRoute.indexOf('Department Chairperson');
        const expectedNext = (chairIdx !== -1 && chairIdx + 1 < assignedRoute.length) ? assignedRoute[chairIdx + 1] : 'College Dean';
        if (targetOfficeName && targetOfficeName !== expectedNext) {
          return {
            valid: false,
            status: 400,
            error: `Invalid route sequence. Department Chairperson endorsements for CESS documents must route to the ${expectedNext} (attempted: '${targetOfficeName}').`,
          };
        }
        return { valid: true, targetOffice: expectedNext };
      }
    }

    // 2. IDS Principal
    if (actorRole === ROLES.IDS_PRINCIPAL) {
      if (origin !== 'IDS') {
        return {
          valid: false,
          status: 403,
          error: 'Forbidden: IDS Principal review is strictly reserved for documents originating from IDS.',
        };
      }
      const prinIdx = assignedRoute.indexOf('IDS Principal');
      const expectedNext = (prinIdx !== -1 && prinIdx + 1 < assignedRoute.length) ? assignedRoute[prinIdx + 1] : 'College Dean';
      if (targetOfficeName && targetOfficeName !== expectedNext) {
        return {
          valid: false,
          status: 400,
          error: `Invalid route sequence. IDS Principal endorsements must route to the ${expectedNext} (attempted: '${targetOfficeName}').`,
        };
      }
      return { valid: true, targetOffice: expectedNext };
    }

    // 3. College Dean
    if (actorRole === ROLES.DEAN) {
      if (normAction === 'approve') {
        if (targetOfficeName && targetOfficeName !== 'College Secretary') {
          return {
            valid: false,
            status: 400,
            error: `Invalid route sequence. Final approval at the college level routes to College Secretary for release (attempted: '${targetOfficeName}').`,
          };
        }
        return { valid: true, targetOffice: 'College Secretary' };
      }
      if (
        normAction === 'endorse_higher' ||
        (normAction === 'endorse' && (!targetOfficeName || targetOfficeName === 'OVCAA'))
      ) {
        if (targetOfficeName && targetOfficeName !== 'OVCAA') {
          return {
            valid: false,
            status: 400,
            error: `Invalid route sequence. Higher approval endorsements from the College Dean must route to OVCAA prior to Office of the Chancellor review (attempted: '${targetOfficeName}').`,
          };
        }
        return { valid: true, targetOffice: 'OVCAA' };
      }
      return {
        valid: false,
        status: 400,
        error: 'Invalid route sequence. College Dean can only approve (routes to College Secretary) or endorse for higher approval (routes to OVCAA).',
      };
    }

    // 4. OVCAA / VCAF
    if (actorRole === ROLES.OVCAA || actorRole === ROLES.VCAF) {
      const actorOffice = ROLE_TO_OFFICE_NAME[actorRole];
      const offIdx = assignedRoute.indexOf(actorOffice);
      const expectedNext = (offIdx !== -1 && offIdx + 1 < assignedRoute.length) ? assignedRoute[offIdx + 1] : 'Office of the Chancellor';
      if (targetOfficeName && targetOfficeName !== expectedNext) {
        return {
          valid: false,
          status: 400,
          error: `Invalid route sequence. ${actorOffice} endorsements must route to the ${expectedNext} (attempted: '${targetOfficeName}').`,
        };
      }
      return { valid: true, targetOffice: expectedNext };
    }

    // 5. Chancellor
    if (actorRole === ROLES.CHANCELLOR) {
      if (normAction === 'approve') {
        if (targetOfficeName && targetOfficeName !== 'College Secretary') {
          return {
            valid: false,
            status: 400,
            error: `Invalid route sequence. Chancellor approval routes to College Secretary for counter release (attempted: '${targetOfficeName}').`,
          };
        }
        return { valid: true, targetOffice: 'College Secretary' };
      }
      return {
        valid: false,
        status: 400,
        error: `Invalid action '${normAction}' for Chancellor. Permitted actions: approve, return, reject.`,
      };
    }

    // 6. Generic/Custom Configured Review Office
    if (actorOfficeName && assignedRoute.includes(actorOfficeName)) {
      const idx = assignedRoute.indexOf(actorOfficeName);
      if (idx !== -1 && idx + 1 < assignedRoute.length) {
        const expectedNext = assignedRoute[idx + 1];
        if (targetOfficeName && targetOfficeName !== expectedNext) {
          return {
            valid: false,
            status: 400,
            error: `Invalid route sequence. Endorsement from ${actorOfficeName} must route to ${expectedNext} (attempted: '${targetOfficeName}').`,
          };
        }
        return { valid: true, targetOffice: expectedNext };
      }
    }
  }

  return { valid: true, targetOffice: targetOfficeName || 'College Secretary' };
}

/**
 * PB-24 Acceptance Criteria:
 * - Only permitted actions appear for the reviewer's office at the current stage
 * - Final authority remains with designated personnel (College Dean / Chancellor)
 */
function getPermittedActions(user, doc) {
  if (!user || !user.active || !doc) {
    return { actions: [], options: [] };
  }

  const status = doc.current_status;
  const requesterId = doc.requester_id || doc.requesterId;

  // Requester actions when document is Returned
  if (REQUESTER_ROLES.includes(user.role) && requesterId === user.id) {
    if (status === 'Returned') {
      return {
        actions: ['edit', 'resubmit'],
        options: [
          { action: 'edit', label: 'Edit Returned Request', requiresRemarks: false },
          { action: 'resubmit', label: 'Resubmit Corrected Request', requiresRemarks: false },
        ],
      };
    }
    return { actions: [], options: [] };
  }

  // College Secretary actions
  if (user.role === ROLES.SECRETARY) {
    if (status === 'Submitted') {
      const firstOffice = 'Department Chairperson';
      return {
        actions: ['complete', 'return', 'reject'],
        options: [
          { action: 'complete', label: 'Verify Complete & Route', nextOffice: firstOffice, requiresRemarks: false },
          { action: 'return', label: 'Return for Revision', nextOffice: null, requiresRemarks: true },
          { action: 'reject', label: 'Reject / Disapprove', nextOffice: null, requiresRemarks: true },
        ],
      };
    }
    if (status === 'Under_Review' && doc.office?.office_name === 'College Secretary') {
      return {
        actions: ['send_external', 'mark_ready'],
        options: [
          { action: 'send_external', label: 'Forward to External Office', requiresRemarks: false },
          { action: 'mark_ready', label: 'Mark Ready for Release', requiresRemarks: false },
        ],
      };
    }
    if (status === 'Ready_for_Release') {
      return {
        actions: ['release'],
        options: [
          { action: 'release', label: 'Record Document Release', requiresRemarks: false },
        ],
      };
    }
    return { actions: [], options: [] };
  }

  // Reviewing Officer actions — only when document is 'Under_Review' AND routed to this reviewer's office
  if (
    REVIEWER_ROLES.includes(user.role) &&
    status === 'Under_Review' &&
    requesterId !== user.id &&
    canViewDocument(user, doc)
  ) {
    const nextOffice = getDefaultNextOfficeForEndorsement(user.role, doc.origin);

    // Intermediate offices (Chairperson, IDS Principal, OVCAA, VCAF) can ONLY endorse, return, or reject
    if (ENDORSE_ONLY_REVIEWER_ROLES.includes(user.role)) {
      return {
        actions: ['endorse', 'return', 'reject'],
        options: [
          { action: 'endorse', label: `Endorse to ${nextOffice}`, nextOffice, requiresRemarks: false },
          { action: 'return', label: 'Return for Revision', nextOffice: null, requiresRemarks: true },
          { action: 'reject', label: 'Reject / Disapprove', nextOffice: null, requiresRemarks: true },
        ],
      };
    }

    // College Dean: Designated college-level final authority (can approve, or endorse to higher approval OVCAA/VCAF, return, reject)
    if (user.role === ROLES.DEAN) {
      return {
        actions: ['approve', 'endorse', 'endorse_higher', 'return', 'reject'],
        options: [
          { action: 'approve', label: 'Approve (Final College Authority)', nextOffice: 'College Secretary', requiresRemarks: false },
          { action: 'endorse_higher', label: 'Endorse for Higher Approval (OVCAA)', nextOffice: 'OVCAA', requiresRemarks: false },
          { action: 'return', label: 'Return for Revision', nextOffice: null, requiresRemarks: true },
          { action: 'reject', label: 'Reject / Disapprove', nextOffice: null, requiresRemarks: true },
        ],
      };
    }

    // Chancellor: Designated highest university-level final authority (can approve, return, reject; no further endorsement step)
    if (user.role === ROLES.CHANCELLOR) {
      return {
        actions: ['approve', 'return', 'reject'],
        options: [
          { action: 'approve', label: 'Approve (Final University Authority)', nextOffice: 'College Secretary', requiresRemarks: false },
          { action: 'return', label: 'Return for Revision', nextOffice: null, requiresRemarks: true },
          { action: 'reject', label: 'Reject / Disapprove', nextOffice: null, requiresRemarks: true },
        ],
      };
    }
  }

  return { actions: [], options: [] };
}

module.exports = {
  ROLES,
  ALL_ROLES,
  REQUESTER_ROLES,
  REVIEWER_ROLES,
  FINAL_APPROVAL_ROLES,
  ENDORSE_ONLY_REVIEWER_ROLES,
  ROLE_OFFICE,
  ROLE_TO_OFFICE_NAME,
  CESS_BASE_ROUTE,
  IDS_BASE_ROUTE,
  HIGHER_APPROVAL_OFFICES,
  toDbRoleName,
  fromDbRoleName,
  getRoleLabel,
  isInstitutionalEmail,
  canViewDocument,
  canPerformAction,
  getApprovedRoute,
  getDefaultNextOfficeForEndorsement,
  validateRouteTransition,
  getPermittedActions,
};
