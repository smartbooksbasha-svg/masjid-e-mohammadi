/* ============================================================
   Masjid - E- Mohammadiy · Khidmath Committee — Mohalla Survey
   Application logic (vanilla JS, local-first + optional Supabase)
   ============================================================ */
'use strict';

/* ---------------- config / constants ---------------- */
const CFG = window.APP_CONFIG || {};
const PREFIX = CFG.FAMILY_ID_PREFIX || 'MEMC';
const LS = { users:'memc_users', families:'memc_families', seq:'memc_seq', session:'memc_session', theme:'memc_theme', seeded:'memc_seeded' };

const DOC_TYPES = [
  ['aadhaar','Aadhaar Card'], ['pan','PAN Card'], ['passport','Passport'],
  ['birth','Birth Certificate'], ['voter','Voter ID'], ['ration','Ration Card'],
  ['driving','Driving Licence'], ['income','Income Certificate'],
  ['disability','Disability Certificate'], ['bpl','BPL / Ayushman Card']
];
const CUSTOM_DOCS = 12; // "more than 10" empty custom boxes

const ROLE_LABEL = { super:'Super Admin', admin:'Admin', family:'Family Member' };
const GENDERS = ['Male','Female','Other'];
const MARITAL = ['Unmarried','Married','Widow','Widower','Divorced'];

/* survey vocabularies (plan sections 1-5) */
const HOUSE_TYPES = [
  ['moulding','Moulding (concrete)'],
  ['cement','Cement sheet'],
  ['other','Other / kachcha']
];
const EDU = [
  ['primary','Primary (1-8)'],
  ['higher_secondary','Higher secondary (9-12)'],
  ['college','College / University'],
  ['madarsa','Madarsa'],
  ['none','Not studying']
];
const SECTOR = [
  ['private','Private sector'],
  ['government','Government sector'],
  ['business','Business / self-employed'],
  ['none','Not working']
];
const DEENI = [
  ['','— none —'],
  ['aalim','Aalim'],
  ['hafiz','Hafiz'],
  ['both','Aalim + Hafiz']
];
const labelOf = (list,key) => (list.find(x=>x[0]===key)||[])[1] || '';
const EDU_LABEL = Object.fromEntries(EDU);
const SECTOR_LABEL = Object.fromEntries(SECTOR);
const DEENI_LABEL = Object.fromEntries(DEENI);

/* old records stored free-text education — map it once */
function inferEdu(text){
  const t = String(text||'').toLowerCase();
  if (!t) return '';
  if (t.includes('madarsa') || t.includes('madrasa') || t.includes('hifz')) return 'madarsa';
  if (t.includes('graduate') || t.includes('college') || t.includes('degree') || t.includes('b.a') || t.includes('b.sc')) return 'college';
  if (t.includes('12') || t.includes('11') || t.includes('inter')) return 'higher_secondary';
  if (t.includes('10') || t.includes('9') || t.includes('8') || t.includes('primary') || t.includes('7')) return 'primary';
  return '';
}
function eduKey(m){ return m.educationLevel || inferEdu(m.education); }

/* ---------------- tiny helpers ---------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function pad(n,l){ return String(n).padStart(l,'0'); }

async function hashPass(pw, salt){
  const raw = salt + '::' + pw;
  if (window.crypto && crypto.subtle && crypto.subtle.digest){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  let h = 2166136261; for (let i=0;i<raw.length;i++){ h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'fnv' + (h>>>0).toString(16);
}
function ageFromDob(dob){
  if (!dob) return null; const d = new Date(dob); if (isNaN(d)) return null;
  const t = new Date(); let a = t.getFullYear()-d.getFullYear();
  const m = t.getMonth()-d.getMonth();
  if (m<0 || (m===0 && t.getDate()<d.getDate())) a--;
  return a>=0 && a<130 ? a : null;
}
function fmtDate(d){ if(!d) return '—'; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1,2)+'-'+pad(d.getDate(),2); }

/* ---------------- storage ---------------- */
const DB = {
  users(){ try{ return JSON.parse(localStorage.getItem(LS.users)||'[]'); }catch(e){ return []; } },
  setUsers(v){ localStorage.setItem(LS.users, JSON.stringify(v)); },
  families(){ try{ return JSON.parse(localStorage.getItem(LS.families)||'[]'); }catch(e){ return []; } },
  setFamilies(v){ localStorage.setItem(LS.families, JSON.stringify(v)); },
  seq(){ return parseInt(localStorage.getItem(LS.seq)||'0',10)||0; },
  setSeq(n){ localStorage.setItem(LS.seq, String(n)); },
  seeded(){ return localStorage.getItem(LS.seeded)==='1'; },
  setSeeded(){ localStorage.setItem(LS.seeded,'1'); }
};

function getSession(){ try{ return JSON.parse(localStorage.getItem(LS.session)||'null'); }catch(e){ return null; } }
function setSession(s){ localStorage.setItem(LS.session, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(LS.session); }
function currentUser(){ const s=getSession(); if(!s) return null; return DB.users().find(u=>u.id===s.userId) || null; }

/* ---------------- theme ---------------- */
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem(LS.theme, t);
  const b=$('#themeBtn'); if(b) b.textContent = t==='night' ? '☾ Night' : '☀ Day'; }
function toggleTheme(){ applyTheme(document.documentElement.getAttribute('data-theme')==='night' ? 'day' : 'night'); }
applyTheme(localStorage.getItem(LS.theme) || 'day');

/* ---------------- toast ---------------- */
function toast(msg, type){
  const wrap = $('#toasts'); if(!wrap) return;
  const t = document.createElement('div'); t.className = 'toast' + (type==='err'?' err':''); t.textContent = msg;
  wrap.appendChild(t); setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),320); }, 2600);
}

/* ---------------- caption helper icons (inline SVG) ---------------- */
const ICON = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

/* ============================================================
   AUTH
   ============================================================ */
let pending = null; // {user, otp} during login

function renderAuth(){
  const app = $('#appScreen'); if (app) app.classList.add('hidden');
  const auth = $('#authScreen'); auth.classList.remove('hidden');
  if (!DB.users().some(u=>u.role==='super')) { renderSetup(); return; }
  if (!currentUser()) { renderLogin(); return; }
  enterApp();
}

function renderSetup(){
  $('#authScreen').innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand"><span class="crest">M</span><div><div class="t">${esc(CFG.ORG_NAME||'Masjid - E- Mohammadiy')}</div><div class="s">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div></div></div>
    <h1>First-time setup</h1>
    <p class="lead">Create the <b>Super Admin</b> account. Iske baad login screen khulegi.</p>
    <form id="setupForm">
      <div class="field"><label>Full name</label><input class="inp" name="name" required placeholder="e.g. Abdul Rahman" /></div>
      <div class="grid g2">
        <div class="field"><label>Mobile number</label><input class="inp" name="phone" inputmode="numeric" placeholder="10-digit number" /></div>
        <div class="field"><label>Login ID</label><input class="inp" name="id" required placeholder="e.g. admin" /></div>
      </div>
      <div class="grid g2">
        <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required minlength="4" placeholder="min 4 characters" /></div>
        <div class="field"><label>Confirm password</label><input class="inp" name="pass2" type="password" required minlength="4" /></div>
      </div>
      <div id="setupAlert"></div>
      <button class="btn block" type="submit">Create Super Admin</button>
    </form>
  </div></div>`;
  $('#setupForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const E = e.target.elements;
    const name=E.name.value.trim(), phone=E.phone.value.trim(), id=E.id.value.trim().toLowerCase(), pass=E.pass.value, pass2=E.pass2.value;
    const alertBox = $('#setupAlert');
    if (pass !== pass2){ alertBox.innerHTML = '<div class="alert err">Passwords do not match.</div>'; return; }
    if (DB.users().some(u=>u.id===id)){ alertBox.innerHTML = '<div class="alert err">That ID is already taken.</div>'; return; }
    const salt = uid();
    const user = { id, role:'super', name:name||id, phone, salt, passHash: await hashPass(pass, salt), createdAt: Date.now() };
    const users = DB.users(); users.push(user); DB.setUsers(users);
    toast('Super Admin created — please log in');
    renderLogin();
  });
}

function renderLogin(){
  $('#authScreen').innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand"><span class="crest">M</span><div><div class="t">${esc(CFG.ORG_NAME||'Masjid - E- Mohammadiy')}</div><div class="s">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div></div></div>
    <h1>Sign in</h1>
    <p class="lead">Apna login ID aur password daaliye.</p>
    <div class="role-tabs" id="roleTabs">
      <button data-role="super" class="active">Super Admin</button>
      <button data-role="admin">Admin</button>
      <button data-role="family">Family</button>
    </div>
    <form id="loginForm">
      <div class="field"><label>Login ID</label><input class="inp" name="id" required autocomplete="username" placeholder="ID / Family ID" /></div>
      <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required autocomplete="current-password" /></div>
      <div class="field"><label>Captcha — answer the sum</label>
        <div class="captcha-box"><div class="captcha-q" id="captchaQ"></div><button type="button" class="icon-btn" id="captchaReload" aria-label="New captcha">↻</button></div>
        <input class="inp" name="captcha" inputmode="numeric" required placeholder="Answer" style="margin-top:6px" />
      </div>
      <div id="loginAlert"></div>
      <button class="btn block" type="submit">Continue</button>
    </form>
  </div></div>`;

  let role = 'super', capA = 0, capB = 0;
  const newCaptcha = ()=>{ capA = 2+Math.floor(Math.random()*8); capB = 1+Math.floor(Math.random()*8); $('#captchaQ').textContent = capA + ' + ' + capB + ' = ?'; };
  newCaptcha();
  $('#captchaReload').addEventListener('click', newCaptcha);
  $('#roleTabs').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; $$('#roleTabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); role=b.dataset.role; });

  $('#loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f=e.target, E=f.elements, alertBox=$('#loginAlert');
    const id=E.id.value.trim().toLowerCase(), pass=E.pass.value, cap=parseInt(E.captcha.value,10);
    if (cap !== capA + capB){ alertBox.innerHTML='<div class="alert err">Captcha answer is wrong.</div>'; newCaptcha(); E.captcha.value=''; return; }
    const user = DB.users().find(u=>u.id===id);
    if (!user){ alertBox.innerHTML='<div class="alert err">No account with that ID.</div>'; newCaptcha(); return; }
    if (user.role !== role){ alertBox.innerHTML=`<div class="alert err">This is not a ${ROLE_LABEL[role]} account.</div>`; newCaptcha(); return; }
    const h = await hashPass(pass, user.salt);
    if (h !== user.passHash){ alertBox.innerHTML='<div class="alert err">Incorrect password.</div>'; newCaptcha(); return; }
    // demo OTP step
    pending = { user, otp: String(100000 + Math.floor(Math.random()*900000)) };
    renderOtp();
  });
}

function renderOtp(){
  $('#authScreen').innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand"><span class="crest">M</span><div><div class="t">${esc(CFG.ORG_NAME||'Masjid - E- Mohammadiy')}</div><div class="s">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div></div></div>
    <h1>Verify mobile OTP</h1>
    <p class="lead">A 6-digit code was sent to <b>${esc(pending.user.phone||'your mobile')}</b>.</p>
    <div class="alert info">Demo mode — SMS is not connected yet. Your code is: <span class="otp-badge">${pending.otp}</span></div>
    <form id="otpForm" style="margin-top:14px">
      <div class="field"><label>Enter OTP</label><input class="inp" name="otp" inputmode="numeric" maxlength="6" required placeholder="6-digit code" style="letter-spacing:.3em;text-align:center;font-size:1.2rem" /></div>
      <div id="otpAlert"></div>
      <button class="btn block" type="submit">Verify &amp; Sign in</button>
      <button class="btn ghost block" type="button" id="otpBack">Back</button>
    </form>
  </div></div>`;
  $('#otpBack').addEventListener('click', ()=>{ pending=null; renderLogin(); });
  $('#otpForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    if (e.target.elements.otp.value.trim() !== pending.otp){ $('#otpAlert').innerHTML='<div class="alert err">Wrong OTP. Try again.</div>'; return; }
    const u = pending.user; pending=null;
    setSession({ userId:u.id });
    enterApp();
  });
}

/* ============================================================
   APP SHELL
   ============================================================ */
const state = { view:'dashboard', param:null, draft:null };

function enterApp(){
  $('#authScreen').classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
  renderShell();
  go('dashboard');
}

function navItems(){
  const u = currentUser(); if(!u) return [];
  if (u.role==='family') return [ ['myfamily','My Family',ICON.home], ['settings','Settings',ICON.gear] ];
  const items = [ ['dashboard','Dashboard',ICON.dash], ['families','Households',ICON.list], ['add','Add Household',ICON.plus] ];
  if (u.role==='super') items.push(['users','Users',ICON.users]);
  items.push(['settings','Settings',ICON.gear]);
  return items;
}

function renderShell(){
  const u = currentUser();
  $('#nav').innerHTML = navItems().map(([v,label,ic])=>`<a class="nav-item" data-act="goto" data-view="${v}">${ic}<span>${label}</span></a>`).join('');
  const initials = (u.name||u.id).split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  $('#userChip').innerHTML = `<span class="av">${esc(initials)}</span><span><span class="nm">${esc(u.name||u.id)}</span><br><span class="rl">${ROLE_LABEL[u.role]}</span></span>`;
  $('#userChip').setAttribute('data-act','logout');
  $('#userChip').title = 'Click to sign out';
  $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===state.view || (state.view==='add' && a.dataset.view==='add')));
  closeNav();
}

function go(view, param){
  const u = currentUser(); if(!u){ renderAuth(); return; }
  if (u.role==='family' && !['myfamily','settings'].includes(view)) view='myfamily';
  state.view = view; state.param = param||null;
  closeNav();
  const titles = { dashboard:'Survey Dashboard', families:'Households', add:(state.param?'Edit Household':'Add Household'), detail:'Household Record', users:'Users', settings:'Settings', myfamily:'My Family' };
  $('#pageTitle').textContent = titles[view] || 'Survey Dashboard';
  let html='';
  if (view==='dashboard') html = viewDashboard();
  else if (view==='families') html = viewFamilies();
  else if (view==='add') html = viewFamilyForm();
  else if (view==='detail') html = viewFamilyDetail(state.param);
  else if (view==='users') html = viewUsers();
  else if (view==='settings') html = viewSettings();
  else if (view==='myfamily') html = viewMyFamily();
  $('#content').innerHTML = html;
  $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===view || (view==='detail'&&a.dataset.view==='families')||(view==='add'&&a.dataset.view==='add')));
  afterRender(view);
}

function closeNav(){ const s=$('#sidebar'), sc=$('#scrimNav'); if(s) s.classList.remove('open'); if(sc) sc.classList.remove('show'); }

/* ============================================================
   SURVEY STATS  (plan sections 1-5)
   ============================================================ */
function houseTypeKey(t){
  const v = String(t||'').toLowerCase();
  if (v.includes('mould') || v.includes('concrete') || v.includes('rcc')) return 'moulding';
  if (v.includes('cement') || v.includes('sheet') || v.includes('tin')) return 'cement';
  return 'other';
}
function streetName(f){ return (String(f.street||'').trim()) || 'Unassigned'; }

function computeStats(){
  const fams = DB.families();
  const s = {
    houses: fams.length,
    families: fams.length,
    streets: [],
    houseTypes: { moulding:0, cement:0, other:0 },
    men:   { total:0, married:0, unmarried:0, disabled:0 },
    women: { total:0, married:0, unmarried:0, disabled:0, widow:0 },
    others: 0,
    children: 0,
    pop: 0,
    students: { total:0, primary:0, higher_secondary:0, college:0, madarsa:0 },
    work: { men:{private:0,government:0,business:0}, women:{private:0,government:0,business:0} },
    deeni: { menAalim:0, menHafiz:0, womenAalim:0, womenHafiz:0 }
  };
  const streetMap = new Map();

  fams.forEach(f=>{
    const name = streetName(f);
    if (!streetMap.has(name)) streetMap.set(name, { name, houses:0, moulding:0, cement:0, other:0 });
    const st = streetMap.get(name);
    st.houses++;

    const ht = houseTypeKey(f.houseType);
    s.houseTypes[ht]++;
    st[ht]++;

    (f.members||[]).forEach(m=>{
      s.pop++;
      const g = (m.gender||'').toLowerCase();
      const bucket = g==='female' ? s.women : (g==='male' ? s.men : null);
      if (g==='other') s.others++;

      const age = ageFromDob(m.dob);
      if (age!==null && age<18) s.children++;

      const ms = (m.maritalStatus||'').toLowerCase();
      if (bucket){
        bucket.total++;
        if (ms==='married') bucket.married++;
        else bucket.unmarried++;   // unmarried / widower / widow / divorced
        if (m.disability==='yes') bucket.disabled++;
      }
      if (g==='female' && ms==='widow') s.women.widow++;

      const edu = eduKey(m);
      // "student" = still of school/college age (26 se kam) aur padhai set hai
      const isStudent = !!edu && edu!=='none' && (age===null || age<26);
      if (isStudent){
        s.students.total++;
        if (s.students[edu]!==undefined) s.students[edu]++;
      }

      const sec = (m.sector||'').toLowerCase();
      if (bucket && (sec==='private'||sec==='government'||sec==='business')){
        const key = g==='female' ? 'women' : 'men';
        s.work[key][sec]++;
      }

      const dn = (m.religious||'').toLowerCase();
      const isF = g==='female';
      if (dn==='aalim' || dn==='both'){ if (isF) s.deeni.womenAalim++; else s.deeni.menAalim++; }
      if (dn==='hafiz' || dn==='both'){ if (isF) s.deeni.womenHafiz++; else s.deeni.menHafiz++; }
    });
  });

  s.streets = Array.from(streetMap.values()).sort((a,b)=> a.name.localeCompare(b.name));
  return s;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function icSmall(path){ return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
function metric(label, val, opts){
  const o = opts||{};
  return `<div class="metric${o.hi?' hi':''}${o.sub?' sub':''}"><span>${label}</span><b>${val}</b></div>`;
}
function grpHead(no, title, sub){
  return `<header class="grp-head"><span class="grp-no">${no}</span><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div></header>`;
}

function viewDashboard(){
  const s = computeStats();
  const u = currentUser();
  const kpis = [
    [icSmall('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'), s.streets.length, 'Total streets'],
    [icSmall('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), s.houses, 'Total houses'],
    [icSmall('<circle cx="12" cy="7" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>'), s.families, 'Total families'],
    [icSmall('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 21v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M17 5.5a3.4 3.4 0 0 1 0 6"/><path d="M18.5 21v-1a6 6 0 0 0-2-4.5"/>'), s.pop, 'Total population']
  ];

  const streetRows = s.streets.length ? `
    <div class="table-wrap street-table" style="margin-top:14px"><table><thead><tr><th>Street name</th><th>Houses</th><th>Moulding</th><th>Cement sheet</th><th>Other</th></tr></thead><tbody>
      ${s.streets.map(st=>`<tr data-act="goto" data-view="families" data-street="${esc(st.name)}" class="clickable">
        <td><b>${esc(st.name)}</b></td><td>${st.houses}</td><td>${st.moulding}</td><td>${st.cement}</td><td>${st.other}</td></tr>`).join('')}
      <tr class="totals"><td>Total</td><td>${s.houses}</td><td>${s.houseTypes.moulding}</td><td>${s.houseTypes.cement}</td><td>${s.houseTypes.other}</td></tr>
    </tbody></table></div>` : `<p class="muted small" style="margin-top:12px">No streets yet — street names appear here as households are added.</p>`;

  const empty = s.houses ? '' : `<div class="empty" style="margin-top:18px"><div class="big">🕌</div><h3>No households surveyed yet</h3><p>Add the first household, ya sample data load karke dashboard dekh lo.</p>
     <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
     ${u.role!=='family' ? '<button class="btn" data-act="goto" data-view="add">Add first household</button>' : ''}
     <button class="btn ghost" data-act="load-sample">Load sample data</button></div></div>`;

  return `
    <div class="page-head"><div><h1>Survey Dashboard</h1><p>Mohalla ke ghar, raste aur logon ka poora hisaab — live totals.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export-excel">⭳ Excel</button>
        <button class="btn ghost sm" data-act="print-all">⎙ PDF / Print</button>
      </div></div>

    <div class="kpi-row">${kpis.map(k=>`<div class="stat"><div class="ic">${k[0]}</div><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('')}</div>
    ${empty}

    <div class="grp-grid">
      <section class="grp wide">
        ${grpHead(1,'Location & Housing','Ghar aur raste ki details')}
        <div class="metrics cols2">
          ${metric('Total streets', s.streets.length)}
          ${metric('Total houses', s.houses)}
          ${metric('Moulding (house type)', s.houseTypes.moulding)}
          ${metric('Cement sheet (house type)', s.houseTypes.cement)}
        </div>
        ${streetRows}
      </section>

      <section class="grp wide">
        ${grpHead(2,'Family & Demographics','Ghar walon ki details')}
        <div class="metrics cols2">
          ${metric('Total families', s.families)}
          ${metric('Total population', s.pop)}
          ${metric('Children (under 18)', s.children)}
          ${metric('Physically challenged (total)', s.men.disabled + s.women.disabled)}
        </div>
        <div class="split">
          <div class="split-col">
            <h3>Men <span class="pill">${s.men.total}</span></h3>
            ${metric('Married', s.men.married)}
            ${metric('Unmarried', s.men.unmarried)}
            ${metric('Physically challenged', s.men.disabled)}
          </div>
          <div class="split-col">
            <h3>Women <span class="pill">${s.women.total}</span></h3>
            ${metric('Married', s.women.married)}
            ${metric('Unmarried', s.women.unmarried)}
            ${metric('Physically challenged', s.women.disabled)}
            ${metric('Widow', s.women.widow)}
          </div>
        </div>
      </section>

      <section class="grp">
        ${grpHead(3,'Education','Total child / students')}
        <div class="metrics">
          ${metric('Total students', s.students.total, {hi:true})}
          ${metric('Primary students', s.students.primary)}
          ${metric('Higher secondary students', s.students.higher_secondary)}
          ${metric('College students', s.students.college)}
          ${metric('Madarsa students', s.students.madarsa)}
        </div>
      </section>

      <section class="grp">
        ${grpHead(4,'Professional','Kaam kaaj ki details')}
        <div class="metrics">
          ${metric('Men — private sector', s.work.men.private)}
          ${metric('Men — government sector', s.work.men.government)}
          ${metric('Men — business', s.work.men.business)}
        </div>
        <div class="metrics" style="margin-top:10px">
          ${metric('Women — private sector', s.work.women.private)}
          ${metric('Women — government sector', s.work.women.government)}
          ${metric('Women — business', s.work.women.business)}
        </div>
      </section>

      <section class="grp wide">
        ${grpHead(5,'Religious Education','Deeni taleem — Aalim & Hafiz')}
        <div class="metrics cols2">
          ${metric('Men Aalim', s.deeni.menAalim)}
          ${metric('Men Hafiz', s.deeni.menHafiz)}
          ${metric('Women Aalim', s.deeni.womenAalim)}
          ${metric('Women Hafiz', s.deeni.womenHafiz)}
        </div>
        <div class="metrics" style="margin-top:10px">
          ${metric('Total Aalim & Hafiz (men + women)', s.deeni.menAalim + s.deeni.menHafiz + s.deeni.womenAalim + s.deeni.womenHafiz, {hi:true})}
        </div>
      </section>
    </div>`;
}

/* ============================================================
   HOUSEHOLDS LIST
   ============================================================ */
function viewFamilies(){
  const fams = DB.families();
  if (!fams.length) return emptyFamilies();
  const streets = Array.from(new Set(fams.map(streetName))).sort();
  const pre = state.param ? esc(state.param) : '';
  return `
    <div class="page-head"><div><h1>Households</h1><p>${fams.length} households on record.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-act="export-excel">⭳ Excel</button><button class="btn ghost sm" data-act="print-all">⎙ PDF</button><button class="btn sm" data-act="goto" data-view="add">+ Add Household</button></div></div>
    <div class="toolbar">
      <input class="inp grow" id="famSearch" placeholder="Search household, Family ID, phone, street…" />
      <select class="inp" id="famStreetF" style="max-width:200px"><option value="">All streets</option>${streets.map(st=>`<option ${pre===st?'selected':''}>${esc(st)}</option>`).join('')}</select>
      <select class="inp" id="famGenderF" style="max-width:170px"><option value="">All genders</option>${GENDERS.map(g=>`<option>${g}</option>`).join('')}</select>
      <select class="inp" id="famMaritalF" style="max-width:190px"><option value="">All marital status</option>${MARITAL.map(m=>`<option>${m}</option>`).join('')}</select>
    </div>
    <div id="famListWrap"></div>`;
}
function emptyFamilies(){
  return `<div class="page-head"><div><h1>Households</h1><p>No households on record yet.</p></div></div>
    <div class="card"><div class="empty"><div class="big">📋</div><h3>Start the survey</h3><p>Add your first household, or load sample data to explore.</p>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn" data-act="goto" data-view="add">+ Add Household</button>
      <button class="btn ghost" data-act="load-sample">Load sample data</button></div></div></div>`;
}
function familyMatches(f, q, st, g, ms){
  q = (q||'').toLowerCase();
  if (st && streetName(f)!==st) return false;
  const hay = [f.id, f.houseName, f.phone, f.address, f.houseNo, f.street, labelOf(HOUSE_TYPES, houseTypeKey(f.houseType))].join(' ').toLowerCase()
    + ' ' + (f.members||[]).map(m=>[m.name,m.fatherName,m.motherName].join(' ')).join(' ').toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (g && !(f.members||[]).some(m=>(m.gender||'')===g)) return false;
  if (ms && !(f.members||[]).some(m=>(m.maritalStatus||'')===ms)) return false;
  return true;
}
function renderFamilyList(){
  const wrap = $('#famListWrap'); if(!wrap) return;
  const q = ($('#famSearch')||{}).value||'', st=($('#famStreetF')||{}).value||'',
        g=($('#famGenderF')||{}).value||'', ms=($('#famMaritalF')||{}).value||'';
  const rows = DB.families().filter(f=>familyMatches(f,q,st,g,ms)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if (!rows.length){ wrap.innerHTML = `<div class="card"><div class="empty"><h3>No matching households</h3><p>Try a different search or filter.</p></div></div>`; return; }
  wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Family ID</th><th>Household</th><th>Street</th><th>Type</th><th>Members</th><th>Phone</th><th></th></tr></thead><tbody>
    ${rows.map(f=>`<tr>
      <td><span class="mono">${esc(f.id)}</span></td>
      <td>${esc(f.houseName||'—')}${f.houseNo?` <span class="muted small">· ${esc(f.houseNo)}</span>`:''}</td>
      <td>${esc(streetName(f))}</td>
      <td><span class="badge gray">${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType))||'Other')}</span></td>
      <td>${(f.members||[]).length}</td>
      <td>${esc(f.phone||'—')}</td>
      <td style="white-space:nowrap">
        <button class="btn ghost sm" data-act="view-family" data-id="${esc(f.id)}">View</button>
        <button class="btn ghost sm" data-act="edit-family" data-id="${esc(f.id)}">Edit</button>
        <button class="btn ghost sm" data-act="del-family" data-id="${esc(f.id)}" style="color:var(--danger)">Del</button>
      </td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================================================
   HOUSEHOLD FORM
   ============================================================ */
function blankMember(){ return { relation:'', name:'', fatherName:'', motherName:'', gender:'Male', dob:'', educationLevel:'', sector:'', religious:'', maritalStatus:'Unmarried', children:'', disability:'no', govtScheme:'no' }; }
function blankDraft(){
  return { id:null, houseName:'', houseNo:'', street:'', houseType:'moulding', address:'', phone:'', notes:'',
    members:[ blankMember() ],
    docs: Object.fromEntries(DOC_TYPES.map(d=>[d[0],'no'])),
    custom: Array.from({length:CUSTOM_DOCS}, ()=>({label:'', value:'no'})) };
}
function streetOptions(current){
  const streets = Array.from(new Set(DB.families().map(streetName).filter(x=>x && x!=='Unassigned'))).sort();
  if (current && !streets.includes(current)) streets.push(current);
  return streets.map(s=>`<option value="${esc(s)}"></option>`).join('');
}

function viewFamilyForm(){
  if (!state.draft) state.draft = blankDraft();
  const d = state.draft;
  const editing = !!d.id;
  return `
    <div class="page-head"><div><h1>${editing?'Edit Household':'Add Household'}</h1><p>${editing?'Update this household record.':'Fill the household details, then add each member.'}</p></div>
      <button class="btn ghost sm" data-act="goto" data-view="families">← Back</button></div>
    <form id="famForm">
      <div class="card">
        <div class="sec-title" style="margin-top:0">1 · Location &amp; housing</div>
        <div class="grid g2">
          <div class="field"><label>Street name *</label><input class="inp" data-field="street" list="streetList" value="${esc(d.street)}" placeholder="e.g. Masjid Road" />
            <datalist id="streetList">${streetOptions(d.street)}</datalist></div>
          <div class="field"><label>House number</label><input class="inp" data-field="houseNo" value="${esc(d.houseNo)}" placeholder="e.g. 12-B" /></div>
        </div>
        <div class="field" style="margin-top:12px"><label>House type</label>
          <div class="seg seg-wrap" data-hfield="houseType">
            ${HOUSE_TYPES.map(([k,l])=>`<button type="button" data-v="${k}" class="${(d.houseType||'moulding')===k?'on':''}">${esc(l)}</button>`).join('')}
          </div>
        </div>
        <div class="grid g2" style="margin-top:12px">
          <div class="field"><label>Household / head name *</label><input class="inp" data-field="houseName" value="${esc(d.houseName)}" placeholder="e.g. Abdul Rahman" /></div>
          <div class="field"><label>Phone number</label><input class="inp" data-field="phone" inputmode="numeric" value="${esc(d.phone)}" placeholder="10-digit mobile" /></div>
        </div>
        <div class="field" style="margin-top:12px"><label>Address / landmark</label><input class="inp" data-field="address" value="${esc(d.address)}" placeholder="Mohalla, gali, landmark" /></div>
        <div class="field" style="margin-top:12px"><label>Notes (optional)</label><textarea class="inp" data-field="notes" placeholder="Any remark about this household">${esc(d.notes)}</textarea></div>
      </div>

      <div class="sec-title">2 · Members</div>
      <div id="membersWrap"></div>
      <button type="button" class="btn ghost sm" data-act="add-member">+ Add member</button>

      <div class="sec-title">Documents held</div>
      <div class="card">
        <p class="muted small" style="margin-bottom:12px">Mark Yes / No for each document. Add your own fields in the empty boxes below.</p>
        <div class="doc-grid">
          ${DOC_TYPES.map(([k,label])=>docRow(label, d.docs[k], k, null)).join('')}
          ${d.custom.map((c,i)=>`
            <div class="doc-row custom">
              <input data-field="customLabel" data-ci="${i}" value="${esc(c.label)}" placeholder="Custom document ${i+1}" />
              ${segHTML(c.value, 'custom:'+i)}
            </div>`).join('')}
        </div>
      </div>

      <div id="formAlert" style="margin-top:14px"></div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn" type="submit">${editing?'Save changes':'Save & generate Family ID'}</button>
        <button class="btn ghost" type="button" data-act="goto" data-view="families">Cancel</button>
      </div>
    </form>`;
}
function segHTML(value, key){
  return `<div class="seg" data-doc="${key}">
    <button type="button" data-v="yes" class="${value==='yes'?'on':''}">Yes</button>
    <button type="button" data-v="no" class="${value!=='yes'?'on':''}">No</button></div>`;
}
function docRow(label, value, key, _x){
  return `<div class="doc-row"><span class="nm">${esc(label)}</span>${segHTML(value,key)}</div>`;
}
function renderMembers(){
  const wrap = $('#membersWrap'); if(!wrap) return;
  wrap.innerHTML = state.draft.members.map((m,i)=>{
    const edu = eduKey(m);
    return `
    <div class="member-card">
      <div class="member-head">
        <span class="idx">Member ${i+1}${m.name?' · '+esc(m.name):''}</span>
        ${state.draft.members.length>1 ? `<button type="button" class="btn ghost sm" data-act="remove-member" data-idx="${i}" style="color:var(--danger)">Remove</button>` : ''}
      </div>
      <div class="member-grid">
        <div class="field"><label>Full name *</label><input class="inp" data-field="m.name" data-idx="${i}" value="${esc(m.name)}" /></div>
        <div class="field"><label>Relation to head</label><input class="inp" data-field="m.relation" data-idx="${i}" value="${esc(m.relation)}" placeholder="Self / Wife / Son…" /></div>
        <div class="field"><label>Gender</label><select class="inp" data-field="m.gender" data-idx="${i}">${GENDERS.map(g=>`<option ${m.gender===g?'selected':''}>${g}</option>`).join('')}</select></div>
        <div class="field"><label>Date of birth</label><input class="inp" type="date" data-field="m.dob" data-idx="${i}" value="${esc(m.dob)}" /></div>
        <div class="field"><label>Marital status</label><select class="inp" data-field="m.maritalStatus" data-idx="${i}">${MARITAL.map(x=>`<option ${m.maritalStatus===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Number of children</label><input class="inp" inputmode="numeric" data-field="m.children" data-idx="${i}" value="${esc(m.children)}" /></div>
        <div class="field"><label>Education</label><select class="inp" data-field="m.educationLevel" data-idx="${i}">
          <option value="">— not set —</option>${EDU.map(([k,l])=>`<option value="${k}" ${edu===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Work / profession</label><select class="inp" data-field="m.sector" data-idx="${i}">
          <option value="">— not set —</option>${SECTOR.map(([k,l])=>`<option value="${k}" ${m.sector===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Deeni taleem</label><select class="inp" data-field="m.religious" data-idx="${i}">
          ${DEENI.map(([k,l])=>`<option value="${k}" ${(m.religious||'')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Father name</label><input class="inp" data-field="m.fatherName" data-idx="${i}" value="${esc(m.fatherName)}" /></div>
        <div class="field"><label>Mother name</label><input class="inp" data-field="m.motherName" data-idx="${i}" value="${esc(m.motherName)}" /></div>
        <div class="field"><label>Physically challenged</label><div class="field-yn">${segYN('m.disability', i, m.disability)}</div></div>
        <div class="field"><label>Govt. scheme</label><div class="field-yn">${segYN('m.govtScheme', i, m.govtScheme)}</div></div>
      </div>
    </div>`; }).join('');
}
function segYN(field, idx, value){
  return `<div class="seg" data-mfield="${field}" data-idx="${idx}">
    <button type="button" data-v="yes" class="${value==='yes'?'on':''}">Yes</button>
    <button type="button" data-v="no" class="${value!=='yes'?'on':''}">No</button></div>`;
}

/* ============================================================
   HOUSEHOLD DETAIL
   ============================================================ */
function viewFamilyDetail(id){
  const f = DB.families().find(x=>x.id===id);
  if (!f) return `<div class="empty"><h3>Household not found</h3><p>It may have been deleted.</p><button class="btn ghost" data-act="goto" data-view="families" style="margin-top:14px">← Back</button></div>`;
  const u = currentUser();
  const canEdit = u.role!=='family';
  const docsYes = DOC_TYPES.filter(([k])=>f.docs && f.docs[k]==='yes').map(([,l])=>l);
  const customYes = (f.custom||[]).filter(c=>c.label && c.value==='yes').map(c=>c.label);
  const members = f.members||[];
  const men = members.filter(m=>m.gender==='Male').length;
  const women = members.filter(m=>m.gender==='Female').length;
  return `
    <div class="page-head"><div><h1>${esc(f.houseName||'Household')}</h1><p>${esc(streetName(f))}${f.houseNo?' · House '+esc(f.houseNo):''} · ${members.length} member(s)</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="print-family" data-id="${esc(f.id)}">⎙ PDF</button>
        <button class="btn ghost sm" data-act="goto" data-view="families">← Back</button>
        ${canEdit?`<button class="btn sm" data-act="edit-family" data-id="${esc(f.id)}">Edit</button>`:''}
      </div></div>

    <div class="card" style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap">
      <div class="qr-panel">
        <div class="qr-box" id="qrBox"></div>
        <div><div class="muted small">FAMILY ID</div><div class="fid">${esc(f.id)}</div>
        <div class="muted small" style="margin-top:6px">Scan to view this household's record</div></div>
      </div>
      <div style="min-width:240px;flex:1">
        <div class="kv">
          <div class="row"><span>Street</span><span>${esc(streetName(f))}</span></div>
          <div class="row"><span>House no.</span><span>${esc(f.houseNo||'—')}</span></div>
          <div class="row"><span>House type</span><span>${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)))}</span></div>
          <div class="row"><span>Phone</span><span>${esc(f.phone||'—')}</span></div>
          <div class="row"><span>Address</span><span>${esc(f.address||'—')}</span></div>
          <div class="row"><span>Members</span><span>${members.length} · ${men} men · ${women} women</span></div>
        </div>
      </div>
    </div>

    <div class="sec-title">Members</div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Work</th><th>Deeni</th><th>Marital</th><th>Challenged</th></tr></thead><tbody>
      ${members.map((m,i)=>{ const a=ageFromDob(m.dob); return `<tr>
        <td>${i+1}</td><td>${esc(m.name||'—')}</td><td>${esc(m.relation||'—')}</td><td>${esc(m.gender||'—')}</td>
        <td>${a===null?'—':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'—')}</td><td>${esc(SECTOR_LABEL[m.sector]||'—')}</td>
        <td>${esc(DEENI_LABEL[m.religious]||'—')}</td><td>${esc(m.maritalStatus||'—')}</td>
        <td>${m.disability==='yes'?'Yes':'No'}</td></tr>`; }).join('')}
    </tbody></table></div>

    <div class="sec-title">Documents held</div>
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${[].concat(docsYes, customYes).length ? [].concat(docsYes,customYes).map(x=>`<span class="badge">✔ ${esc(x)}</span>`).join('') : '<span class="muted">No documents marked.</span>'}
      </div>
    </div>
    ${f.notes?`<div class="sec-title">Notes</div><div class="card">${esc(f.notes)}</div>`:''}`;
}

/* ============================================================
   USERS (super admin)
   ============================================================ */
function viewUsers(){
  const u = currentUser();
  if (u.role!=='super') return `<div class="empty"><h3>Admins only</h3><p>Only the Super Admin can manage logins.</p></div>`;
  const users = DB.users();
  const fams = DB.families();
  return `
    <div class="page-head"><div><h1>Users</h1><p>Create admin logins and family view-only logins.</p></div></div>

    <div class="card">
      <div class="sec-title" style="margin-top:0">Add an Admin</div>
      <form id="addAdminForm" class="grid g3">
        <div class="field"><label>Name</label><input class="inp" name="name" required /></div>
        <div class="field"><label>Login ID</label><input class="inp" name="id" required /></div>
        <div class="field"><label>Mobile</label><input class="inp" name="phone" inputmode="numeric" /></div>
        <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required minlength="4" /></div>
        <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">Add Admin</button></div>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Create a Family login</div>
      <p class="muted small" style="margin-bottom:12px">Family login ID = the Family ID. The member can only view their own record.</p>
      <form id="addFamForm" class="grid g3">
        <div class="field"><label>Family</label><select class="inp" name="familyId" required>
          <option value="">Select family…</option>${fams.map(f=>`<option value="${esc(f.id)}">${esc(f.id)} — ${esc(f.houseName||'')}</option>`).join('')}</select></div>
        <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required minlength="4" /></div>
        <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">Create Family Login</button></div>
      </form>
    </div>

    <div class="sec-title">All logins</div>
    <div class="table-wrap"><table><thead><tr><th>Login ID</th><th>Name</th><th>Role</th><th>Linked Family</th><th></th></tr></thead><tbody>
      ${users.map(x=>`<tr>
        <td><span class="mono">${esc(x.id)}</span></td><td>${esc(x.name||'—')}</td>
        <td><span class="badge ${x.role==='super'?'':'gray'}">${ROLE_LABEL[x.role]}</span></td>
        <td>${esc(x.familyId||'—')}</td>
        <td>${x.role==='super'?'':`<button class="btn ghost sm" data-act="del-user" data-id="${esc(x.id)}" style="color:var(--danger)">Delete</button>`}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================================================
   SETTINGS
   ============================================================ */
function viewSettings(){
  const u = currentUser();
  const cloudOn = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  return `
    <div class="page-head"><div><h1>Settings</h1><p>Appearance, data and account.</p></div></div>

    <div class="card">
      <div class="sec-title" style="margin-top:0">Appearance</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <button class="toggle" data-act="toggle-theme" id="themeBtn2">☀ Day / ☾ Night</button>
        <span class="muted small">Emerald Lattice theme · day &amp; night.</span>
      </div>
    </div>

    ${u.role==='family'?'':`<div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Data &amp; backup</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export-excel">⭳ Export Excel (.xlsx)</button>
        <button class="btn ghost sm" data-act="print-all">⎙ Export PDF / Print</button>
        <button class="btn ghost sm" data-act="backup-json">⭳ Backup (JSON)</button>
        <button class="btn ghost sm" data-act="load-sample">Load sample data</button>
      </div>
    </div>`}

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Cloud sync (Supabase)</div>
      <p class="muted small">Status: <b style="color:${cloudOn?'var(--ok)':'var(--warn)'}">${cloudOn?'Connected':'Not connected — running on this device'}</b></p>
      ${cloudOn?'':'<p class="muted small" style="margin-top:8px">Add your Supabase Project URL + anon key in <span class="mono">config.js</span> and run <span class="mono">supabase/schema.sql</span> to switch to shared cloud storage.</p>'}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Account</div>
      <div class="kv"><div class="row"><span>Name</span><span>${esc(u.name||u.id)}</span></div>
        <div class="row"><span>Login ID</span><span>${esc(u.id)}</span></div>
        <div class="row"><span>Role</span><span>${ROLE_LABEL[u.role]}</span></div>
        <div class="row"><span>Mobile</span><span>${esc(u.phone||'—')}</span></div></div>
      <button class="btn danger sm" data-act="logout" style="margin-top:16px">Sign out</button>
    </div>

    ${u.role==='super'?`<div class="card" style="margin-top:16px;border-color:var(--danger-brd)">
      <div class="sec-title" style="margin-top:0;color:var(--danger)">Danger zone</div>
      <p class="muted small" style="margin-bottom:12px">Deletes all household records on this device. Logins are kept.</p>
      <button class="btn danger sm" data-act="clear-data">Erase all household records</button>
    </div>`:''}`;
}

/* ============================================================
   MY FAMILY (family role)
   ============================================================ */
function viewMyFamily(){
  const u = currentUser();
  const f = DB.families().find(x=>x.id===u.familyId);
  if (!f) return `<div class="empty"><h3>No record linked</h3><p>Your login is not linked to a household record yet. Please contact the committee.</p></div>`;
  return viewFamilyDetail(f.id);
}

/* ============================================================
   ACTIONS (event delegation)
   ============================================================ */
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-act]'); if(!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act==='toggle-theme') { toggleTheme(); const b=$('#themeBtn2'); if(b) b.textContent = document.documentElement.getAttribute('data-theme')==='night'?'☾ Night':'☀ Day'; return; }
  if (act==='goto'){ if (el.dataset.view==='add'){ state.draft=blankDraft(); go(el.dataset.view); } else go(el.dataset.view, el.dataset.street||null); return; }
  if (act==='logout'){ clearSession(); state.draft=null; renderAuth(); return; }
  if (act==='load-sample'){ loadSample(); enterApp(); go('dashboard'); toast('Sample data loaded'); return; }
  if (act==='clear-data'){ if(confirm('Erase ALL household records on this device? This cannot be undone.')){ DB.setFamilies([]); DB.setSeq(0); toast('All household records erased'); go('dashboard'); } return; }
  if (act==='export-excel'){ exportExcel(); return; }
  if (act==='print-all'){ printFamilies(DB.families(), 'All Households'); return; }
  if (act==='print-family'){ const f=DB.families().find(x=>x.id===id); if(f) printFamilies([f], f.houseName||f.id); return; }
  if (act==='backup-json'){ backupJSON(); return; }
  if (act==='view-family'){ go('detail', id); return; }
  if (act==='edit-family'){ const f=DB.families().find(x=>x.id===id); if(f){ state.draft = JSON.parse(JSON.stringify(f)); state.draft.docs = Object.assign(Object.fromEntries(DOC_TYPES.map(d=>[d[0],'no'])), state.draft.docs||{}); state.draft.custom = padCustom(state.draft.custom); if(!state.draft.houseType) state.draft.houseType='moulding'; go('add', id); } return; }
  if (act==='del-family'){ if(confirm('Delete this household record permanently?')){ DB.setFamilies(DB.families().filter(f=>f.id!==id)); toast('Household deleted'); go('families'); } return; }
  if (act==='del-user'){ if(confirm('Delete this login?')){ DB.setUsers(DB.users().filter(u=>u.id!==id)); toast('Login deleted'); go('users'); } return; }
  if (act==='add-member'){ state.draft.members.push(blankMember()); renderMembers(); return; }
  if (act==='remove-member'){ state.draft.members.splice(+el.dataset.idx,1); renderMembers(); return; }
});

// segmented controls (documents, house type, member yes/no)
document.addEventListener('click', (e)=>{
  const seg = e.target.closest('.seg'); if(!seg || !state.draft) return;
  const btn = e.target.closest('button[data-v]'); if(!btn) return;
  const v = btn.dataset.v;
  if (seg.dataset.hfield){
    state.draft[seg.dataset.hfield] = v;
  } else if (seg.dataset.doc){
    const key = seg.dataset.doc;
    if (key.startsWith('custom:')){ const i = +key.split(':')[1]; state.draft.custom[i].value = v; }
    else state.draft.docs[key] = v;
  } else if (seg.dataset.mfield){
    const i = +seg.dataset.idx; state.draft.members[i][seg.dataset.mfield.replace('m.','')] = v;
  }
  $$('button', seg).forEach(b=>b.classList.toggle('on', b.dataset.v===v));
});

// text/select inputs update the draft
function applyField(el){
  if(!state.draft || !el || !el.dataset || !el.dataset.field) return;
  const f = el.dataset.field;
  if (f==='customLabel'){ state.draft.custom[+el.dataset.ci].label = el.value; return; }
  if (f.startsWith('m.')){ const i = +el.dataset.idx; state.draft.members[i][f.slice(2)] = el.value; return; }
  state.draft[f] = el.value;
}
document.addEventListener('input', (e)=>{
  const el=e.target;
  if(el.dataset&&el.dataset.field){ applyField(el); if(el.dataset.field==='m.name'){ const h=el.closest('.member-card')&&el.closest('.member-card').querySelector('.idx'); if(h) h.textContent='Member '+(+el.dataset.idx+1)+' · '+el.value; } return; }
  if(el.id==='famSearch') renderFamilyList();
});
document.addEventListener('change', (e)=>{
  const el=e.target;
  if(el.dataset&&el.dataset.field){ applyField(el); return; }
  if(el.id==='famGenderF'||el.id==='famMaritalF'||el.id==='famStreetF') renderFamilyList();
});

// form submissions
document.addEventListener('submit', async (e)=>{
  const form = e.target;
  if (form.id==='famForm'){ e.preventDefault(); saveFamily(); }
  else if (form.id==='addAdminForm'){ e.preventDefault(); await addAdmin(form); }
  else if (form.id==='addFamForm'){ e.preventDefault(); await addFamilyLogin(form); }
});

// hamburger
document.addEventListener('DOMContentLoaded', ()=>{
  const b=$('#burger'); if(b) b.addEventListener('click', ()=>{ $('#sidebar').classList.add('open'); $('#scrimNav').classList.add('show'); });
  const sc=$('#scrimNav'); if(sc) sc.addEventListener('click', closeNav);
  const tb=$('#themeBtn'); if(tb) tb.addEventListener('click', toggleTheme);
});

/* ---------------- render side-effects ---------------- */
function afterRender(view){
  if (view==='add' && state.draft){ renderMembers(); }
  if (view==='detail' || view==='myfamily'){ const id = (view==='detail')?state.param:currentUser().familyId; const f=DB.families().find(x=>x.id===id); const box=$('#qrBox'); if(f&&box) renderQR(box, f.id + ' | ' + (f.houseName||'')); }
  if (view==='families'){ renderFamilyList(); }
  const tb=$('#themeBtn2'); if(tb) tb.textContent = document.documentElement.getAttribute('data-theme')==='night'?'☾ Night':'☀ Day';
}

/* ---------------- QR ---------------- */
function renderQR(el, text){
  el.innerHTML='';
  try{
    if (typeof qrcode === 'function'){
      const qr = qrcode(0,'M'); qr.addData(text); qr.make();
      el.innerHTML = qr.createSvgTag({cellSize:4, margin:1, scalable:true});
      return;
    }
  }catch(err){ /* fall through */ }
  el.innerHTML = '<div style="font-size:.62rem;color:#555;padding:6px;word-break:break-all">QR unavailable offline<br>'+esc(text)+'</div>';
}

/* ============================================================
   SAVE HOUSEHOLD
   ============================================================ */
function saveFamily(){
  const d = state.draft, u = currentUser();
  const alertBox = $('#formAlert');
  const fail = (msg)=>{ if(alertBox) alertBox.innerHTML='<div class="alert err">'+esc(msg)+'</div>'; window.scrollTo({top:0,behavior:'smooth'}); };
  if (!String(d.street||'').trim()) return fail('Street name is required (section 1).');
  if (!String(d.houseName||'').trim()) return fail('Household / head name is required.');
  const members = d.members.filter(m=> (m.name||'').trim());
  if (!members.length) return fail('Add at least one member with a name.');
  if (d.phone && !/^[0-9+\-\s]{6,15}$/.test(d.phone)) return fail('Phone number looks invalid.');

  d.street = d.street.trim();
  d.houseType = d.houseType || 'moulding';
  d.members = members;
  const fams = DB.families();
  if (d.id){
    const i = fams.findIndex(f=>f.id===d.id);
    d.updatedAt = Date.now();
    if (i>=0) fams[i]=d; else fams.push(d);
  } else {
    d.id = nextFamilyId();
    d.createdAt = Date.now();
    d.createdBy = u.id;
    fams.push(d);
  }
  DB.setFamilies(fams);
  const wasNew = !state.param;
  state.draft = null;
  toast(wasNew ? 'Household saved — ID generated' : 'Changes saved');
  go('detail', d.id);
}
function nextFamilyId(){ const n=DB.seq()+1; DB.setSeq(n); return PREFIX+'-'+new Date().getFullYear()+'-'+pad(n,6); }
function padCustom(custom){
  const arr = Array.isArray(custom) ? custom.slice(0,CUSTOM_DOCS) : [];
  while (arr.length < CUSTOM_DOCS) arr.push({label:'', value:'no'});
  return arr;
}

/* ============================================================
   USERS create
   ============================================================ */
async function addAdmin(form){
  const E=form.elements;
  const name=E.name.value.trim(), id=E.id.value.trim().toLowerCase(), phone=E.phone.value.trim(), pass=E.pass.value;
  if (DB.users().some(u=>u.id===id)){ toast('That ID already exists','err'); return; }
  const salt=uid();
  const users=DB.users(); users.push({ id, role:'admin', name:name||id, phone, salt, passHash:await hashPass(pass,salt), createdAt:Date.now() });
  DB.setUsers(users); toast('Admin added'); go('users');
}
async function addFamilyLogin(form){
  const E=form.elements;
  const familyId=E.familyId.value, pass=E.pass.value;
  if (!familyId){ toast('Select a family','err'); return; }
  const id = familyId.toLowerCase();
  const fam = DB.families().find(f=>f.id===familyId);
  const users=DB.users().filter(u=>u.id!==id);
  const salt=uid();
  users.push({ id, role:'family', name:(fam&&fam.houseName)||familyId, phone:(fam&&fam.phone)||'', familyId, salt, passHash:await hashPass(pass,salt), createdAt:Date.now() });
  DB.setUsers(users); toast('Family login created (ID: '+familyId+')'); go('users');
}

/* ============================================================
   EXPORT
   ============================================================ */
function collectRows(){
  const rows=[]; DB.families().forEach(f=>(f.members||[]).forEach(m=>{
    const edu = eduKey(m);
    rows.push({
      'Family ID':f.id, 'Street':streetName(f), 'House No':f.houseNo||'', 'House Type':labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)),
      'Household':f.houseName||'', 'Address':f.address||'', 'Phone':f.phone||'',
      'Member Name':m.name||'', 'Relation':m.relation||'', 'Gender':m.gender||'', 'DOB':m.dob||'', 'Age':(ageFromDob(m.dob)??''),
      'Education Level':EDU_LABEL[edu]||m.education||'', 'Work Sector':SECTOR_LABEL[m.sector]||'', 'Deeni Taleem':DEENI_LABEL[m.religious]||'',
      'Marital Status':m.maritalStatus||'', 'Children':m.children||'', 'Father Name':m.fatherName||'', 'Mother Name':m.motherName||'',
      'Physically Challenged':m.disability||'', 'Govt Scheme':m.govtScheme||''
    });
  }));
  return rows;
}
function summaryRows(){
  const s = computeStats();
  return [
    ['1 · Location & Housing','Total streets', s.streets.length],
    ['1 · Location & Housing','Total houses', s.houses],
    ['1 · Location & Housing','Moulding houses', s.houseTypes.moulding],
    ['1 · Location & Housing','Cement sheet houses', s.houseTypes.cement],
    ['2 · Family & Demographics','Total families', s.families],
    ['2 · Family & Demographics','Total population', s.pop],
    ['2 · Family & Demographics','Children (under 18)', s.children],
    ['2 · Family & Demographics','Men', s.men.total],
    ['2 · Family & Demographics','Men — married', s.men.married],
    ['2 · Family & Demographics','Men — unmarried', s.men.unmarried],
    ['2 · Family & Demographics','Men — physically challenged', s.men.disabled],
    ['2 · Family & Demographics','Women', s.women.total],
    ['2 · Family & Demographics','Women — married', s.women.married],
    ['2 · Family & Demographics','Women — unmarried', s.women.unmarried],
    ['2 · Family & Demographics','Women — physically challenged', s.women.disabled],
    ['2 · Family & Demographics','Women — widow', s.women.widow],
    ['3 · Education','Total students', s.students.total],
    ['3 · Education','Primary students', s.students.primary],
    ['3 · Education','Higher secondary students', s.students.higher_secondary],
    ['3 · Education','College students', s.students.college],
    ['3 · Education','Madarsa students', s.students.madarsa],
    ['4 · Professional','Men — private sector', s.work.men.private],
    ['4 · Professional','Men — government sector', s.work.men.government],
    ['4 · Professional','Men — business', s.work.men.business],
    ['4 · Professional','Women — private sector', s.work.women.private],
    ['4 · Professional','Women — government sector', s.work.women.government],
    ['4 · Professional','Women — business', s.work.women.business],
    ['5 · Religious Education','Men Aalim', s.deeni.menAalim],
    ['5 · Religious Education','Men Hafiz', s.deeni.menHafiz],
    ['5 · Religious Education','Women Aalim', s.deeni.womenAalim],
    ['5 · Religious Education','Women Hafiz', s.deeni.womenHafiz]
  ].map(([group,metric,value])=>({ Group:group, Metric:metric, Total:value }));
}
function exportExcel(){
  if (typeof XLSX === 'undefined'){ toast('Excel library not loaded (need internet once)','err'); return; }
  const rows = collectRows();
  if (!rows.length){ toast('No data to export','err'); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Members');
  const famRows = DB.families().map(f=>({
    'Family ID':f.id,'Street':streetName(f),'House No':f.houseNo||'','House Type':labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)),
    'Household':f.houseName||'','Phone':f.phone||'','Address':f.address||'',
    'Members':(f.members||[]).length,
    'Men':(f.members||[]).filter(m=>m.gender==='Male').length,
    'Women':(f.members||[]).filter(m=>m.gender==='Female').length,
    'Docs (Yes)':DOC_TYPES.filter(([k])=>f.docs&&f.docs[k]==='yes').map(([,l])=>l).join(', ')
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(famRows), 'Households');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows()), 'Survey Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(computeStats().streets.map(st=>({
    'Street':st.name,'Houses':st.houses,'Moulding':st.moulding,'Cement sheet':st.cement,'Other':st.other
  }))), 'Streets');
  XLSX.writeFile(wb, 'masjid-survey-'+todayStr()+'.xlsx');
  toast('Excel file downloaded');
}
function backupJSON(){
  const data = { org:CFG.ORG_NAME, exportedAt:new Date().toISOString(), families:DB.families(), users:DB.users().map(u=>({id:u.id,role:u.role,name:u.name,phone:u.phone,familyId:u.familyId})) };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='masjid-survey-backup-'+todayStr()+'.json'; a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}
function printFamilies(fams, title){
  if (!fams.length){ toast('Nothing to print','err'); return; }
  const s = computeStats();
  const head = `<h1>${esc(CFG.ORG_NAME||'Masjid - E- Mohammadiy')} — ${esc(title)}</h1>
    <div class="pmeta">${esc(CFG.ORG_SUB||'Khidmath Committee')} · printed ${new Date().toLocaleDateString('en-GB')}</div>
    ${title==='All Households'?`
    <div class="psum">
      <b>1 · Location &amp; Housing</b> — streets ${s.streets.length} · houses ${s.houses} · moulding ${s.houseTypes.moulding} · cement sheet ${s.houseTypes.cement}<br>
      <b>2 · Family &amp; Demographics</b> — families ${s.families} · population ${s.pop} · children ${s.children} · men ${s.men.total} (married ${s.men.married}, unmarried ${s.men.unmarried}, challenged ${s.men.disabled}) · women ${s.women.total} (married ${s.women.married}, unmarried ${s.women.unmarried}, challenged ${s.women.disabled}, widow ${s.women.widow})<br>
      <b>3 · Education</b> — students ${s.students.total} · primary ${s.students.primary} · higher secondary ${s.students.higher_secondary} · college ${s.students.college} · madarsa ${s.students.madarsa}<br>
      <b>4 · Professional</b> — men: private ${s.work.men.private}, govt ${s.work.men.government}, business ${s.work.men.business} · women: private ${s.work.women.private}, govt ${s.work.women.government}, business ${s.work.women.business}<br>
      <b>5 · Religious Education</b> — men aalim ${s.deeni.menAalim}, hafiz ${s.deeni.menHafiz} · women aalim ${s.deeni.womenAalim}, hafiz ${s.deeni.womenHafiz}
    </div>`:''}`;
  const body = fams.map(f=>{
    const docs = DOC_TYPES.filter(([k])=>f.docs&&f.docs[k]==='yes').map(([,l])=>l).concat((f.custom||[]).filter(c=>c.label&&c.value==='yes').map(c=>c.label));
    return `<div class="pcard">
      <h2>${esc(f.houseName||'Household')} — ${esc(f.id)}</h2>
      <div class="pmeta">Street: ${esc(streetName(f))} · House No: ${esc(f.houseNo||'—')} · Type: ${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)))} · Phone: ${esc(f.phone||'—')} · Address: ${esc(f.address||'—')}</div>
      <table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Work</th><th>Deeni</th><th>Marital</th><th>Challenged</th></tr></thead><tbody>
      ${(f.members||[]).map((m,i)=>{const a=ageFromDob(m.dob);return `<tr><td>${i+1}</td><td>${esc(m.name||'')}</td><td>${esc(m.relation||'')}</td><td>${esc(m.gender||'')}</td><td>${a===null?'':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'')}</td><td>${esc(SECTOR_LABEL[m.sector]||'')}</td><td>${esc(DEENI_LABEL[m.religious]||'')}</td><td>${esc(m.maritalStatus||'')}</td><td>${m.disability==='yes'?'Yes':'No'}</td></tr>`;}).join('')}
      </tbody></table>
      <div class="pmeta" style="margin-top:6pt">Documents: ${docs.length?esc(docs.join(', ')):'—'}</div>
    </div>`;
  }).join('');
  const area = $('#printArea'); area.innerHTML = head + body;
  setTimeout(()=>{ window.print(); }, 120);
}

/* ============================================================
   SAMPLE DATA
   ============================================================ */
function loadSample(){
  if (DB.families().length && !confirm('Add sample households on top of existing data?')) return;
  const M = (relation,name,gender,dob,marital,edu,sector,religious,opt)=>{
    const o = opt||{};
    return { relation, name, gender, dob, maritalStatus:marital, educationLevel:edu, sector:sector||'', religious:religious||'',
      children:o.children||'0', fatherName:o.father||'', motherName:o.mother||'', disability:o.disability||'no', govtScheme:o.scheme||'no' };
  };
  const sample = [
    { houseName:'Abdul Rahman', houseNo:'12-B', street:'Masjid Road', houseType:'moulding', phone:'9876543210', address:'Masjid Road, Block A',
      members:[ M('Self','Abdul Rahman','Male','1979-04-12','Married','college','business','', {children:'3',father:'Mohd Yusuf',mother:'Ayesha Bibi',scheme:'yes'}),
                M('Wife','Fatima Begum','Female','1984-08-20','Married','higher_secondary','none','', {children:'3',father:'Ibrahim',mother:'Khatija'}),
                M('Son','Imran Khan','Male','2011-02-05','Unmarried','primary','', '', {father:'Abdul Rahman',mother:'Fatima Begum'}),
                M('Daughter','Ayesha Khan','Female','2014-09-11','Unmarried','primary','', 'hafiz', {father:'Abdul Rahman',mother:'Fatima Begum'}) ] },
    { houseName:'Sayeed Ahmed', houseNo:'45', street:'Nala Road', houseType:'cement', phone:'9812345678', address:'Nala Road, Block C',
      members:[ M('Self','Sayeed Ahmed','Male','1965-11-01','Widower','higher_secondary','private','', {children:'2',father:'Late Karim',mother:'Rahima',disability:'yes',scheme:'yes'}),
                M('Daughter','Sana Ahmed','Female','2009-06-18','Unmarried','higher_secondary','', '', {father:'Sayeed Ahmed',mother:'Nasreen',scheme:'yes'}) ] },
    { houseName:'Mohd Salim', houseNo:'7-A', street:'Idgah Lane', houseType:'moulding', phone:'9822001100', address:'Idgah Lane, Block B',
      members:[ M('Self','Mohd Salim','Male','1988-01-30','Married','college','private','aalim', {children:'1',father:'Abdul Karim',mother:'Shabana'}),
                M('Wife','Rukhsana','Female','1990-09-09','Married','higher_secondary','business','', {children:'1',father:'Yusuf',mother:'Zubeida'}),
                M('Son','Zaid Salim','Male','2016-03-21','Unmarried','primary','','', {father:'Mohd Salim',mother:'Rukhsana'}) ] },
    { houseName:'Ismail Sheikh', houseNo:'88', street:'Masjid Road', houseType:'cement', phone:'9867891234', address:'Masjid Road, Block A',
      members:[ M('Self','Ismail Sheikh','Male','1972-03-15','Married','primary','business','', {children:'4',father:'Rasheed',mother:'Hameeda',scheme:'yes'}),
                M('Wife','Naseem Bano','Female','1976-12-25','Married','primary','none','', {children:'4',father:'Anwar',mother:'Salma',disability:'yes',scheme:'yes'}),
                M('Son','Faizan Sheikh','Male','2004-05-02','Unmarried','college','','hafiz', {father:'Ismail Sheikh',mother:'Naseem Bano'}),
                M('Daughter','Mehjabeen','Female','2007-01-19','Unmarried','higher_secondary','','', {father:'Ismail Sheikh',mother:'Naseem Bano'}) ] },
    { houseName:'Rizwan Ali', houseNo:'23', street:'Nala Road', houseType:'moulding', phone:'9800012345', address:'Nala Road, Block D',
      members:[ M('Self','Rizwan Ali','Male','1995-07-07','Unmarried','college','private','', {father:'Shakeel',mother:'Farida'}) ] },
    { houseName:'Hafiz Noor Alam', houseNo:'5', street:'Madarsa Gali', houseType:'moulding', phone:'9833001122', address:'Madarsa Gali, near masjid',
      members:[ M('Self','Noor Alam','Male','1983-02-14','Married','madarsa','', 'both', {children:'2',father:'Siraj',mother:'Amina'}),
                M('Wife','Shabnam','Female','1987-10-30','Married','madarsa','none','aalim', {children:'2',father:'Ismail',mother:'Razia'}),
                M('Daughter','Hafsa','Female','2013-12-08','Unmarried','madarsa','', 'hafiz', {father:'Noor Alam',mother:'Shabnam'}) ] },
    { houseName:'Shakeel Ahmed', houseNo:'31', street:'Idgah Lane', houseType:'other', phone:'9845009988', address:'Idgah Lane, Block B',
      members:[ M('Self','Shakeel Ahmed','Male','1969-06-09','Married','primary','government','', {children:'2',father:'Yaqoob',mother:'Sakina',scheme:'yes'}),
                M('Wife','Farida','Female','1974-04-17','Married','primary','none','', {children:'2',father:'Rauf',mother:'Noorjahan'}),
                M('Son','Arif','Male','2001-08-25','Unmarried','college','private','', {father:'Shakeel Ahmed',mother:'Farida'}) ] },
    { houseName:'Yusuf Khan', houseNo:'64', street:'Masjid Road', houseType:'moulding', phone:'9898987676', address:'Masjid Road, Block A',
      members:[ M('Self','Yusuf Khan','Male','1990-11-11','Married','higher_secondary','private','', {children:'0',father:'Latif',mother:'Saira'}),
                M('Wife','Afsana','Female','1993-03-03','Married','college','government','', {father:'Naeem',mother:'Rukhsar'}) ] }
  ];
  const fams = DB.families();
  sample.forEach((s,i)=>{
    const id = nextFamilyId();
    const docs = {}; DOC_TYPES.forEach(([k],idx)=>{ docs[k] = (idx % 2 === 0 && i % 2 === 0) ? 'yes' : 'no'; });
    fams.push(Object.assign({ id, createdAt:Date.now()- (sample.length-i)*86400000, createdBy:'sample', notes:'Sample record', docs, custom:padCustom([]) }, s));
  });
  DB.setFamilies(fams);
}

/* ============================================================
   INIT
   ============================================================ */
function init(){ renderAuth(); }
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
