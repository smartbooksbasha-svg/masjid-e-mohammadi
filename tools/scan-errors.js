/* Full scan: har view ko admin + public dono role me khol kar JS errors + duplicate IDs pakdo. */
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
const OWNER = { name: 'Isthiyaque Basha', email: 'smartbooksbasha@gmail.com', userId: 'OW102026#48391', status: 'active', role: 'owner', passHash: 'x' };
const ADMIN = { name: 'Rahman', email: 'rahman@example.com', userId: 'AD102026#21200', status: 'active', role: 'admin', passHash: 'y', tempPass: 'tmp123' };
const FAM = { id: 'MEMC-26K7Q2', houseName: 'House 1', houseNo: '1', street: 'Masjid Road', houseType: 'cement', phone: '9876500000', address: 'Masjid Road, Chennai', notes: 'x note', createdAt: '2026-10-28T10:00', createdBy: 'owner',
  custom: [{label:'Caste Certificate', value:'yes'}],
  members: [
    { name: 'Ali', relation: 'Self', gender: 'Male', dob: '1990-01-01', maritalStatus: 'Married', education: 'primary', educationNote: '', religious: 'hafiz', occupation: 'Plumber', docs: { aadhaar:'yes' }, schemes: ['widowPension'], disability: 'yes', disabilityNote: 'leg', children: 2, fatherName: 'X', motherName: 'Y', occupationNote: '' },
    { name: 'Fathima', relation: 'Wife', gender: 'Female', dob: '1995-02-02', maritalStatus: 'Married', education: 'higherSecondary', religious: 'aalima', occupation: 'Teacher', docs: {}, schemes: [], disability: 'no', children: 0 }
  ] };
async function run(uid, admin, views) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(buildHtml(), { url: 'https://x.test/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('memc_seeded', '1');
      w.localStorage.setItem('memc_admins', JSON.stringify(admin ? [OWNER, ADMIN] : []));
      w.localStorage.setItem('memc_families', JSON.stringify([FAM]));
      w.open = () => ({ document: { write() {}, close() {} } });
      w.confirm = () => true; w.prompt = () => 'x'; w.print = () => {};
    } });
  await new Promise(r => setTimeout(r, 700));
  const w = dom.window;
  if (admin) { w.eval('startSession(' + JSON.stringify(OWNER.email) + ')'); w.eval('renderShell()'); }
  const dupIds = (label) => {
    const ids = {};
    w.document.querySelectorAll('[id]').forEach(el => { const k = '#' + el.id + ' <' + (el.tagName) + '>'; ids[k] = (ids[k] || 0) + 1; });
    const d = Object.entries(ids).filter(([k, n]) => n > 1).map(([k]) => k);
    if (d.length) errors.push('DUP IDS [' + label + ']: ' + d.join(', '));
  };
  dupIds('boot');
  for (const v of views) {
    const before = errors.length;
    try {
      w.eval('go(' + JSON.stringify(v) + (v === 'detail' ? ', "' + FAM.id + '"' : '') + ')');
      await new Promise(r => setTimeout(r, 160));
    } catch (e) { errors.push(v + ': throw: ' + (e && e.message || e)); continue; }
    if (errors.length === before) errors.push(v + ': OK');
    else { void before; }
    dupIds(v);
  }
  console.log('== ' + uid + ' ==');
  if (!errors.length) console.log('  (no errors)');
  errors.filter(e => !e.endsWith(': OK')).forEach(e => console.log('  ' + e));
  if (admin) {
    // bhi try card preview
    try { w.eval('go("idcard")'); await new Promise(r => setTimeout(r, 150)); console.log('  idcard: OK'); } catch(e) { console.log('  idcard: throw ' + e.message); }
  }
}
(async () => {
  const views = ['dashboard','families','add','masjid','find','detail'];
  const adminViews = ['dashboard','families','add','masjid','find','detail','adminpanel','audit','settings','users','idcard','myprofile'];
  await run('PUBLIC', false, views);
  await run('ADMIN', true, adminViews);
})().catch(e => { console.error('FATAL', e && e.message || e); process.exit(2); });
