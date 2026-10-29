const supabase = require('../config/database');

const DOC_SELECT = `
  *,
  office:current_office_id (
    office_id,
    office_name,
    office_type
  ),
  document_type:doc_type_id (
    doc_type_id,
    type_name,
    origin,
    standard_processing_days
  ),
  document_attachment (*),
  document_history (
    *,
    office:action_office_id (
      office_id,
      office_name,
      office_type
    )
  )
`;

const ACTION_TO_STATUS = {
  Submitted: 'Submitted',
  Content_Verified: 'Under_Review',
  Routed: 'Under_Review',
  Endorsed: 'Under_Review',
  Approved: 'Under_Review',
  Returned: 'Returned',
  Rejected: 'Rejected',
  Sent_External: 'With_External_Office',
  Returned_External: 'Under_Review',
  Ready_for_Release: 'Ready_for_Release',
  Released: 'Released',
  Archived: 'Archived',
};

function normalizeDoc(raw) {
  if (!raw) return null;
  const history = Array.isArray(raw.document_history)
    ? [...raw.document_history].sort(
        (a, b) => new Date(a.action_timestamp) - new Date(b.action_timestamp)
      )
    : [];

  let current_status = raw.current_status;
  let current_office_id = raw.current_office_id;
  let office = raw.office;
  let is_deleted = raw.is_deleted;

  if (history.length > 0) {
    const latest = history[history.length - 1];
    if (latest.action_type === 'Archived') {
      is_deleted = true;
    }
    if (ACTION_TO_STATUS[latest.action_type]) {
      current_status = ACTION_TO_STATUS[latest.action_type];
    }
    if (latest.action_type === 'Returned' || latest.action_type === 'Rejected') {
      current_office_id = null;
      office = null;
    } else if (latest.action_office_id) {
      current_office_id = latest.action_office_id;
      office = latest.office || office;
    }
  }

  return {
    ...raw,
    id: raw.document_id,
    current_status,
    current_office_id,
    office,
    is_deleted,
    document_history: history,
  };
}

const DocumentModel = {
  async findAll() {
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('is_deleted', false)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeDoc).filter((d) => !d.is_deleted);
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('document_id', id)
      .maybeSingle();
    if (error) throw error;
    const doc = normalizeDoc(data);
    return doc && !doc.is_deleted ? doc : null;
  },

  async findByRequester(requesterId) {
    const { data, error } = await supabase
      .from('document_request')
      .select(DOC_SELECT)
      .eq('requester_id', requesterId)
      .eq('is_deleted', false)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeDoc).filter((d) => !d.is_deleted);
  },

  async getDefaultDocTypeId(origin = 'CESS') {
    const { data } = await supabase
      .from('document_type')
      .select('doc_type_id')
      .eq('origin', origin)
      .limit(1)
      .maybeSingle();
    if (data?.doc_type_id) return data.doc_type_id;

    const { data: fallback } = await supabase
      .from('document_type')
      .select('doc_type_id')
      .limit(1)
      .maybeSingle();
    return fallback?.doc_type_id || 1;
  },

  async create(docPayload) {
    const { data, error } = await supabase
      .from('document_request')
      .insert(docPayload)
      .select(DOC_SELECT)
      .single();
    if (error) throw error;
    return normalizeDoc(data);
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('document_request')
      .update({ ...updates, last_updated_at: new Date().toISOString() })
      .eq('document_id', id)
      .select(DOC_SELECT)
      .single();

    if (error) {
      // Fallback if DB trigger `trg_doc_request_updated_at` references `NEW.updated_at` instead of `NEW.last_updated_at`
      if (error.code === '42703') {
        const current = await this.findById(id);
        return { ...current, ...updates };
      }
      throw error;
    }
    return normalizeDoc(data);
  },

  async addHistory(historyEntry) {
    const { data, error } = await supabase
      .from('document_history')
      .insert(historyEntry)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async softDelete(id) {
    const { error } = await supabase
      .from('document_request')
      .update({ is_deleted: true })
      .eq('document_id', id);

    if (error && error.code === '42703') {
      await supabase.from('document_history').insert({
        document_id: id,
        revision_no: 1,
        action_type: 'Archived',
        action_remarks: 'Archived test record.',
      });
    }
  },
};

module.exports = DocumentModel;
