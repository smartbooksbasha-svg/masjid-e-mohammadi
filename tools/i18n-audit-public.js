/* public + modal i18n audit */
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
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(buildHtml(), { url: 'https://example.test/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_lang', 'hi');
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_admins', '[]');
      w.localStorage.setItem('memc_families', '[]');
      w.open = function () { return { document: { write() {}, close() {} } }; };
    } });
  await new Promise(r => setTimeout(r, 700));
  const win = dom.window;
  const seen = new Map(); let checked = 0;
  const dump = (label) => {
    const out = win.eval(`(function(){
      const t = [], a = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const p = n.parentElement; if (!p) continue;
        if (['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName) || p.closest('.no-i18n')) continue;
        const v = (n.nodeValue||'').trim(); if (v) t.push(v); }
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
        ['placeholder','title','aria-label'].forEach(k=>{ const v = el.getAttribute(k); if (v && v.trim()) a.push(v.trim()); });
      });
      return { t, a };
    })()`);
    for (const v of out.t.concat(out.a)) {
      checked++;
      const key = v.replace(/\s+/g,' ').trim();
      if (!key || /^[0-9·—%.,:/#()-]+$/.test(key)) continue;
      const has = win.eval('(function(k){ return !!(I18N.en && Object.prototype.hasOwnProperty.call(I18N.en,k)); })(' + JSON.stringify(key) + ')');
      if (!has) seen.set(key, (seen.get(key)||new Set()).add(label));
    }
  };
  for (const v of ['dashboard','find','families']) { try { win.eval('go(' + JSON.stringify(v) + ')'); } catch(e){} await new Promise(r=>setTimeout(r,80)); dump('public:'+v); }
  try { win.eval("openAuth('login')"); } catch(e){} await new Promise(r=>setTimeout(r,120)); dump('login');
  try { win.eval("openAuth('forgot')"); } catch(e){} await new Promise(r=>setTimeout(r,120)); dump('forgot');
  console.log('nodes: ' + checked + ' | missing: ' + seen.size);
  for (const [k, vs] of [...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) console.log('['+[...vs].join(',')+'] '+k);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
