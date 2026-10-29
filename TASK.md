# TASK — Masjid Survey v108 (audit-fix batch)

GOAL: Post-audit fixes ek hi release me — dead code removal (DONE), guards removal (DONE),
prompt→modal (DONE), deceased counts + gender/marital tStr (PENDING), load-sample confirm (PENDING),
fonts self-host (PENDING), dict keys (PENDING), tests + deploy v108.

Plan/notes: AGENTS.md (v107 tak), PROJECT_PLAN.md, PRD.md

## v108 Steps
- [x] Dead fns + guards + magic-login removed; askEventReason modal + evr/evr-cancel delegation (cb-order BUG FIX)
- [x] Deceased live counts (detail/subtitle/members row/print males/export Men/Women/ID-card foot)
- [x] Gender/Marital tStr (filters value-attr sahi + form + lists + detail + print) + dict keys en+ur
- [x] load-sample confirm + modal/sample dict keys
- [x] Fonts self-hosted (fontface css + CSP strip + sw shell + woff2 files)
- [x] APP_VER v108 + CACHE v108, tests 184 green, audits en/hi/ur 0 (ta 186 = pehle se pending)
- [x] Deploy v108 (commit c785843 pushed; curl verify baad me ek baar)
- [ ] 9. v109 ROLE MODEL (Shan ka order): owner + user tiers
      1. migrateAdmins: role default = 'user' (owner Email = 'owner' locked; purana 'admin' role hata)
      2. userRole() helper (isOwner ke paas)
      3. Route guards: user ko adminpanel/users/settings/audit/idcard BAND
      4. navItems: user ke liye Administration/Settings/Audit/Backup-publish chhupe
      5. USER_DENIED acts list (export-excel/print-all/backup/publish/print-family/print-idcards/sample/clear/admin-mgmt)
      6. User allowed: dashboard/add/edit/detail/families/masjid save/find-edit/my-profile/password
      7. Tests: user session add family ok, settings route blocked, export denied, sidebar clean
      8. Deploy v109 + memory

## Decisions
- F12/right-click deterrent REMOVE (Shan approved); asli security = Supabase RLS
- Modal: birth = naam rakhta hai + event, death = deceased mark, other = normal remove
- Excel raw values (no tStr); enum translate sirf UI; ID card members = live count
- Role tiers: owner (locked) + user (data entry) — purana 'admin' tiers dissolve hokar user me merge hoga

## NOW:
v109 role model — step 3-5 pe hoon (route guards + USER_DENIED + sidebar)

## Previous releases (shaamil)
v104 commit 98176fe (favicon+mobile), v105 7554593 (Urdu RTL), v106 2228e09 (mobile fix+ur poora),
v107 86fee48 (carets+one-line) — sab live cache memc-app-v107 tak, tests 174 green.
Audit findings detail: AGENTS.md "AUDIT 2026-10-28" section.
