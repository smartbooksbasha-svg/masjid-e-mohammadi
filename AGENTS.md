# AGENTS.md — Masjid e Mohammadi · Khidmath Committee Survey

## What this is
Mohalla **survey / records web app** for Masjid e Mohammadi (Khidmath
Committee). One household record = section 1 (street, house no, house type)
+ members (section 2 demographics, 3 education, 4 profession, 5 deeni
taleem). Dashboard totals follow Shan's 5-section survey plan exactly.
UI = "Emerald Lattice" (emerald/mint, Sora + Manrope), day + night.

## Stack
Vanilla JS single-page app, no build step. Local-first via `localStorage`,
with an optional Supabase (Postgres) backend.

Files (deploy root = repo root, GitHub Pages serves `index.html`):
- `index.html`   — shell: auth screen, app shell (sidebar/topbar), print area
- `styles.css`   — Emerald Lattice design system, day + night tokens + survey
                   dashboard blocks (`.grp`, `.metrics`, `.metric`, `.split`)
- `app.js`       — all logic: auth, survey stats, dashboard, households,
                   household form, detail, users, settings, exports, QR, samples
- `config.js`    — `window.APP_CONFIG` (ORG name, FAMILY_ID_PREFIX, empty
                   SUPABASE_URL / SUPABASE_ANON_KEY)
- `supabase/schema.sql` — families + members + app_users, RLS ON,
                   `next_family_id()`; new survey columns + ALTER migrations
- `manifest.webmanifest` + `sw.js` + `icons/` — PWA. Bump `CACHE` in `sw.js`
                   on every web update or clients serve stale files.
- `ui-preview.html` — historical: the 3 design directions preview

## Survey data model (localStorage `memc_families`)
Household: `id` (MEMC-<year>-<6-digit>), `houseName`, `houseNo`, `street`,
`houseType` (`moulding|cement|other`), `address`, `phone`, `notes`,
`docs{}`, `custom[]`, members[].
Member: `name`, `relation`, `fatherName`, `motherName`, `gender`, `dob`,
`maritalStatus`, `children`, `educationLevel`
(`primary|higher_secondary|college|madarsa|none`), `sector`
(`private|government|business|none`), `religious` (`aalim|hafiz|both`),
`disability`, `govtScheme`.
Legacy records (no street / educationLevel) are migrated on read:
street → "Unassigned", free-text education → level via `inferEdu()`.

## Dashboard rules (computeStats — plan sections)
1. Location & Housing: unique streets, houses, house-type split, street table.
2. Demographics: families, population, children (age<18); men/women
   married · unmarried · physically challenged; women widow.
   Unmarried = everyone not "Married" (widow(er)/divorced included).
3. Education: students = level set AND age<26 (or unknown age); split
   primary / higher secondary / college / madarsa.
4. Professional: men & women × private / government / business.
5. Deeni: men & women Aalim / Hafiz (`both` counts in each).

## Roles
`super` (first-run setup; manage users) · `admin` (edit data) ·
`family` (view-only, linked via `familyId`, login ID = the Family ID).
Password = SHA-256 + per-user salt (`crypto.subtle`, fnv fallback).

## Commands
- Syntax check: `node --check app.js`
- Serve locally: `python -m http.server 8484` then `http://127.0.0.1:8484/`
- Smoke test (headless jsdom, 56 checks):
  `cd "$TMPDIR/zytest" && node smoke-survey.js`
  (harness lives outside the repo; script loads real index.html + app.js)

## Key conventions / gotchas
- **Form field reads use `form.elements.X`** (NOT `form.X`).
- All output goes through `esc()` (XSS). Keep it that way.
- Event handling is centralised: one `document` click delegation for
  `[data-act]`, one for `.seg` controls (`data-doc` / `data-hfield` /
  `data-mfield`), plus `input`/`change`/`submit` delegation. New buttons =
  add a `data-act="..."` branch, not a new listener.
- CDN deps loaded with `defer`: qrcode-generator@1.4.4, xlsx@0.18.5.
- Build ONE screen → test → next. Shan's rule.

## v2.1 additions (2026-10-26)
- House types now include **Palm leaf** (`palm`) — dashboard metrics + street
  table column + exports.
- **Family ID**: edit keeps the ID read-only; new records accept a custom ID
  (uppercased, `[A-Z0-9-_/]{3,32}`, uniqueness enforced) or auto-generate
  `MEMC-<year>-<seq>` via `previewFamilyId()`.
- **Per-member basic documents** (`BASIC_DOCS`: Aadhaar / Ration / Voter /
  BPL-Ayushman / Bank) — tap pills, stored as `member.docs[key]='yes'|'no'`.
- **Govt scheme** per member: `govtScheme` + `schemeName`.
- **Group 6 card** on dashboard: all-docs / no-docs counts, scheme applied vs
  not, per-document table, scheme-wise counts.
- **Masjid Profile screen** (`go('masjid')`, storage key `memc_masjid`,
  `MASJID_FIELDS`): 12 fields + note + up to 6 photos. Photos compressed in
  the browser (canvas, max 1100px, JPEG .72) before localStorage.
  Printed on the report header; exported as an Excel `Masjid` sheet.
- Family role can open Masjid Profile (read-only).

## v2.2 changes (2026-10-26, Shan's correction)
- **Occupation replaces the private/govt/business sector dropdown.** Field is
  free text `member.occupation` with a suggestion list `OCCUPATIONS`
  (`#occList` datalist). Legacy `sector` is mapped through `occName()`.
- Dashboard group 4 = **Occupations**: members-with-a-job, distinct count, and
  a table Occupation | Men | Women | Total (sorted by total).
- **Documents** now include Passport and TN Kapidu Thittam card (7 total).
- **Schemes are a multi-select** (`member.schemes = {key:'yes'}`) from the
  `SCHEMES` list: Magalir Urimai Thogai, disability / old age / widow pension,
  school scholarship, PM Awas, Ayushman, Ujjwala, bus pass, other.
  Old `govtScheme` + `schemeName` still read via `memberSchemes()`.
- Scheme table on dashboard group 6 shows per-scheme member counts.
- Tests: 81/81 green.

## State of things (2026-10-26)
Live: https://smartbooksbasha-svg.github.io/masjid-kidmat-records/
v2 survey upgrade: 5-section dashboard + extended household/member form +
Excel sheets (Members / Households / Survey Summary / Streets) + PDF summary.
Smoke test 75/75 green (v2.1).
Open: wire Supabase keys; real OTP SMS later.
- Note: login IDs/passwords live only in the browser localStorage — no
  password-reset flow yet (forgotten password = add reset or clear data).

## v3 — PUBLIC WEBSITE + SINGLE ADMIN (2026-10-26)
- Roles: **admin** (email login, `memc_admins`) + **anonymous public** (no session).
  Family/super logins hata diye; purane `memc_users` ek baar migrate hote hain.
- Public dekh sakta hai: dashboard (saare 6 groups + KPI), families list + detail,
  masjid photos. Nahin dekh sakta: phone (masked), edit/add/delete, export/print,
  Admins + Settings screens (public ho to sirf "Admin login" button).
- Admin login page: email + password + captcha; **forgot password** (email code →
  new password) aur **forgot user ID** (registered phone se email dhundho).
  Register: invite code (`config.js → ADMIN_INVITE_CODE`) + email verification code.
- Cloud: `SYNC` (app.js) — anon *read* + admin *write*; Supabase keys na ho to
  demo mode (local only) aur verification code screen par dikhta hai.
- Schema v3 (`supabase/schema.sql`) — public read allowed, phone/address column
  grants se anon ke liye blocked, writes sirf `is_admin()`.
- sw cache: `memc-app-v5`.
- QA: jsdom smoke 97/97 (`$TMPDIR/zytest/smoke-survey.js`).

## v17 — LANGUAGE SWITCH (2026-10-27)
- Public UI has 3 languages: **Hinglish (default) / English / Tamil**, picked in the
  topbar `#langSel` (persisted in `memc_lang`).
- How it works (`app.js`, block "i18n" just before MASJID PROFILE): the Hinglish
  strings already in the markup ARE the keys. `I18N.en` / `I18N.ta` map them;
  `translateTree()` rewrites live text nodes + `placeholder/title/aria-label`.
  Originals are kept in WeakMaps so switching back to Hinglish restores exactly.
  `setLang()` → renderShell() → go() → translateTree(); a MutationObserver on
  `document.body` re-translates after every render (`translateSoon`, 25ms debounce).
- Rule for new UI text: write it in Hinglish and add the same string to both dicts;
  anything missing simply stays Hinglish (safe fallback).
- Split mixed text nodes when a label is glued to dynamic text (e.g. category page
  uses `<span>public totals</span>`) — a text node only translates as a whole.
- sw cache: `memc-app-v17`. QA: jsdom smoke **115/115**.

## v18 — Islamic texture background (2026-10-27)
- Shan: "website ke background me ek islamic texture". Body ka purana dot-grid hata ke
  ek **girih lattice** (8-point star tile, 96px) lagaya — data-URI SVG, `--tex` var
  per theme (day `#0e7c66` @ .16 stroke, night `#3fd0ab` @ .15), no extra request,
  no build step. Top par soft `--glow` radial.
- `.masjid-hero::after` me wahi pattern thoda strong (76px) + horizontal mask (left
  transparent → right visible), `.mh-text` z-index:1. `background-attachment:fixed`
  jaan-boojh ke nahi (mobile iOS repaint).
- sw cache `memc-app-v18`. Smoke 115/115.

## v19 — PDF report: full family details + QR (2026-10-27)
- `printFamilies()` (app.js) ka card ab: header me **Family ID, street, house no,
  house type, phone, address, members (men/women/children), registered date/by** +
  right side **auto QR** (payload = `<FamilyID> | <house name> | <street>`, drawn by
  `renderQR` after `innerHTML`, library = CDN `qrcode-generator`).
- Member table (12 cols) ke neeche "Member details" list — DOB + age, gender, marital,
  father, mother, children, disability, education, occupation, deeni, documents
  (n/N + names), govt schemes (+ custom scheme name).
- Family-level documents (DOC_TYPES) + custom boxes (Yes/No) + notes bhi print hote hain.
- Print CSS: `.pchead`/`.pqr` page-break-inside avoid, `.pcard` auto, `tr` avoid.
- PDF = print → "Save as PDF" (browser ka print dialog); no server, no jsPDF.
- sw cache `memc-app-v19`. Smoke 121/121.

## Backup model (fact, 2026-10-27)
- `backupJSON()` → downloads `masjid-survey-backup-<date>.json` (families + masjid +
  admins, no photos), stamps `memc_lastbackup`; reminder banner after 7 days.
- Drive me rakhna MANUAL hai (Shan khud upload karta hai). Auto Drive upload nahi —
  uske liye Google OAuth Client ID chahiye (Shan ke Google account se banana padega).
- **Restore hai** (2026-10-27, v20): Settings → "Restore from backup file" → JSON
  chuno → confirm → families+masjid replace, admins sirf ADD hote hain (lockout nahi),
  seq max family-id se bump, phir cloud push (agar connected).
- **Google Drive upload** (v20): `config.js → GOOGLE_CLIENT_ID` (OAuth Web client,
  scope `drive.file`). Connect → folder `Masjid Records Backup` → multipart upload
  `masjid-survey-backup-<date>-<HHMM>.json`; last upload meta `memc_drive`
  (token sirf memory me, refresh nahi — 1 ghante baad silent re-auth try hota hai).
- Drive OFF hai jab tak Client ID khaali hai — UI setup guide dikhata hai, crash nahi.

## Drive enabled (2026-10-27, v21)
- `config.js → GOOGLE_CLIENT_ID` = committee's OAuth **Web application** client
  (project no. `206058317618`). Public by design (not a secret).
- Google Cloud side MUST have: Authorized JavaScript origin
  `https://smartbooksbasha-svg.github.io` + OAuth consent screen test user
  (Shan ka Gmail). Warna connect par `origin_mismatch` / `access_denied`.
- sw cache `memc-app-v21`. Smoke 134/134 (harness GOOGLE_CLIENT_ID blank karke
  offline path + runtime-enabled path dono test karta hai).

## Admin approval model (2026-10-27, v22 — FINAL)
- Shan ka order: public se koi khud admin nahi ban sakta; naya admin ka **User ID +
  temporary password app khud banati hai**, owner (Shan) approve karta hai, phir hi login.
- `createAdminRequest(name,email,phone,requestedBy)` — ek hi jagah se request banti hai:
  `userId = ADM-YYYY-NNNN` (`genUserId()`), `tempPass = genTempPass()` (9 chars),
  `salt`+`passHash` (hashPass), `status:'pending'`, `tempPass` sirf tab tak jab tak
  pehli baar login na ho (setSession me delete + `firstLoginAt`).
- Owner = `ownerEmail()` (`memc_owner` localStorage, default = pehla admin;
  pehle login par auto-set). `isOwner()` = currentUser.email === ownerEmail().
- `isAdmin()` → `migrateAdmins()` bhi chalata hai: purane records me `userId` + `status:'active'` bhar deta hai.
- Register/self-signup BAND: admins hone par `renderRegister()` → `renderRequestAccess()`
  (`#reqForm`, no password) → `renderRequestSent()` (User ID + pending badge + mailto/WhatsApp).
  Pehla admin (empty DB) hi normal register karta hai.
- Login field = **User ID ya Email** (`findAdminByIdentifier`); pending account block
  ("approval pending"). Cloud `signInWithPassword` ab bhi email se hota hai (ID se resolve).
- Admins screen (owner only): Pending requests table → Approve / Reject; "Naya admin request
  banao" form (name/email/mobile — koi password field nahi); Active admins table with User ID
  + Owner badge; non-owner ko sirf info ("owner: email") dikhta hai, koi approve/add/remove nahi.
- Approve par: `status:'active'`, cloud `signUp` (tempPass) chalta hai aur **owner app_users
  row banata hai** (`user_id: data.user.id`) — RLS ke wajah se row owner hi likh sakta hai.
- `cloudAutoLogin()` ab sirf approved admin ko andar leta hai: local record active ya
  `cloudIsListed(email)` (app_users row), warna `signOut` + "approved list me nahi" message.
- Settings → Account: User ID, login email, role (Owner/Admin), **Approval email (owner)**
  editable (`#ownerForm`, owner only), log out.
- `del-admin`, `approve-admin`, `reject-admin` sab owner-only guards ke saath.
- sw cache `memc-app-v22`. Smoke **152/152** (21 naye asserts: migration, self-register band,
  pending block, approve → login with user ID, tempPass clear, non-owner blocked).
- i18n keys naye: `User ID / Email`, `Request access`, `Request admin access`, `Create first admin`.

## v23 — security hardening (2026-10-27)
- **Data leak band**: pehle anon key se koi bhi `families`/`members` ka poora data padh sakta tha.
  Ab `supabase/security-v4.sql` (`revoke select ... from anon`) + naya **`public_snapshot`** table
  (id boolean PK, single row, RLS: public read / admin write). Public site sirf snapshot padhti hai.
- `publicPayload()` + `anonymizeFamily()`: sirf street/houseType/members survey fields — naam,
  phone, pata, notes, docs, bank/waqf kabhi nahi. `sourceFamilies()` public ke liye PUBDATA
  (`localStorage memc_pub`) deta hai, admin ke liye real data.
- `SYNC.publishSnapshot()` (admin save par auto + Settings "Public totals refresh"),
  `SYNC.pullPublic()` (snapshot), `SYNC.pullPublicLegacy()` (jab tak SQL v4 nahi chala —
  site blank na ho). `setSession`/`clearSession` `cloudPulled` reset karte hain.
- **PBKDF2** `hashPass()` (`pbkdf2$120000$hex`), `checkPass()` legacy sha256 + fnv bhi verify karta
  hai (purane accounts lock nahi hote). Login lockout: 5 galat → 60s (`LOGIN_TRIES`).
- **Vendored libs**: `vendor/qrcode.js`, `vendor/xlsx.full.min.js`; CDN hataye; `index.html` me
  CSP (object-src none, base-uri self, frame-ancestors none) + referrer policy + robots.
- CSS fixes: undefined `--accent-soft`/`--shadow-1` define kiye, card rhythm `#content .card`,
  sticky `th`, mobile table `min-width:560px`, `@media(hover:none)` hover reset,
  `prefers-reduced-motion`, 40px tap targets, `:focus-visible` ring, `.empty`, `.details/.steps`
  (collapsible setup guide), emoji → inline SVG (`ICON.*`, `themeIcon()`).
- Settings me naya **Security** card (public scope / RLS / PBKDF2 / lockout / approval).
  `SECURITY.md` = poora model + verification queries + incident steps.
- sw cache `memc-app-v23`. Smoke **176/176** (security payload, XSS, CSP/SQL asserts, PBKDF2 + lockout).
- ⚠️ Trap: `applyTheme()` load par turant chalta hai — `ICON` const uske baad define hota hai,
  isliye theme icons `ICON_SUN`/`ICON_MOON` (applyTheme se pehle) use karo, warna app boot par crash.

## v79 — every dashboard number is clickable (2026-10-28)
- Shan: "total students click karne par jo aata hai, waisa hi baaqi sab me karo".
  Ab **saare** dashboard metrics list kholte hain — sirf education/deeni nahi.
- Pattern (app.js): `metric(label, val, {f:'filterKey', act:'mlist|flist|slist', title})`
  → div me `data-act` + `data-f` + `data-title`; click delegation branch
  `act==='mlist'|'flist'` → `openList()` → `go('memberlist'|'familylist')`.
- Registries: `window.MF` (member filters, `mf(fn)` wrapper deceased ko hata deta hai),
  `window.MFD` (parameterised: `doc:k`, `nodoc:k`, `scheme:k`, `occupation:Name`,
  `house:moulding`, `street:Name`), `window.FF` logic inline `resolveFamilyFilter()`.
- Naye views: `viewMembersList` (Name/Age/Gender/Family ID/Street/View),
  `viewFamilyList` (Family ID/House/Street/House No/Type/Members/View),
  `viewStreetList` (street table, row → us street ke ghar). Routes + titles dono
  jagah add karo (go() aur popstate handler) — ek chhoot gaya to back button tut jaata hai.
- Har filter computeStats ki exact definition follow karta hai (eduKey + age<26,
  marital `!== married` = unmarried, religious aalim/both, `memberSchemes().length`),
  warna number aur list ka count mismatch hota hai. Deceased har filter se bahar.
- Keyboard: `role=button` + `tabindex=0` + global keydown (Enter/Space) handler.
- CSS: `.metric.click` hover, `tr.clickable:hover`, `.lnk`, `.pill[data-act]`,
  `@media(hover:none)` reset.
- `window.navTo` ke debug `alert()` hata diye (2 alert per sidebar click).
- sw cache `memc-app-v79`. Headless jsdom proof: **72/72** — har metric click karke
  list rows == dashboard number match kiya (`$TMPDIR/zyvo/zycount/count-smoke.js`).

## v80 — documents cleaned up + full app scan (2026-10-28)
- Shan: "documents me 12 empty boxes hain, hide karo — add document click se add ho".
- **Documents held** section ab: sirf wo document dikhta hai jo mark hai. `+ Add document`
  → inline picker (`#docsPicker`, `.dp-chips`) me bache hue DOC_TYPES; chip tap → `docs[k]='yes'`
  → row me aa jaata hai; `Remove` → wapas `'no'`. Khaali state me `.empty-mini` hint.
  Handlers: `add-doc` (open), `close-docs`, `pick-doc`, `unpick-doc`; `renderDocs()`.
- **Custom documents**: `padCustom()` (12 empty rows) hata diya → `normCustom()` sirf
  bhare hue rows rakhta hai (save par bhi strip). Purane 12-box records edit kholte hi saaf.
- Fixed: Family ID hint me toota text ("MEMC-2026-000101), warna…") — saaf Hinglish.
- Removed: dead `toggle-custom-docs` branch, `padCustom`, sample seed padding.
- **New features**: member/household list me live search (`filterRows(value, '#mlistTable')`);
  add-form me **Save & add another** (street + house type carry, baaki khaali) — survey speed.
- Verification (harness `$TMPDIR/zyvo/zycount/`): scan **167/167** (admin+public, saare views,
  zero runtime errors, no undefined/NaN/[object Object], no duplicate ids, har `data-act` handled),
  dashboard counts **72/72**, documents **21/21**, features **12/12**.
- sw cache `memc-app-v80`, commit `74fccdc`.

## Copy rule (2026-10-28)
- Dashboard labels Hinglish-first rakhna hai ("Scheme mili" / "Scheme nahi mili"), formal
  English ("Scheme applied") nahi — Shan ne kaha: "scheme no scheme bhi change kar du".
- Naya UI text Hinglish me likho aur `I18N.en` / `I18N.ta` me wahi string key ke saath add karo.

## v82 — scheme rows = member list (2026-10-28)
- Shan: "scheme wise count jab click karein to member ka naam, family id, View — waisa karo".
- `s.scheme.byName` rows (custom "Other scheme" naam + legacy `govtScheme` records) bhi ab
  clickable: `data-act="mlist" data-f="schemeName:<naam>"` → naya `MFD.schemeName` filter
  (member.schemeName match ya `memberSchemes()` me naam) → `viewMembersList` (Name/Age/Gender/
  Family ID/Street + View button).
- Yaad rakho: har bucket ke liye list ka title us row ka apna naam hona chahiye.
- Proof: `schemes-smoke.js` 13/13, poora suite 167/72/21/12 green. Cache `memc-app-v82`.
