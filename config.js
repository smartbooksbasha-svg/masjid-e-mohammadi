/* ============================================================
   App config — Masjid - E- Mohammadiy · Khidmath Committee Survey
   ------------------------------------------------------------
   The app runs fully on this device right now (localStorage).
   To turn on REAL cloud storage (multi-device, shared data),
   fill the two values below from your Supabase project, then
   run supabase/schema.sql in the Supabase SQL editor.

   Supabase dashboard: https://supabase.com/dashboard
   Project Settings → API → "Project URL" + "anon public" key.
   (The anon key is safe to expose publicly — it is protected by
    Row Level Security policies, not kept secret.)
   ============================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://xxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "",  // e.g. "eyJhbGciOi..."
  ORG_NAME: "Masjid - E- Mohammadiy",
  ORG_SUB: "Khidmath Committee",
  FAMILY_ID_PREFIX: "MEMC"
};
