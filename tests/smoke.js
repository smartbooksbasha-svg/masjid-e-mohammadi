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
  for (const f of ['config.js', 'app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('</script>').join('<\\/script>');
    html = html.split('<script src="' + f + '" defer></script>').join('<script>\n' + src + '\n</script>');
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
    url: 'https://smartbooksbasha-svg.github.io/masjid-e-mohammadi/',
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
  A.win.eval("DB.setIdsSet({adminPrefix:'MEMC', adminSuffix:'KHD', passPrefix:'MC-', passSuffix:'-26', famPrefix:'MJ', famRandom:true})");
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

  /* ---------------- 9. backup round trip ---------------- */
  const backup = A.win.eval("JSON.stringify({ families:DB.families(), masjid:DB.masjid() })");
  ok(JSON.parse(backup).families.length === 1, 'backup payload contains households');

  console.log((pass + fail) + ' asserts — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
