# PROJECT PLAN — Masjid e Mohammadi · Khidmath Committee Survey

**What:** Mohalla family-records website — har ghar/person ka data safely
save, dashboard counts, Family ID + QR, 3-role login, PDF/Excel export.
**Source folder:** `$HOME/masjid-kidmat-records`
**Pipeline:** webdev skill (loaded 2026-10-09) — one stage at a time, tick when done.
**Boot questions sent:** 2026-10-09 (data storage · form structure · UI language · OTP mode)

## Stages (webdev pipeline)

- [x] 1. Idea Discovery
- [x] 2. User Research
- [x] 3. Requirements (must/should/nice/future)
- [x] 4. PRD.md — full blueprint
- [x] 5. PRD Review — PRD v1.0 approved with preview gate (2026-10-09)
- [x] 8. UI Design System — direction 2 "Emerald Lattice" (EMERALD/mint,
      Sora + Manrope), DAY + NIGHT tokens in styles.css
- [x] 9. Technical Spec — vanilla SPA; index.html + styles.css + app.js +
      config.js; local-first localStorage, optional Supabase
      (supabase/schema.sql written)
- [x] 11. Implementation — DONE 2026-10-09. UI preview gate: 3 directions
      (repo smartbooksbasha-svg/masjid-kidmat-records, ui-preview.html).
      Shan picked direction 2 → full app built:
        index.html  · styles.css · app.js · config.js · supabase/schema.sql
      Auth (setup/login/captcha/OTP/roles), dashboard 9 stat boxes,
      families list + search/filter, add/edit family + member rows,
      documents YES/NO + 12 custom boxes, Family ID + QR, detail view,
      users mgmt (admin + family logins), settings, Word→no: Excel + PDF
      print + JSON backup, day/night theme.
- [x] 12. Testing — headless jsdom smoke test: 22/22 checks green
      (setup→login→captcha→OTP→dashboard→sample data→search→add family
      with members→detail→theme). Project per-screen rule honoured.
- [ ] 13. Responsive (375px + desktop polish pass)
- [~] 14. Security — SHA-256+salt password hash (crypto.subtle), role
      perms, XSS esc() on all output, input validation; cloud auth TBD
- [ ] 15-17. Perf / a11y / SEO polish
- [ ] 18. User Acceptance (real task for Shan)
- [ ] 19b. CUSTOMIZATION ROUND
- [ ] 21. Deploy — GitHub Pages (repo has Pages ON already)
- [ ] 22. Post-Launch

## Touchpoints (only these interrupt autonomy)

1. Boot questions — sent 2026-10-09 ✅
2. PRD validation (stage 5)
3. UI preview gate (stage 11) — 2-3 design directions, Shan picks
4. Customization round (19b)
5. Deploy approval

## Spec anchors (from Shan's brief, 2026-10-09)

- **Dashboard stat boxes:** total ghar · men · women · children · married ·
  unmarried · widow · disability · government-scheme — har ek alag text box me.
- **Family form:** name, father name, mother name, DOB, education, married,
  number of children, gender, phone, address + documents list YES/NO toggles
  (Aadhaar, PAN, Passport, Birth Certificate, …) + **10+ EMPTY custom boxes**.
- **On save:** auto Family ID + QR code generate.
- **3 logins (same mechanism on all):** 1) Super Admin 2) Admin
  3) Family Member — id + password create option, mobile OTP, captcha.
  Super admin = FIRST-RUN setup (details fill → then login appears).
- **Permissions:** roles 1 & 2 edit data; role 3 (family) view only.
- **Export:** PDF, Excel sheet, document file.
- **UI:** "accha UI" — preview gate will show 2-3 directions.

## Decisions (locked 2026-10-09)

- [x] **Data storage: Supabase free (cloud)** — real multi-user; app ships with
      localStorage fallback so everything demos before keys are added.
- [x] **Form structure: family form + member rows** (one screen).
- [x] **UI language: English** (language switcher possible later).
- [x] **OTP: deferred** — demo/on-screen OTP placeholder for now; real SMS
      (MSG91/Twilio) baad me decide.

## v2 — Survey upgrade (2026-10-26)

- [x] Shan ka 5-section survey plan → data model (street/house type,
      education level, work sector, deeni taleem)
- [x] Dashboard rebuilt: 5 group cards + street-wise table + KPI row
- [x] Household form + member fields extended; legacy migration on read
- [x] Detail view, Excel (4 sheets), PDF summary updated
- [x] jsdom smoke test rewritten — 56/56 green
- [ ] Real contact numbers / Supabase keys still open
