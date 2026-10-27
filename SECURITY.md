# Security model — Mohalla Survey (Masjid e Mohammadi)

Ye file batati hai ki data kis tarah protected hai, kya public hai, aur kaunse kaam
**tumhe ek baar** karne hain. Har change ke baad `sw.js` ka cache version bump karo.

---

## 1. Kya public hai, kya nahi

| Data | Public website | Admin (login ke baad) |
|---|---|---|
| Streets, houses, house type totals | ✅ | ✅ |
| Members ki ginti (men/women/children), education, occupation, deeni, schemes | ✅ (sirf totals) | ✅ |
| Family ka naam, house no, phone, pata, notes | ❌ | ✅ |
| Member ka naam, father/mother, DOB, documents | ❌ | ✅ |
| Masjid profile (naam, imam, pata, photos, note) | ✅ | ✅ |
| Masjid bank / waqf / email | ❌ | ✅ |
| Admin list, app_users, phone/address columns | ❌ | ✅ |

Public ko data **anonymous snapshot** se milta hai: `public_snapshot` table ki ek hi row,
jisme har family ka sirf `street`, `houseType` aur members ke survey fields hote hain —
naam, phone, pata, notes, documents kahin nahi. Wo snapshot admin ke har save par khud
refresh hota hai (Settings → "Public totals refresh" se manually bhi).

## 2. Database (Supabase) — ye SQL ek baar chalao

`supabase/security-v4.sql` **Supabase → SQL Editor** me paste karke RUN karo.

Ye karta hai:
1. `anon` ka poora `select` `families` + `members` se hata deta hai (yahi sabse bada leak tha —
   anon key public hoti hai, isliye koi bhi `curl` se saara data nikaal sakta tha).
2. `masjid` par sirf public columns ka access deta hai (bank/waqf/email private).
3. `public_snapshot` table banata hai: public read, write sirf admin (`is_admin()`).
4. `app_users` par anon ka access band karta hai.

Verification (SQL editor):
```sql
select
  has_table_privilege('anon','public.families','select')        as anon_families,   -- false
  has_table_privilege('anon','public.members','select')         as anon_members,    -- false
  has_table_privilege('anon','public.public_snapshot','select') as anon_snapshot,   -- true
  has_table_privilege('anon','public.app_users','select')       as anon_admins;     -- false
```

Termux se bhi test kar sakte ho (URL + anon key `config.js` se):
```bash
URL=$(grep -o 'https://[a-z0-9]*\.supabase\.co' config.js | head -1)
KEY=$(grep -o 'SUPABASE_ANON_KEY: *"[^"]*"' config.js | sed 's/.*"\(.*\)"/\1/')
# 1) families: 401/403 aana chahiye
curl -s -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/families?select=id&limit=1" -H "apikey: $KEY"
# 2) snapshot: 200 aana chahiye
curl -s -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/public_snapshot?select=id" -H "apikey: $KEY"
```

## 3. Login / accounts

- Public se **koi admin nahi ban sakta**. "Request access" → `pending` request →
  owner approve karega tabhi login.
- Login ID + temporary password app khud banati hai (`ADM-YYYY-NNNN`) — temp password
  pehli login par khud mit jaata hai.
- Sirf **owner** admin add/approve/remove kar sakta hai (Settings → Approval email).
- 5 galat password → 60 second lock (per device).
- Password hashing: **PBKDF2-SHA256, 1,20,000 rounds** (purane sha256/fnv records bhi
  verify hote hain, isliye koi lockout nahi hota).
- Supabase side: `app_users` row sirf owner approve par banti hai; `cloudAutoLogin()`
  sirf approved email ko andar leta hai, warna sign-out.

## 4. App-side hardening

- **CSP** meta (`index.html`) — sirf apne origin + Supabase + Google + fonts.
  `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- QR aur Excel libraries **self-hosted** (`vendor/`) — CDN compromise ka risk khatam.
- Har user text `esc()` se escape hota hai (XSS test smoke me hai).
- Session localStorage me sirf email hai; cloud writes RLS-protected hain, isliye
  device par session edit karke cloud data badla nahi ja sakta.

## 5. Tumhare liye baaki kaam (one time)

1. `supabase/security-v4.sql` run karo (upar step 2).
2. Supabase → Authentication → Email Templates: **Confirm signup** aur **Reset password**
   dono me `{{ .Token }}` add karo (asli email/code ke liye).
3. Supabase → Authentication → URL Configuration:
   - Site URL: `https://smartbooksbasha-svg.github.io/masjid-e-mohammadi/app/`
   - Redirect URLs: `https://smartbooksbasha-svg.github.io/masjid-e-mohammadi/app/**`
4. Settings → "Public totals refresh" ek baar dabao (snapshot bharne ke liye).
5. Admin login karke ek test family add karo, phir public site (logout) me check karo ki
   totals badh gaye aur koi naam nahi dikh raha.

## 6. Agar kabhi leak ka shak ho

1. Supabase → Settings → API → **anon key rotate** karo, nayi key `config.js` me daalo.
2. `app_users` se ajnabi rows hatao (owner ke alawa).
3. Supabase → Auth → Users: unknown users delete karo.
4. Saare admin passwords reset karao (Forgot password flow).
5. `security-v4.sql` dobara chalao (idempotent hai).
