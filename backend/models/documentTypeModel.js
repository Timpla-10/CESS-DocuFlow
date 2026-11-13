const supabase = require('../config/database');
const { ROLES } = require('../utils/roles');

/**
 * Standard description / summary metadata for document types
 */
const TYPE_DESCRIPTIONS = {
  1: 'Official completion form for removing an Incomplete (INC) academic grade within the prescribed 1-year residency.',
  2: 'Petition for change of matriculation, dropping an enrolled class, or adding an authorized subject section.',
  3: 'Official clearance and diploma application for graduating undergraduate students.',
  4: 'Official leave endorsement form for college faculty members endorsed by Department Chairperson and College Dean.',
  5: 'Official request for institutional travel, workshop attendance, or field visit endorsement for faculty personnel.',
  6: 'Comprehensive institutional clearance checklist for Integrated Developmental School students.',
};

/**
 * In-memory runtime stores for custom audiences and template URLs
 */
const TYPE_AUDIENCES = {};
const TYPE_TEMPLATES = {};

/**
 * Standard checklist requirements for document types (REQ-REQT-1,2,7)
 */
const DEFAULT_REQUIREMENTS = {
  1: [
    { form_name: 'Official INC Completion Form', is_required: true, source_office: "Registrar's Office", template_url: '/templates/INC_Form_Template.pdf' },
    { form_name: 'Affidavit / Grade Slip Copy', is_required: true, source_office: "Registrar's Office", template_url: null },
    { form_name: 'Official Assessment Receipt', is_required: false, source_office: 'Cashier / Accounting', template_url: null },
  ],
  2: [
    { form_name: 'Adding/Dropping/Changing Form', is_required: true, source_office: "Registrar's Office", template_url: '/templates/Add_Drop_Form_Template.pdf' },
    { form_name: 'Instructor Endorsement Slip', is_required: true, source_office: 'Department Chairperson', template_url: null },
  ],
  3: [
    { form_name: 'Application for Graduation Form', is_required: true, source_office: 'College Secretary', template_url: '/templates/Graduation_Application_Template.pdf' },
    { form_name: 'Transcript of Records / Evaluation Copy', is_required: true, source_office: "Registrar's Office", template_url: null },
    { form_name: 'Birth Certificate (PSA copy)', is_required: true, source_office: 'Philippine Statistics Authority', template_url: null },
  ],
  4: [
    { form_name: 'Civil Service Form No. 6 (Application for Leave)', is_required: true, source_office: 'HRMO', template_url: '/templates/CSC_Form_6_Leave.pdf' },
    { form_name: 'Medical Certificate / Clearance (if sick leave > 5 days)', is_required: false, source_office: 'University Clinic', template_url: null },
  ],
  5: [
    { form_name: 'Travel Order Request Form', is_required: true, source_office: 'HRMO / College Secretary', template_url: '/templates/Travel_Order_Template.pdf' },
    { form_name: 'Official Invitation Letter or Training Memo', is_required: true, source_office: 'Organizing Agency / Host', template_url: null },
    { form_name: 'Detailed Activity Design (DAD)', is_required: false, source_office: 'College Secretary', template_url: null },
  ],
  6: [
    { form_name: 'IDS Student Clearance Form', is_required: true, source_office: 'IDS Principal Office', template_url: '/templates/IDS_Clearance_Template.pdf' },
    { form_name: 'Library Clearance Slip', is_required: true, source_office: 'Campus Library', template_url: null },
  ],
};

const SLUG_MAP = {
  'inc': 1,
  'add-drop': 2,
  'graduation': 3,
  'leave': 4,
  'travel-order': 5,
  'clearance': 6,
};

function getAudienceForType(typeName = '') {
  const lower = typeName.toLowerCase();
  if (
    lower.includes('faculty') ||
    lower.includes('travel order') ||
    lower.includes('teaching load') ||
    lower.includes('service record') ||
    lower.includes('ipcr')
  ) {
    return 'faculty';
  }
  return 'student';
}

function normalizeRequirement(f, defaultDocTypeId = null) {
  if (!f) return null;
  const isReq = f.is_required !== undefined ? Boolean(f.is_required) : Boolean(f.required);
  return {
    form_id: f.form_id || f.id || null,
    id: f.form_id || f.id || null,
    doc_type_id: f.doc_type_id || defaultDocTypeId,
    form_name: f.form_name || f.label || 'Document Attachment',
    label: f.form_name || f.label || 'Document Attachment',
    is_required: isReq,
    required: isReq,
    source_office: f.source_office || f.source || 'Not specified',
    source: f.source_office || f.source || 'Not specified',
    template_url: f.template_url || f.templateUrl || null,
    templateUrl: f.template_url || f.templateUrl || null,
  };
}

function normalizeDocType(raw) {
  if (!raw) return null;
  const docTypeId = raw.doc_type_id;
  const customAudience = TYPE_AUDIENCES[docTypeId];
  const audience = raw.audience || customAudience || getAudienceForType(raw.type_name);
  const summary = raw.summary || raw.description || TYPE_DESCRIPTIONS[docTypeId] || `${raw.type_name} document processing.`;

  const dbForms = Array.isArray(raw.required_form) && raw.required_form.length > 0 ? raw.required_form : [];
  const rawRequirements = dbForms.length > 0 ? dbForms : DEFAULT_REQUIREMENTS[docTypeId] || [];
  const requirements = rawRequirements.map((f) => normalizeRequirement(f, docTypeId));

  const customTemplate = TYPE_TEMPLATES[docTypeId];
  const primaryTemplate = customTemplate || raw.template_url || (requirements.find((r) => r.template_url)?.template_url) || null;

  return {
    id: docTypeId,
    doc_type_id: docTypeId,
    name: raw.type_name,
    type_name: raw.type_name,
    origin: raw.origin,
    audience,
    standard_processing_days: raw.standard_processing_days,
    standardProcessingDays: raw.standard_processing_days,
    summary,
    description: summary,
    template_url: primaryTemplate,
    templateUrl: primaryTemplate,
    is_active: raw.is_active ?? true,
    requirements,
    required_forms: requirements,
    created_at: raw.created_at,
  };
}

const DocumentTypeModel = {
  /**
   * Fetches all document types with requirements joined
   * Defaults to active-only unless options.includeInactive is true
   */
  async findAll(options = {}) {
    let query = supabase
      .from('document_type')
      .select('*, required_form (*)')
      .order('doc_type_id', { ascending: true });

    if (!options.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(normalizeDocType);
  },

  /**
   * PB-10 & PB-44: Returns document types eligible for the caller's role and origin
   */
  async findEligibleForRole(role, origin = 'CESS', options = {}) {
    const all = await this.findAll(options);

    if (role === ROLES.SECRETARY) {
      return all;
    }

    let filtered = all.filter((t) => t.is_active);

    if (role === ROLES.STUDENT) {
      filtered = filtered.filter((t) => t.audience === 'student');
    } else if (role === ROLES.FACULTY) {
      filtered = filtered.filter((t) => t.audience === 'faculty');
    }

    if (origin && origin !== 'ALL') {
      filtered = filtered.filter((t) => !t.origin || t.origin === 'ALL' || t.origin === origin);
    }

    return filtered;
  },

  /**
   * Fetches a single document type by its ID or slug
   */
  async findById(docTypeIdOrSlug) {
    if (!docTypeIdOrSlug) return null;

    let numericId = Number(docTypeIdOrSlug);
    if (isNaN(numericId)) {
      numericId = SLUG_MAP[String(docTypeIdOrSlug).toLowerCase()] || null;
    }

    if (!numericId) {
      const { data } = await supabase
        .from('document_type')
        .select('*, required_form (*)')
        .ilike('type_name', `%${docTypeIdOrSlug}%`)
        .maybeSingle();
      return normalizeDocType(data);
    }

    const { data, error } = await supabase
      .from('document_type')
      .select('*, required_form (*)')
      .eq('doc_type_id', numericId)
      .maybeSingle();

    if (error) throw error;
    return normalizeDocType(data);
  },

  /**
   * PB-10 & PB-44 Acceptance Criterion: Server-side eligibility validation before submission
   */
  async isRoleEligible(docTypeIdOrSlug, role, origin = 'CESS') {
    const docType = await this.findById(docTypeIdOrSlug);
    if (!docType) {
      return { eligible: false, reason: 'Document type not found.' };
    }

    if (!docType.is_active) {
      return { eligible: false, reason: `Document type '${docType.name}' is currently inactive.` };
    }

    if (role === ROLES.SECRETARY) {
      return { eligible: true, docType };
    }

    if (role === ROLES.STUDENT) {
      if (docType.audience !== 'student') {
        return {
          eligible: false,
          docType,
          reason: `Document type '${docType.name}' is reserved for faculty and cannot be submitted by a Student.`,
        };
      }
    } else if (role === ROLES.FACULTY) {
      if (docType.audience !== 'faculty') {
        return {
          eligible: false,
          docType,
          reason: `Document type '${docType.name}' is reserved for students and cannot be submitted by Faculty.`,
        };
      }
    } else {
      return {
        eligible: false,
        docType,
        reason: `Role '${role}' is not authorized to submit document requests.`,
      };
    }

    // Origin check (CESS vs IDS)
    if (origin && docType.origin && docType.origin !== 'ALL' && origin !== 'ALL') {
      if (docType.origin !== origin) {
        return {
          eligible: false,
          docType,
          reason: `Document type '${docType.name}' is designated for ${docType.origin} and cannot be submitted under ${origin}.`,
        };
      }
    }

    return { eligible: true, docType };
  },

  /**
   * Helper to resolve numeric doc_type_id from ID, slug, or name
   */
  async resolveNumericId(docTypeIdOrSlug) {
    if (!docTypeIdOrSlug) return null;
    let numericId = Number(docTypeIdOrSlug);
    if (!isNaN(numericId)) return numericId;

    const mapped = SLUG_MAP[String(docTypeIdOrSlug).toLowerCase()];
    if (mapped) return mapped;

    const found = await this.findById(docTypeIdOrSlug);
    return found ? found.doc_type_id : null;
  },

  /**
   * PB-11: Fetch all required forms/attachments for a document type with source office
   */
  async getRequirementsByDocTypeId(docTypeIdOrSlug) {
    const numericId = await this.resolveNumericId(docTypeIdOrSlug);
    if (!numericId) return null;

    const { data, error } = await supabase
      .from('required_form')
      .select('*')
      .eq('doc_type_id', numericId)
      .order('is_required', { ascending: false })
      .order('form_id', { ascending: true });

    if (error) throw error;

    const forms = (data && data.length > 0) ? data : (DEFAULT_REQUIREMENTS[numericId] || []);
    return forms.map((f) => normalizeRequirement(f, numericId));
  },

  /**
   * PB-11 / REQ-REQT-1: Secretary / Admin adds a required form/attachment
   */
  async createRequirement(docTypeIdOrSlug, payload) {
    const numericId = await this.resolveNumericId(docTypeIdOrSlug);
    if (!numericId) {
      throw new Error('Document type not found.');
    }

    const formName = (payload.form_name || payload.label || '').trim();
    if (!formName) {
      throw new Error('Form name is required.');
    }

    const sourceOffice = (payload.source_office || payload.source || '').trim();
    const isRequired = payload.is_required !== undefined
      ? Boolean(payload.is_required)
      : (payload.required !== undefined ? Boolean(payload.required) : true);
    const templateUrl = payload.template_url || payload.templateUrl || null;

    const { data, error } = await supabase
      .from('required_form')
      .insert({
        doc_type_id: numericId,
        form_name: formName,
        is_required: isRequired,
        source_office: sourceOffice || 'Not specified',
        template_url: templateUrl,
      })
      .select()
      .single();

    if (error) throw error;
    return normalizeRequirement(data, numericId);
  },

  /**
   * PB-11 / REQ-REQT-1: Secretary / Admin updates a required form/attachment
   */
  async updateRequirement(formId, payload) {
    const numericFormId = Number(formId);
    if (isNaN(numericFormId)) {
      throw new Error('Invalid form ID.');
    }

    const updates = {};
    if (payload.form_name !== undefined || payload.label !== undefined) {
      updates.form_name = (payload.form_name || payload.label || '').trim();
    }
    if (payload.is_required !== undefined) {
      updates.is_required = Boolean(payload.is_required);
    } else if (payload.required !== undefined) {
      updates.is_required = Boolean(payload.required);
    }
    if (payload.source_office !== undefined || payload.source !== undefined) {
      updates.source_office = (payload.source_office || payload.source || '').trim();
    }
    if (payload.template_url !== undefined || payload.templateUrl !== undefined) {
      updates.template_url = payload.template_url || payload.templateUrl || null;
    }

    const { data, error } = await supabase
      .from('required_form')
      .update(updates)
      .eq('form_id', numericFormId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return normalizeRequirement(data, data.doc_type_id);
  },

  /**
   * PB-11 / REQ-REQT-1: Secretary / Admin deletes a requirement
   */
  async deleteRequirement(formId) {
    const numericFormId = Number(formId);
    if (isNaN(numericFormId)) {
      throw new Error('Invalid form ID.');
    }

    const { data, error } = await supabase
      .from('required_form')
      .delete()
      .eq('form_id', numericFormId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeRequirement(data, data.doc_type_id) : null;
  },

  /**
   * PB-44 / REQ-REQT-1: Secretary / Admin creates a new document type
   */
  async createDocumentType(payload) {
    const typeName = (payload.type_name || payload.name || '').trim();
    if (!typeName) {
      throw new Error('Document type name is required.');
    }

    const origin = (payload.origin || 'CESS').toUpperCase();
    const processingDays = Number(payload.standard_processing_days || payload.standardProcessingDays || 3);
    const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    const { data, error } = await supabase
      .from('document_type')
      .insert({
        type_name: typeName,
        origin,
        standard_processing_days: processingDays,
        is_active: isActive,
      })
      .select()
      .single();

    if (error) throw error;
    const newId = data.doc_type_id;

    if (payload.audience) {
      TYPE_AUDIENCES[newId] = payload.audience;
    }
    if (payload.description || payload.summary) {
      TYPE_DESCRIPTIONS[newId] = payload.description || payload.summary;
    }
    if (payload.template_url || payload.templateUrl) {
      TYPE_TEMPLATES[newId] = payload.template_url || payload.templateUrl;
    }

    const rawReqs = payload.requirements || payload.required_forms || [];
    if (Array.isArray(rawReqs) && rawReqs.length > 0) {
      for (const r of rawReqs) {
        if (r && (r.form_name || r.label)) {
          await this.createRequirement(newId, {
            form_name: r.form_name || r.label,
            is_required: r.is_required !== undefined ? Boolean(r.is_required) : Boolean(r.required ?? true),
            source_office: r.source_office || r.source || 'Not specified',
            template_url: r.template_url || r.templateUrl || null,
          });
        }
      }
    }

    return await this.findById(newId);
  },

  /**
   * PB-44 / REQ-REQT-1: Secretary / Admin updates an existing document type
   */
  async updateDocumentType(docTypeIdOrSlug, payload) {
    const numericId = await this.resolveNumericId(docTypeIdOrSlug);
    if (!numericId) {
      throw new Error('Document type not found.');
    }

    const updates = {};
    if (payload.type_name !== undefined || payload.name !== undefined) {
      updates.type_name = (payload.type_name || payload.name).trim();
    }
    if (payload.origin !== undefined) {
      updates.origin = payload.origin.toUpperCase();
    }
    if (payload.standard_processing_days !== undefined || payload.standardProcessingDays !== undefined) {
      updates.standard_processing_days = Number(payload.standard_processing_days || payload.standardProcessingDays);
    }
    if (payload.is_active !== undefined) {
      updates.is_active = Boolean(payload.is_active);
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('document_type')
        .update(updates)
        .eq('doc_type_id', numericId);

      if (error) throw error;
    }

    if (payload.audience !== undefined) {
      TYPE_AUDIENCES[numericId] = payload.audience;
    }
    if (payload.description !== undefined || payload.summary !== undefined) {
      TYPE_DESCRIPTIONS[numericId] = payload.description || payload.summary;
    }
    if (payload.template_url !== undefined || payload.templateUrl !== undefined) {
      TYPE_TEMPLATES[numericId] = payload.template_url || payload.templateUrl;
    }

    return await this.findById(numericId);
  },

  /**
   * PB-44 / REQ-REQT-1: Secretary / Admin toggles active status of document type
   */
  async setDocumentTypeActive(docTypeIdOrSlug, isActive) {
    const numericId = await this.resolveNumericId(docTypeIdOrSlug);
    if (!numericId) {
      throw new Error('Document type not found.');
    }

    const { error } = await supabase
      .from('document_type')
      .update({ is_active: Boolean(isActive) })
      .eq('doc_type_id', numericId);

    if (error) throw error;
    return await this.findById(numericId);
  },

  /**
   * PB-44 / REQ-REQT-1: Secretary / Admin soft-deletes/disables a document type
   * Keeps existing requests and historical records 100% intact
   */
  async deleteDocumentType(docTypeIdOrSlug) {
    return await this.setDocumentTypeActive(docTypeIdOrSlug, false);
  },

  /**
   * PB-44 / REQ-REQT-9,10: Secretary / Admin replaces document blank template
   */
  async replaceTemplate(docTypeIdOrSlug, templateUrl, formId = null) {
    const numericId = await this.resolveNumericId(docTypeIdOrSlug);
    if (!numericId) {
      throw new Error('Document type not found.');
    }

    TYPE_TEMPLATES[numericId] = templateUrl;

    if (formId) {
      await this.updateRequirement(formId, { template_url: templateUrl });
    } else {
      const forms = await this.getRequirementsByDocTypeId(numericId);
      if (forms && forms.length > 0) {
        await this.updateRequirement(forms[0].id, { template_url: templateUrl });
      }
    }

    return await this.findById(numericId);
  },
};

module.exports = DocumentTypeModel;
