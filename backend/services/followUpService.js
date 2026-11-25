const DocumentModel = require('../models/documentModel');
const UserModel = require('../models/userModel');
const NotificationModel = require('../models/notificationModel');
const FollowUpRuleModel = require('../models/followUpRuleModel');
const EmailService = require('./emailService');
const { ROLE_TO_OFFICE_NAME, ROLES } = require('../utils/roles');

function resolveHoldingOfficeName(doc) {
  return doc.office?.office_name || doc.metadata?.currentOffice || 'College Secretary';
}

function userMatchesOffice(user, officeName) {
  if (!user || !user.active) return false;
  const officeNames = Array.isArray(user.officeNames) ? user.officeNames : [];
  if (officeNames.includes(officeName)) return true;
  return ROLE_TO_OFFICE_NAME[user.role] === officeName;
}

const FollowUpService = {
  /**
   * Resolves deduplicated target recipients for a matched pending document based on rule settings.
   */
  resolveTargetsForDocument(doc, allActiveUsers, rule, daysWaiting) {
    const holdingOffice = resolveHoldingOfficeName(doc);
    const targets = new Map(); // userId -> { user, targetType }

    const secretaries = allActiveUsers.filter((u) => u.active && u.role === ROLES.SECRETARY);

    if (rule.notifyHoldingOffice) {
      let holdingUsers = allActiveUsers.filter(
        (u) => userMatchesOffice(u, holdingOffice) && u.id !== doc.requester_id
      );

      // External offices (VCAF / OVCAA / Chancellor) may fall back to Secretary liaison if unstaffed
      if (holdingUsers.length === 0) {
        holdingUsers = secretaries.filter((s) => s.id !== doc.requester_id);
      }

      for (const u of holdingUsers) {
        if (!targets.has(u.id)) {
          targets.set(u.id, { user: u, targetType: 'holding_office' });
        }
      }
    }

    if (rule.notifySecretaryOnOverdue && daysWaiting >= rule.escalationDays) {
      for (const sec of secretaries) {
        if (sec.id !== doc.requester_id && !targets.has(sec.id)) {
          targets.set(sec.id, { user: sec, targetType: 'secretary_escalation' });
        }
      }
    }

    if (rule.notifyRequester && doc.requester_id) {
      const reqUser = allActiveUsers.find((u) => u.id === doc.requester_id);
      if (reqUser && reqUser.active && !targets.has(reqUser.id)) {
        targets.set(reqUser.id, { user: reqUser, targetType: 'requester' });
      }
    }

    return {
      holdingOffice,
      recipients: Array.from(targets.values()),
    };
  },

  /**
   * Checks duplicate suppression against stage tracker and recent DB Reminder_3_Days logs.
   */
  async checkDuplicateStatus({ documentId, holdingOffice, officeSince, recipientId, rule }) {
    const trackerKey = `${documentId}::${holdingOffice}::${recipientId}`;
    const tracked = FollowUpRuleModel.getStageDispatchState(trackerKey);

    if (tracked && tracked.lastOfficeSince === officeSince) {
      const elapsedHoursSinceLast = (Date.now() - tracked.lastSentAt) / (1000 * 60 * 60);
      if (tracked.count >= rule.maxRemindersPerStage) {
        return {
          trackerKey,
          isDuplicate: true,
          reason: 'max_stage_reminders_reached',
          stageReminderCount: tracked.count,
        };
      }
      if (elapsedHoursSinceLast < rule.cooldownHours) {
        return {
          trackerKey,
          isDuplicate: true,
          reason: 'cooldown_active',
          stageReminderCount: tracked.count,
        };
      }
    }

    const recentInDb = await NotificationModel.hasRecentReminderLog({
      documentId,
      recipientId,
      cooldownHours: rule.cooldownHours,
    });

    if (recentInDb) {
      return {
        trackerKey,
        isDuplicate: true,
        reason: 'recent_reminder_logged',
        stageReminderCount: tracked?.count || 1,
      };
    }

    return {
      trackerKey,
      isDuplicate: false,
      reason: null,
      stageReminderCount: tracked?.lastOfficeSince === officeSince ? tracked.count : 0,
    };
  },

  /**
   * Evaluate pending documents against configured rules and optionally dispatch reminders.
   * Honors PB-05 notification delivery preferences and prevents duplicate reminder spam.
   */
  async evaluateAndDispatch({
    dryRun = false,
    documentIds = null,
    asOf = null,
    triggeredBy = 'College Secretary',
  } = {}) {
    const rule = FollowUpRuleModel.getRule();
    const refTimeMs = asOf ? new Date(asOf).getTime() : Date.now();
    const safeRefTimeMs = Number.isFinite(refTimeMs) ? refTimeMs : Date.now();

    const allDocs = await DocumentModel.findAll({ sort: 'oldest' });
    const allUsers = (await UserModel.findAll().catch(() => [])).filter((u) => u.active);

    const filterDocIdSet =
      Array.isArray(documentIds) && documentIds.length > 0
        ? new Set(documentIds.map(String))
        : null;

    const evaluatedDocs = allDocs.filter((doc) => {
      if (filterDocIdSet && !filterDocIdSet.has(String(doc.document_id))) return false;
      if (doc.is_deleted || doc.archived) return false;
      if (!rule.eligibleStatuses.includes(doc.current_status)) return false;
      if (!rule.eligibleOrigins.includes(doc.origin)) return false;
      if (rule.includeExpeditedOnly && !doc.is_expedited) return false;
      return true;
    });

    let matchedDocumentsCount = 0;
    let sentCount = 0;
    let emailSentCount = 0;
    let inSystemSentCount = 0;
    let skippedDuplicateCount = 0;
    let failedCount = 0;

    const details = [];

    for (const doc of evaluatedDocs) {
      const officeSinceIso = doc.officeSince || doc.submitted_at;
      const officeSinceMs = officeSinceIso ? new Date(officeSinceIso).getTime() : safeRefTimeMs;
      const elapsedMs = Math.max(0, safeRefTimeMs - officeSinceMs);
      const exactDaysWaiting = elapsedMs / (1000 * 60 * 60 * 24);
      const daysWaiting = Math.floor(exactDaysWaiting);

      if (exactDaysWaiting < rule.reminderIntervalDays) {
        continue;
      }

      matchedDocumentsCount += 1;
      const isEscalated = exactDaysWaiting >= rule.escalationDays;
      const { holdingOffice, recipients } = this.resolveTargetsForDocument(
        doc,
        allUsers,
        rule,
        exactDaysWaiting
      );

      const recipientOutcomes = [];

      for (const { user: recipient, targetType } of recipients) {
        const pref = await NotificationModel.getPreference(recipient.id);
        const dup = await this.checkDuplicateStatus({
          documentId: doc.document_id,
          holdingOffice,
          officeSince: officeSinceIso,
          recipientId: recipient.id,
          rule,
        });

        if (dup.isDuplicate) {
          skippedDuplicateCount += 1;
          recipientOutcomes.push({
            recipientId: recipient.id,
            name: recipient.name,
            email: recipient.email,
            targetType,
            preference: pref.preference,
            status: 'skipped_duplicate',
            reason: dup.reason,
          });
          continue;
        }

        if (dryRun || !rule.enabled) {
          recipientOutcomes.push({
            recipientId: recipient.id,
            name: recipient.name,
            email: recipient.email,
            targetType,
            preference: pref.preference,
            status: !rule.enabled ? 'skipped_rule_disabled' : 'eligible_dry_run',
            wouldSendEmail: Boolean(pref.receive_email),
            wouldSendInSystem: Boolean(pref.receive_in_system),
          });
          continue;
        }

        let deliveredAny = false;
        let emailResult = null;
        let inSystemCreated = false;

        // 1. Respect In-System preference ('both' or 'in_system_only')
        if (pref.receive_in_system) {
          const title = isEscalated
            ? `Escalation Reminder: ${doc.control_number} (${daysWaiting}d pending)`
            : `Pending Review Reminder: ${doc.control_number} (${daysWaiting}d pending)`;
          const msg =
            targetType === 'requester'
              ? `Automated follow-up issued for your request ${doc.control_number} (${doc.title}), waiting at ${holdingOffice} for ${daysWaiting} day(s).`
              : `Request ${doc.control_number} (${doc.title}) has been pending at ${holdingOffice} for ${daysWaiting} day(s) (rule interval: ${rule.reminderIntervalDays}d).`;

          const created = await NotificationModel.createLog({
            recipientId: recipient.id,
            documentId: doc.document_id,
            notificationType: 'Reminder_3_Days',
            deliveryMethod: 'In_System',
            title,
            message: msg,
            status: 'Sent',
          }).catch(() => null);

          if (created) {
            inSystemCreated = true;
            inSystemSentCount += 1;
            deliveredAny = true;
          }
        }

        // 2. Respect Email preference ('both' or 'email_only')
        if (pref.receive_email) {
          if (targetType === 'requester') {
            emailResult = await EmailService.sendRequesterFollowUpUpdateEmail({
              to: recipient.email,
              name: recipient.name,
              controlNumber: doc.control_number,
              title: doc.title,
              currentOffice: holdingOffice,
              daysWaiting,
              documentId: doc.document_id,
              recipientId: recipient.id,
            });
          } else {
            emailResult = await EmailService.sendPendingReminderEmail({
              to: recipient.email,
              name: recipient.name,
              controlNumber: doc.control_number,
              title: doc.title,
              currentOffice: holdingOffice,
              daysWaiting,
              thresholdDays: rule.reminderIntervalDays,
              isEscalated,
              documentId: doc.document_id,
              recipientId: recipient.id,
            });
          }

          if (emailResult?.success) {
            emailSentCount += 1;
            deliveredAny = true;
          } else {
            failedCount += 1;
          }
        }

        if (deliveredAny) {
          sentCount += 1;
          FollowUpRuleModel.recordStageDispatch(dup.trackerKey, { officeSince: officeSinceIso });
        }

        recipientOutcomes.push({
          recipientId: recipient.id,
          name: recipient.name,
          email: recipient.email,
          targetType,
          preference: pref.preference,
          status: deliveredAny ? 'dispatched' : 'failed',
          inSystemSent: inSystemCreated,
          emailSent: Boolean(emailResult?.success),
          emailError: emailResult && !emailResult.success ? emailResult.error || emailResult.reason : null,
        });
      }

      details.push({
        documentId: doc.document_id,
        controlNumber: doc.control_number,
        title: doc.title,
        origin: doc.origin,
        currentStatus: doc.current_status,
        holdingOffice,
        daysWaiting,
        isEscalated,
        recipients: recipientOutcomes,
      });
    }

    const summary = {
      runId: `fu-run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      executedAt: new Date().toISOString(),
      triggeredBy,
      dryRun: Boolean(dryRun),
      enabled: rule.enabled,
      ruleVersion: rule.version,
      reminderIntervalDays: rule.reminderIntervalDays,
      cooldownHours: rule.cooldownHours,
      evaluatedCount: evaluatedDocs.length,
      matchedDocumentsCount,
      sentCount,
      emailSentCount,
      inSystemSentCount,
      skippedDuplicateCount,
      failedCount,
      details,
    };

    if (!dryRun) {
      FollowUpRuleModel.recordRunExecution(summary);
    }

    return summary;
  },
};

module.exports = FollowUpService;

