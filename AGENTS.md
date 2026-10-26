# AGENTS.md — Masjid - E- Mohammadiy · Khidmath Committee Survey

## What this is
Mohalla **survey / records web app** for Masjid - E- Mohammadiy (Khidmath
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
