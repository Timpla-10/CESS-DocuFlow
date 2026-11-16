const { redactSensitiveText } = require('../utils/logSanitizer');

const ALLOWED_ELIGIBLE_STATUSES = [
  'Submitted',
  'Under_Review',
  'With_External_Office',
  'Returned_for_Revision',
];

const TERMINAL_OR_INVALID_STATUSES = [
  'Ready_for_Release',
  'Released',
  'Rejected',
  'Archived',
];

const ALLOWED_ORIGINS = ['CESS', 'IDS'];

function buildDefaultRule() {
  return {
    ruleId: 'default-pending-followup-rule',
    name: 'Pending Review Automated Follow-Up Rule (REQ-NOT-3)',
    enabled: true,
    reminderIntervalDays: 3,
    cooldownHours: 72,
    maxRemindersPerStage: 3,
    eligibleStatuses: ['Submitted', 'Under_Review', 'With_External_Office'],
    eligibleOrigins: ['CESS', 'IDS'],
    includeExpeditedOnly: false,
    notifyHoldingOffice: true,
    notifyRequester: false,
    notifySecretaryOnOverdue: true,
    escalationDays: 5,
    version: 1,
    updatedAt: '2026-03-01T08:00:00.000Z',
    updatedBy: 'Ms. Carmela Ortiz (College Secretary)',
    updatedByEmail: null,
  };
}

function cloneDeep(v) {
  return JSON.parse(JSON.stringify(v));
}

const state = {
  activeRule: buildDefaultRule(),
  configHistory: [
    {
      version: 1,
      action: 'INITIAL_RULE_BASELINE',
      timestamp: '2026-03-01T08:00:00.000Z',
      updatedBy: 'Ms. Carmela Ortiz (College Secretary)',
      updatedByEmail: null,
      reason: 'Default 3-day automated pending review reminder configuration (SRS 3.10 REQ-NOT-3).',
      changedFields: ['initial'],
      before: null,
      after: buildDefaultRule(),
    },
  ],
  stageDispatchTracker: new Map(), // key: `${documentId}::${officeName}::${recipientId}` -> { count, lastSentAt, lastOfficeSince }
  runHistory: [], // Array of evaluation/dispatch execution summaries
};

const FollowUpRuleModel = {
  ALLOWED_ELIGIBLE_STATUSES,
  ALLOWED_ORIGINS,

  getRule() {
    return cloneDeep(state.activeRule);
  },

  validateAndUpdateRule(payload = {}, { updatedBy, updatedByEmail = null } = {}) {
    const before = cloneDeep(state.activeRule);
    const next = cloneDeep(state.activeRule);
    const changedFields = [];
    const errors = [];

    if (payload.name !== undefined) {
      const cleanName = redactSensitiveText(String(payload.name || '').trim());
      if (!cleanName) errors.push('Rule name cannot be empty.');
      else if (cleanName !== next.name) {
        next.name = cleanName;
        changedFields.push('name');
      }
    }

    if (payload.enabled !== undefined) {
      if (typeof payload.enabled !== 'boolean') {
        errors.push('enabled must be a boolean.');
      } else if (payload.enabled !== next.enabled) {
        next.enabled = payload.enabled;
        changedFields.push('enabled');
      }
    }

    if (payload.reminderIntervalDays !== undefined) {
      const days = Number(payload.reminderIntervalDays);
      if (!Number.isFinite(days) || days < 1 || days > 30) {
        errors.push('reminderIntervalDays must be a valid number between 1 and 30 days.');
      } else if (days !== next.reminderIntervalDays) {
        next.reminderIntervalDays = days;
        changedFields.push('reminderIntervalDays');
      }
    }

    if (payload.cooldownHours !== undefined) {
      const hours = Number(payload.cooldownHours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
        errors.push('cooldownHours must be a valid number between 1 and 720 hours.');
      } else if (hours !== next.cooldownHours) {
        next.cooldownHours = hours;
        changedFields.push('cooldownHours');
      }
    }

    if (payload.maxRemindersPerStage !== undefined) {
      const maxRem = Number(payload.maxRemindersPerStage);
      if (!Number.isInteger(maxRem) || maxRem < 1 || maxRem > 20) {
        errors.push('maxRemindersPerStage must be an integer between 1 and 20.');
      } else if (maxRem !== next.maxRemindersPerStage) {
        next.maxRemindersPerStage = maxRem;
        changedFields.push('maxRemindersPerStage');
      }
    }

    if (payload.eligibleStatuses !== undefined) {
      if (!Array.isArray(payload.eligibleStatuses) || payload.eligibleStatuses.length === 0) {
        errors.push('eligibleStatuses must be a non-empty array of active pending statuses.');
      } else {
        const invalid = payload.eligibleStatuses.filter((s) => !ALLOWED_ELIGIBLE_STATUSES.includes(s));
        if (invalid.length > 0) {
          const hitTerminal = invalid.some((s) => TERMINAL_OR_INVALID_STATUSES.includes(s));
          errors.push(
            hitTerminal
              ? `Terminal or non-pending statuses cannot trigger follow-up reminders: ${invalid.join(', ')}. Allowed: ${ALLOWED_ELIGIBLE_STATUSES.join(', ')}.`
              : `Unsupported status values in eligibleStatuses: ${invalid.join(', ')}. Allowed: ${ALLOWED_ELIGIBLE_STATUSES.join(', ')}.`
          );
        } else {
          const deduped = Array.from(new Set(payload.eligibleStatuses));
          if (JSON.stringify(deduped) !== JSON.stringify(next.eligibleStatuses)) {
            next.eligibleStatuses = deduped;
            changedFields.push('eligibleStatuses');
          }
        }
      }
    }

    if (payload.eligibleOrigins !== undefined) {
      if (!Array.isArray(payload.eligibleOrigins) || payload.eligibleOrigins.length === 0) {
        errors.push('eligibleOrigins must be a non-empty array containing CESS and/or IDS.');
      } else {
        const invalidOrigins = payload.eligibleOrigins.filter((o) => !ALLOWED_ORIGINS.includes(o));
        if (invalidOrigins.length > 0) {
          errors.push(`Invalid origins in eligibleOrigins: ${invalidOrigins.join(', ')}. Allowed: CESS, IDS.`);
        } else {
          const dedupedOrigins = Array.from(new Set(payload.eligibleOrigins));
          if (JSON.stringify(dedupedOrigins) !== JSON.stringify(next.eligibleOrigins)) {
            next.eligibleOrigins = dedupedOrigins;
            changedFields.push('eligibleOrigins');
          }
        }
      }
    }

    if (payload.includeExpeditedOnly !== undefined) {
      if (typeof payload.includeExpeditedOnly !== 'boolean') {
        errors.push('includeExpeditedOnly must be a boolean.');
      } else if (payload.includeExpeditedOnly !== next.includeExpeditedOnly) {
        next.includeExpeditedOnly = payload.includeExpeditedOnly;
        changedFields.push('includeExpeditedOnly');
      }
    }

    if (payload.notifyHoldingOffice !== undefined) {
      if (typeof payload.notifyHoldingOffice !== 'boolean') {
        errors.push('notifyHoldingOffice must be a boolean.');
      } else if (payload.notifyHoldingOffice !== next.notifyHoldingOffice) {
        next.notifyHoldingOffice = payload.notifyHoldingOffice;
        changedFields.push('notifyHoldingOffice');
      }
    }

    if (payload.notifyRequester !== undefined) {
      if (typeof payload.notifyRequester !== 'boolean') {
        errors.push('notifyRequester must be a boolean.');
      } else if (payload.notifyRequester !== next.notifyRequester) {
        next.notifyRequester = payload.notifyRequester;
        changedFields.push('notifyRequester');
      }
    }

    if (payload.notifySecretaryOnOverdue !== undefined) {
      if (typeof payload.notifySecretaryOnOverdue !== 'boolean') {
        errors.push('notifySecretaryOnOverdue must be a boolean.');
      } else if (payload.notifySecretaryOnOverdue !== next.notifySecretaryOnOverdue) {
        next.notifySecretaryOnOverdue = payload.notifySecretaryOnOverdue;
        changedFields.push('notifySecretaryOnOverdue');
      }
    }

    if (payload.escalationDays !== undefined) {
      const esc = Number(payload.escalationDays);
      if (!Number.isFinite(esc) || esc < 1 || esc > 60) {
        errors.push('escalationDays must be a valid number between 1 and 60.');
      } else if (esc < next.reminderIntervalDays) {
        errors.push('escalationDays cannot be less than reminderIntervalDays.');
      } else if (esc !== next.escalationDays) {
        next.escalationDays = esc;
        changedFields.push('escalationDays');
      }
    }

    if (!next.notifyHoldingOffice && !next.notifyRequester && !next.notifySecretaryOnOverdue) {
      errors.push('At least one notification target (notifyHoldingOffice, notifyRequester, or notifySecretaryOnOverdue) must be enabled.');
    }

    if (errors.length > 0) {
      const err = new Error(errors.join(' '));
      err.status = 400;
      err.validationErrors = errors;
      throw err;
    }

    const nowIso = new Date().toISOString();
    next.version = before.version + 1;
    next.updatedAt = nowIso;
    next.updatedBy = updatedBy || 'College Secretary';
    next.updatedByEmail = updatedByEmail || null;

    state.activeRule = next;

    const historyEntry = {
      version: next.version,
      action: 'FOLLOW_UP_RULE_UPDATED',
      timestamp: nowIso,
      updatedBy: next.updatedBy,
      updatedByEmail: next.updatedByEmail,
      reason: payload.reason ? redactSensitiveText(String(payload.reason).trim()) : null,
      changedFields: changedFields.length > 0 ? changedFields : ['re_affirmed'],
      before,
      after: cloneDeep(next),
    };
    state.configHistory.unshift(historyEntry);

    return {
      rule: cloneDeep(next),
      previousRule: before,
      changedFields: historyEntry.changedFields,
      historyEntry,
    };
  },

  getConfigHistory(limit = 50) {
    return cloneDeep(state.configHistory.slice(0, Math.max(1, Number(limit) || 50)));
  },

  getStageDispatchState(key) {
    return state.stageDispatchTracker.get(key) || null;
  },

  recordStageDispatch(key, { officeSince }) {
    const prev = state.stageDispatchTracker.get(key);
    const sameStage = prev && prev.lastOfficeSince === officeSince;
    const count = sameStage ? prev.count + 1 : 1;
    const entry = {
      count,
      lastSentAt: Date.now(),
      lastSentIso: new Date().toISOString(),
      lastOfficeSince: officeSince || null,
    };
    state.stageDispatchTracker.set(key, entry);
    return entry;
  },

  clearStageTrackerForDocument(documentId) {
    const prefix = `${documentId}::`;
    for (const key of state.stageDispatchTracker.keys()) {
      if (key.startsWith(prefix)) {
        state.stageDispatchTracker.delete(key);
      }
    }
  },

  recordRunExecution(runSummary) {
    state.runHistory.unshift(runSummary);
    if (state.runHistory.length > 100) {
      state.runHistory.length = 100;
    }
  },

  getRunHistory(limit = 30) {
    return cloneDeep(state.runHistory.slice(0, Math.max(1, Number(limit) || 30)));
  },

  resetToDefaults() {
    state.activeRule = buildDefaultRule();
    state.configHistory = [
      {
        version: 1,
        action: 'INITIAL_RULE_BASELINE',
        timestamp: '2026-03-01T08:00:00.000Z',
        updatedBy: 'Ms. Carmela Ortiz (College Secretary)',
        updatedByEmail: null,
        reason: 'Default 3-day automated pending review reminder configuration (SRS 3.10 REQ-NOT-3).',
        changedFields: ['initial'],
        before: null,
        after: buildDefaultRule(),
      },
    ];
    state.stageDispatchTracker.clear();
    state.runHistory = [];
  },
};

module.exports = FollowUpRuleModel;

