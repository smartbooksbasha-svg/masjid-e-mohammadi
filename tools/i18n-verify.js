/* Verify: en mode me Hinglish nahi bachna chahiye, hi mode me English nahi bachna chahiye.
   node tools/i18n-verify.js */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HING = /\b(hai|hain|nahi|karo|karein|aap|apni|apna|apne|ke|ka|ki|ko|se|mein|bhi|aur|ye|wo|kya|jo|par|tak|liye|chahiye|hoga|hogi|jayega|jayegi|daalo|dalo|chuno|likho|kholo|sahi|galat|sirf|sab|kuch|bahut|thoda|abhi|baad|pehle|naya|nayi|purana|pura|dikh|banta|hote|hoti|hota|raha|rahe|rahi|gaya|gayi|kiya|karna|karke|wala|wali|jaisa|jaise|saath|bina|andar|bahar|upar|neeche|naam|ghar|kitne|kaun|kahan|aisa|aise|wahi|yahi)\b/i;

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
const FAM = { id: 'MEMC-26K7Q2', houseName: 'Test House', houseNo: '12', street: 'Masjid Road', houseType: 'cement', members: [{ name: 'Ali', relation: 'Self', gender: 'male', dob: '1990-01-01', education_level: 'college', occupation: 'Plumber', religious: 'hafiz', marital_status: 'married', disability: 'no' }], docs: {}, notes: '' };
const VIEWS = ['dashboard','families','add','detail','adminpanel','users','settings','masjid','myprofile','idcard','audit','find','memberlist','familylist','streetlist','cat'];

async function run(lang) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(buildHtml(), {
    url: 'https://example.test/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_lang', lang);
      w.localStorage.setItem('memc_seeded', '1'); w.localStorage.setItem('memc_seq', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify([OWNER]));
      w.localStorage.setItem('memc_families', JSON.stringify([FAM]));
      w.open = function () { return { document: { write() {}, close() {} } }; };
    }
  });
  await new Promise(r => setTimeout(r, 700));
  const win = dom.window;
  win.eval('startSession(' + JSON.stringify(OWNER.email) + ')');
  win.eval('renderShell()');
  const bad = new Map();
  const collect = (label) => {
    const nodes = win.eval(`(function(){const o=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
      while(n=w.nextNode()){const p=n.parentElement;if(!p)continue;
        if(['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)||p.closest('.no-i18n'))continue;
        const v=(n.nodeValue||'').trim();if(v)o.push(v);}
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{['placeholder','title','aria-label'].forEach(k=>{const v=el.getAttribute(k);if(v&&v.trim())o.push(v.trim());});});
      return o;})()`);
    for (const t of nodes) {
      const key = t.replace(/\s+/g, ' ').trim();
      if (!key || key.length < 3) continue;
      if (lang === 'en' && HING.test(key)) bad.set(key, (bad.get(key) || new Set()).add(label));
      if (lang === 'ta') {
        const stillHinglish = win.eval('(function(k){return !!(I18N.en&&Object.prototype.hasOwnProperty.call(I18N.en,k));})(' + JSON.stringify(key) + ')');
        if (stillHinglish) bad.set(key, (bad.get(key) || new Set()).add(label));
      }
      if (lang === 'hi') {
        const isEnValue = win.eval('(function(k){var o=I18N.en||{};for(var p in o){if(o[p]===k)return true;}return false;})(' + JSON.stringify(key) + ')');
        const isEnKey = win.eval('(function(k){return !!(I18N.en&&Object.prototype.hasOwnProperty.call(I18N.en,k));})(' + JSON.stringify(key) + ')');
        if (isEnValue && !isEnKey) bad.set(key, (bad.get(key) || new Set()).add(label));
      }
    }
  };
  for (const v of VIEWS) { try { win.eval('go(' + JSON.stringify(v) + (v === 'detail' ? ',' + JSON.stringify(FAM.id) : '') + ')'); } catch (e) { continue; } await new Promise(r => setTimeout(r, 80)); collect(v); }
  try { win.eval("openAuth('login')"); } catch (e) {} await new Promise(r => setTimeout(r, 120)); collect('login');
  return bad;
}

(async () => {
  let total = 0;
  for (const lang of ['en', 'hi', 'ta']) {
    const bad = await run(lang);
    total += bad.size;
    console.log('\n=== ' + lang + ': ' + bad.size + ' leftover ===');
    for (const [k, vs] of [...bad.entries()].sort((a, b) => a[0].localeCompare(b[0]))) console.log('[' + [...vs].join(',') + '] ' + k);
  }
  process.exit(total ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
