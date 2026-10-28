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

## v83 — "no scheme" row in the scheme-wise table (2026-10-28)
- Shan: "ujjwala / ayushman / PM sab barabar, last scheme (no scheme) purana jaisa hai — thik karo".
- Scheme-wise table ka aakhri row ab proper: **"Scheme nahi mili (koi scheme nahi)"** = `s.scheme.notApplied`,
  `data-act="mlist" data-f="schemeNone"` → same member list (Name/Age/Gender/Family ID/Street + View).
  Public category page me bhi wahi row (non-clickable). Style `tr.scheme-none` (italic, surface-2).
- Rule: koi bhi table bucket bina row ke na chhoote — count dikhta hai to uski row + list bhi honi chahiye.
- Suites: schemes 13, counts 72, scan 167, docs 21, features 12 — sab green. Cache `memc-app-v83`, commit `5a57551`.

## v84 — legacy "Scheme (old record)" row fixed (2026-10-28)
- BUG: purane record (`govtScheme:'yes'`, koi `schemeName` nahi) ke liye dashboard bucket ka naam
  `'Scheme (old record)'` tha, par `memberSchemes()` `'Scheme'` return karta tha → row count 1,
  click par list 0. Ab dono jagah **`LEGACY_SCHEME_LABEL = 'Scheme (old record)'`** (ek const).
- Rule: kisi bhi bucket ka label ek hi source se aaye — computeStats aur memberSchemes() kabhi
  alag string na banayein, warna count aur list mismatch hoti hai.
- Suites: schemes 17, counts 72, scan 167, docs 21, features 12 — green. Cache `memc-app-v84`, commit `39e1aac`.

## v85 — pura English i18n pass (2026-10-28)
- Problem: English select karne par bhi kai jagah Hinglish reh jaata tha (dashboard units, masjid profile,
  form hints, documents picker, toasts/dialogs).
- Fix 1 (dict): `I18N.en` me ~140 naye keys — dashboard colours/units (`ghar`, `log kaam par`, `scheme li`),
  category subs (`Ghar, raste aur makan ki qism`…), masjid profile labels/placeholders, form hints,
  documents picker, aur saare runtime toasts/errors (`Sirf owner`, `Kam se kam 6 characters.`…).
- Fix 2 (markup): jahan Hinglish kisi translated value ke saath ek hi text node me chipka tha, use alag
  `<span>` me toda — `viewCat` sub + `·`, masjid photo count + hint, backup reminder suffix.
  Rule: **ek text node = ek translatable string**; `${esc(x)} — hinglish` kabhi ek node me na likho.
- Fix 3 (native dialogs): `confirm()` DOM nahi hota, isliye `tStr()` se wrap kiya (admin delete,
  restore warning). Dynamic fragments (`din pehle backup liya`, `QR mila`, `Restore ho gaya`) bhi `tStr()`.
- Metric `title` se `— list dekho` suffix hataya (26 attribute keys ban rahe the); title ab plain.
- Naya test: `i18n-smoke.js` (38 asserts) — English mode me dashboard/masjid/form par Hinglish
  nahi bachna chahiye + `tStr()` + Tamil render. `i18n-scan.js` (admin/public scan) = 0 real leftovers.
- Suites: i18n 38, schemes 17, counts 72, scan 167, docs 21, features 12 — green. Cache `memc-app-v85`, commit `357e2ce`.

## v86 — 3 roles + admin login modal (2026-10-28)
- Roles: **Public** (read only) · **Admin** (add/edit data) · **Super Admin** = fixed owner email
  (`config.js OWNER_EMAIL`), locked — koi naya account kabhi super admin nahi banta.
- Login ab **modal** hai (`#authScreen` = fixed overlay + `.auth-wrap` card, `.auth-x` close):
  sirf User ID/Email + Password + "Forgot password?" + "Back to public site". Captcha, tabs,
  magic-link aur self-register (request access) **hata diye**; `authTabs`/`renderRegister`/
  `renderRequestAccess`/`renderRequestSent` functions delete ho gaye. Lockout (5 tries / 60s) intact.
- Public topbar/sidebar me ek hi **Admin** button (`data-act="open-auth"`).
- Super admin panel (`go('adminpanel')` → `viewAdminPanel` → `viewUsersTable`):
  "Add a new admin" form (`#addAdminForm`: name/email/mobile/age/photo) → `createAdminRequest`
  auto **User ID `ADM-YYYY-NNNN` + temp password** banata hai, status `active` (approval nahi chahiye),
  aur `credsCard()` me credentials + Email/WhatsApp/Copy dikhte hain.
  Har non-owner row par **Edit / Reset password / Remove** (owner-only guards).
- `reset-admin-pass`: naya temp password + naya salt/hash, creds card dobara dikhta hai.
- My Profile me **Change password** card (`#profPassForm`: current + new + confirm, `checkPass` verify).
- `credsMailto()` ab us admin ko jaata hai (subject/body naye login ke liye), owner ko nahi.
- Test: `auth-smoke.js` **50 asserts** (modal open/close, no register UI, super admin add form,
  auto ID/password, reset, plain-admin restrictions, real login by User ID, wrong password rejected).
- Suites: auth 50, scan 167, counts 72, docs 21, features 12, schemes 17, i18n 38 = **377 green**.
  Cache `memc-app-v86`, commit `09f8f47`.

## v87 — family ID card redesign (2026-10-28)
- `printIdCards(fam)` pura naya: header band me **logo crest** (`DB.logo()` upload hua ho to wahi,
  warna inline mosque SVG), org name + "Khidmat Committee · Mohalla Survey" + "Family ID Card" tag.
- Background: girih star pattern (data-URI SVG, `girihBg()`) + emerald radial glows + big dome watermark
  (`opacity .055`) — print par bhi safed/emerald me saaf.
- Layout: **left** = Family ID (mono, bold) + Head of family / Relation / DOB+age / Phone / Address;
  **right** (dashed divider) = QR box 20.5mm + "Scan to verify" + Family ID.
- Footer = members count + issue date + committee name. Card size ID-1 (85.6 × 53.98 mm) unchanged.
- Popup page me apna **Print / Save as PDF** button (`@media print` me chhup jaata hai) + auto print.
- `vendor/qrcode.js` ab **absolute URL** se load hota hai (`location.href` se base) — about:blank popup
  me relative path tootti thi.
- Test: `idcard-smoke.js` 24 asserts (structure, QR right column, head details left, absolute script,
  print CSS, uploaded-logo override). Total suites 401 green. Cache `memc-app-v87`, commit `6206152`.
- Preview file `idcard-preview.html` (repo root, gitignored) — `printIdCards` ka output capture karke
  localhost par dekhne ke liye.

## v88 — ID card: bada text, designer (super admin), back-side terms (2026-10-28)
- **Text bada**: saare card font sizes ab `IDCARD_DEFAULT.scale` (default 1.12) se multiply hote hain
  (`idCardCSS` me `pt(n) = (n*scale)pt`). Rows 6.1pt→6.8pt, Family ID 9.4pt→10.5pt, QR 21mm.
- **Back side**: har card ke saath doosra card chhapta hai — "Terms & Conditions" + text + Mutavalli /
  Secretary / Member signature lines. Print me `page-break-before:always` (alag page).
- **Designer (super admin only)**: route `idcard` → `viewIdCardDesign()`; Administration panel me
  "ID Card Design → Open designer" card. Fields: logo upload/remove, background photo upload/remove +
  strength slider (0-60), card colour (accent), text size (Normal/Bada/Bahut bada/Sabse bada),
  org/sub/tag, footer left/right, terms textarea; buttons Save / Preview / Reset.
  Storage: `memc_idcard` (`DB.idcard()/setIdcard()`), defaults `IDCARD_DEFAULT`, resolved by `idcardCfg()`.
- **BADA FIX**: `purgeNonOwnerAdmins()` pehle **saare non-owner admins delete** kar deta tha
  (v86 ke add kiye admins reboot par gayab!). Ab sirf: owner row ensure + kisi aur se `role:'owner'` strip;
  delete sirf un accounts ka jinke paas `passHash`/`cloud`/`pending` kuch bhi nahi (legacy junk).
- Suites: idcard 44 (designer fields, save round-trip, scale/bg/accent, plain-admin block), auth 50,
  scan 167, counts 72, docs 21, features 12, schemes 17, i18n 38 = **421 green**.
- Cache `memc-app-v88`, commit `4da26b5`. Preview `idcard-preview.html` (gitignored) regenerate:
  `node $TMPDIR/zyvo/zycount/idcard-preview.js`.

## v89 — signature photos + collapsed admin panel (2026-10-28)
- **Signatures on card back**: `sigMutavalli` / `sigSecretary` / `sigMember` in `memc_idcard`.
  Designer me har slot ke 2 buttons — **Camera** (`capture="environment"`) aur **Gallery** (+ Remove).
  `signatureImage(dataURL)` = canvas 760px, grayscale + threshold (lum>186 → white, warna dark) so white paper
  photo prints clean. `sigBox(src,label)` back card me image + line; khaali slot sirf line dikhata hai.
  `.idterms` ab flex column, `p` flex:1 overflow hidden, `.idsign` fixed 10.5mm → terms kabhi signature ko
  dhak nahi sakta.
- **Administration collapsed**: `state.showAddAdmin` / `state.showAdmins`. Panel sirf "Admins (n)" +
  **+ Add admin** + **View admins** dikhata hai. Form aur admin table sirf click par khulte hain
  (`admin-add`, `admin-add-cancel`, `admin-list`). Admin banne ke baad form khud band.
- Suites: idcard 50, auth 58, scan 169, counts 72, docs 21, features 12, schemes 17, i18n 38 = **437 green**.
- Cache `memc-app-v89`, commit `e817321`. Preview me sample signatures (`idcard-preview.js` me SVG sig).

## v90 — 3×5 inch card + QR always printed (2026-10-28)
- **Card size**: default ab **3×5 inch portrait** (76.2 × 127 mm). `c.size = '3x5' | 'id1'`
  (`IDCARD_DEFAULT.size='3x5'`, designer me "Card size" select). CSS ab flex-column shell —
  `.idcard{width/height per size; display:flex;flex-direction:column}`, `.idbody` portrait me column,
  id1 me row. 3×5 par font factor `s=1.5` (rows 10.25pt @ scale 1.12), QR box **33mm**.
- **QR print fix**: pehle QR popup ke andar `vendor/qrcode.js` se banta tha + 650ms par print — race me
  QR gayab ho jata tha. Ab `qrDataURL(text,700)` parent page me QR bana kar **PNG data URL** deta hai aur
  front card me `<img>` chhapta hai; popup me koi external script nahi. `.qrbox[data-qr]` me payload bhi hai.
- **Family ID auto**: `nextFamilyId(members)` = `YYYY` + 3-digit form no + `FM` + 2-digit members
  (e.g. `2026001FM04`); save par lagta hai, QR me `#qedit=<id>` encode hota hai → scan par wahi family khulti hai.
- Suites: idcard 57, auth 58, scan 169, counts 72, docs 21, features 12, schemes 17, i18n 38 = **444 green**.
- Cache `memc-app-v90`, commit `bf9f80e`. Preview me asli QR (python `qrcode` se inject) — `idcard-preview.js` + post-step.

## v91 — card 5×3 inch landscape default (2026-10-28)
- **Shan ka final spec: card = 5×3 inch landscape (127 × 76.2 mm)**. `IDCARD_DEFAULT.size='5x3'`.
- Size model ab teen modes: `5x3` (default, landscape, font ×1.32, QR 32mm, header 15.4mm, foot 7.4mm),
  `3x5` (portrait 76.2×127, font ×1.5, QR 33mm), `id1` (85.6×53.98, font ×1, QR 21mm).
  Layout ek hi flex shell: `.idcard{flex-direction:column}`, `.idbody` portrait me column warna row;
  right col width `${QR+7}mm`, footer/header padding mode ke hisaab se.
- Designer: "Card size" select me teeno options, hint "5×3 = chaudi card, QR bada aur text saaf".
- Suites: idcard 58, auth 58, scan 169, counts 72, docs 21, features 12, schemes 17, i18n 38 = **445 green**.
- Cache `memc-app-v91`, commit `7f04d81`.

## Backup (2026-10-28)
- Full backup Shan ke **Download folder** me: `masjid-survey-backup-<date>.zip` (source, .git chhod kar)
  aur `masjid-survey-repo-<date>.bundle` (git history, `git bundle create ... --all`).
  README: `Download/MASJID-SURVEY-BACKUP-README.txt`. Data (families) alag — app ke Settings → Backup (JSON).
- Zip command: `zip -rq "$OUT" masjid-kidmat-records -x "masjid-kidmat-records/.git/*"` (Termux me `zip` pkg).

## v92 — protection + timestamps + snapshot guard (2026-10-28)
- **Guards** (`installGuards()` in `init()`): right-click band (inputs/textarea me allowed for paste),
  F12 / Ctrl+Shift+I,J,C,K / Ctrl+U blocked, image drag band, throttled `softWarn()` toast.
  ⚠️ Yeh deterrent hai — DevTools console band nahi hota. Asli security = Supabase RLS (verified: anon
  `families`/`members`/`app_users` = 401, `masjid?select=bank` = 401, sirf `public_snapshot` + public
  masjid columns 200).
- **Timestamps**: `fmtDateTime()` helper. Family par `createdAt`/`createdBy`/`updatedAt`/`updatedBy`
  (create par updatedAt = createdAt, edit par bump + user). Detail me "Registered" + "Last updated" rows,
  households list me **Updated** column. Public page par "Data updated: <time>" (snapshot ka `at`, warna
  row ka `updated_at`).
- **Snapshot guard**: `PUBLIC_BANNED` + `stripPersonal()` — publish se pehle recursive strip
  (name/fatherName/motherName/phone/address/bank/aadhaar/notes/houseName/createdBy/updatedBy).
- **TESTS AB REPO ME**: `tests/smoke.js` (`npm test`, jsdom devDependency) — 68 asserts: boot, guards,
  family add + auto ID, timestamps, list/detail, ID card 5×3 + QR + signatures, designer, admin panel
  collapse, plain-admin limits, snapshot strip, public timestamp, i18n. ⚠️ Pehle harness `$TMPDIR` me tha
  aur delete ho gaya — tests sirf repo me rakho.
- Cache `memc-app-v92`, commit `6f49ede`.

## v93 — ID / password / Family ID formats (2026-10-28)
- **Settings → "ID & password format"** (super admin only, `#idsetForm`), storage `memc_idset`
  (`DB.idset()/setIdsSet()`), defaults `IDSET_DEFAULT`, resolver `idset()` (sanitizes: A-Z0-9-_ only,
  max 10 chars, prefix fallback ADM / MEMC).
- **Admin User ID** = `<adminPrefix>-<year>-<0001>[-<adminSuffix>]` — prefix fixed start, suffix optional end.
- **Temp password** = `<passPrefix>` + 6 random (2 upper + 2 lower + 2 digits) + `<passSuffix>`;
  prefix/suffix fix ho to bhi beech ka 6 hamesha random (guess-proof).
- **Family ID** default = random `MEMC-<yy><4 chars>` (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no 0/O/1/I),
  uniqueness loop against existing IDs. Settings me "Simple" style (`2026001FM04`) bhi chun sakte hain.
- `tests/preview.js` — card preview generator (sample family + sample signatures → `idcard-preview.html`,
  gitignored). Tests `npm test` 82 asserts green.
- Cache `memc-app-v93`, commit `a266fa5`.

## v94 — signed sessions + silent guards (2026-10-28)
- **Session signed:** `startSession(email,name)` = random 36-char token + `exp` (12h, `SESSION_MS`),
  admin record me sirf `sess:{h:fnv(token),exp}` + `lastLogin`. `currentUser()` reject karta hai jab
  token missing/galat ho ya record/session exp nikal gaya ho. `touchSession()` (click/keydown/touchstart,
  5-min throttle) expiry refresh karta hai. `setSession()` safe-fields list me `token`,`exp` add kiye
  (warna token drop ho jata tha — pehla bug).
- **Login paths:** saare `setSession({kind:'admin',email})` → `startSession(email)` (6 jagah).
- **Guards silent:** right-click / F12 / Ctrl+Shift+I,J,C,K / Ctrl+U par koi toast nahi — bas block.
- **Tests:** `boot()` me admin session ab `win.eval("startSession(email)")` se banti hai; 8 naye asserts
  (no session, forged session, wrong token, real token, expiry present, expired session, silent guard)
  → **90 asserts green**.
- **Server verify:** anon `families` INSERT/DELETE/PATCH = 0 rows (RLS), `public_snapshot` PATCH/DELETE
  ka payload hash same raha — data safe, sirf 204 (0 rows) milta hai.
- Cache `memc-app-v94`, commit `9e6c508`.

## v95 — owner audit log (2026-10-28)
- **Kya:** har kaam ka record — `{at, a, by, uid, email, t, d}` in `memc_audit` (cap `AUDIT_MAX` 1000),
  sirf owner ko dikhta hai (`viewAudit()`, route `audit`, sidebar item sirf `isOwner()` par).
- **Auto logging (diff-based):** `DB.setFamilies()` / `DB.setAdmins()` purani vs nayi list compare karte hain
  (`auditFamiliesDiff` / `auditAdminsDiff`) → add / edit (kaun se field: `naam, phone, members 1→2`…) / delete.
  Internal writes `{silent:true}` se chup: cloud pull, restore, purge, migrate, sample seed, session.
  `adminVolatile()` (sess/lastLogin/tempPass/firstLoginAt) strip → session refresh log ko spam nahi karta.
- **Explicit events:** login, login_fail, logout, publish, backup, restore, data_clear, masjid_save
  (`DB.setMasjid` hook), settings (`DB.setIdsSet` / `DB.setIdcard` hooks), owner email, password_change, audit_clear.
- **Screen:** filter chips (Sab/Login/Data/Admins/Settings), live search (DOM filter, re-render nahi),
  day grouping (Today/Yesterday/date), colour badges, CSV export (`exportAuditCSV`), clear (khud ki ek entry chhodta hai).
- **Cross-device (optional):** `SYNC.pushAudit()` / `SYNC.fetchAudit()` → `audit_log` table
  (`supabase/audit.sql`, RLS: insert+select sirf `authenticated`, anon revoke). Table na ho to chup-chaap local-only.
  Server rows view me merge hote hain (dedupe by id, `☁` mark).
- Tests **106 asserts green** (login record, add/edit/delete fields, admin add/remove, no session spam, owner-only, clear).
- Cache `memc-app-v95`, commit `15e4ee7`.

## v96 — QR on print + English default (2026-10-28)
- **QR bug (root cause):** `qrDataURL()` used the `QRCode` class (qrcodejs) — but `vendor/qrcode.js` is
  **qrcode-generator**, whose global is the `qrcode()` FUNCTION. `typeof QRCode === 'undefined'` → returned ''
  → card printed "QR unavailable". Fix: `qrSvgTag(text)` = `qrcode(0,'M')…createSvgTag({cellSize:4,margin:0,scalable:true})`
  and the card embeds that **inline SVG** inside `.qrbox` (no img load race, crisp in PDF). `qrDataURL()` ab SVG→data-URL.
- Print popup waits for every `document.images` (signature photos) to load before `window.print()`.
- Tests inline `vendor/qrcode.js` now, so QR output is really exercised: asserts `<svg>` inside `.qrbox`,
  no "QR unavailable", 2+ SVGs.
- **Language:** `LANGS = [['en','English'],['hi','Hinglish'],['ta','Tamil']]`, `LANG='en'` default (saved value wins),
  `setLang()` fallback → `en`. **Bug fixed:** v95 ka en-dict block `en` object ke BAAHAR chala gaya tha
  (`},` usse pehle aa gaya) — isliye audit/masjid keys ignore ho rahi thi; ab andar hai (en 392 keys).
  Masjid fields + audit sentences ki translations add.
- Tests **113 asserts green**. Cache `memc-app-v96`, commit `050173c`.
