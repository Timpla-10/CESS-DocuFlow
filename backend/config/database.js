const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Warning: Missing SUPABASE_URL or Supabase Key in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Creates a disposable, isolated Supabase Auth client using ONLY the public/publishable key
 * (never the service-role/secret key) so user password verification (`signInWithPassword`)
 * never mutates the shared privileged database client's Authorization state.
 */
supabase.createAuthClient = function createAuthClient() {
  const url = process.env.SUPABASE_URL || supabaseUrl;
  const publicKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !publicKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY for isolated password authentication.'
    );
  }

  return createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

module.exports = supabase;
