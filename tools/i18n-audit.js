/* i18n audit — English mode me kaunse text nodes translate nahi hote.
   node tools/i18n-audit.js */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
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

const OWNER = { name: 'Isthiyaque Basha', email: 'smartbooksbasha@gmail.com', userId: 'OW102026#48391', status: 'active', role: 'owner', passHash: 'x', tempPass: 'Ab12Cd34' };
const FAM = { id: 'MEMC-26K7Q2', houseName: 'Test House', houseNo: '12', street: 'Masjid Road', houseType: 'cement', members: [{ name: 'Ali', relation: 'Self', gender: 'male', dob: '1990-01-01', education_level: 'college', occupation: 'Plumber', religious: 'hafiz', marital_status: 'married', disability: 'no', docs: {}, scheme: '' }], docs: {}, notes: '' };

const HING = /\b(hai|hain|nahi|karo|karein|kar|aap|apni|apna|apne|ke|ka|ki|ko|se|mein|me|bhi|aur|ye|wo|kya|jo|par|tak|liye|chahiye|hoga|hogi|jayega|jayegi|daalo|dalo|chuno|likho|kholo|sahi|galat|sirf|sab|kuch|bahut|thoda|abhi|baad|pehle|naya|nayi|purana|poora|pura|dikh|banta|banti|hote|hoti|hota|raha|rahe|rahi|gaya|gayi|kiya|karna|karke|wala|wali|jaisa|jaise|saath|bina|andar|bahar|upar|neeche|naam|ghar|kitne|kaun|kahan|kab|aisa|aise|wahi|yahi|sirf)\b/i;
const VIEWS = ['dashboard','families','add','detail','adminpanel','users','settings','masjid','myprofile','idcard','audit','find','memberlist','familylist','streetlist','cat'];

(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  let cap = '';
  const dom = new JSDOM(buildHtml(), {
    url: 'https://example.test/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_lang', 'hi');
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_seq', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify([OWNER]));
      w.localStorage.setItem('memc_families', JSON.stringify([FAM]));
      w.localStorage.setItem('memc_events', JSON.stringify([]));
      w.open = function () { return { document: { write(h) { cap = h; }, close() {} } }; };
    }
  });
  await new Promise(r => setTimeout(r, 700));
  const win = dom.window;
  win.eval('startSession(' + JSON.stringify(OWNER.email) + ')');
  win.eval('renderShell()');

  const seen = new Map(); let checked = 0, okViews = 0;
  for (const v of VIEWS) {
    try { win.eval('go(' + JSON.stringify(v) + (v === 'detail' ? ',' + JSON.stringify(FAM.id) : '') + ')'); } catch (e) { continue; }
    await new Promise(r => setTimeout(r, 90));
    const nodes = win.eval(`(function(){
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) {
        const p = n.parentElement; if (!p) continue;
        const tag = p.tagName;
        if (tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||p.closest('.no-i18n')) continue;
        const t = (n.nodeValue||'').trim(); if (t) out.push(t);
      }
      return out;
    })()`);
    okViews++;
    for (const t of nodes) { checked++;
      const key = t.replace(/\s+/g, ' ').trim();
      if (!key || /^[0-9·—%.,:/#()-]+$/.test(key)) continue;
      if (!HING.test(key) && !(process.env.ALL)) continue;
      const has = win.eval('(function(k){ return !!(I18N.en && Object.prototype.hasOwnProperty.call(I18N.en,k)); })(' + JSON.stringify(key) + ')');
      if (!has) seen.set(key, (seen.get(key) || new Set()).add(v));
    }
  }
  console.log('dict keys: ' + win.eval('Object.keys(I18N.en||{}).length') + ' | nodes checked: ' + checked + ' | views ok: ' + okViews);
  const rows = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(rows.length + ' untranslated text nodes\n');
  for (const [k, vs] of rows) console.log('[' + [...vs].join(',') + '] ' + k);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
