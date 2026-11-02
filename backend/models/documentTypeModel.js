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
  const audience = raw.audience || getAudienceForType(raw.type_name);
  const summary = raw.summary || TYPE_DESCRIPTIONS[docTypeId] || `${raw.type_name} document processing.`;

  const dbForms = Array.isArray(raw.required_form) && raw.required_form.length > 0 ? raw.required_form : [];
  const rawRequirements = dbForms.length > 0 ? dbForms : DEFAULT_REQUIREMENTS[docTypeId] || [];
  const requirements = rawRequirements.map((f) => normalizeRequirement(f, docTypeId));

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
    is_active: raw.is_active ?? true,
    requirements,
    required_forms: requirements,
    created_at: raw.created_at,
  };
}

const DocumentTypeModel = {
  /**
   * Fetches all active document types with requirements joined
   */
  async findAll() {
    const { data, error } = await supabase
      .from('document_type')
      .select('*, required_form (*)')
      .eq('is_active', true)
      .order('doc_type_id', { ascending: true });

    if (error) throw error;
    return (data || []).map(normalizeDocType);
  },

  /**
   * PB-10: Returns document types eligible for the caller's role and origin
   */
  async findEligibleForRole(role, origin = 'CESS') {
    const all = await this.findAll();

    if (role === ROLES.SECRETARY) {
      return all;
    }

    if (role === ROLES.STUDENT) {
      return all.filter((t) => t.audience === 'student');
    }

    if (role === ROLES.FACULTY) {
      return all.filter((t) => t.audience === 'faculty');
    }

    return all;
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
   * PB-10 Acceptance Criterion: Server-side eligibility validation before submission
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
      return { eligible: true, docType };
    }

    if (role === ROLES.FACULTY) {
      if (docType.audience !== 'faculty') {
        return {
          eligible: false,
          docType,
          reason: `Document type '${docType.name}' is reserved for students and cannot be submitted by Faculty.`,
        };
      }
      return { eligible: true, docType };
    }

    return {
      eligible: false,
      docType,
      reason: `Role '${role}' is not authorized to submit document requests.`,
    };
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
};

module.exports = DocumentTypeModel;
