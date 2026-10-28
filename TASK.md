# TASK — Masjid Survey v104

GOAL: QR scan par admin ko edit option, poora language switch, website icon (uploaded logo), aur mobile text layout fix.

Plan/notes: AGENTS.md (v103 tak), PROJECT_PLAN.md, PRD.md

## Steps
- [ ] 1. `renderFindResult`: admin ko **Edit household** + **Full record** buttons; public read-only hi rahe
- [ ] 2. i18n audit script: English mode me saare views render karke Hinglish text nodes dhoondo, dict me add karo
- [ ] 3. Website icon: uploaded committee logo (`memc_logo`) → favicon (dynamic) + brand crest; static PNG fallback
- [ ] 4. Mobile (360px) layout: overflow, font-size, table/card/text fixes
- [ ] 5. Tests + `node -c` + deploy v104 + Pages verify
- [ ] 6. AGENTS.md / vault / skill notes

## Decisions
- QR result edit sirf admin ke liye (privacy rule: public ko sirf anonymous view)
- Favicon upload se banti hai (data URL), static icons fallback

## NOW:
Step 1 — QR scan edit option

## v104 — DONE (2026-10-28, commit 98176fe, cache memc-app-v104)
- [x] QR find-result admin Edit + Full record buttons
- [x] i18n audit tools + 0 leftovers (en/hi/ta)
- [x] Uploaded logo → site favicon + auth crest (applyFavicon)
- [x] Mobile 360/380px text + table layout pass
- [x] Tests 164 green, deployed + verified live

## v105 — DONE (2026-10-28, commit 7554593, cache memc-app-v105)
- [x] Urdu dictionary (420 keys) + langSel option
- [x] RTL layout (dir attr, sidebar mirror, LTR for IDs/inputs, eye button, mobile drawer)
- [x] i18n verify 4 languages 0 leftover, tests 170 green, deployed + verified

## v106 — DONE (2026-10-28, commit 2228e09, cache memc-app-v106)
- [x] Mobile alignment regression revert (.kv text-align, table squeeze)
- [x] Urdu 615 keys + dynamic strings split into nodes + ID card labels tStr
- [x] ur-audit tool (208 -> 18, bache sirf data/brand words)
- [x] Tests 170, deployed + verified live
- [ ] Tamil full translation (186 leftovers) — pending
