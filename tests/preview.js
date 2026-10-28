/* Card preview generator: node tests/preview.js  ->  idcard-preview.html
   (gitignored; sample family + sample signatures, no auto-print) */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function buildHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.split('\n').filter(l => !/src="https?:/.test(l)).join('\n');
  for (const f of ['config.js', 'app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('</script>').join('<\\/script>');
    html = html.split('<script src="' + f + '" defer></script>').join('<script>\n' + src + '\n</script>');
  }
  return html;
}

const FAM = {
  id: 'MEMC-26K7Q2', street: 'Masjid Road', houseNo: '12', houseName: 'Abdul Rahman',
  phone: '98765 43210', address: 'Masjid Road, Near Masjid', houseType: 'moulding',
  createdAt: Date.now() - 86400000 * 3,
  docs: { aadhaar: 'yes', ration: 'yes', voter: 'yes', bank: 'no' },
  custom: [],
  members: [
    { name: 'Abdul Rahman', relation: 'Head', gender: 'Male', dob: '1979-04-12', maritalStatus: 'Married', educationLevel: 'college', occupation: 'Electrician', religious: '', children: '3' },
    { name: 'Ayesha Begum', relation: 'Wife', gender: 'Female', dob: '1984-08-20', maritalStatus: 'Married', educationLevel: 'higher_secondary', occupation: 'Housewife', religious: '', children: '3' },
    { name: 'Yusuf Rahman', relation: 'Son', gender: 'Male', dob: '2011-02-05', maritalStatus: 'Unmarried', educationLevel: 'primary', religious: '', children: '0' },
    { name: 'Sumayya Rahman', relation: 'Daughter', gender: 'Female', dob: '2014-09-11', maritalStatus: 'Unmarried', educationLevel: 'primary', religious: 'hafiz', children: '0' }
  ]
};

const sig = name => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120"><text x="20" y="86" font-family="Segoe Script,Brush Script MT,cursive" font-size="58" fill="#12261f">${name}</text></svg>`);

(async () => {
  let cap = '';
  const dom = new JSDOM(buildHtml(), {
    url: 'https://smartbooksbasha-svg.github.io/masjid-e-mohammadi/',
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_families', JSON.stringify([FAM]));
      w.localStorage.setItem('memc_seq', '1');
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify([{ name: 'Isthiyaque Basha', email: 'smartbooksbasha@gmail.com', userId: 'ADM-2026-0001', status: 'active', role: 'owner', passHash: 'x' }]));
      w.localStorage.setItem('memc_session', JSON.stringify({ kind: 'admin', email: 'smartbooksbasha@gmail.com', name: 'Owner' }));
      w.localStorage.setItem('memc_idcard', JSON.stringify({ sigMutavalli: sig('A. Mutavalli'), sigMember: sig('M. Member') }));
      w.open = function () { return { document: { write(h) { cap = h; }, close() {} } }; };
    }
  });
  await new Promise(r => setTimeout(r, 700));
  dom.window.eval('printIdCards(DB.families()[0])');
  await new Promise(r => setTimeout(r, 200));
  if (!cap) { console.log('NO HTML'); process.exit(2); }
  const out = cap.replace(/setTimeout\(function\(\)\{ try\{ window\.print\(\)[^<]*<\/script>/, '</script>');
  fs.writeFileSync(path.join(ROOT, 'idcard-preview.html'), out);
  console.log('written idcard-preview.html', out.length, 'bytes');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
