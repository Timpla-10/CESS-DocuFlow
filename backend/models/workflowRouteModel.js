/**
 * WorkflowRouteModel.js
 * PB-45 / SRS 3.5: Configure workflow routes, status transitions, validation, and audit logging.
 * Enforces the migration rule: "Changes affect new requests only."
 */
const { ROLES } = require('../utils/roles');

const ALLOWED_OFFICES = [
  'College Secretary',
  'Department Chairperson',
  'IDS Principal',
  'College Dean',
  'OVCAA',
  'VCAF',
  'Office of the Chancellor',
];

const DEFAULT_CESS_ROUTE = [
  'College Secretary',
  'Department Chairperson',
  'College Dean',
  'College Secretary',
];

const DEFAULT_IDS_ROUTE = [
  'College Secretary',
  'Department Chairperson',
  'IDS Principal',
  'College Dean',
  'College Secretary',
];

// Active configured routes store
const activeRoutes = {
  CESS: {
    origin: 'CESS',
    sequence: [...DEFAULT_CESS_ROUTE],
    version: 1,
    updated_at: new Date('2026-10-26T00:00:00Z').toISOString(),
    updated_by: 'system',
    reason: 'Initial approved CESS standard procedure (SRS 3.5 REQ-ROUTE-2).',
  },
  IDS: {
    origin: 'IDS',
    sequence: [...DEFAULT_IDS_ROUTE],
    version: 1,
    updated_at: new Date('2026-10-26T00:00:00Z').toISOString(),
    updated_by: 'system',
    reason: 'Initial approved IDS standard procedure with Principal review (SRS 3.5 REQ-ROUTE-3).',
  },
};

// Document-specific route snapshots: documentId -> { sequence, version, origin, snapshotted_at }
const documentRouteSnapshots = new Map();

// Route change audit log: array of audit records
const routeAuditLog = [
  {
    id: 'audit-init-cess',
    origin: 'CESS',
    version: 1,
    previous_sequence: null,
    new_sequence: [...DEFAULT_CESS_ROUTE],
    changed_by_user_id: 'system',
    changed_by_email: 'admin@msunaawan.edu.ph',
    changed_by_name: 'System Default',
    reason: 'Initial approved CESS standard procedure (SRS 3.5 REQ-ROUTE-2).',
    timestamp: new Date('2026-10-26T00:00:00Z').toISOString(),
  },
  {
    id: 'audit-init-ids',
    origin: 'IDS',
    version: 1,
    previous_sequence: null,
    new_sequence: [...DEFAULT_IDS_ROUTE],
    changed_by_user_id: 'system',
    changed_by_email: 'admin@msunaawan.edu.ph',
    changed_by_name: 'System Default',
    reason: 'Initial approved IDS standard procedure with Principal review (SRS 3.5 REQ-ROUTE-3).',
    timestamp: new Date('2026-10-26T00:00:00Z').toISOString(),
  },
];

const WorkflowRouteModel = {
  ALLOWED_OFFICES,

  /**
   * Normalizes office name strings to canonical names
   */
  normalizeOfficeName(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    const found = ALLOWED_OFFICES.find((o) => o.toLowerCase() === trimmed.toLowerCase());
    if (found) return found;

    const lower = trimmed.toLowerCase();
    if (lower === 'chairperson' || lower === 'department chair') return 'Department Chairperson';
    if (lower === 'ids principal' || lower === 'principal') return 'IDS Principal';
    if (lower === 'dean' || lower === 'college dean') return 'College Dean';
    if (lower === 'secretary' || lower === 'college secretary') return 'College Secretary';
    if (lower === 'chancellor') return 'Office of the Chancellor';
    return trimmed;
  },

  /**
   * Validates a workflow route office sequence according to SRS 3.5 rules
   */
  validateSequence(origin, sequence) {
    const normOrigin = String(origin || 'CESS').toUpperCase();
    if (!['CESS', 'IDS', 'ALL'].includes(normOrigin)) {
      return { valid: false, error: `Invalid origin '${origin}'. Must be 'CESS' or 'IDS'.` };
    }

    if (!Array.isArray(sequence) || sequence.length < 3) {
      return {
        valid: false,
        error: 'Route sequence must be an array containing at least 3 offices (Secretary Verification -> Review Office(s) -> Secretary Release).',
      };
    }

    const normalized = sequence.map((o) => this.normalizeOfficeName(o));

    // 1. Initial office must be College Secretary
    if (normalized[0] !== 'College Secretary') {
      return {
        valid: false,
        error: `Route sequence must start with 'College Secretary' for completeness verification (attempted: '${normalized[0]}').`,
      };
    }

    // 2. Terminal office must be College Secretary
    if (normalized[normalized.length - 1] !== 'College Secretary') {
      return {
        valid: false,
        error: `Route sequence must terminate with 'College Secretary' for final document release (attempted: '${normalized[normalized.length - 1]}').`,
      };
    }

    // 3. All intermediate offices must be valid recognized offices
    for (const off of normalized) {
      if (!ALLOWED_OFFICES.includes(off)) {
        return {
          valid: false,
          error: `Unrecognized office '${off}' in route sequence. Permitted offices: ${ALLOWED_OFFICES.join(', ')}.`,
        };
      }
    }

    // 4. No adjacent duplicate offices
    for (let i = 0; i < normalized.length - 1; i++) {
      if (normalized[i] === normalized[i + 1]) {
        return {
          valid: false,
          error: `Invalid consecutive duplicate step '${normalized[i]}' at positions ${i + 1} and ${i + 2}.`,
        };
      }
    }

    // 5. Must contain at least one approving authority (College Dean or Office of the Chancellor)
    const hasApprovingAuthority = normalized.includes('College Dean') || normalized.includes('Office of the Chancellor');
    if (!hasApprovingAuthority) {
      return {
        valid: false,
        error: "Route sequence must include at least one approving authority ('College Dean' or 'Office of the Chancellor').",
      };
    }

    // 6. Origin specific constraints
    if (normOrigin === 'CESS' && normalized.includes('IDS Principal')) {
      return {
        valid: false,
        error: "Invalid sequence: CESS documents cannot route through the 'IDS Principal'.",
      };
    }

    if (normOrigin === 'IDS' && !normalized.includes('IDS Principal')) {
      return {
        valid: false,
        error: "Invalid sequence: IDS documents must include 'IDS Principal' review.",
      };
    }

    return { valid: true, normalizedSequence: normalized };
  },

  /**
   * Retrieves all active configured routes
   */
  async getAllRoutes() {
    return {
      CESS: { ...activeRoutes.CESS, sequence: [...activeRoutes.CESS.sequence] },
      IDS: { ...activeRoutes.IDS, sequence: [...activeRoutes.IDS.sequence] },
    };
  },

  /**
   * Retrieves the active configured route for an origin
   */
  getActiveRoute(origin = 'CESS', docType = null, requesterRole = null) {
    const normOrigin = String(origin || 'CESS').toUpperCase();
    const config = activeRoutes[normOrigin] || activeRoutes.CESS;
    let sequence = [...config.sequence];

    // Self-submission exception for IDS Principal
    if (normOrigin === 'IDS' && requesterRole === ROLES.IDS_PRINCIPAL) {
      sequence = sequence.filter((o) => o !== 'IDS Principal');
    }

    return sequence;
  },

  /**
   * Updates an approved workflow route sequence with validation and audit logging (PB-45)
   */
  async updateRoute(origin, newSequence, user, reason = '') {
    const normOrigin = String(origin || 'CESS').toUpperCase();
    const validation = this.validateSequence(normOrigin, newSequence);
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.status = 400;
      throw err;
    }

    const currentConfig = activeRoutes[normOrigin] || {
      origin: normOrigin,
      sequence: normOrigin === 'IDS' ? [...DEFAULT_IDS_ROUTE] : [...DEFAULT_CESS_ROUTE],
      version: 1,
    };

    const previousSequence = [...currentConfig.sequence];
    const newVersion = (currentConfig.version || 1) + 1;
    const nowIso = new Date().toISOString();

    activeRoutes[normOrigin] = {
      origin: normOrigin,
      sequence: validation.normalizedSequence,
      version: newVersion,
      updated_at: nowIso,
      updated_by: user.id || user.email || 'secretary',
      reason: reason.trim() || 'Approved institutional routing procedure update.',
    };

    // Log modification to audit trail
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      origin: normOrigin,
      version: newVersion,
      previous_sequence: previousSequence,
      new_sequence: validation.normalizedSequence,
      changed_by_user_id: user.id || null,
      changed_by_email: user.email || 'secretary@msunaawan.edu.ph',
      changed_by_name: user.name || 'College Secretary',
      reason: reason.trim() || 'Approved institutional routing procedure update.',
      timestamp: nowIso,
    };

    routeAuditLog.unshift(auditEntry);

    return {
      route: { ...activeRoutes[normOrigin] },
      auditEntry,
    };
  },

  /**
   * PB-45 Migration Rule: "Changes affect new requests only."
   * Snapshots the active route sequence and version onto a document upon submission.
   */
  assignRouteToDocument(doc, requesterRole = null) {
    if (!doc) return null;
    const docId = doc.document_id || doc.id;
    if (!docId) return null;

    if (documentRouteSnapshots.has(docId)) {
      return documentRouteSnapshots.get(docId).sequence;
    }

    const normOrigin = String(doc.origin || 'CESS').toUpperCase();
    const config = activeRoutes[normOrigin] || activeRoutes.CESS;
    let sequence = [...config.sequence];

    // Self-submission exception for IDS Principal
    if (normOrigin === 'IDS' && requesterRole === ROLES.IDS_PRINCIPAL) {
      sequence = sequence.filter((o) => o !== 'IDS Principal');
    }

    documentRouteSnapshots.set(docId, {
      documentId: docId,
      origin: normOrigin,
      sequence,
      version: config.version || 1,
      snapshotted_at: new Date().toISOString(),
    });

    return sequence;
  },

  /**
   * Retrieves the assigned route for a document.
   * If document was created under an earlier route version, returns its snapshot route!
   */
  getRouteForDocument(doc, requesterRole = null) {
    if (!doc) return this.getActiveRoute('CESS', null, requesterRole);
    const docId = doc.document_id || doc.id;

    if (docId && documentRouteSnapshots.has(docId)) {
      return [...documentRouteSnapshots.get(docId).sequence];
    }

    // If not yet snapshotted, snapshot now to preserve continuity
    return this.assignRouteToDocument(doc, requesterRole);
  },

  /**
   * Returns the chronological route audit log
   */
  async getAuditLog() {
    return [...routeAuditLog];
  },

  /**
   * Helper to reset to default routes (for testing)
   */
  resetDefaults() {
    activeRoutes.CESS = {
      origin: 'CESS',
      sequence: [...DEFAULT_CESS_ROUTE],
      version: 1,
      updated_at: new Date().toISOString(),
      updated_by: 'system',
      reason: 'Reset to default CESS route.',
    };
    activeRoutes.IDS = {
      origin: 'IDS',
      sequence: [...DEFAULT_IDS_ROUTE],
      version: 1,
      updated_at: new Date().toISOString(),
      updated_by: 'system',
      reason: 'Reset to default IDS route.',
    };
    documentRouteSnapshots.clear();
  },
};

module.exports = WorkflowRouteModel;
