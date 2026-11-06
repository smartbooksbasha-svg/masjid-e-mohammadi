/* ============================================================
   App config — Masjid e Mohammadi · Khidmath Committee Survey
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
  SUPABASE_URL: "https://yipxzbgqtyvfllrpqehs.supabase.co", // Shan ka project (2026-10-26)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcHh6YmdxdHl2ZmxscnBxZWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjczNjcsImV4cCI6MjEwODYwMzM2N30.7nopVZwAOvi6Wu3g3nM1Chxfwt5AHoaVlgFlgNa9qXM",  // e.g. "eyJhbGciOi..."
  /* Google Drive backup — free OAuth "Web application" client ID.
     console.cloud.google.com → APIs & Services → Library → enable "Google Drive API"
     → OAuth consent screen (External, add your email as test user)
     → Credentials → Create OAuth client ID → Web application
     → Authorized JavaScript origins: https://smartbooksbasha-svg.github.io
     → paste the client ID (…apps.googleusercontent.com) below. */
  GOOGLE_CLIENT_ID: "206058317618-ts99lgaath602onml5t35g4o7r1oihfn.apps.googleusercontent.com",
  DRIVE_FOLDER: "Masjid Records Backup",
  ORG_NAME: "Masjid e Mohammadi",
  /* committee owner — admin requests / approvals isi email par jaate hain */
  OWNER_EMAIL: "smartbooksbasha@gmail.com",
  ORG_SUB: "Khidmath Committee",
  FAMILY_ID_PREFIX: "MEMC",
  /* Public Find OTP (scan/family ID): server-side SMS required for real delivery.
     Set OTP_WEBHOOK_URL to an endpoint you control (POST JSON: {phone,familyId,purpose})
     that sends SMS and returns {ok:true,otpId?:string} or {ok:false,error:string}.
     Optional OTP_VERIFY_URL (POST {otpId,code,phone,familyId}) -> {ok:true/false}.
     Without webhook, OTP cannot be delivered from this static app. */
  OTP_WEBHOOK_URL: "",
  OTP_VERIFY_URL: ""
};
