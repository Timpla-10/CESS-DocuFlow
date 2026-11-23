const supabase = require('../config/database');
const { fromDbRoleName } = require('../utils/roles');

/**
 * Formats a raw `"User"` row + `user_role` + `user_office` into the unified profile object
 */
function normalizeUserRow(row) {
  if (!row) return null;

  const userRoles = Array.isArray(row.user_role) ? row.user_role : [];
  const primaryDbRole = userRoles[0]?.role?.role_name || 'Student';
  const { role, origin, roleLabel } = fromDbRoleName(primaryDbRole);

  const userOffices = Array.isArray(row.user_office) ? row.user_office : [];
  const officeIds = userOffices.map((uo) => uo.office_id).filter(Boolean);
  const officeNames = userOffices.map((uo) => uo.office?.office_name).filter(Boolean);

  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();

  return {
    id: row.user_id,
    user_id: row.user_id,
    name: fullName || row.university_email,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.university_email,
    role,
    dbRoleName: primaryDbRole,
    origin,
    roleLabel,
    department: row.department_or_office || 'CESS',
    position: roleLabel,
    account_status: row.account_status,
    is_whitelisted: row.is_whitelisted,
    active: row.account_status === 'Active' && row.is_whitelisted === true,
    officeIds,
    officeNames,
    created_at: row.created_at,
  };
}

const USER_SELECT = `
  *,
  user_role (
    role_id,
    role (
      role_id,
      role_name
    )
  ),
  user_office (
    office_id,
    office (
      office_id,
      office_name,
      office_type
    )
  )
`;

const UserModel = {
  async findById(id) {
    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .eq('user_id', id)
      .maybeSingle();
    if (error) throw error;
    return normalizeUserRow(data);
  },

  async findByEmail(email) {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .ilike('university_email', cleanEmail)
      .maybeSingle();
    if (error) throw error;
    return normalizeUserRow(data);
  },

  async findAll() {
    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeUserRow);
  },

  async getRoleIdByName(dbRoleName) {
    const { data, error } = await supabase
      .from('role')
      .select('role_id')
      .eq('role_name', dbRoleName)
      .maybeSingle();
    if (error) throw error;
    return data?.role_id || null;
  },

  async getOfficeIdByName(officeName) {
    if (!officeName) return null;
    const { data, error } = await supabase
      .from('office')
      .select('office_id')
      .eq('office_name', officeName)
      .maybeSingle();
    if (error) throw error;
    return data?.office_id || null;
  },

  // --- Whitelist Queries (Backed by "User" table with is_whitelisted = true) ---
  async getAllWhitelist() {
    const all = await this.findAll();
    return all.filter((u) => u.is_whitelisted);
  },

  async findWhitelistByEmail(email) {
    const user = await this.findByEmail(email);
    if (user && user.is_whitelisted) return user;
    return null;
  },

  // --- Pending Registrations Queries (Backed by "User" with account_status = 'Pending_Verification') ---
  async getAllPendingRegistrations() {
    const all = await this.findAll();
    return all.filter((u) => u.account_status === 'Pending_Verification');
  },

  async findPendingByEmail(email) {
    const user = await this.findByEmail(email);
    if (user && user.account_status === 'Pending_Verification') return user;
    return null;
  },

  async findPendingById(id) {
    const user = await this.findById(id);
    if (user) return user;
    return null;
  },
};

module.exports = UserModel;
