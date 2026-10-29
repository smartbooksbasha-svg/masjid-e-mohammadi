# TASK — Masjid Survey v108 (audit-fix batch)

GOAL: Post-audit fixes ek hi release me — dead code removal (DONE), guards removal (DONE),
prompt→modal (DONE), deceased counts + gender/marital tStr (PENDING), load-sample confirm (PENDING),
fonts self-host (PENDING), dict keys (PENDING), tests + deploy v108.

Plan/notes: AGENTS.md (v107 tak), PROJECT_PLAN.md, PRD.md

## v108 Steps
- [x] Dead fns removed: sanitize, sanitizeInput, loginLocked, softWarn, docRow, viewUsers, viewSettings, qrDataURL; cloudAutoLogin = stub; magic-login dead handler removed — node -c OK, no dangling refs
- [x] installGuards: contextmenu/F12/Ctrl+U/dragstart guards hata diye; session touch listeners CHALU (touchSession intact)
- [x] add-member / remove-member ab askEventReason(cb) modal use karte hain (prompt('1,2,3') gaya); remove: death → mark deceased, birth → member rakhta hai, other → remove
- [ ] 1. askEventReason() helper + baat-soch par close (yeh MISSING — abhi call crash karega!) + evr / evr-cancel click delegation + scrim click close
- [ ] 2. load-sample confirm (deen par families empty ho) — 3 markup spots (2094/2287/4751 ke aaspaas) + delegation 4898
- [ ] 3. Decesed counts: detail men/women/subtitle/Members row + export Men/Women + print males + ID card footL members = alive count
- [ ] 4. Gender/Marital tStr: form options, detail table, print report, find result; dict keys en+ur (Male/Female/Other, Married/Unmarried/Widower/Divorced/Widow)
- [ ] 5. Modal keys en+ur: Reason?/Birth/Death/Other/Cancel/members added/member removed…/normal remove/add/Sample data loaded/sample-confirm-string
- [ ] 6. Fonts self-host: styles.css mein 2 @font-face (tools/_fonts.css tin hai), index.html 22-24 strip, CSP line 5 se fonts.googleapis/gstatic hatao, sw.js SHELL mein fonts add
- [ ] 7. APP_VER='v108', CACHE='memc-app-v108'
- [ ] 8. node -c + npm test (174+new) + ur-audit + i18n-verify
- [ ] 9. Commit + push + curl-verify 2x (Pages CDN ~1 min lag)
- [ ] 10. AGENTS.md / hot memory / SKILL.md / vault notes

## Decisions
-_rights: deterrent (F12/right-click) REMOVE — Shan approved waste list; asli security = Supabase RLS
- modal: birth reason = isliye naam rakhta hai, death par deceased mark, other = normal remove
- Excel raw values (no tStr); enum translate only UI
- ID card members count = live (non-deceased)

## NOW:
Step 1 — askEventReason helper add karo (remove-member/add-member iska intezaar kar rahe hain)

## Previous releases (shaamil)
v104 commit 98176fe (favicon+mobile), v105 7554593 (Urdu RTL), v106 2228e09 (mobile fix+ur poora),
v107 86fee48 (carets+one-line) — sab live cache memc-app-v107 tak, tests 174 green.
Audit findings detail: AGENTS.md "AUDIT 2026-10-28" section.
