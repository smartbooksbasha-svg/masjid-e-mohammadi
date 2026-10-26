# PRD — Masjid e Mohammadi · Masjid Kidmat Committee Family Records
_v1.1 — 2026-10-26 · v2 adds the 5-section mohalla survey_

## 1. Product vision
Masjid-e-Mohammadi (mohalla) ki **Kidmat Committee** ke liye ek safe digital
register — har ghar aur har member ka poora record ek jagah, live dashboard
counts, auto Family ID + QR, aur PDF/Excel export. Data cloud (Supabase) me
surakshit, taaki sab committee members ek hi data dekh sakein.

## 2. Goals
- Family entry minute se kam samay me, ek hi screen par (family + member rows).
- Dashboard par 9 key numbers live, har ek apne box me.
- Har family → automatic **Family ID + QR code**.
- 3-level access: Super Admin > Admin > Family (view-only).
- Export: PDF, Excel (.xlsx), print document.
- Mobile-first; English UI.

## 3. Locked decisions (2026-10-09)
| # | Decision | Choice |
|---|---|---|
| 1 | Data storage | **Supabase free** (cloud Postgres + Auth) + localStorage fallback for offline/demo |
| 2 | Form structure | **Family form + member rows** (ek screen) |
| 3 | UI language | **English** |
| 4 | OTP | **Deferred** → demo/on-screen OTP placeholder abhi; real SMS baad me |

## 4. Users & permissions
| Role | Kaun | Permissions |
|---|---|---|
| Super Admin | Committee head (pehla setup wizard) | Sab: add/edit/delete, admins manage, family credentials banaye |
| Admin | Committee members | Add/edit records, export |
| Family Member | Mohalla family | Sirf apna record **view** (edit = disabled) |

## 5. Features (must-have)
1. **First-run setup wizard** — pehli baar khole to Super Admin form (naam,
   phone, ID, password) → save → uske baad login screen.
2. **Login** — 3 login types, same mechanism: ID + password, mobile OTP
   (demo), captcha. Family ID bhi ek login ID.
3. **Dashboard** — 9 stat boxes: Total Houses/Families · Men · Women ·
   Children · Married · Unmarried · Widow · Disability · Govt-Scheme.
4. **Family form** (one screen):
   - Family block: House/Family name, Address, Phone, House number.
   - Member rows (add/remove): Name, Father name, Mother name, DOB,
     Education, Marital status, Children count, Gender.
   - Documents per member/family: YES/NO toggles — Aadhaar, PAN, Passport,
     Birth Certificate, Voter ID, Ration Card, Driving Licence, Income
     Certificate, Disability Certificate, BPL/Ayushman + **10 empty custom
     boxes** (label user khud likhe).
5. **Family ID + QR** — save karte hi generate; screen par QR + printable ID.
6. **Records list** — searchable, filters (gender/status/document), pagination.
7. **Export** — per-record & bulk: PDF, Excel, print document.
8. **Role-based UI** — role 3 me edit/delete buttons hidden/disabled.

## 6. Non-functional
- Passwords hashed (Supabase Auth). Row Level Security: family sirf apna record.
- XSS-safe rendering (escape all user input). Input validation on every field.
- Fast on 4G; responsive 375px+; accessible labels & focus states.

## 7. User flows
- **Setup:** open → setup wizard → save Super Admin → login.
- **Entry:** login (captcha+OTP) → Dashboard → "Add Family" → form + members
  + docs → Save → Family ID+QR screen → export/print.
- **Family view:** login (Family ID+pass) → apna record read-only.

## 8. Out of scope (v1)
Payments/donations · SMS/WhatsApp blast · multi-masjid · native app ·
real SMS OTP (deferred).

## 9. Success metrics
Family entry < 2 min · dashboard counts exactly match raw data · export opens
in Excel & PDF viewer · all 3 role permission tests pass.


## 10. v2 — Mohalla Survey upgrade (2026-10-26)

Shan ka survey plan hi data model ban gaya. Har household record me:

1. **Location & Housing** — street name, house number, house type
   (moulding / cement sheet / other).
2. **Family & Demographics** — total families, men (married / unmarried /
   physically challenged), women (married / unmarried / physically
   challenged / widow), children under 18.
3. **Education** — students split: primary, higher secondary, college,
   madarsa.
4. **Professional** — men & women × private sector / government / business.
5. **Religious Education** — Aalim & Hafiz, men and women separately.

Dashboard in 5 numbered group cards + a street-wise table (street → houses →
moulding / cement sheet / other) + KPI row (streets · houses · families ·
population). Click a street row → filtered household list.

Exports: Excel = Members / Households / Survey Summary / Streets sheets;
PDF print = 5-section summary block + per-household member tables.
Legacy records stay readable (street → "Unassigned", free-text education
inferred into a level).


## v2.1 (2026-10-26) — requested additions
6. **Documents & Govt. Schemes** — per-member YES/NO for the five basic
   documents (Aadhaar, Ration, Voter, BPL/Ayushman, Bank) with a
   "how many have it / how many don't" table, plus scheme applied + scheme
   name, and scheme-wise counts.
7. **Palm leaf** house type added to section 1 (moulding / cement sheet /
   palm leaf / other).
8. **Family ID** — auto-generated, or committee can type its own ID.
9. **Masjid Profile** — masjid details (name, est. year, address, phone,
   imam, muazzin, area, capacity, rooms, madrasa, waqf, bank, note) and up
   to six photos; appears on printed reports + Excel `Masjid` sheet.
