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
- **Import/restore abhi nahi hai** (koi `restoreJSON` nahi) — backup file wapas
  load karne ka button banana baaki kaam hai.
