/* Urdu audit: ur mode me koi Latin (Hinglish/English) text bacha ho to pakdo. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function buildHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.split('\n').filter(l => !/src="https?:/.test(l)).join('\n');
  for (const f of ['vendor/qrcode.js', 'config.js', 'app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('</script>').join('<\\/script>');
    html = html.split('<script src="' + f + '" defer></script>').join('<script>\n' + src + '\n</script>');
  }
  return html;
}
const OWNER = { name: 'Isthiyaque Basha', email: 'smartbooksbasha@gmail.com', userId: 'ADM-2026-0001', status: 'active', role: 'owner', passHash: 'x' };
const FAM = { id: 'MEMC-26K7Q2', houseName: 'House 1', houseNo: '1', street: 'Masjid Road', houseType: 'cement',
  members: [{ name: 'Ali', relation: 'Self', gender: 'male', dob: '1990-01-01', marital_status: 'married', education: 'primary', occupation: 'Plumber', docs: {}, schemes: [], disability: 'no' }] };
const ALLOW = /^(QR|ID|ID-1|MEMC|AD|OW|JSON|Excel|Google|Drive|Plumber|Electrician|Painter|Helper|Mason|PDF|XLSX|v\d+|https?:\/\/\S+|[\d\W_]+)$/i;
async function run(lang, opts) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(buildHtml(), { url: 'https://x.test/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify([OWNER, { name: 'Rahman', email: 'r@e.com', userId: 'AD102026#21200', status: 'active', role: 'admin', passHash: 'y' }]));
      w.localStorage.setItem('memc_families', JSON.stringify([FAM]));
      w.open = () => ({ document: { write() {}, close() {} } });
    } });
  await new Promise(r => setTimeout(r, 700));
  const w = dom.window;
  if (opts.admin) { w.eval('startSession(' + JSON.stringify(OWNER.email) + ')'); w.eval('renderShell()'); }
  w.eval("setLang('ur')");
  await new Promise(r => setTimeout(r, 250));
  const views = opts.views;
  const found = new Map();
  for (const v of views) {
    try { w.eval('go(' + JSON.stringify(v) + (v === 'detail' ? ',' + JSON.stringify(FAM.id) : '') + ')'); } catch (e) { continue; }
    await new Promise(r => setTimeout(r, 220));
    w.eval("setLang('ur')"); await new Promise(r => setTimeout(r, 120));
    const texts = w.eval(`(function(){const o=[];const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
      while(n=tw.nextNode()){const p=n.parentElement;if(!p)continue;
        if(['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(p.tagName))continue;
        if(p.closest('.no-i18n'))continue;
        const v=(n.nodeValue||'').trim();if(v)o.push(v);}
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{['placeholder','title','aria-label'].forEach(k=>{const v=el.getAttribute(k);if(v&&v.trim())o.push(v.trim());});});
      return o;})()`);
    for (const t of texts) {
      if (!/[A-Za-z]{3,}/.test(t)) continue;
      if (ALLOW.test(t)) continue;
      if (/^[\w.-]+@[\w.-]+$/.test(t)) continue;
      if (!found.has(t)) found.set(t, new Set());
      found.get(t).add(v);
    }
  }
  return found;
}
(async () => {
  const publicViews = ['dashboard', 'families', 'detail', 'masjid', 'find'];
  const adminViews = ['dashboard', 'families', 'detail', 'add', 'masjid', 'adminpanel', 'audit', 'settings', 'idcarddesign', 'users'];
  const a = await run('ur', { admin: false, views: publicViews });
  const b = await run('ur', { admin: true, views: adminViews });
  const all = new Map([...a, ...b]);
  console.log('UNTRANSLATED (ur mode): ' + all.size);
  [...all.entries()].sort((x, y) => x[0].localeCompare(y[0])).forEach(([t, vs]) => console.log('  [' + [...vs].join(',') + '] ' + t));
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
