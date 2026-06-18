const SUPABASE_URL = 'https://wzmsmcnioyahvdyptjhs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Wq3UrQnkKQNJ3h5vv7Mj6w_VGXW5LNA';

window.SUPABASE_CONFIG = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };

if (window.supabase && typeof window.supabase.createClient === 'function') {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  window.supabaseClient = null;
}
