const DirectoryModel = require('./directoryModel');
const { redactSensitiveText } = require('../utils/logSanitizer');

const RESTRICTED_KEYS = new Set([
  'internalnotes',
  'internal_notes',
  'draft',
  'unpublished',
  'unpublishedcontent',
  'users',
  'userids',
  'user_ids',
  'emails',
  'password',
  'passwords',
  'token',
  'tokens',
  'secret',
  'secrets',
  'smtp',
  'notificationlogs',
  'notification_logs',
  'securitylogs',
  'security_logs',
  'audithistory',
  'audit_history',
  'updatedbyuserid',
  'restricteddata',
  'restricted_data',
  'private',
]);

const ALLOWED_INFO_FIELDS = [
  'collegeName',
  'shortName',
  'universityName',
  'tagline',
  'heroTitle',
  'heroSubtitle',
  'heroBannerUrl',
  'about',
  'mission',
  'vision',
  'coreValues',
  'programsOffered',
  'officeInfo',
  'workflowOverview',
];

function isSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^javascript:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) return false;
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  );
}

function buildDefaultContent() {
  return {
    collegeName: 'College of Education and Social Sciences (CESS)',
    shortName: 'CESS',
    universityName: 'Mindanao State University at Naawan',
    tagline: 'Transparent, Traceable Academic Document Routing & Institutional Governance',
    heroTitle: 'CESS DocuFlow — Institutional Document Tracking Portal',
    heroSubtitle:
      'Submit, track, and verify college document requests and academic references across CESS and the Integrated Developmental School (IDS).',
    heroBannerUrl: '/assets/banners/cess-campus-hero.jpg',
    about:
      'The College of Education and Social Sciences (CESS) at Mindanao State University at Naawan advances teacher education, social science scholarship, and responsive academic administration.',
    mission:
      'To prepare competent educators and social science professionals grounded in ethical service, research, and inclusive community development.',
    vision:
      'A premier college of education and social sciences recognized for academic excellence, innovation, and regional stewardship.',
    coreValues: ['Integrity', 'Academic Excellence', 'Service', 'Inclusivity', 'Accountability'],
    programsOffered: [
      'Bachelor of Secondary Education (BSEd)',
      'Bachelor of Elementary Education (BEEd)',
      'Bachelor of Arts in Political Science',
      'Integrated Developmental School (IDS) Basic Education Support',
    ],
    officeInfo: {
      officeName: 'Office of the College Secretary (CESS)',
      location: 'CESS Administration Building, MSU at Naawan Campus, Naawan, Misamis Oriental',
      publicEmail: 'cess.docuflow@msunaawan.edu.ph',
      contactNumber: '(088) 555-0142',
      officeHours: 'Monday - Friday, 8:00 AM - 5:00 PM',
    },
    workflowOverview: [
      { step: 1, title: 'Submit Request', description: 'Upload required forms and receive an official CESS control number.' },
      { step: 2, title: 'Secretary Verification', description: 'Completeness review before sequential office endorsement.' },
      { step: 3, title: 'Office Review & Endorsement', description: 'Real-time routing status across CESS, IDS, and external university offices.' },
      { step: 4, title: 'Official Release', description: 'Signed document readiness notice and verified release confirmation.' },
    ],
    logos: {
      universityLogo: {
        id: 'logo-msu-naawan',
        name: 'MSU at Naawan Official Seal',
        url: '/assets/logos/msu-naawan-seal.png',
        altText: 'Mindanao State University at Naawan Official Seal',
        isApproved: true,
        isActive: true,
      },
      collegeLogo: {
        id: 'logo-cess',
        name: 'CESS Official College Emblem',
        url: '/assets/logos/cess-emblem.png',
        altText: 'College of Education and Social Sciences Official Logo',
        isApproved: true,
        isActive: true,
      },
      additionalLogos: [
        {
          id: 'logo-ids',
          name: 'Integrated Developmental School Crest',
          url: '/assets/logos/ids-crest.png',
          altText: 'Integrated Developmental School Logo',
          isApproved: true,
          isActive: true,
        },
      ],
    },
  };
}

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function sanitizeIncomingPayload(body = {}) {
  const cleaned = {};
  for (const [k, v] of Object.entries(body || {})) {
    const lower = k.toLowerCase();
    if (RESTRICTED_KEYS.has(lower)) continue;
    if (!ALLOWED_INFO_FIELDS.includes(k)) continue;
    cleaned[k] = typeof v === 'string' ? redactSensitiveText(v.trim()) : cloneDeep(v);
  }
  return cleaned;
}

function projectApprovedPublicContent(approvedState, meta, publicAnnouncements = []) {
  const activeAdditionalLogos = (approvedState.logos?.additionalLogos || []).filter(
    (l) => l && l.isActive !== false && l.isApproved !== false
  );
  const universityLogo =
    approvedState.logos?.universityLogo &&
    approvedState.logos.universityLogo.isActive !== false &&
    approvedState.logos.universityLogo.isApproved !== false
      ? approvedState.logos.universityLogo
      : null;
  const collegeLogo =
    approvedState.logos?.collegeLogo &&
    approvedState.logos.collegeLogo.isActive !== false &&
    approvedState.logos.collegeLogo.isApproved !== false
      ? approvedState.logos.collegeLogo
      : null;

  return {
    collegeName: approvedState.collegeName,
    shortName: approvedState.shortName,
    universityName: approvedState.universityName,
    tagline: approvedState.tagline,
    heroTitle: approvedState.heroTitle,
    heroSubtitle: approvedState.heroSubtitle,
    heroBannerUrl: approvedState.heroBannerUrl,
    about: approvedState.about,
    mission: approvedState.mission,
    vision: approvedState.vision,
    coreValues: cloneDeep(approvedState.coreValues || []),
    programsOffered: cloneDeep(approvedState.programsOffered || []),
    officeInfo: cloneDeep(approvedState.officeInfo || {}),
    workflowOverview: cloneDeep(approvedState.workflowOverview || []),
    logos: {
      universityLogo: universityLogo ? cloneDeep(universityLogo) : null,
      collegeLogo: collegeLogo ? cloneDeep(collegeLogo) : null,
      additionalLogos: cloneDeep(activeAdditionalLogos),
      activeCount: [universityLogo, collegeLogo, ...activeAdditionalLogos].filter(Boolean).length,
    },
    featuredAnnouncements: publicAnnouncements.map((a) => ({
      id: a.announcement_id || a.id,
      title: redactSensitiveText(a.title),
      content: redactSensitiveText(a.content),
      targetAudience: a.target_audience || 'All',
      publishedAt: a.created_at,
    })),
    approvalStatus: 'Approved',
    publishedVersion: meta.publishedVersion,
    lastPublishedAt: meta.lastPublishedAt,
  };
}

const initialContent = buildDefaultContent();
const homepageState = {
  approved: cloneDeep(initialContent),
  draft: null, // Holds unapproved draft edits when publish=false
  publishedVersion: 1,
  lastPublishedAt: '2026-03-01T08:00:00.000Z',
  lastUpdatedAt: '2026-03-01T08:00:00.000Z',
  lastUpdatedBy: 'Ms. Carmela Ortiz (College Secretary)',
  history: [
    {
      version: 1,
      action: 'INITIAL_APPROVED_HOMEPAGE',
      published: true,
      timestamp: '2026-03-01T08:00:00.000Z',
      updatedBy: 'Ms. Carmela Ortiz (College Secretary)',
      summary: 'Initial approved MSU-Naawan CESS homepage information and official logos.',
      changedFields: ['initial'],
    },
  ],
};

const HomepageModel = {
  isSafeMediaUrl,

  async getPublicHomepage() {
    // Only surface strictly public announcements (is_published=true AND target_audience='All')
    const allPublicAnnouncements = await DirectoryModel.listAnnouncements({
      onlyPublished: true,
    }).catch(() => []);

    const strictlyPublic = allPublicAnnouncements.filter(
      (a) => a.is_published === true && /^all$/i.test(String(a.target_audience || ''))
    );

    return projectApprovedPublicContent(
      homepageState.approved,
      {
        publishedVersion: homepageState.publishedVersion,
        lastPublishedAt: homepageState.lastPublishedAt,
      },
      strictlyPublic.slice(0, 5)
    );
  },

  getPublicLogos() {
    const publicProj = projectApprovedPublicContent(homepageState.approved, {
      publishedVersion: homepageState.publishedVersion,
      lastPublishedAt: homepageState.lastPublishedAt,
    });
    return {
      approvalStatus: 'Approved',
      publishedVersion: homepageState.publishedVersion,
      lastPublishedAt: homepageState.lastPublishedAt,
      ...publicProj.logos,
    };
  },

  getManagementView() {
    return {
      approved: cloneDeep(homepageState.approved),
      draft: homepageState.draft ? cloneDeep(homepageState.draft) : null,
      hasPendingDraft: Boolean(homepageState.draft),
      publishedVersion: homepageState.publishedVersion,
      lastPublishedAt: homepageState.lastPublishedAt,
      lastUpdatedAt: homepageState.lastUpdatedAt,
      lastUpdatedBy: homepageState.lastUpdatedBy,
      historyCount: homepageState.history.length,
    };
  },

  updateCollegeInfo(body = {}, { updatedBy, reason = null, publish = true } = {}) {
    const sanitizedPatch = sanitizeIncomingPayload(body);
    const changedFields = Object.keys(sanitizedPatch);
    if (changedFields.length === 0) {
      const err = new Error('No valid homepage or college information fields were provided.');
      err.status = 400;
      throw err;
    }

    if (sanitizedPatch.heroBannerUrl && !isSafeMediaUrl(sanitizedPatch.heroBannerUrl)) {
      const err = new Error('heroBannerUrl must be a safe relative path or http(s)/image data URL.');
      err.status = 400;
      throw err;
    }

    const baseTarget = cloneDeep(homepageState.draft || homepageState.approved);
    for (const key of changedFields) {
      if (key === 'officeInfo' && typeof sanitizedPatch.officeInfo === 'object' && sanitizedPatch.officeInfo !== null) {
        baseTarget.officeInfo = {
          ...(baseTarget.officeInfo || {}),
          ...sanitizedPatch.officeInfo,
        };
      } else {
        baseTarget[key] = sanitizedPatch[key];
      }
    }

    const nowIso = new Date().toISOString();
    homepageState.lastUpdatedAt = nowIso;
    homepageState.lastUpdatedBy = updatedBy || 'College Secretary';

    if (publish) {
      homepageState.approved = baseTarget;
      homepageState.draft = null;
      homepageState.publishedVersion += 1;
      homepageState.lastPublishedAt = nowIso;
    } else {
      homepageState.draft = baseTarget;
    }

    const entry = {
      version: publish ? homepageState.publishedVersion : homepageState.publishedVersion,
      action: publish ? 'HOMEPAGE_INFO_PUBLISHED' : 'HOMEPAGE_DRAFT_SAVED',
      published: Boolean(publish),
      timestamp: nowIso,
      updatedBy: homepageState.lastUpdatedBy,
      reason: reason ? redactSensitiveText(String(reason).trim()) : null,
      summary: `${publish ? 'Published' : 'Staged draft'} homepage/college information update (${changedFields.join(', ')}).`,
      changedFields,
    };
    homepageState.history.unshift(entry);

    return {
      published: Boolean(publish),
      publishedVersion: homepageState.publishedVersion,
      historyEntry: entry,
      management: this.getManagementView(),
    };
  },

  updateLogos(body = {}, { updatedBy, reason = null, publish = true } = {}) {
    const { universityLogo, collegeLogo, additionalLogos } = body || {};
    const validateLogoObj = (logo, fallbackName) => {
      if (!logo || typeof logo !== 'object') {
        const err = new Error(`Invalid logo payload for ${fallbackName}.`);
        err.status = 400;
        throw err;
      }
      if (!isSafeMediaUrl(logo.url)) {
        const err = new Error(`Logo "${logo.name || fallbackName}" has an invalid or unsafe URL.`);
        err.status = 400;
        throw err;
      }
      return {
        id: String(logo.id || `logo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        name: redactSensitiveText(String(logo.name || fallbackName).trim()),
        url: String(logo.url).trim(),
        altText: redactSensitiveText(String(logo.altText || logo.name || fallbackName).trim()),
        isApproved: logo.isApproved !== undefined ? Boolean(logo.isApproved) : true,
        isActive: logo.isActive !== undefined ? Boolean(logo.isActive) : true,
      };
    };

    const baseTarget = cloneDeep(homepageState.draft || homepageState.approved);
    const nextLogos = cloneDeep(baseTarget.logos || {});
    const changed = [];

    if (universityLogo !== undefined) {
      nextLogos.universityLogo = validateLogoObj(universityLogo, 'University Seal');
      changed.push('universityLogo');
    }
    if (collegeLogo !== undefined) {
      nextLogos.collegeLogo = validateLogoObj(collegeLogo, 'College Logo');
      changed.push('collegeLogo');
    }
    if (additionalLogos !== undefined) {
      if (!Array.isArray(additionalLogos)) {
        const err = new Error('additionalLogos must be an array.');
        err.status = 400;
        throw err;
      }
      nextLogos.additionalLogos = additionalLogos.map((l, idx) => validateLogoObj(l, `Partner Logo ${idx + 1}`));
      changed.push('additionalLogos');
    }

    if (changed.length === 0) {
      const err = new Error('Provide universityLogo, collegeLogo, or additionalLogos.');
      err.status = 400;
      throw err;
    }

    baseTarget.logos = nextLogos;
    const nowIso = new Date().toISOString();
    homepageState.lastUpdatedAt = nowIso;
    homepageState.lastUpdatedBy = updatedBy || 'College Secretary';

    if (publish) {
      homepageState.approved = baseTarget;
      homepageState.draft = null;
      homepageState.publishedVersion += 1;
      homepageState.lastPublishedAt = nowIso;
    } else {
      homepageState.draft = baseTarget;
    }

    const entry = {
      version: homepageState.publishedVersion,
      action: publish ? 'HOMEPAGE_LOGOS_PUBLISHED' : 'HOMEPAGE_LOGOS_DRAFT_SAVED',
      published: Boolean(publish),
      timestamp: nowIso,
      updatedBy: homepageState.lastUpdatedBy,
      reason: reason ? redactSensitiveText(String(reason).trim()) : null,
      summary: `${publish ? 'Published' : 'Staged'} official institutional logo update (${changed.join(', ')}).`,
      changedFields: changed,
    };
    homepageState.history.unshift(entry);

    return {
      published: Boolean(publish),
      publishedVersion: homepageState.publishedVersion,
      logos: nextLogos,
      historyEntry: entry,
    };
  },

  publishDraft({ updatedBy, reason = null } = {}) {
    const nowIso = new Date().toISOString();
    const hadDraft = Boolean(homepageState.draft);
    if (homepageState.draft) {
      homepageState.approved = cloneDeep(homepageState.draft);
      homepageState.draft = null;
    }
    homepageState.publishedVersion += 1;
    homepageState.lastPublishedAt = nowIso;
    homepageState.lastUpdatedAt = nowIso;
    homepageState.lastUpdatedBy = updatedBy || 'College Secretary';

    const entry = {
      version: homepageState.publishedVersion,
      action: 'HOMEPAGE_DRAFT_APPROVED_AND_PUBLISHED',
      published: true,
      timestamp: nowIso,
      updatedBy: homepageState.lastUpdatedBy,
      reason: reason ? redactSensitiveText(String(reason).trim()) : null,
      summary: hadDraft
        ? `Approved and published staged homepage draft as v${homepageState.publishedVersion}.`
        : `Re-affirmed and published approved homepage v${homepageState.publishedVersion}.`,
      changedFields: ['publish'],
    };
    homepageState.history.unshift(entry);

    return {
      publishedVersion: homepageState.publishedVersion,
      lastPublishedAt: nowIso,
      historyEntry: entry,
      management: this.getManagementView(),
    };
  },

  getHistory(limit = 50) {
    return homepageState.history.slice(0, Math.max(1, Number(limit) || 50));
  },

  resetToDefaults() {
    homepageState.approved = cloneDeep(initialContent);
    homepageState.draft = null;
    homepageState.publishedVersion = 1;
    homepageState.lastPublishedAt = '2026-03-01T08:00:00.000Z';
    homepageState.lastUpdatedAt = '2026-03-01T08:00:00.000Z';
    homepageState.lastUpdatedBy = 'Ms. Carmela Ortiz (College Secretary)';
    homepageState.history = [
      {
        version: 1,
        action: 'INITIAL_APPROVED_HOMEPAGE',
        published: true,
        timestamp: '2026-03-01T08:00:00.000Z',
        updatedBy: 'Ms. Carmela Ortiz (College Secretary)',
        summary: 'Initial approved MSU-Naawan CESS homepage information and official logos.',
        changedFields: ['initial'],
      },
    ];
  },
};

module.exports = HomepageModel;

