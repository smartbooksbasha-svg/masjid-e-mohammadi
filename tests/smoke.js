/* Masjid Survey — jsdom smoke test (node tests/smoke.js)
   Boots the real index.html + app.js and drives the main flows. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL: ' + msg); } };

function buildHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.split('\n').filter(l => !/src="https?:/.test(l)).join('\n');
  for (const f of ['vendor/qrcode.js', 'config.js', 'app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('</script>').join('<\\/script>');
    const tag = f === 'vendor/qrcode.js' ? 'vendor/qrcode.js' : f;
    html = html.split('<script src="' + tag + '" defer></script>').join('<script>\n' + src + '\n</script>');
  }
  return html;
}

const OWNER = { name: 'Isthiyaque Basha', email: 'smartbooksbasha@gmail.com', userId: 'ADM-2026-0001', status: 'active', role: 'owner', passHash: 'x' };
const ADMIN = { name: 'Rahman', email: 'rahman@example.com', userId: 'ADM-2026-0002', status: 'active', role: 'admin', passHash: 'y' };

async function boot(opts) {
  const st = opts || {};
  let cap = '';
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(buildHtml(), {
    url: 'https://smartbooksbasha-svg.github.io/masjid-e-mohammadi/' + (st.hash || ''),
    runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_seq', String(st.seq || 0));
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify(st.admins || [OWNER]));
      if (st.families) w.localStorage.setItem('memc_families', JSON.stringify(st.families));
      if (st.admin) w.localStorage.setItem('memc_session', JSON.stringify({ kind: 'admin', email: st.admin, name: 'X' }));
      if (st.idcard) w.localStorage.setItem('memc_idcard', JSON.stringify(st.idcard));
      if (st.pub) w.localStorage.setItem('memc_pub', JSON.stringify(st.pub));
      w.open = function () { return { document: { write(h) { cap = h; }, close() {} } }; };
    }
  });
  await new Promise(r => setTimeout(r, 650));
  const win = dom.window;
  if (st.admin) {
    /* signed session (v94) — forged localStorage session kaam nahi karta */
    try { win.eval('startSession(' + JSON.stringify(st.admin) + ')'); win.renderShell(); win.go(st.view || 'dashboard'); } catch (e) {}
    await new Promise(r => setTimeout(r, 120));
  }
  return {
    win, doc: win.document,
    get html() { return cap; },
    $(sel) { return win.document.querySelector(sel); },
    text() { return win.document.querySelector('#content').textContent || ''; }
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms || 120));

(async () => {
  /* ---------------- 1. public visitor ---------------- */
  const P = await boot({});
  ok(!P.doc.querySelector('#appScreen').classList.contains('hidden'), 'app shell visible for public');
  ok((P.doc.querySelector('#content').textContent || '').trim().length > 20, 'public dashboard renders');
  ok(!/memc_families/.test(JSON.stringify(Object.keys(P.win.localStorage))), 'no family cache written on public boot');

  /* guards */
  const evCtx = new P.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  P.doc.querySelector('#content').dispatchEvent(evCtx);
  ok(evCtx.defaultPrevented, 'right-click blocked on content');
  const inp = P.win.document.createElement('input');
  P.doc.body.appendChild(inp);
  ok(!/Right-click band hai/.test(P.doc.querySelector('#toasts').textContent || ''), 'right-click blocked silently (no popup)');
  const evCtx2 = new P.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  inp.dispatchEvent(evCtx2);
  ok(!evCtx2.defaultPrevented, 'right-click allowed inside inputs (paste)');
  const evF12 = new P.win.KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true });
  P.doc.dispatchEvent(evF12);
  ok(evF12.defaultPrevented, 'F12 blocked');
  const evCtrlU = new P.win.KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true, cancelable: true });
  P.doc.dispatchEvent(evCtrlU);
  ok(evCtrlU.defaultPrevented, 'Ctrl+U blocked');
  const evShiftI = new P.win.KeyboardEvent('keydown', { key: 'I', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  P.doc.dispatchEvent(evShiftI);
  ok(evShiftI.defaultPrevented, 'Ctrl+Shift+I blocked');
  const evType = new P.win.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
  P.doc.dispatchEvent(evType);
  ok(!evType.defaultPrevented, 'normal typing not blocked');

  /* ---------------- 2. admin adds a household ---------------- */
  const A = await boot({ admin: OWNER.email });
  A.win.eval("go('add')"); await wait();
  ok(!!A.$('#famForm'), 'add household form renders');
  A.win.eval(`
    state.draft = Object.assign(blankDraft(), {
      street:'Test Street', houseNo:'12', houseName:'Test Head', phone:'9876543210',
      members:[{ name:'Test Head', gender:'Male', relation:'Head', dob:'1980-05-10', maritalStatus:'Married', educationLevel:'college' }]
    });
    saveFamily();
  `);
  await wait(200);
  const fams = JSON.parse(A.win.localStorage.getItem('memc_families') || '[]');
  ok(fams.length === 1, 'household saved');
  ok(/^MEMC-\d{2}[A-Z2-9]{4}$/.test(fams[0].id || ''), 'family id auto (random) generated: ' + (fams[0] && fams[0].id));
  ok(!!fams[0].createdAt, 'createdAt timestamp stored');
  ok(!!fams[0].createdBy, 'createdBy stored: ' + fams[0].createdBy);
  ok(!!fams[0].updatedAt, 'updatedAt timestamp stored');

  /* detail shows both timestamps */
  const fid = fams[0].id;
  A.win.eval("go('detail'," + JSON.stringify(fid) + ")"); await wait(180);
  const detail = A.text();
  ok(/Registered/.test(detail), 'detail shows Registered');
  ok(/Last updated/.test(detail), 'detail shows Last updated');
  ok(/\d{2}-\d{2}-\d{4} · \d{2}:\d{2}/.test(detail), 'timestamps include time');
  ok(detail.includes(fid), 'detail shows family id');

  /* edit keeps updatedAt newer */
  const t0 = fams[0].updatedAt;
  await wait(20);
  A.win.eval("state.draft = JSON.parse(JSON.stringify(DB.families()[0])); state.draft.phone='9876500000'; saveFamily();");
  await wait(150);
  const fams2 = JSON.parse(A.win.localStorage.getItem('memc_families'));
  ok(fams2[0].updatedAt >= t0, 'edit bumps updatedAt');
  ok(fams2[0].updatedBy && fams2[0].updatedBy === OWNER.email || /Isthiyaque|smartbooksbasha/.test(fams2[0].updatedBy || ''), 'edit records updatedBy');

  /* list shows Updated column */
  A.win.eval("go('families')"); await wait(200);
  A.win.eval("renderFamilyList()"); await wait(120);
  ok(/Updated/.test(A.text()), 'households list has Updated column');

  /* ---------------- 2b. ID / password format ---------------- */
  A.win.eval("DB.setIdsSet({idStyle:'seq', adminPrefix:'MEMC', adminSuffix:'KHD', passPrefix:'MC-', passSuffix:'-26', famPrefix:'MJ', famRandom:true})");
  const uid = A.win.eval('genUserId()');
  ok(/^MEMC-\d{4}-\d{4}-KHD$/.test(uid), 'admin id uses prefix + suffix: ' + uid);
  const pw = A.win.eval('genTempPass()');
  ok(/^MC-[A-Z2-9a-z]{6}-26$/.test(pw), 'password uses prefix + 6 random + suffix: ' + pw);
  const pw2 = A.win.eval('genTempPass()');
  ok(pw !== pw2, 'passwords differ each time');
  const fid2 = A.win.eval('nextFamilyId(0)');
  ok(/^MJ-\d{2}[A-Z2-9]{4}$/.test(fid2), 'family id uses configured prefix: ' + fid2);
  A.win.eval("DB.setIdsSet({famPrefix:'MEMC', famRandom:false})");
  const fid3 = A.win.eval('nextFamilyId(3)');
  ok(/^\d{4}\d{3}FM03$/.test(fid3), 'simple family id style still available: ' + fid3);
  A.win.eval("DB.setIdsSet(null)");

  /* ---------------- 3. ID card ---------------- */
  A.win.eval("printIdCards(DB.families()[0])"); await wait(120);
  const card = A.html;
  ok(card.length > 3000, 'card html generated');
  ok((card.match(/class="idcard"/g) || []).length === 2, 'front + back card');
  ok(/width:127mm/.test(card) && /height:76\.2mm/.test(card), '5x3 inch landscape size');
  ok(/width:32mm/.test(card), '32mm QR box');
  ok(card.includes('#qedit=' + encodeURIComponent(fid)), 'QR payload has family id');
  ok(/class="sg"/.test(card) && /Mutavalli/.test(card), 'signature slots on back');
  ok(/Terms &amp; Conditions/.test(card), 'terms on back');
  ok(!/vendor\/qrcode\.js/.test(card), 'no external qr script in print popup');
  ok(/<svg[^>]*>/.test(card) && /class="qrbox"[^>]*>\s*<svg/.test(card), 'QR prints as inline SVG inside the card');
  ok(!/QR unavailable/.test(card), 'no "QR unavailable" fallback on the card');
  ok((card.match(/<svg/g) || []).length >= 2, 'QR svg present for front card');

  /* ---------------- 3b. language: English default ---------------- */
  ok(A.win.eval('LANG') === 'en', 'website defaults to English');
  const sel = A.$('#langSel');
  ok(sel && sel.options[0].value === 'en' && sel.options[0].textContent === 'English', 'English is the first language option');
  ok(sel && sel.options.length >= 3, 'other languages stay available in the list');
  A.win.eval("setLang('hi')"); await wait(150);
  ok(/Household|Ghar|Add Household|Dashboard/.test(A.text()) && A.win.eval('LANG') === 'hi', 'switching to Hinglish still works');
  A.win.eval("setLang('en')"); await wait(150);

  /* ---------------- 4. designer ---------------- */
  A.win.eval("go('idcard')"); await wait(200);
  ok(!!A.$('#idcardForm'), 'designer opens for super admin');
  ['org', 'sub', 'tag', 'accent', 'scale', 'size', 'terms', 'footLeft', 'footRight', 'bgOpacity'].forEach(k =>
    ok(!!A.$('#idcardForm').elements[k], 'designer field: ' + k));
  ok(A.doc.querySelectorAll('[data-act="idc-sig"]').length === 6, 'camera + gallery for 3 signatures');
  ok(!!A.$('#idcardForm').querySelector('[data-act="idc-logo"]'), 'logo upload button');
  ok(!!A.$('#idcardForm').querySelector('[data-act="idc-bg"]'), 'background upload button');

  /* save a design with signatures */
  A.win.eval(`
    const f = document.querySelector('#idcardForm');
    f.elements.org.value = 'Masjid Test'; f.elements.size.value = '5x3'; f.elements.scale.value = '1.24';
    saveIdcardForm(f);
  `);
  await wait(150);
  const saved = JSON.parse(A.win.localStorage.getItem('memc_idcard'));
  ok(saved.org === 'Masjid Test' && saved.size === '5x3' && Number(saved.scale) === 1.24, 'designer saves size + scale');

  /* ---------------- 4b. ID format settings form ---------------- */
  A.win.eval("go('adminpanel')"); await wait(200);
  ok(!!A.$('#idsetForm'), 'ID format form present for owner');
  ['adminPrefix','adminSuffix','passPrefix','passSuffix','famPrefix','famRandom'].forEach(k =>
    ok(!!A.$('#idsetForm').elements[k], 'idset field: ' + k));
  A.win.eval(`
    const f = document.querySelector('#idsetForm');
    f.elements.idStyle.value='seq';
    f.elements.adminPrefix.value='MASJID'; f.elements.adminSuffix.value='TN';
    f.elements.famPrefix.value='MEMC'; f.elements.famRandom.value='1';
    saveIdsetForm(f);
  `);
  await wait(200);
  const ids = JSON.parse(A.win.localStorage.getItem('memc_idset'));
  ok(ids.adminPrefix === 'MASJID' && ids.adminSuffix === 'TN', 'idset saved');
  ok(/^MASJID-\d{4}-\d{4}-TN$/.test(A.win.eval('genUserId()')), 'new admin id follows saved format');

  /* ---------------- 5. admin panel collapse ---------------- */
  A.win.eval("go('adminpanel')"); await wait(200);
  ok(!A.$('#addAdminForm'), 'add-admin form hidden by default');
  const addBtn = A.$('[data-act="admin-add"]');
  ok(!!addBtn, 'single Add admin button present');
  addBtn.click(); await wait(200);
  ok(!!A.$('#addAdminForm'), 'form shows after Add admin');
  ok(!!A.$('[data-act="admin-add-cancel"]'), 'cancel button present');
  A.$('[data-act="admin-add-cancel"]').click(); await wait(150);
  ok(!A.$('#addAdminForm'), 'cancel hides the form');
  A.$('[data-act="admin-list"]').click(); await wait(180);
  ok(/Hide admins/.test(A.text()), 'view admins toggles the list');

  /* ---------------- 6. plain admin restrictions ---------------- */
  const B = await boot({ admin: ADMIN.email, admins: [OWNER, ADMIN] });
  ok(B.win.eval('isOwner()') === false, 'plain admin is not owner');
  ok(B.win.eval('isAdmin()') === true, 'plain admin can edit data');
  B.win.eval("go('idcard')"); await wait(150);
  ok(/Super admin only/.test(B.text()), 'plain admin cannot open designer');
  B.win.eval("go('adminpanel')"); await wait(150);
  ok(!B.$('[data-act="admin-add"]'), 'plain admin has no add button');

  /* ---------------- 6b. session forgery blocked ---------------- */
  const F = await boot({});   /* no admin session */
  ok(F.win.eval('isAdmin()') === false, 'no session = not admin');
  F.win.localStorage.setItem('memc_session', JSON.stringify({ kind:'admin', email: OWNER.email, name:'x' }));
  F.win.renderShell(); await wait(150);
  ok(F.win.eval('isAdmin()') === false, 'forged session without token is rejected');
  F.win.localStorage.setItem('memc_session', JSON.stringify({ kind:'admin', email: OWNER.email, token:'fake-token', exp: Date.now()+999999 }));
  F.win.renderShell(); await wait(150);
  ok(F.win.eval('isAdmin()') === false, 'wrong token is rejected');

  const G = await boot({ admin: OWNER.email });
  ok(G.win.eval('isAdmin()') === true, 'real login session works');
  const sess = JSON.parse(G.win.localStorage.getItem('memc_session'));
  ok(!!sess.token && sess.token.length > 20, 'session carries a random token');
  ok(sess.exp > Date.now(), 'session has an expiry');
  G.win.localStorage.setItem('memc_session', JSON.stringify(Object.assign({}, sess, { exp: Date.now() - 1000 })));
  G.win.renderShell(); await wait(120);
  ok(G.win.eval('isAdmin()') === false, 'expired session is rejected');

  /* ---------------- 7. public snapshot has no personal data ---------------- */
  const snap = A.win.eval('JSON.stringify(publicPayload().families)');
  const blob = String(snap);
  ['"name"', '"phone"', '"address"', '"bank"', '"aadhaar"', '"notes"'].forEach(bad =>
    ok(blob.indexOf(bad) === -1, 'public snapshot has no ' + bad));
  ok(/"street"/.test(blob), 'public snapshot keeps anonymous street');
  ok(/"at":"/.test(A.win.eval('JSON.stringify({at:publicPayload().at})')), 'public snapshot carries a timestamp');

  /* public dashboard shows the snapshot time */
  const P2 = await boot({ pub: { at: '2026-10-28T06:56:10.799Z', families: [
      { id:'p1', street:'Masjid Road', houseType:'moulding', createdAt:1792335691132,
        docs:{}, custom:[], members:[{ gender:'Male', dob:'1980-04-12', maritalStatus:'Married', children:'2' }] } ],
    masjid:{ name:'Masjid e Mohammadi' } } });
  const pubText = P2.doc.querySelector('#content').textContent || '';
  ok(/Data updated:/.test(pubText), 'public dashboard shows data timestamp');
  ok(/28-10-2026/.test(pubText), 'timestamp is formatted with date');
  ok(!/1980-04-12/.test(pubText), 'public page does not print raw DOB');

  /* ---------------- 8. i18n switch ---------------- */
  A.win.eval("setLang('en')"); await wait(200);
  ok(!/Naya admin add karo/.test(A.text()) || /English|Admins/.test(A.text()), 'english switch applied');

  /* ---------------- 8b. audit log (kisne kya kiya) ---------------- */
  const AU = await boot({ admin: OWNER.email });
  const logs = () => JSON.parse(AU.win.localStorage.getItem('memc_audit') || '[]');
  ok(logs().some(r => r.a === 'login' && /Isthiyaque/.test(r.by)), 'login is recorded with the user name');
  AU.win.eval("auditSave([])");

  /* add a household through the real save path */
  AU.win.eval("state.draft = blankDraft(); state.draft.street='Audit Street'; state.draft.houseType='cement'; state.draft.houseName='Audit Family'; state.draft.members=[{name:'Head',gender:'Male',dob:'1980-01-01',maritalStatus:'Married'}]; go('add')");
  await wait(150);
  AU.win.eval("saveFamily(false)");
  await wait(150);
  const addRow = logs().filter(r => r.a === 'family_add');
  ok(addRow.length === 1, 'household add is logged');
  ok(/Audit Family/.test(addRow[0].t), 'log entry carries the household name');
  ok(/1 members/.test(addRow[0].d), 'log entry carries member count');

  /* edit it */
  const afid = AU.win.eval("DB.families()[0].id");
  AU.win.eval("(function(){ const f=DB.families(); f[0].phone='9876543210'; f[0].members.push({name:'Two',gender:'Female',dob:'1985-02-02',maritalStatus:'Married'}); DB.setFamilies(f); })()");
  const editRow = logs().filter(r => r.a === 'family_edit');
  ok(editRow.length >= 1, 'household edit is logged');
  ok(/phone/.test(editRow[0].d) && /members 1→2/.test(editRow[0].d), 'edit log names the changed fields');

  /* delete it */
  AU.win.eval("DB.setFamilies(DB.families().filter(f=>f.id!=='" + afid + "'))");
  ok(logs().some(r => r.a === 'family_delete' && /Audit Family/.test(r.t)), 'household delete is logged');

  /* admin add/remove */
  AU.win.eval("(function(){ const a=DB.admins(); a.push({name:'New Guy',email:'new@example.com',userId:'ADM-2026-0009',status:'active'}); DB.setAdmins(a); })()");
  ok(logs().some(r => r.a === 'admin_add' && /New Guy/.test(r.t)), 'admin add is logged');
  AU.win.eval("DB.setAdmins(DB.admins().filter(a=>a.email!=='new@example.com'))");
  ok(logs().some(r => r.a === 'admin_remove' && /New Guy/.test(r.t)), 'admin remove is logged');

  /* session housekeeping must not spam the log */
  const before = logs().length;
  AU.win.eval("touchSession()");
  AU.win.eval("startSession('" + OWNER.email + "')");
  ok(logs().length <= before + 1, 'session refresh does not spam the audit log');

  /* owner-only screen */
  AU.win.eval("go('audit')");
  await wait(120);
  ok(!!AU.doc.querySelector('#auditList'), 'audit screen renders for owner');
  ok(/Household add/.test(AU.doc.querySelector('#content').textContent), 'audit rows show action labels');
  ok(AU.doc.querySelectorAll('.aud-row').length >= 4, 'audit rows are listed');

  const AD = await boot({ admin: ADMIN.email, admins: [OWNER, ADMIN] });
  ok(!AD.doc.querySelector('#nav').textContent.includes('Audit log'), 'plain admin does not see the audit menu');
  AD.win.eval("go('audit')");
  await wait(120);
  ok(/Super admin only/.test(AD.text()), 'plain admin cannot open the audit screen');

  /* clear keeps one honest entry */
  AU.win.eval("auditSave([]); audit('audit_clear','Audit log','x')");
  ok(logs().length === 1 && logs()[0].a === 'audit_clear', 'audit clear leaves a single record of itself');

  /* ---------------- 8bb. login guard: 3 try = 5 min lock, 6 = panel hide ---------------- */
  const GD = await boot({});
  GD.win.eval('guardReset()');
  GD.win.eval('loginFailed(); loginFailed(); loginFailed()');
  ok(GD.win.eval('guardLocked()') === true, '3 wrong attempts lock the login');
  ok(GD.win.eval('guardHidden()') === false, 'panel still visible after 3 attempts');
  GD.win.eval("openAuth('login')"); await wait(150);
  const lockTxt = (GD.doc.querySelector('#loginAlert') || {}).textContent || '';
  ok(/\d{2}:\d{2}/.test(lockTxt), 'countdown timer is shown (mm:ss): ' + lockTxt.trim().slice(0, 60));
  ok(GD.doc.querySelector('#loginForm button[type=submit]').disabled === true, 'login button is disabled while locked');
  const t1 = lockTxt;
  await wait(1200);
  const t2 = (GD.doc.querySelector('#loginAlert') || {}).textContent || '';
  ok(t1 !== t2, 'countdown actually ticks');

  GD.win.eval('loginFailed(); loginFailed(); loginFailed()');
  ok(GD.win.eval('guardHidden()') === true, '6 wrong attempts hide the admin panel');
  GD.win.eval('renderShell()'); await wait(80);
  ok(!/data-act="open-auth"/.test(GD.doc.querySelector('#userChip').innerHTML), 'Admin button is hidden while locked out');
  ok(!/Admin login/.test(GD.doc.querySelector('.sb-foot').textContent || ''), 'sidebar login link is hidden too');
  GD.win.eval("openAuth('login')"); await wait(120);
  ok(!GD.doc.querySelector('#loginForm'), 'login box cannot be opened while panel is hidden');

  GD.win.eval('guardReset()');
  ok(GD.win.eval('guardHidden()') === false && GD.win.eval('guardLocked()') === false, 'guard resets (successful login / expiry)');
  GD.win.eval('loginOk()');
  ok(GD.win.eval('guardGet().fails') === 0, 'successful login clears the counter');

  /* ---------------- 8c. direct admin login link ---------------- */
  const DL = await boot({ hash: '#login' });
  await wait(300);
  ok(!!DL.doc.querySelector('#authScreen') && !DL.doc.querySelector('#authScreen').hidden, '#login link opens the admin login box');
  ok(!!DL.doc.querySelector('#loginForm'), 'login form is ready on the direct link');

  /* ---------------- 8d. v99 — alag ID series + temp password + eye toggle ---------------- */
  const V9 = await boot({ admin: OWNER.email, admins: [OWNER, ADMIN] });
  /* owner ki ID alag series (OWN-...), admin ki ADM-... */
  const ownRec = JSON.parse(V9.win.localStorage.getItem('memc_admins')).find(a => a.email === OWNER.email);
  ok(/^OW\d{6}#\d{5}$/.test(String(ownRec.userId)), 'super admin ID random format me hai: ' + ownRec.userId);
  ok(/^AD\d{6}#\d{5}$/.test(String(JSON.parse(V9.win.localStorage.getItem('memc_admins')).find(a => a.email === ADMIN.email).userId)), 'admin ID AD-series random format me hai');
  /* har naye admin ko alag random ID */
  const newId = String(V9.win.eval('genUserId()'));
  const newId2 = String(V9.win.eval('genUserId()'));
  ok(/^AD\d{2}\d{4}#\d{5}$/.test(newId), 'naya admin ID AD<2><year>#<5 digits> format me: ' + newId);
  ok(newId !== newId2, 'do admin IDs kabhi same nahi: ' + newId + ' vs ' + newId2);
  ok(!/#/.test(String(V9.win.eval("genUserId()")).slice(0, 2)) && /#/.test(newId), 'ID me # separator hai');
  const newOwn = String(V9.win.eval('genOwnerId()'));
  ok(/^OW\d{6}#\d{5}$/.test(newOwn), 'owner ID alag OW series me hai: ' + newOwn);
  ok(newOwn.slice(0,2) !== newId.slice(0,2), 'owner aur admin ka prefix alag hai');
  /* owner prefix badla to migrate naya ID deta hai */
  V9.win.eval("DB.setIdsSet(Object.assign({}, idset(), { ownerPrefix:'MUT' }))");
  V9.win.eval('migrateAdmins()');
  const own2 = JSON.parse(V9.win.localStorage.getItem('memc_admins')).find(a => a.email === OWNER.email);
  ok(/^MUT\d{6}#\d{5}$/.test(String(own2.userId)), 'owner prefix badalne par owner ID update hoti hai: ' + own2.userId);

  /* temp password login ke baad bhi super admin ko dikhta hai */
  const T = await boot({ admin: OWNER.email, admins: [
    Object.assign({}, OWNER),
    Object.assign({}, ADMIN, { tempPass: 'Ab12Cd34' })
  ], view: 'adminpanel' });
  T.win.eval("state.showAdmins = true; go('adminpanel')"); await wait(150);
  const tpCell = T.doc.querySelector('.tp');
  ok(!!tpCell, 'admins table me password cell hai');
  ok(tpCell && tpCell.dataset.pw === 'Ab12Cd34', 'temp password data me maujood hai');
  ok(tpCell && /••••••/.test(tpCell.querySelector('code').textContent), 'password by default masked hai');
  tpCell.querySelector('[data-act="tp-show"]').dispatchEvent(new T.win.MouseEvent('click', { bubbles: true }));
  ok(tpCell.querySelector('code').textContent === 'Ab12Cd34', 'Show dabane par password dikhta hai');
  tpCell.querySelector('[data-act="tp-show"]').dispatchEvent(new T.win.MouseEvent('click', { bubbles: true }));
  ok(/••••••/.test(tpCell.querySelector('code').textContent), 'dobara dabane par chhup jata hai');
  /* login par tempPass delete nahi hota */
  T.win.eval("startSession(" + JSON.stringify(ADMIN.email) + ")");
  const afterLogin = JSON.parse(T.win.localStorage.getItem('memc_admins')).find(a => a.email === ADMIN.email);
  ok(afterLogin.tempPass === 'Ab12Cd34', 'login ke baad bhi temp password bacha rehta hai');
  ok(!!afterLogin.firstLoginAt, 'pehla login mark ho jata hai');

  /* eye toggle password inputs par */
  const EY = await boot({});
  EY.win.eval("openAuth('login')"); await wait(150);
  const eyeBtn = EY.doc.querySelector('#loginForm .pw-eye');
  ok(!!eyeBtn, 'login password field par eye button hai');
  const pwInp = EY.doc.querySelector('#loginForm input[name="pass"]');
  ok(pwInp.type === 'password', 'password chhupa hua shuru hota hai');
  eyeBtn.dispatchEvent(new EY.win.MouseEvent('click', { bubbles: true }));
  ok(pwInp.type === 'text', 'eye dabane par password dikhta hai');
  ok(/aria-pressed="true"/.test(eyeBtn.outerHTML), 'eye button pressed state set karta hai');
  eyeBtn.dispatchEvent(new EY.win.MouseEvent('click', { bubbles: true }));
  ok(pwInp.type === 'password', 'dobara dabane par password chhup jata hai');

  /* purani OWN-/ADM- settings khud naye random format par migrate hoti hain */
  const MG = await boot({});
  MG.win.eval("DB.setIdsSet({ adminPrefix:'ADM', adminSuffix:'', famPrefix:'MEMC' })");
  MG.win.eval('migrateIdsSet(); migrateAdmins()');
  const mgSet = JSON.parse(MG.win.localStorage.getItem('memc_idset'));
  ok(mgSet.idStyle === 'random', 'purani settings naye random style par migrate hoti hain');
  ok(mgSet.adminPrefix === 'AD' && mgSet.ownerPrefix === 'OW', 'purane ADM/OWN prefix AD/OW ban jate hain');

  /* version stamp + force update button */
  ok(new RegExp(V9.win.eval('APP_VER')).test(V9.doc.querySelector('.sb-foot').textContent || ''), 'sidebar footer me app version dikhta hai');
  V9.win.eval("go('settings')"); await wait(150);
  ok(!!V9.doc.querySelector('[data-act="force-update"]'), 'Settings me Force update button hai');

  /* login field me nakli ID placeholder nahi (v102) */
  const PH = await boot({});
  PH.win.eval("openAuth('login')"); await wait(150);
  const uidInp = PH.doc.querySelector('#loginForm input[name="email"]');
  ok(!/#/.test(uidInp.getAttribute('placeholder') || ''), 'login placeholder me nakli User ID nahi: ' + uidInp.getAttribute('placeholder'));
  ok(uidInp.getAttribute('autocomplete') === 'off', 'login field par browser autofill band hai');
  ok(!!PH.doc.querySelector('.auth-ver'), 'login card me version stamp dikhta hai');

  /* ---------------- 9. backup round trip ---------------- */
  const backup = A.win.eval("JSON.stringify({ families:DB.families(), masjid:DB.masjid() })");
  ok(JSON.parse(backup).families.length === 1, 'backup payload contains households');

  console.log((pass + fail) + ' asserts — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
