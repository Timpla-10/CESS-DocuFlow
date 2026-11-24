const supabase = require('../config/database');

async function testConnection() {
  console.log('Testing Supabase Connection against:', process.env.SUPABASE_URL);

  try {
    // 1. Check Role table from supabase_schema.sql
    const { data: roles, error: roleErr } = await supabase.from('role').select('*');
    if (roleErr) {
      console.error('❌ Error querying role table:', roleErr.message);
    } else {
      console.log(`✅ Connected! Found ${roles.length} roles in 'role' table:`, roles.map((r) => r.role_name));
    }

    // 2. Check Office table
    const { data: offices, error: officeErr } = await supabase.from('office').select('*');
    if (officeErr) {
      console.error('❌ Error querying office table:', officeErr.message);
    } else {
      console.log(`✅ Found ${offices.length} offices in 'office' table:`, offices.map((o) => o.office_name));
    }

    // 3. Check "User" table
    const { data: users, error: userErr } = await supabase.from('User').select('*');
    if (userErr) {
      console.error('❌ Error querying "User" table:', userErr.message);
    } else {
      console.log(`✅ Found ${users.length} user(s) in '"User"' table.`);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testConnection();
