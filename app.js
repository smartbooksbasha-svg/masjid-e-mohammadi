/* ============================================================
   Masjid e Mohammadi · Khidmath Committee — Mohalla Survey
   Application logic (vanilla JS, local-first + optional Supabase)
   ============================================================ */
'use strict';

/* ---------------- config / constants ---------------- */
const CFG = window.APP_CONFIG || {};
const PREFIX = CFG.FAMILY_ID_PREFIX || 'MEMC';
const LS = { users:'memc_users', admins:'memc_admins', families:'memc_families', seq:'memc_seq', session:'memc_session', theme:'memc_theme', seeded:'memc_seeded', masjid:'memc_masjid' };

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
  ['palm','Palm leaf'],
  ['other','Other / kachcha']
];
const HOUSE_LABEL = Object.fromEntries(HOUSE_TYPES);

/* basic government documents — counted per member */
const BASIC_DOCS = [
  ['aadhaar','Aadhaar'],
  ['pan','PAN card'],
  ['passbook','Bank passbook'],
  ['voter','Voter ID'],
  ['birth','Birth certificate'],
  ['passport','Passport'],
  ['tc','School TC'],
  ['smartcard','Smart card'],
  ['kapidu','Kapidu Thittam card'],
];
const EDU = [
  ['primary','Primary (1-8)'],
  ['higher_secondary','Higher secondary (9-12)'],
  ['college','College / University'],
  ['madarsa','Madarsa'],
  ['none','Not studying']
];
/* occupation is free text; these are just quick suggestions */
const OCCUPATIONS = [
  'Plumber','Electrician','Painter','Helper / daily labour','Mason','Carpenter',
  'Tailor','Driver','Mechanic','Shop / business','Farmer','Beedi / factory worker',
  'Security','Cook','Teacher','Imam / madrasa teacher','Housewife','Student',
  'Retired','Not working'
];

/* welfare schemes — multi-select per member */
const SCHEMES = [
  ['magalir','Magalir Urimai Thogai'],
  ['disability_pension','Disability pension'],
  ['old_age_pension','Old age pension'],
  ['widow_pension','Widow pension'],
  ['scholarship','School scholarship'],
  ['pm_awas','PM Awas Yojana'],
  ['ayushman','Ayushman Bharat'],
  ['ujjwala','Ujjwala gas'],
  ['bus_pass','Free bus pass'],
  ['other','Other scheme']
];
const DEENI = [
  ['','— none —'],
  ['aalim','Aalim'],
  ['hafiz','Hafiz'],
  ['both','Aalim + Hafiz']
];
const labelOf = (list,key) => (list.find(x=>x[0]===key)||[])[1] || '';
const EDU_LABEL = Object.fromEntries(EDU);
const SECTOR_LABEL = { private:'Private job', government:'Government job', business:'Business' }; // legacy records only
const SCHEME_LABEL = Object.fromEntries(SCHEMES);
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
function maskPhone(p){
  const d = String(p||'').replace(/\D/g,'');
  if (d.length < 6) return p ? '••••••' : '—';
  return d.slice(0,2) + '•••••' + d.slice(-2);
}
function fmtDate(d){ if(!d) return '—'; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1,2)+'-'+pad(d.getDate(),2); }

/* ---------------- storage ---------------- */
const DB = {
  users(){ try{ return JSON.parse(localStorage.getItem(LS.users)||'[]'); }catch(e){ return []; } },
  setUsers(v){ localStorage.setItem(LS.users, JSON.stringify(v)); },
  /* single-role world: admins only. Old super/admin accounts migrate once. */
  admins(){
    try {
      const raw = JSON.parse(localStorage.getItem(LS.admins)||'null');
      if (Array.isArray(raw)) return raw;
    } catch(e){}
    const legacy = this.users().filter(u=>u.role==='super'||u.role==='admin').map(u=>({
      email: String(u.id||'').includes('@') ? u.id : (u.email||''),
      name: u.name||u.id, phone:u.phone||'', salt:u.salt, passHash:u.passHash,
      createdAt:u.createdAt||Date.now(), verified:true, legacyId:u.id
    })).filter(a=>a.email);
    localStorage.setItem(LS.admins, JSON.stringify(legacy));
    return legacy;
  },
  setAdmins(v){ localStorage.setItem(LS.admins, JSON.stringify(v)); },
  families(){ try{ return JSON.parse(localStorage.getItem(LS.families)||'[]'); }catch(e){ return []; } },
  setFamilies(v){ localStorage.setItem(LS.families, JSON.stringify(v)); },
  seq(){ return parseInt(localStorage.getItem(LS.seq)||'0',10)||0; },
  setSeq(n){ localStorage.setItem(LS.seq, String(n)); },
  seeded(){ return localStorage.getItem(LS.seeded)==='1'; },
  setSeeded(){ localStorage.setItem(LS.seeded,'1'); },
  masjid(){ try{ return JSON.parse(localStorage.getItem(LS.masjid)||'null') || null; }catch(e){ return null; } },
  setMasjid(v){ localStorage.setItem(LS.masjid, JSON.stringify(v)); }
};

function getSession(){ try{ return JSON.parse(localStorage.getItem(LS.session)||'null'); }catch(e){ return null; } }
function setSession(s){ localStorage.setItem(LS.session, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(LS.session); }

/* ---------- optional cloud (Supabase) ---------- */
const CLOUD = {
  enabled(){ return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); },
  client: null, failed: false,
  async get(){
    if (!this.enabled() || this.failed) return null;
    if (this.client) return this.client;
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      this.client = mod.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      return this.client;
    } catch(e){ this.failed = true; return null; }
  }
};

function currentUser(){
  const s = getSession();
  if (!s || s.kind !== 'admin' || !s.email) return null;
  const a = DB.admins().find(x=>String(x.email).toLowerCase()===String(s.email).toLowerCase());
  return a ? { id:a.email, email:a.email, name:a.name||a.email, role:'admin' } : null;
}
function isAdmin(){ return !!currentUser(); }

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
  mosque:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2.5 2.4 4 4.2 4 6a4 4 0 0 1-8 0c0-1.8 1.5-3.6 4-6z"/><path d="M4 21v-6a8 8 0 0 1 16 0v6"/><path d="M9 21v-4a3 3 0 0 1 6 0v4"/><path d="M2 21h20"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

/* ============================================================
   AUTH — ek Admin login · public visitors read-only
   ============================================================ */
let pending = null;      // { kind:'login'|'register'|'reset', email, code, name, phone, pass, expires }

function adminByEmail(email){
  const e = String(email||'').trim().toLowerCase();
  return DB.admins().find(a=>String(a.email||'').toLowerCase()===e) || null;
}
function mailMode(){ return CLOUD.enabled() ? 'cloud' : 'demo'; }
function newCode(){ return String(100000 + Math.floor(Math.random()*900000)); }
function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v||'').trim()); }

function authCard(inner){
  return `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand"><span class="crest">M</span><div><div class="t">${esc(CFG.ORG_NAME||'Masjid e Mohammadi')}</div><div class="s">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div></div></div>
    ${inner}
    <button class="btn ghost block" type="button" data-act="close-auth" style="margin-top:10px">← Public dashboard</button>
  </div></div>`;
}
function authTabs(active){
  return `<div class="role-tabs" id="authTabs">
    <button data-tab="login" class="${active==='login'?'active':''}">Login</button>
    <button data-tab="register" class="${active==='register'?'active':''}">Register</button>
    <button data-tab="forgot" class="${active==='forgot'?'active':''}">Forgot</button>
  </div>`;
}

function openAuth(tab){
  renderAuth(tab || 'login');
}
function closeAuth(){
  const a = $('#authScreen'); if (a){ a.classList.add('hidden'); a.innerHTML=''; }
  const app = $('#appScreen'); if (app) app.classList.remove('hidden');
}

function renderAuth(tab){
  const app = $('#appScreen'); if (app) app.classList.add('hidden');
  const box = $('#authScreen'); box.classList.remove('hidden');
  pending = pending && pending.expires > Date.now() ? pending : null;
  if (pending) return renderCodeStep();

  if (tab === 'register') return renderRegister();
  if (tab === 'forgot')  return renderForgot();
  return renderLogin();
}

/* ---------------- login ---------------- */
function renderLogin(){
  $('#authScreen').innerHTML = authCard(`
    <h1>Admin login</h1>
    <p class="lead">Sirf committee admin ke liye. Baaki sab public dashboard dekh sakte hain.</p>
    ${authTabs('login')}
    <form id="loginForm">
      <div class="field"><label>Email ID</label><input class="inp" name="email" type="email" required autocomplete="username" placeholder="admin@example.com" /></div>
      <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required autocomplete="current-password" /></div>
      <div class="field"><label>Captcha — answer the sum</label>
        <div class="captcha-box"><div class="captcha-q" id="captchaQ"></div><button type="button" class="icon-btn" id="captchaReload" aria-label="New captcha">↻</button></div>
        <input class="inp" name="captcha" inputmode="numeric" required placeholder="Answer" style="margin-top:6px" />
      </div>
      <div id="loginAlert"></div>
      <button class="btn block" type="submit">Login</button>
      <button class="btn ghost block" type="button" data-act="magic-login" style="margin-top:8px">Email link se login (password ke bina)</button>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:12px;flex-wrap:wrap">
        <button class="linklike" type="button" data-act="auth-tab" data-tab="forgot">Forgot password / ID?</button>
        <button class="linklike" type="button" data-act="auth-tab" data-tab="register">Create admin</button>
      </div>
    </form>`);

  let capA=0, capB=0;
  const newCaptcha = ()=>{ capA=2+Math.floor(Math.random()*8); capB=1+Math.floor(Math.random()*8); $('#captchaQ').textContent = capA+' + '+capB+' = ?'; };
  newCaptcha();
  $('#captchaReload').addEventListener('click', newCaptcha);

  $('#loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const E = e.target.elements, alertBox = $('#loginAlert');
    const email = E.email.value.trim().toLowerCase(), pass = E.pass.value;
    if (parseInt(E.captcha.value,10) !== capA+capB){ alertBox.innerHTML='<div class="alert err">Captcha answer is wrong.</div>'; newCaptcha(); E.captcha.value=''; return; }
    if (!isEmail(email)){ alertBox.innerHTML='<div class="alert err">Email ID theek nahi lag rahi.</div>'; return; }

    if (mailMode() === 'cloud'){
      const c = await CLOUD.get();
      if (!c){ alertBox.innerHTML='<div class="alert err">Cloud connect nahi hua — internet check karo.</div>'; return; }
      const { error } = await c.auth.signInWithPassword({ email, password: pass });
      if (error){ alertBox.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
      await cloudClaimAdmin(email, '', '');
      if (!adminByEmail(email)){
        const admins = DB.admins();
        admins.push({ email, name:email.split('@')[0], phone:'', createdAt:Date.now(), verified:true, cloud:true });
        DB.setAdmins(admins);
      }
      setSession({ kind:'admin', email });
      closeAuth(); enterApp(); toast('Welcome back'); return;
    }

    const admin = adminByEmail(email);
    if (!admin){ alertBox.innerHTML='<div class="alert err">Is email se koi admin nahi hai.</div>'; newCaptcha(); return; }
    const h = await hashPass(pass, admin.salt);
    if (h !== admin.passHash){ alertBox.innerHTML='<div class="alert err">Password galat hai.</div>'; newCaptcha(); return; }
    pending = { kind:'login', email, code:newCode(), expires:Date.now()+10*60*1000 };
    renderCodeStep();
  });
}

/* ---------------- register ---------------- */
function renderRegister(){
  const first = DB.admins().length === 0;
  $('#authScreen').innerHTML = authCard(`
    <h1>${first?'Create the first admin':'Create another admin'}</h1>
    <p class="lead">${first ? 'Pehla admin account banao — email par 6-digit code aayega.' : 'Naya admin banane ke liye committee ka invite code chahiye.'}</p>
    ${authTabs('register')}
    <form id="regForm">
      <div class="field"><label>Full name</label><input class="inp" name="name" required placeholder="e.g. Abdul Rahman" /></div>
      <div class="grid g2">
        <div class="field"><label>Email ID</label><input class="inp" name="email" type="email" required placeholder="name@example.com" /></div>
        <div class="field"><label>Mobile</label><input class="inp" name="phone" inputmode="numeric" placeholder="10-digit" /></div>
      </div>
      <div class="grid g2">
        <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required minlength="6" placeholder="min 6 characters" /></div>
        <div class="field"><label>Confirm password</label><input class="inp" name="pass2" type="password" required minlength="6" /></div>
      </div>
      ${first ? '' : `<div class="field"><label>Invite code</label><input class="inp" name="invite" required placeholder="Admin se poochho" />
        <span class="hint">Settings me admin invite code dikhta hai.</span></div>`}
      <div id="regAlert"></div>
      <button class="btn block" type="submit">Send code to email</button>
    </form>`);

  $('#regForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const E = e.target.elements, alertBox = $('#regAlert');
    const name = E.name.value.trim(), email = E.email.value.trim().toLowerCase(), phone = E.phone.value.trim();
    const pass = E.pass.value, pass2 = E.pass2.value;
    if (!isEmail(email)){ alertBox.innerHTML='<div class="alert err">Valid email ID daalo.</div>'; return; }
    if (adminByEmail(email)){ alertBox.innerHTML='<div class="alert err">Ye email pehle se admin hai — login karo.</div>'; return; }
    if (pass !== pass2){ alertBox.innerHTML='<div class="alert err">Passwords match nahi kar rahe.</div>'; return; }
    if (pass.length < 6){ alertBox.innerHTML='<div class="alert err">Password kam se kam 6 characters ka ho.</div>'; return; }
    if (DB.admins().length){
      const code = (CFG.ADMIN_INVITE_CODE||'').trim().toUpperCase();
      if (!code || E.invite.value.trim().toUpperCase() !== code){ alertBox.innerHTML='<div class="alert err">Invite code galat hai.</div>'; return; }
    }

    if (mailMode() === 'cloud'){
      const c = await CLOUD.get();
      if (!c){ alertBox.innerHTML='<div class="alert err">Cloud connect nahi hua.</div>'; return; }
      const { error } = await c.auth.signUp({ email, password: pass, options:{ data:{ name, phone }, emailRedirectTo: location.origin + location.pathname } });
      if (error){
        const m = String(error.message||'');
        if (/already registered|already exists/i.test(m))
          alertBox.innerHTML='<div class="alert err">Ye email pehle se registered hai. <b>Forgot password / ID?</b> par jao → email par link aayega → click karke password set karo, phir login.</div>';
        else alertBox.innerHTML='<div class="alert err">'+esc(m)+'</div>';
        return;
      }
      pending = { kind:'register', email, name, phone };
      renderLinkSent(); return;
    }

    const code = newCode();
    pending = { kind:'register', email, name, phone, pass, code, expires:Date.now()+10*60*1000 };
    renderCodeStep();
  });
}


/* Supabase side: logged-in auth user ko app_users (admin) me claim karo */
async function cloudClaimAdmin(email, name, phone){
  const c = await CLOUD.get(); if (!c) return false;
  try {
    const { data } = await c.auth.getUser();
    const u = data && data.user; if (!u) return false;
    const { data: rows } = await c.from('app_users').select('id').eq('user_id', u.id).limit(1);
    if (rows && rows.length) return true;
    const { error } = await c.from('app_users').upsert({ id:email, user_id:u.id, role:'admin', name:name||'', phone:phone||'' });
    return !error;
  } catch(e){ return false; }
}


/* ---------------- email LINK step (cloud) ---------------- */
function renderLinkSent(){
  const isReset = pending.kind === 'reset';
  const isLogin = pending.kind === 'login';
  $('#authScreen').innerHTML = authCard(`
    <h1>${isReset?'Reset link bhej diya':isLogin?'Login link bhej diya':'Email check karo'}</h1>
    <p class="lead"><b>${esc(pending.email)}</b> par ${isReset?'password reset':isLogin?'login':'confirm'} link bheja hai.</p>
    <div class="alert info">Email kholo → link par <b>click</b> karo → app khud login kar lega.<br>
      <span class="small">Link na dikhe to spam folder dekho. Link 1 ghante tak chalta hai.</span></div>
    <button class="btn block" type="button" data-act="auth-check">Maine link par click kar liya</button>
    <button class="btn ghost block" type="button" data-act="auth-cancel">Cancel</button>`);
}

async function cloudLinkCheck(){
  const c = await CLOUD.get();
  if (!c){ toast('Cloud connect nahi hua','err'); return; }
  const { data } = await c.auth.getSession();
  const sess = data && data.session;
  if (!sess){ toast('Abhi verify nahi hua — email me link par click karo','err'); return; }
  const email = (sess.user.email||'').toLowerCase();
  if (pending && pending.kind === 'reset'){ pending = { kind:'newpass', email }; return renderNewPassword(); }
  const md = sess.user.user_metadata || {};
  const known = !!adminByEmail(email);
  const granted = await cloudClaimAdmin(email, md.name||'', md.phone||'');
  if (!known && !granted){
    await c.auth.signOut();
    setSession(null);
    const box = $('#codeAlert') || $('#authScreen');
    $('#authScreen').innerHTML = authCard(`
      <h1>Permission nahi mili</h1>
      <p class="lead"><b>${esc(email)}</b> admin list me nahi hai.</p>
      <div class="alert info">Admin login sirf committee ke registered email se hota hai. Is email ko pehle <b>Admins</b> screen se add karna hoga (cloud me write permission sirf pehle admin ke paas hai).</div>
      <button class="btn block" type="button" data-act="open-auth">Wapas login</button>`);
    return;
  }
  if (!known){
    const admins = DB.admins();
    admins.push({ email, name:md.name||email.split('@')[0], phone:md.phone||'', createdAt:Date.now(), verified:true, cloud:true });
    DB.setAdmins(admins);
  }
  setSession({ kind:'admin', email });
  pending=null; closeAuth(); enterApp(); toast('Admin login ho gaya');
}

/* ---------------- email code step ---------------- */
function renderCodeStep(){
  const p = pending;
  const demo = mailMode() === 'demo';
  const titleMap = { login:'Confirm login', register:'Verify your email', reset:'Reset password' };
  $('#authScreen').innerHTML = authCard(`
    <h1>${titleMap[p.kind]||'Verify'}</h1>
    <p class="lead">6-digit code bheja gaya hai <b>${esc(p.email)}</b> par.${demo?'':''}</p>
    ${demo ? `<div class="alert info">Demo mode — email service abhi connect nahi hai. Aapka code: <span class="otp-badge">${esc(p.code||'——')}</span><br><span class="small">Asli email code ke liye Supabase keys chahiye (Settings → Cloud sync).</span></div>`
           : `<div class="alert info">Email khol ke 6-digit code daalo. Na mile to spam folder dekho.</div>`}
    <form id="codeForm" style="margin-top:14px">
      <div class="field"><label>Code</label><input class="inp" name="code" inputmode="numeric" maxlength="6" required placeholder="6-digit" style="letter-spacing:.3em;text-align:center;font-size:1.2rem" /></div>
      <div id="codeAlert"></div>
      <button class="btn block" type="submit">Verify</button>
      <button class="btn ghost block" type="button" data-act="auth-cancel">Cancel</button>
    </form>`);

  $('#codeForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const code = e.target.elements.code.value.trim();
    const alertBox = $('#codeAlert');

    if (mailMode() === 'cloud'){
      const c = await CLOUD.get();
      if (!c){ alertBox.innerHTML='<div class="alert err">Cloud connect nahi hua.</div>'; return; }
      if (pending.kind === 'register'){
        const { error } = await c.auth.verifyOtp({ email:pending.email, token:code, type:'signup' });
        if (error){ alertBox.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
        await cloudClaimAdmin(pending.email, pending.name, pending.phone);
        const admins = DB.admins();
        admins.push({ email:pending.email, name:pending.name, phone:pending.phone, createdAt:Date.now(), verified:true, cloud:true });
        DB.setAdmins(admins);
        setSession({ kind:'admin', email:pending.email });
        pending=null; closeAuth(); enterApp(); toast('Admin account ban gaya'); return;
      }
      if (pending.kind === 'reset'){
        const { error } = await c.auth.verifyOtp({ email:pending.email, token:code, type:'recovery' });
        if (error){ alertBox.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
        pending = { ...pending, kind:'newpass', code:'' };
        return renderNewPassword();
      }
      return;
    }

    if (!pending || code !== pending.code){ alertBox.innerHTML='<div class="alert err">Code galat hai — dobara dekho.</div>'; return; }

    if (pending.kind === 'login'){
      setSession({ kind:'admin', email:pending.email });
      pending=null; closeAuth(); enterApp(); toast('Welcome back'); return;
    }
    if (pending.kind === 'register'){
      const salt = uid();
      const admins = DB.admins();
      admins.push({ email:pending.email, name:pending.name, phone:pending.phone, salt, passHash: await hashPass(pending.pass, salt), createdAt:Date.now(), verified:true });
      DB.setAdmins(admins);
      setSession({ kind:'admin', email:pending.email });
      pending=null; closeAuth(); enterApp(); toast('Admin account ban gaya'); return;
    }
    if (pending.kind === 'reset'){
      pending = { ...pending, kind:'newpass', code:'' };
      return renderNewPassword();
    }
  });
}

/* ---------------- forgot password / id ---------------- */
function renderForgot(){
  $('#authScreen').innerHTML = authCard(`
    <h1>Forgot password / ID</h1>
    <p class="lead">Email ID yaad hai to password reset karo. Nahi to mobile number se ID dhoondo.</p>
    ${authTabs('forgot')}
    <div class="sec-title" style="margin-top:0;font-size:.9rem">Reset password</div>
    <form id="forgotForm">
      <div class="field"><label>Registered email ID</label><input class="inp" name="email" type="email" required placeholder="admin@example.com" /></div>
      <div id="forgotAlert"></div>
      <button class="btn block" type="submit">Send reset code</button>
    </form>
    <div class="sec-title" style="margin-top:18px;font-size:.9rem">Forgot your ID?</div>
    <form id="findForm">
      <div class="field"><label>Registered mobile number</label><input class="inp" name="phone" inputmode="numeric" required placeholder="10-digit" /></div>
      <div id="findAlert"></div>
      <button class="btn ghost block" type="submit">Find my ID</button>
    </form>`);

  $('#forgotForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = e.target.elements.email.value.trim().toLowerCase();
    const alertBox = $('#forgotAlert');
    if (!isEmail(email)){ alertBox.innerHTML='<div class="alert err">Valid email daalo.</div>'; return; }
    if (mailMode() === 'cloud'){
      const c = await CLOUD.get();
      if (!c){ alertBox.innerHTML='<div class="alert err">Cloud connect nahi hua.</div>'; return; }
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error){ alertBox.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
      pending = { kind:'reset', email };
      return renderLinkSent();
    }
    if (!adminByEmail(email)){ alertBox.innerHTML='<div class="alert err">Is email se koi admin nahi hai.</div>'; return; }
    pending = { kind:'reset', email, code:newCode(), expires:Date.now()+10*60*1000 };
    renderCodeStep();
  });

  $('#findForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const phone = e.target.elements.phone.value.trim().replace(/\D/g,'');
    const alertBox = $('#findAlert');
    const hit = DB.admins().find(a=>String(a.phone||'').replace(/\D/g,'')===phone && phone);
    if (!hit){ alertBox.innerHTML='<div class="alert err">Is number se koi admin nahi mila.</div>'; return; }
    alertBox.innerHTML=`<div class="alert ok">Aapki admin ID: <b>${esc(hit.email)}</b><br><span class="small">Ab password reset kar sakte ho.</span></div>`;
  });
}

function renderNewPassword(){
  $('#authScreen').innerHTML = authCard(`
    <h1>Set a new password</h1>
    <p class="lead">Naya password daalo — iske baad login ho jayega.</p>
    <form id="newPassForm">
      <div class="grid g2">
        <div class="field"><label>New password</label><input class="inp" name="pass" type="password" required minlength="6" /></div>
        <div class="field"><label>Confirm</label><input class="inp" name="pass2" type="password" required minlength="6" /></div>
      </div>
      <div id="npAlert"></div>
      <button class="btn block" type="submit">Save password</button>
    </form>`);
  $('#newPassForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const E = e.target.elements, alertBox = $('#npAlert');
    if (E.pass.value !== E.pass2.value){ alertBox.innerHTML='<div class="alert err">Passwords match nahi kar rahe.</div>'; return; }
    if (E.pass.value.length < 6){ alertBox.innerHTML='<div class="alert err">Kam se kam 6 characters.</div>'; return; }

    if (mailMode() === 'cloud'){
      const c = await CLOUD.get();
      const { error } = await c.auth.updateUser({ password: E.pass.value });
      if (error){ alertBox.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
    } else {
      const admins = DB.admins();
      const idx = admins.findIndex(a=>a.email===pending.email);
      if (idx < 0){ alertBox.innerHTML='<div class="alert err">Admin nahi mila.</div>'; return; }
      const salt = uid();
      admins[idx].salt = salt;
      admins[idx].passHash = await hashPass(E.pass.value, salt);
      DB.setAdmins(admins);
    }
    const email = pending.email; pending = null;
    toast('Password badal gaya — ab login karo');
    renderLogin();
  });
}

/* ============================================================
   APP SHELL
   ============================================================ */
const state = { view:'dashboard', param:null, draft:null };


/* ============================================================
   CLOUD SYNC — public read, admin write (activates with keys)
   ============================================================ */
const PUB_FAM_COLS = 'id,house_name,house_no,street,house_type,notes,docs,custom,created_at';
const ADMIN_FAM_COLS = PUB_FAM_COLS + ',address,phone';
const MEMBER_COLS = ['relation','name','father_name','mother_name','gender','dob','education','education_level','occupation','sector','religious','marital_status','children','disability','schemes','scheme_name','docs'];
const MEMBER_TO_JS = { father_name:'fatherName', mother_name:'motherName', education_level:'educationLevel', marital_status:'maritalStatus', scheme_name:'schemeName' };

const SYNC = {
  on(){ return CLOUD.enabled(); },
  famCols(){ return isAdmin() ? ADMIN_FAM_COLS : PUB_FAM_COLS; },
  async pull(){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const { data, error } = await c.from('families').select(this.famCols() + ',members(' + MEMBER_COLS.join(',') + ')');
      if (error) throw error;
      const fams = (data||[]).map(f=>({
        id:f.id, houseName:f.house_name||'', houseNo:f.house_no||'', street:f.street||'',
        houseType:f.house_type||'moulding', address:f.address||'', phone:f.phone||'',
        notes:f.notes||'', docs:f.docs||{}, custom:f.custom||[], createdAt:f.created_at?Date.parse(f.created_at):Date.now(),
        members:(f.members||[]).map(m=>{
          const o = { id:m.id };
          MEMBER_COLS.forEach(k=>{ o[MEMBER_TO_JS[k]||k] = m[k]; });
          o.docs = m.docs || {}; o.schemes = m.schemes || {};
          return o;
        })
      }));
      if (fams.length) DB.setFamilies(fams);
      const { data: mj } = await c.from('masjid').select('*').limit(1);
      if (mj && mj[0]) DB.setMasjid(mj[0]);
      return true;
    } catch(e){ return false; }
  },
  async saveFamily(f){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const row = {
        id:f.id, house_name:f.houseName||'', house_no:f.houseNo||'', street:f.street||'',
        house_type:f.houseType||'moulding', address:f.address||'', phone:f.phone||'',
        notes:f.notes||'', docs:f.docs||{}, custom:f.custom||[], updated_at:new Date().toISOString()
      };
      const { error } = await c.from('families').upsert(row);
      if (error) throw error;
      await c.from('members').delete().eq('family_id', f.id);
      const rows = (f.members||[]).filter(m=>String(m.name||'').trim()).map(m=>({
        family_id:f.id, relation:m.relation||'', name:m.name||'', father_name:m.fatherName||'', mother_name:m.motherName||'',
        gender:m.gender||'', dob:m.dob||null, education:m.education||'', education_level:m.educationLevel||'',
        occupation:m.occupation||'', sector:m.sector||'', religious:m.religious||'', marital_status:m.maritalStatus||'',
        children:String(m.children||''), disability:m.disability||'no', schemes:m.schemes||{}, scheme_name:m.schemeName||'', docs:m.docs||{}
      }));
      if (rows.length){ const { error: e2 } = await c.from('members').insert(rows); if (e2) throw e2; }
      return true;
    } catch(e){ return false; }
  },
  async delFamily(id){
    const c = await CLOUD.get(); if (!c) return false;
    try { const { error } = await c.from('families').delete().eq('id', id); if (error) throw error; return true; } catch(e){ return false; }
  },
  async saveMasjid(m){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const row = Object.assign({}, m, { id:true, updated_at:new Date().toISOString() });
      const { error } = await c.from('masjid').upsert(row);
      if (error) throw error; return true;
    } catch(e){ return false; }
  }
};

let cloudPulled = false;
function enterApp(){
  const a = $('#authScreen'); if (a) a.classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
  renderShell();
  if (!state.view || state.view==='myfamily') state.view = 'dashboard';
  go(state.view, state.param);
  if (SYNC.on() && !cloudPulled){
    cloudPulled = true;
    SYNC.pull().then(ok=>{ if (ok) go(state.view, state.param); });
  }
}

function openPhoto(src){
  const d = document.createElement('div');
  d.className = 'lb';
  d.innerHTML = `<img src="${esc(src)}" alt="Masjid photo" /><button class="lb-x" type="button" aria-label="Close">×</button>`;
  d.addEventListener('click', ()=>d.remove());
  document.body.appendChild(d);
}

function navItems(){
  if (!isAdmin()) return [ ['dashboard','Dashboard',ICON.dash] ];
  return [ ['dashboard','Dashboard',ICON.dash], ['families','Households',ICON.list],
           ['add','Add Household',ICON.plus], ['masjid','Masjid Profile',ICON.mosque],
           ['users','Admins',ICON.users], ['settings','Settings',ICON.gear] ];
}

function renderShell(){
  const u = currentUser();
  $('#nav').innerHTML = navItems().map(([v,label,ic])=>`<a class="nav-item" data-act="goto" data-view="${v}">${ic}<span>${label}</span></a>`).join('');
  const chip = $('#userChip');
  if (u){
    const initials = (u.name||u.email).split(/[ @.]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
    chip.innerHTML = `<span class="av">${esc(initials)}</span><span><span class="nm">${esc(u.name||u.email)}</span><br><span class="rl">Admin · logout</span></span>`;
    chip.setAttribute('data-act','admin-logout');
    chip.title = 'Click to log out';
  } else {
    chip.innerHTML = `<span class="public-chip">Public view</span><span class="btn ghost sm" data-act="open-auth" style="margin-left:8px">Admin login</span>`;
    chip.removeAttribute('data-act');
    chip.title = 'Read-only public view';
  }
  const foot = document.querySelector('.sb-foot');
  if (foot) foot.innerHTML = u
    ? 'Admin mode · you can add and edit'
    : 'Public view · read only<br><button class="linklike" type="button" data-act="open-auth" style="margin-top:8px">Admin login / create admin</button>';
  $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===state.view || (state.view==='add' && a.dataset.view==='add')));
  closeNav();
}

function go(view, param){
  const ADMIN_ONLY = ['add','users','settings'];
  if (ADMIN_ONLY.includes(view) && !isAdmin()){ toast('Ye page sirf admin ke liye hai','err'); view='dashboard'; }
  state.view = view; state.param = param||null;
  closeNav();
  const titles = { dashboard:'Survey Dashboard', families:'Households', add:(state.param?'Edit Household':'Add Household'), detail:'Household Record', users:'Admins', settings:'Settings', masjid:'Masjid Profile' };
  $('#pageTitle').textContent = titles[view] || 'Survey Dashboard';
  let html='';
  if (view==='dashboard') html = viewDashboard();
  else if (view==='families') html = viewFamilies();
  else if (view==='add') html = viewFamilyForm();
  else if (view==='detail') html = viewFamilyDetail(state.param);
  else if (view==='users') html = viewUsers();
  else if (view==='settings') html = viewSettings();
  else if (view==='masjid') html = viewMasjid();
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
  if (v.includes('palm') || v.includes('leaf') || v.includes('khaprail') || v.includes('thatch')) return 'palm';
  return 'other';
}
function streetName(f){ return (String(f.street||'').trim()) || 'Unassigned'; }

function computeStats(){
  const fams = DB.families();
  const s = {
    houses: fams.length,
    families: fams.length,
    streets: [],
    houseTypes: { moulding:0, cement:0, palm:0, other:0 },
    men:   { total:0, married:0, unmarried:0, disabled:0 },
    women: { total:0, married:0, unmarried:0, disabled:0, widow:0 },
    others: 0,
    children: 0,
    pop: 0,
    students: { total:0, primary:0, higher_secondary:0, college:0, madarsa:0 },
    occupations: [],
    employed: 0,
    occupationNames: 0,
    deeni: { menAalim:0, menHafiz:0, womenAalim:0, womenHafiz:0 },
    docs: Object.fromEntries(BASIC_DOCS.map(([k])=>[k,0])),
    membersWithAllDocs: 0,
    membersWithNoDocs: 0,
    scheme: { applied:0, notApplied:0, byName:[], counts:{} }
  };
  const streetMap = new Map();
  const schemeMap = new Map();
  const occMap = new Map();

  fams.forEach(f=>{
    const name = streetName(f);
    if (!streetMap.has(name)) streetMap.set(name, { name, houses:0, moulding:0, cement:0, palm:0, other:0 });
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

      // occupation (free text) — grouped case-insensitively, first spelling wins
      const occ = occName(m);
      if (occ){
        const key = occ.toLowerCase();
        if (!occMap.has(key)) occMap.set(key, { name:occ, men:0, women:0, total:0 });
        const row = occMap.get(key);
        row.total++;
        if (g==='female') row.women++; else if (g==='male') row.men++;
        if (!/not working|housewife|student|retired/i.test(occ)) s.employed++;
      }

      // basic government documents held by this member
      const md = m.docs || {};
      let have = 0;
      BASIC_DOCS.forEach(([k])=>{ if (md[k]==='yes'){ s.docs[k]++; have++; } });
      if (have === BASIC_DOCS.length) s.membersWithAllDocs++;
      if (have === 0) s.membersWithNoDocs++;

      // government / welfare schemes (multi-select)
      const sch = SCHEMES.filter(([k])=>m.schemes && m.schemes[k]==='yes').map(([k])=>k);
      if (sch.length){
        s.scheme.applied++;
        sch.forEach(k=>{
          s.scheme.counts[k] = (s.scheme.counts[k]||0) + 1;
          if (k==='other'){
            const nm = String(m.schemeName||'').trim() || 'Other scheme';
            schemeMap.set(nm, (schemeMap.get(nm)||0) + 1);
          }
        });
      } else if (m.govtScheme==='yes'){
        s.scheme.applied++;
        const nm = String(m.schemeName||'').trim() || 'Scheme (old record)';
        schemeMap.set(nm, (schemeMap.get(nm)||0) + 1);
      } else s.scheme.notApplied++;

      const dn = (m.religious||'').toLowerCase();
      const isF = g==='female';
      if (dn==='aalim' || dn==='both'){ if (isF) s.deeni.womenAalim++; else s.deeni.menAalim++; }
      if (dn==='hafiz' || dn==='both'){ if (isF) s.deeni.womenHafiz++; else s.deeni.menHafiz++; }
    });
  });

  s.streets = Array.from(streetMap.values()).sort((a,b)=> a.name.localeCompare(b.name));
  s.occupations = Array.from(occMap.values()).sort((a,b)=> b.total-a.total || a.name.localeCompare(b.name));
  s.occupationNames = s.occupations.length;
  s.scheme.byName = Array.from(schemeMap.entries()).sort((a,b)=> b[1]-a[1]);
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

function allMembers(){
  const out=[];
  DB.families().forEach(f=>(f.members||[]).forEach(m=>{ if (String(m.name||'').trim()) out.push({ m, f }); }));
  return out;
}

function groupDetail(no){
  const s = computeStats();
  const wrap = (head, rows) => `<div class="grp-more"><div class="gm-head">${esc(head)} <span class="small">(${rows}${rows===1?' row':' rows'})</span></div>
    <div class="table-wrap">`;
  const th = (...cols)=>`<thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>`;
  const rowsHTML = (cols, arr)=>`${th(...cols)}<tbody>${arr.join('')}</tbody>`;
  const empty = '<div class="grp-more"><div class="gm-empty">Abhi koi record nahi hai.</div></div>';

  if (no === 1){
    const fams = DB.families();
    if (!fams.length) return empty;
    const rows = fams.map(f=>`<tr data-act="detail" data-id="${esc(f.id)}" class="clickable"><td><b>${esc(f.id)}</b></td><td>${esc(f.houseName||'')}</td><td>${esc(f.houseNo||'')}</td><td>${esc(f.street||'')}</td><td>${esc(HOUSE_LABEL[f.houseType]||f.houseType||'')}</td><td>${(f.members||[]).filter(m=>String(m.name||'').trim()).length}</td></tr>`);
    return `<div class="grp-more"><div class="gm-head">Har ghar — street, house no, type, members</div><div class="table-wrap">${rowsHTML(['Family ID','House name','House no','Street','Type','Members'], rows)}</div></div>`;
  }
  if (no === 2){
    const arr = allMembers(); if (!arr.length) return empty;
    const rows = arr.map(({m,f})=>{
      const a = ageFromDob(m.dob);
      return `<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(m.relation||'')}</td><td>${esc(m.gender||'')}</td><td>${a===null?'':a}</td><td>${esc(m.maritalStatus||'')}</td><td>${esc(String(m.children||''))}</td><td>${m.disability==='yes'?'Yes':'—'}</td></tr>`;
    });
    return `<div class="grp-more"><div class="gm-head">Har fard — umar, marital status, bachche, disability</div><div class="table-wrap">${rowsHTML(['Name','Family','Relation','Gender','Age','Marital','Children','Disabled'], rows)}</div></div>`;
  }
  if (no === 3){
    const arr = allMembers().filter(({m})=>{ const a = ageFromDob(m.dob); return (m.educationLevel && m.educationLevel!=='none') || (a!==null && a<26 && m.educationLevel); });
    if (!arr.length) return empty;
    const rows = arr.map(({m,f})=>`<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'')}</td><td>${ageFromDob(m.dob)===null?'':ageFromDob(m.dob)}</td></tr>`);
    return `<div class="grp-more"><div class="gm-head">Padhne wale bachche / students</div><div class="table-wrap">${rowsHTML(['Name','Family','Education','Age'], rows)}</div></div>`;
  }
  if (no === 4){
    const arr = allMembers().filter(({m})=>String(occName(m)||'').trim());
    if (!arr.length) return empty;
    const rows = arr.map(({m,f})=>`<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(m.gender||'')}</td><td>${esc(occName(m))}</td></tr>`);
    return `<div class="grp-more"><div class="gm-head">Kaam karne wale log</div><div class="table-wrap">${rowsHTML(['Name','Family','Gender','Occupation'], rows)}</div></div>`;
  }
  if (no === 5){
    const arr = allMembers().filter(({m})=>m.religious && m.religious!=='none');
    if (!arr.length) return empty;
    const rows = arr.map(({m,f})=>`<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(DEENI_LABEL[m.religious]||'')}</td></tr>`);
    return `<div class="grp-more"><div class="gm-head">Aalim / Hafiz</div><div class="table-wrap">${rowsHTML(['Name','Family','Deeni taleem'], rows)}</div></div>`;
  }
  if (no === 6){
    const arr = allMembers().filter(({m})=>memberSchemes(m).length || DOC_KEYS_HAS(m));
    if (!arr.length) return empty;
    const rows = arr.map(({m,f})=>{
      const docs = BASIC_DOCS.filter(([k])=>m.docs && m.docs[k]==='yes').map(([,l])=>l).join(', ');
      return `<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(memberSchemes(m).join(', ')||'—')}</td><td class="small">${esc(docs||'—')}</td></tr>`;
    });
    return `<div class="grp-more"><div class="gm-head">Scheme aur documents wale members</div><div class="table-wrap">${rowsHTML(['Name','Family','Schemes','Documents'], rows)}</div></div>`;
  }
  return '';
}
function DOC_KEYS_HAS(m){ return BASIC_DOCS.some(([k])=>m.docs && m.docs[k]==='yes'); }

function grpHead(no, title, sub){
  return `<header class="grp-head" data-act="grp-toggle" data-g="${no}" title="Click to open full details"><span class="grp-caret">▾</span><span class="grp-no">${no}</span><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><span class="grp-caret">▾</span></header>`;
}

function viewDashboard(){
  const s = computeStats();
  const u = currentUser();
  const mj = masjidData();
  const photos = Array.isArray(mj.photos) ? mj.photos.slice(0,6) : [];
  const heroBlock = `
    <section class="masjid-hero">
      <div class="mh-grid">
        <div class="mh-photos">
          ${photos.length ? photos.map((p,i)=>`<button class="mh-photo ${i===0?'lead':''}" type="button" data-act="photo" data-src="${esc(p.src||p)}"><img src="${esc(p.src||p)}" alt="Masjid photo ${i+1}" loading="lazy" /></button>`).join('')
            : `<div class="mh-empty"><span class="mh-crescent">☾</span><b>Masjid photos</b><span>Admin login karke Masjid Profile me photos add hongi.</span></div>`}
        </div>
        <div class="mh-text">
          <div class="mh-kicker">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div>
          <h2>${esc(mj.name || CFG.ORG_NAME || 'Masjid e Mohammadi')}</h2>
          <p class="mh-desc">${esc(mj.note || 'Mohalla ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka hisaab ek jagah.')}</p>
          <div class="mh-meta">
            ${mj.established?`<span><b>Qayam</b> ${esc(mj.established)}</span>`:''}
            ${mj.address?`<span><b>Pata</b> ${esc(mj.address)}</span>`:''}
            ${mj.imam?`<span><b>Imam</b> ${esc(mj.imam)}</span>`:''}
            ${mj.area?`<span><b>Raqba</b> ${esc(mj.area)}</span>`:''}
            ${mj.capacity?`<span><b>Capacity</b> ${esc(mj.capacity)}</span>`:''}
          </div>
          ${isAdmin()?`<button class="btn ghost sm" type="button" data-act="goto" data-view="masjid">Masjid profile edit karo</button>`
                    :`<button class="btn sm" type="button" data-act="open-auth">Admin login</button>`}
        </div>
      </div>
    </section>`;
  const kpis = [
    [icSmall('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'), s.streets.length, 'Total streets'],
    [icSmall('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), s.houses, 'Total houses'],
    [icSmall('<circle cx="12" cy="7" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>'), s.families, 'Total families'],
    [icSmall('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 21v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M17 5.5a3.4 3.4 0 0 1 0 6"/><path d="M18.5 21v-1a6 6 0 0 0-2-4.5"/>'), s.pop, 'Total population']
  ];

  const streetRows = s.streets.length ? `
    <div class="table-wrap street-table" style="margin-top:14px"><table><thead><tr><th>Street name</th><th>Houses</th><th>Moulding</th><th>Cement sheet</th><th>Palm leaf</th><th>Other</th></tr></thead><tbody>
      ${s.streets.map(st=>`<tr data-act="goto" data-view="families" data-street="${esc(st.name)}" class="clickable">
        <td><b>${esc(st.name)}</b></td><td>${st.houses}</td><td>${st.moulding}</td><td>${st.cement}</td><td>${st.palm}</td><td>${st.other}</td></tr>`).join('')}
      <tr class="totals"><td>Total</td><td>${s.houses}</td><td>${s.houseTypes.moulding}</td><td>${s.houseTypes.cement}</td><td>${s.houseTypes.palm}</td><td>${s.houseTypes.other}</td></tr>
    </tbody></table></div>` : `<p class="muted small" style="margin-top:12px">No streets yet — street names appear here as households are added.</p>`;

  const empty = s.houses ? '' : `<div class="empty" style="margin-top:18px"><div class="big">🕌</div><h3>No households surveyed yet</h3><p>Add the first household, ya sample data load karke dashboard dekh lo.</p>
     <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
     ${isAdmin() ? '<button class="btn" data-act="goto" data-view="add">Add first household</button>' : ''}
     <button class="btn ghost" data-act="load-sample">Load sample data</button></div></div>`;

  return `${heroBlock}

    <div class="page-head"><div><h1>Survey Dashboard</h1><p>Mohalla ke ghar, raste aur logon ka poora hisaab — live totals.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdmin()
          ? `<button class="btn ghost sm" data-act="export-excel">⭳ Excel</button>
             <button class="btn ghost sm" data-act="print-all">⎙ PDF / Print</button>`
          : `<span class="badge gray">Public view · read only</span>`}
      </div></div>

    <div class="kpi-row">${kpis.map(k=>`<div class="stat"><div class="ic">${k[0]}</div><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('')}</div>
    ${empty}

    <div class="grp-grid">
      <section class="grp wide" data-g="1" data-act="grp-toggle">
        ${grpHead(1,'Location & Housing','Ghar aur raste ki details')}
        <div class="metrics cols2">
          ${metric('Total streets', s.streets.length)}
          ${metric('Total houses', s.houses)}
          ${metric('Moulding (house type)', s.houseTypes.moulding)}
          ${metric('Cement sheet (house type)', s.houseTypes.cement)}
          ${metric('Palm leaf (house type)', s.houseTypes.palm)}
          ${metric('Other / kachcha (house type)', s.houseTypes.other)}
        </div>
        ${streetRows}
      </section>

      <section class="grp wide" data-g="2" data-act="grp-toggle">
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

      <section class="grp" data-g="3" data-act="grp-toggle">
        ${grpHead(3,'Education','Total child / students')}
        <div class="metrics">
          ${metric('Total students', s.students.total, {hi:true})}
          ${metric('Primary students', s.students.primary)}
          ${metric('Higher secondary students', s.students.higher_secondary)}
          ${metric('College students', s.students.college)}
          ${metric('Madarsa students', s.students.madarsa)}
        </div>
      </section>

      <section class="grp wide" data-g="4" data-act="grp-toggle">
        ${grpHead(4,'Occupations','Kaam ke hisaab se ginti — plumber, electrician, painter, helper…')}
        <div class="metrics cols2">
          ${metric('Members with a job', s.employed, {hi:true})}
          ${metric('Different occupations', s.occupationNames)}
        </div>
        ${s.occupations.length ? `<div class="table-wrap small-table" style="margin-top:14px"><table>
          <thead><tr><th>Occupation</th><th>Men</th><th>Women</th><th>Total</th></tr></thead><tbody>
          ${s.occupations.map(o=>`<tr><td><b>${esc(o.name)}</b></td><td>${o.men}</td><td>${o.women}</td><td><b>${o.total}</b></td></tr>`).join('')}
          </tbody></table></div>` : `<p class="muted small" style="margin-top:12px">Abhi kisi ka occupation nahi bhara — member form me "Kaam / occupation" likho (jaise Plumber).</p>`}
      </section>

      <section class="grp wide" data-g="5" data-act="grp-toggle">
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

      <section class="grp wide" data-g="6" data-act="grp-toggle">
        ${grpHead(6,'Documents & Govt. Schemes','Kitne logon ke paas documents hain · kitne ne scheme li')}
        <div class="metrics cols2">
          ${metric('Members with all basic documents', s.membersWithAllDocs)}
          ${metric('Members with no basic document', s.membersWithNoDocs)}
          ${metric('Scheme applied', s.scheme.applied)}
          ${metric('Scheme not applied', s.scheme.notApplied)}
        </div>
        <div class="table-wrap small-table" style="margin-top:14px"><table>
          <thead><tr><th>Document</th><th>Have</th><th>Don't have</th></tr></thead><tbody>
          ${BASIC_DOCS.map(([k,l])=>`<tr><td>${esc(l)}</td><td><b>${s.docs[k]}</b></td><td>${Math.max(0, s.pop - s.docs[k])}</td></tr>`).join('')}
          </tbody></table></div>
        <div class="sec-title" style="margin:16px 0 4px;font-size:.88rem">Scheme-wise count</div>
        <div class="table-wrap small-table"><table>
          <thead><tr><th>Scheme</th><th>Members</th></tr></thead><tbody>
          ${SCHEMES.filter(([k])=>k!=='other').map(([k,l])=>`<tr><td>${esc(l)}</td><td><b>${s.scheme.counts[k]||0}</b></td></tr>`).join('')}
          ${s.scheme.byName.map(([nm,n])=>`<tr><td>${esc(nm)}</td><td><b>${n}</b></td></tr>`).join('')}
          </tbody></table></div>
        ${!s.scheme.applied ? '<p class="muted small" style="margin-top:10px">Abhi koi scheme mark nahi hui — member form me scheme chips tap karo.</p>' : ''}
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">${isAdmin()?`<button class="btn ghost sm" data-act="export-excel">⭳ Excel</button><button class="btn ghost sm" data-act="print-all">⎙ PDF</button><button class="btn sm" data-act="goto" data-view="add">+ Add Household</button>`:''}</div></div>
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
      ${isAdmin()?`<button class="btn" data-act="goto" data-view="add">+ Add Household</button>`:''}
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
        ${isAdmin()?`<button class="btn ghost sm" data-act="edit-family" data-id="${esc(f.id)}">Edit</button>
        <button class="btn ghost sm" data-act="del-family" data-id="${esc(f.id)}" style="color:var(--danger)">Del</button>`:''}
      </td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================================================
   HOUSEHOLD FORM
   ============================================================ */
function blankMember(){ return { relation:'', name:'', fatherName:'', motherName:'', gender:'Male', dob:'', educationLevel:'', occupation:'', religious:'', maritalStatus:'Unmarried', children:'', disability:'no', schemes:{}, schemeName:'', docs:{} }; }

/* occupation with legacy fallback (old records only had private/govt/business) */
function occName(m){
  const o = String(m.occupation||'').trim();
  if (o) return o;
  const sec = String(m.sector||'').toLowerCase();
  return SECTOR_LABEL[sec] || '';
}
/* schemes = new multi-select, or the old single govtScheme flag */
function memberSchemes(m){
  const list = SCHEMES.filter(([k])=>m.schemes && m.schemes[k]==='yes').map(([,l])=>l);
  if (!list.length && m.govtScheme==='yes') list.push(String(m.schemeName||'').trim() || 'Scheme');
  return list;
}
function blankDraft(){
  return { id:null, customId:'', houseName:'', houseNo:'', street:'', houseType:'moulding', address:'', phone:'', notes:'',
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
      <datalist id="occList">${OCCUPATIONS.map(o=>`<option value="${esc(o)}"></option>`).join('')}</datalist>
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
        <div class="field" style="margin-top:12px">
          <label>Family ID ${editing?'':'<span class="hint" style="font-weight:400">— optional, khali chhodo to auto banega</span>'}</label>
          ${editing
            ? `<input class="inp" value="${esc(d.id)}" readonly />`
            : `<input class="inp" data-field="customId" value="${esc(d.customId||'')}" placeholder="Auto: ${esc(previewFamilyId())}" />
               <span class="hint">Apna ID likhna ho to likho (jaise MEMC-2026-000101), warna system khud de dega. QR isi ID ka banega.</span>`}
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
        <div class="field"><label>Kaam / occupation</label>
          <input class="inp" data-field="m.occupation" data-idx="${i}" list="occList" value="${esc(occName(m))}" placeholder="Plumber, Electrician, Painter, Helper…" /></div>
        <div class="field"><label>Deeni taleem</label><select class="inp" data-field="m.religious" data-idx="${i}">
          ${DEENI.map(([k,l])=>`<option value="${k}" ${(m.religious||'')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Father name</label><input class="inp" data-field="m.fatherName" data-idx="${i}" value="${esc(m.fatherName)}" /></div>
        <div class="field"><label>Mother name</label><input class="inp" data-field="m.motherName" data-idx="${i}" value="${esc(m.motherName)}" /></div>
        <div class="field" style="grid-column:1/-1"><label>Basic government documents</label>
          <div class="doc-pills" data-mdocs data-idx="${i}">
            ${BASIC_DOCS.map(([k,l])=>`<button type="button" data-doc-key="${k}" class="${m.docs&&m.docs[k]==='yes'?'on':''}">${esc(l)}</button>`).join('')}
          </div>
          <span class="hint">Tap karke on/off karo — jo document jiske paas hai.</span>
        </div>
        <div class="field"><label>Physically challenged</label><div class="field-yn">${segYN('m.disability', i, m.disability)}</div></div>
        <div class="field" style="grid-column:1/-1"><label>Government / welfare schemes</label>
          <div class="doc-pills" data-mschemes data-idx="${i}">
            ${SCHEMES.map(([k,l])=>`<button type="button" data-scheme-key="${k}" class="${m.schemes&&m.schemes[k]==='yes'?'on':''}">${esc(l)}</button>`).join('')}
          </div>
          <span class="hint">Jitni scheme milti hai utni tap karo. "Other scheme" chuna to niche naam likho.</span>
        </div>
        <div class="field"><label>"Other scheme" ka naam</label><input class="inp" data-field="m.schemeName" data-idx="${i}" value="${esc(m.schemeName||'')}" placeholder="e.g. CM relief fund" /></div>
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
  const canEdit = isAdmin();
  const docsYes = DOC_TYPES.filter(([k])=>f.docs && f.docs[k]==='yes').map(([,l])=>l);
  const customYes = (f.custom||[]).filter(c=>c.label && c.value==='yes').map(c=>c.label);
  const members = f.members||[];
  const men = members.filter(m=>m.gender==='Male').length;
  const women = members.filter(m=>m.gender==='Female').length;
  return `
    <div class="page-head"><div><h1>${esc(f.houseName||'Household')}</h1><p>${esc(streetName(f))}${f.houseNo?' · House '+esc(f.houseNo):''} · ${members.length} member(s)${canEdit?'':' · public view (phone hidden)'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canEdit?`<button class="btn ghost sm" data-act="print-family" data-id="${esc(f.id)}">⎙ PDF</button>`:''}
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
          <div class="row"><span>Phone</span><span>${canEdit?esc(f.phone||'—'):esc(maskPhone(f.phone))}</span></div>
          <div class="row"><span>Address</span><span>${esc(f.address||'—')}</span></div>
          <div class="row"><span>Members</span><span>${members.length} · ${men} men · ${women} women</span></div>
        </div>
      </div>
    </div>

    <div class="sec-title">Members</div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Occupation</th><th>Deeni</th><th>Marital</th><th>Docs</th><th>Schemes</th><th>Challenged</th></tr></thead><tbody>
      ${members.map((m,i)=>{ const a=ageFromDob(m.dob); const md=m.docs||{}; const dc=BASIC_DOCS.filter(([k])=>md[k]==='yes').length; return `<tr>
        <td>${i+1}</td><td>${esc(m.name||'—')}</td><td>${esc(m.relation||'—')}</td><td>${esc(m.gender||'—')}</td>
        <td>${a===null?'—':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'—')}</td><td>${esc(occName(m)||'—')}</td>
        <td>${esc(DEENI_LABEL[m.religious]||'—')}</td><td>${esc(m.maritalStatus||'—')}</td>
        <td><span class="badge ${dc===BASIC_DOCS.length?'':'gray'}">${dc}/${BASIC_DOCS.length}</span></td>
        <td>${memberSchemes(m).length ? esc(memberSchemes(m).join(', ')) : '<span class="muted">—</span>'}</td>
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
  if (!isAdmin()) return `<div class="empty"><h3>Admins only</h3><p>Ye page sirf admin ke liye hai.</p></div>`;
  const me = currentUser();
  const admins = DB.admins();
  return `
    <div class="page-head"><div><h1>Admins</h1><p>Committee admin accounts — sab ke paas poora add/edit access hota hai.</p></div></div>

    <div class="card">
      <div class="sec-title" style="margin-top:0">Invite code for new admins</div>
      <div class="kv"><div class="row"><span>Invite code</span><span class="mono">${esc(CFG.ADMIN_INVITE_CODE||'—')}</span></div></div>
      <p class="muted small" style="margin-top:8px">Naya admin <b>Register</b> page par ye code daal ke apna account bana sakta hai. Code badalna ho to <span class="mono">config.js</span> → <span class="mono">ADMIN_INVITE_CODE</span>.</p>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Add admin directly</div>
      <form id="addAdminForm" class="grid g3">
        <div class="field"><label>Name</label><input class="inp" name="name" required /></div>
        <div class="field"><label>Email ID</label><input class="inp" name="email" type="email" required /></div>
        <div class="field"><label>Mobile</label><input class="inp" name="phone" inputmode="numeric" /></div>
        <div class="field"><label>Password</label><input class="inp" name="pass" type="password" required minlength="6" /></div>
        <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">Add admin</button></div>
      </form>
    </div>

    <div class="sec-title">All admins</div>
    <div class="table-wrap"><table><thead><tr><th>Email (login ID)</th><th>Name</th><th>Mobile</th><th>Added</th><th></th></tr></thead><tbody>
      ${admins.map(a=>`<tr>
        <td><span class="mono">${esc(a.email)}</span></td><td>${esc(a.name||'—')}</td><td>${esc(a.phone||'—')}</td>
        <td>${fmtDate(a.createdAt ? new Date(a.createdAt).toISOString() : '')}</td>
        <td>${String(a.email).toLowerCase()===String(me.email).toLowerCase()
          ? '<span class="badge">You</span>'
          : `<button class="btn ghost sm" data-act="del-admin" data-id="${esc(a.email)}" style="color:var(--danger)">Remove</button>`}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================================================
   SETTINGS
   ============================================================ */
/* ============================== MASJID PROFILE ============================== */
const MASJID_FIELDS = [
  ['name','Masjid ka naam','e.g. Masjid e Mohammadi'],
  ['established','Qayam saal','e.g. 1985'],
  ['address','Pura pata','Mohalla, shehar, pincode'],
  ['phone','Rabta number','10-digit mobile'],
  ['imam','Imam sahab ka naam',''],
  ['muazzin','Muazzin ka naam',''],
  ['area','Raqba (sq ft / gaj)',''],
  ['capacity','Namazi capacity',''],
  ['rooms','Kamre / halls',''],
  ['madrasa','Madrasa / maktab','e.g. 60 bachche, 3 ustad'],
  ['waqf','Waqf / registration no.',''],
  ['bank','Bank / account detail',''],
];

function masjidData(){
  const m = DB.masjid() || {};
  return Object.assign({ photos: [] }, m);
}

function viewMasjid(){
  const u = currentUser();
  const canEdit = isAdmin();
  const m = masjidData();
  return `
  <div class="page-head"><div><h1>Masjid Profile</h1><p>Masjid ki tafseel, imam/muazzin, tasveerein — report ke saath print hoti hain.</p></div></div>
  <div class="card">
    <div class="card-h"><div><h3>Masjid Profile</h3><div class="hint">Masjid ki poori tafseel aur tasveerein — survey report ke saath chhapti hain.</div></div>
      ${canEdit?'<span class="badge">Editable</span>':'<span class="badge gray">View only</span>'}</div>
    <div class="grid g2" style="margin-top:12px">
      ${MASJID_FIELDS.map(([k,l,ph])=>`<div class="field"><label>${esc(l)}</label>
        <input class="inp" data-mj="${k}" value="${esc(m[k]||'')}" placeholder="${esc(ph||'')}" ${canEdit?'':'readonly'} /></div>`).join('')}
    </div>
    <div class="field" style="margin-top:12px"><label>Note / khaas baat</label>
      <textarea class="inp" rows="2" data-mj="note" ${canEdit?'':'readonly'} placeholder="Tareekh, khidmat, koi khaas baat">${esc(m.note||'')}</textarea></div>
    ${canEdit?'<div style="margin-top:14px"><button class="btn primary" data-act="saveMasjid">Save masjid details</button></div>':''}
  </div>

  <div class="card">
    <div class="card-h"><div><h3>Masjid ki tasveerein</h3><div class="hint">${m.photos.length}/6 photo · har photo phone me hi save hoti hai</div></div>
      ${canEdit?'<span class="badge">Max 6</span>':''}</div>
    <div class="photo-grid" style="margin-top:12px">
      ${m.photos.length ? m.photos.map((src,i)=>`<div class="photo"><img src="${esc(src)}" alt="Masjid photo ${i+1}" />
        ${canEdit?`<button class="photo-x" data-act="delPhoto" data-i="${i}" title="Remove">×</button>`:''}</div>`).join('')
        : '<div class="photo empty">Abhi koi photo nahi</div>'}
      ${canEdit && m.photos.length<6 ? `<label class="photo add">
        <input type="file" accept="image/*" data-act="masjidPhoto" hidden />
        <span>+ Photo</span><span class="hint">Gallery se chuno</span></label>`:''}
    </div>
    ${canEdit?'<div class="hint" style="margin-top:10px">Photo apne aap chhoti (compress) ho jati hai, isliye data bhi kam jagah leta hai.</div>':''}
  </div>`;
}

async function compressImage(file, maxSide = 1100, quality = 0.72){
  const dataUrl = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
  const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=dataUrl; });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
  return c.toDataURL('image/jpeg', quality);
}

function viewSettings(){
  const u = currentUser();
  const cloudOn = CLOUD.enabled();
  return `
    <div class="page-head"><div><h1>Settings</h1><p>Appearance, data, cloud aur account.</p></div></div>

    <div class="card">
      <div class="sec-title" style="margin-top:0">Appearance</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <button class="toggle" data-act="toggle-theme" id="themeBtn2">☀ Day / ☾ Night</button>
        <span class="muted small">Emerald Lattice theme · day &amp; night.</span>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Data &amp; backup</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export-excel">⭳ Export Excel (.xlsx)</button>
        <button class="btn ghost sm" data-act="print-all">⎙ Export PDF / Print</button>
        <button class="btn ghost sm" data-act="backup-json">⭳ Backup (JSON)</button>
        <button class="btn ghost sm" data-act="load-sample">Load sample data</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Cloud sync &amp; email (Supabase)</div>
      <p class="muted small">Status: <b style="color:${cloudOn?'var(--ok)':'var(--warn)'}">${cloudOn?'Connected':'Not connected — data is on this device only'}</b></p>
      <div class="kv" style="margin-top:10px">
        <div class="row"><span>Public website</span><span>${cloudOn?'Live for everyone':'Only this device'}</span></div>
        <div class="row"><span>Email codes</span><span>${cloudOn?'Real email':'On-screen (demo)'}</span></div>
      </div>
      ${cloudOn ? '' : `<p class="muted small" style="margin-top:10px">Public dashboard aur asli email code ke liye Supabase free project chahiye: <span class="mono">supabase.com</span> → naya project → Settings → API se <b>Project URL</b> + <b>anon key</b>, aur <span class="mono">supabase/schema.sql</span> run karo. Phir dono values <span class="mono">config.js</span> me daalo.</p>`}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="sec-title" style="margin-top:0">Account</div>
      <div class="kv"><div class="row"><span>Name</span><span>${esc(u.name||'—')}</span></div>
        <div class="row"><span>Login ID (email)</span><span class="mono">${esc(u.email)}</span></div>
        <div class="row"><span>Role</span><span>Admin — full edit</span></div></div>
      <button class="btn danger sm" data-act="admin-logout" style="margin-top:16px">Log out</button>
    </div>

    <div class="card" style="margin-top:16px;border-color:var(--danger-brd)">
      <div class="sec-title" style="margin-top:0;color:var(--danger)">Danger zone</div>
      <p class="muted small" style="margin-bottom:12px">Deletes all household records on this device. Admin accounts are kept.</p>
      <button class="btn danger sm" data-act="clear-data">Erase all household records</button>
    </div>`;
}

/* ============================================================
   ACTIONS (event delegation)
   ============================================================ */
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-act]'); if(!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const ADMIN_ACTS = ['load-sample','clear-data','export-excel','print-all','backup-json','edit-family','del-family','del-admin','saveMasjid','delPhoto','print-family'];
  if (ADMIN_ACTS.includes(act) && !isAdmin()){ toast('Ye sirf admin kar sakta hai','err'); return; }

  if (act==='toggle-theme') { toggleTheme(); const b=$('#themeBtn2'); if(b) b.textContent = document.documentElement.getAttribute('data-theme')==='night'?'☾ Night':'☀ Day'; return; }
  if (act==='goto'){ if (el.dataset.view==='add'){ state.draft=blankDraft(); go(el.dataset.view); } else go(el.dataset.view, el.dataset.street||null); return; }
  if (act==='auth-check'){ cloudLinkCheck(); return; }
  if (act==='magic-login'){
    const f = $('#loginForm');
    const email = f ? String(f.elements.email.value||'').trim().toLowerCase() : '';
    const box = $('#loginAlert');
    if (!isEmail(email)){ if (box) box.innerHTML='<div class="alert err">Pehle upar apna email daalo, phir ye button dabao.</div>'; return; }
    if (mailMode() !== 'cloud'){ if (box) box.innerHTML='<div class="alert err">Email login ke liye cloud on hona chahiye.</div>'; return; }
    (async ()=>{
      const c = await CLOUD.get();
      if (!c){ if (box) box.innerHTML='<div class="alert err">Cloud connect nahi hua — internet check karo.</div>'; return; }
      const { error } = await c.auth.signInWithOtp({ email, options:{ shouldCreateUser:false, emailRedirectTo: location.origin + location.pathname } });
      if (error){ if (box) box.innerHTML='<div class="alert err">'+esc(error.message)+'</div>'; return; }
      pending = { kind:'login', email };
      renderLinkSent();
    })();
    return;
  }
  if (act==='grp-toggle'){
    const sec = el.closest('.grp'); if (!sec) return;
    if (!sec.dataset.filled){ sec.insertAdjacentHTML('beforeend', groupDetail(Number(sec.dataset.g)||0)); sec.dataset.filled='1'; }
    sec.classList.toggle('open');
    if (sec.classList.contains('open')) sec.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (act==='photo'){ const src = el.dataset.src; if (src) openPhoto(src); return; }
  if (act==='open-auth'){ openAuth('login'); return; }
  if (act==='close-auth'){ closeAuth(); return; }
  if (act==='auth-tab'){ pending=null; renderAuth(el.dataset.tab||'login'); return; }
  if (act==='auth-cancel'){ pending=null; renderAuth('login'); return; }
  if (act==='admin-logout'){ clearSession(); state.draft=null; toast('Log out ho gaya'); renderShell(); go('dashboard'); return; }
  if (act==='logout'){ clearSession(); state.draft=null; renderShell(); go('dashboard'); return; }
  if (act==='del-admin'){
    const me = currentUser();
    if (String(id).toLowerCase()===String(me.email).toLowerCase()){ toast('Apna account nahi hata sakte','err'); return; }
    if (DB.admins().length <= 1){ toast('Kam se kam ek admin rehna chahiye','err'); return; }
    if (!confirm('Ye admin account hata dein?')) return;
    DB.setAdmins(DB.admins().filter(a=>a.email!==id));
    toast('Admin hata diya'); go('users'); return;
  }
  if (act==='load-sample'){ loadSample(); enterApp(); go('dashboard'); toast('Sample data loaded'); return; }
  if (act==='clear-data'){ if(confirm('Erase ALL household records on this device? This cannot be undone.')){ DB.setFamilies([]); DB.setSeq(0); toast('All household records erased'); go('dashboard'); } return; }
  if (act==='export-excel'){ exportExcel(); return; }
  if (act==='print-all'){ printFamilies(DB.families(), 'All Households'); return; }
  if (act==='print-family'){ const f=DB.families().find(x=>x.id===id); if(f) printFamilies([f], f.houseName||f.id); return; }
  if (act==='backup-json'){ backupJSON(); return; }
  if (act==='view-family'){ go('detail', id); return; }
  if (act==='edit-family'){ const f=DB.families().find(x=>x.id===id); if(f){ state.draft = JSON.parse(JSON.stringify(f)); state.draft.docs = Object.assign(Object.fromEntries(DOC_TYPES.map(d=>[d[0],'no'])), state.draft.docs||{}); state.draft.custom = padCustom(state.draft.custom); if(!state.draft.houseType) state.draft.houseType='moulding'; go('add', id); } return; }
  if (act==='del-family'){ if(confirm('Delete this household record permanently?')){
    DB.setFamilies(DB.families().filter(f=>f.id!==id));
    if (SYNC.on() && isAdmin()) SYNC.delFamily(id);
    toast('Household deleted'); go('families'); } return; }
  if (act==='saveMasjid'){
    const m = masjidData();
    document.querySelectorAll('[data-mj]').forEach(el=>{ m[el.dataset.mj] = el.value.trim(); });
    m.updatedAt = Date.now(); m.updatedBy = currentUser().id;
    if (SYNC.on() && isAdmin()) SYNC.saveMasjid(m);
    try { DB.setMasjid(m); } catch(err){ toast('Save nahi hua — storage bhar gaya. Kuch photos hata ke dobara koshish karo.','err'); return; }
    toast('Masjid details save ho gayi'); go(state.view, state.param); return;
  }
  if (act==='delPhoto'){
    const m = masjidData();
    m.photos.splice(+el.dataset.i,1);
    DB.setMasjid(m); toast('Photo hata di'); go(state.view, state.param); return;
  }
  if (act==='add-member'){ state.draft.members.push(blankMember()); renderMembers(); return; }
  if (act==='remove-member'){ state.draft.members.splice(+el.dataset.idx,1); renderMembers(); return; }
});

// masjid photo upload
document.addEventListener('change', async (e)=>{
  const inp = e.target.closest('[data-act="masjidPhoto"]'); if(!inp || !inp.files || !inp.files[0]) return;
  const m = masjidData();
  try{
    const src = await compressImage(inp.files[0]);
    m.photos = (m.photos||[]).concat([src]).slice(0,6);
    DB.setMasjid(m); toast('Photo add ho gayi'); go(state.view, state.param);
  }catch(err){ toast('Photo add nahi hui — dusri image try karo'); }
});

// per-member document pills (tap to toggle)
document.addEventListener('click', (e)=>{
  const pill = e.target.closest('[data-doc-key]'); if(!pill || !state.draft) return;
  const wrap = pill.closest('[data-mdocs]'); if(!wrap) return;
  const i = +wrap.dataset.idx, key = pill.dataset.docKey;
  const m = state.draft.members[i]; if(!m) return;
  m.docs = m.docs || {};
  m.docs[key] = m.docs[key]==='yes' ? 'no' : 'yes';
  pill.classList.toggle('on', m.docs[key]==='yes');
});

// per-member scheme pills (tap to toggle)
document.addEventListener('click', (e)=>{
  const pill = e.target.closest('[data-scheme-key]'); if(!pill || !state.draft) return;
  const wrap = pill.closest('[data-mschemes]'); if(!wrap) return;
  const i = +wrap.dataset.idx, key = pill.dataset.schemeKey;
  const m = state.draft.members[i]; if(!m) return;
  m.schemes = m.schemes || {};
  m.schemes[key] = m.schemes[key]==='yes' ? 'no' : 'yes';
  pill.classList.toggle('on', m.schemes[key]==='yes');
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
  if (view==='detail'){ const f=DB.families().find(x=>x.id===state.param); const box=$('#qrBox'); if(f&&box) renderQR(box, f.id + ' | ' + (f.houseName||'')); }
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
    const custom = String(d.customId||'').trim().toUpperCase();
    if (custom){
      if (!/^[A-Z0-9\-_/]{3,32}$/.test(custom)) return fail('Family ID me sirf letters, numbers, - _ / chalega (3-32 characters).');
      if (fams.some(f=>f.id.toUpperCase()===custom)) return fail('Ye Family ID pehle se kisi ghar ke paas hai — koi aur do.');
      d.id = custom;
    } else {
      d.id = nextFamilyId();
    }
    d.createdAt = Date.now();
    d.createdBy = u.id;
    fams.push(d);
  }
  DB.setFamilies(fams);
  const wasNew = !state.param;
  state.draft = null;
  if (SYNC.on() && isAdmin()){
    SYNC.saveFamily(d).then(ok=>{ if (!ok) toast('Cloud me save nahi hua — baad me retry karega','err'); });
  }
  toast(wasNew ? 'Household saved — ID generated' : 'Changes saved');
  go('detail', d.id);
}
function previewFamilyId(){ return PREFIX+'-'+new Date().getFullYear()+'-'+pad(DB.seq()+1,6); }
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
  const E = form.elements;
  const name = E.name.value.trim(), email = E.email.value.trim().toLowerCase();
  const phone = E.phone.value.trim(), pass = E.pass.value;
  if (!isEmail(email)){ toast('Valid email ID daalo','err'); return; }
  if (adminByEmail(email)){ toast('Ye email pehle se admin hai','err'); return; }
  if (pass.length < 6){ toast('Password kam se kam 6 characters','err'); return; }

  if (CLOUD.enabled()){
    const c = await CLOUD.get();
    if (!c){ toast('Cloud connect nahi hua','err'); return; }
    const { error } = await c.auth.signUp({ email, password: pass, options:{ data:{ name, phone } } });
    if (error){ toast(error.message,'err'); return; }
  } else {
    const salt = uid();
    const admins = DB.admins();
    admins.push({ email, name:name||email, phone, salt, passHash: await hashPass(pass, salt), createdAt:Date.now(), verified:true });
    DB.setAdmins(admins);
  }
  toast('Admin add ho gaya'); go('users');
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
      'Education Level':EDU_LABEL[edu]||m.education||'', 'Occupation':occName(m), 'Deeni Taleem':DEENI_LABEL[m.religious]||'',
      'Marital Status':m.maritalStatus||'', 'Children':m.children||'', 'Father Name':m.fatherName||'', 'Mother Name':m.motherName||'',
      'Physically Challenged':m.disability||'', 'Schemes':memberSchemes(m).join(', '),
      ...Object.fromEntries(SCHEMES.map(([k,l])=>['Scheme: '+l, (m.schemes&&m.schemes[k]==='yes')?'Yes':'No'])),
      ...Object.fromEntries(BASIC_DOCS.map(([k,l])=>['Doc: '+l, (m.docs&&m.docs[k]==='yes')?'Yes':'No'])),
      'Docs Count':BASIC_DOCS.filter(([k])=>m.docs&&m.docs[k]==='yes').length+'/'+BASIC_DOCS.length
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
    ['1 · Location & Housing','Palm leaf houses', s.houseTypes.palm],
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
    ['4 · Occupations','Members with a job', s.employed],
    ['4 · Occupations','Different occupations', s.occupationNames],
    ...s.occupations.map(o=>['4 · Occupations', o.name, o.total]),
    ['5 · Religious Education','Men Aalim', s.deeni.menAalim],
    ['5 · Religious Education','Men Hafiz', s.deeni.menHafiz],
    ['5 · Religious Education','Women Aalim', s.deeni.womenAalim],
    ['5 · Religious Education','Women Hafiz', s.deeni.womenHafiz],
    ['6 · Documents & Schemes','Members with all basic documents', s.membersWithAllDocs],
    ['6 · Documents & Schemes','Members with no basic document', s.membersWithNoDocs],
    ['6 · Documents & Schemes','Scheme applied', s.scheme.applied],
    ['6 · Documents & Schemes','Scheme not applied', s.scheme.notApplied],
    ...BASIC_DOCS.map(([k,l])=>['6 · Documents & Schemes','Have '+l, s.docs[k]]),
    ...SCHEMES.filter(([k])=>k!=='other').map(([k,l])=>['6 · Documents & Schemes','Scheme: '+l, s.scheme.counts[k]||0]),
    ...s.scheme.byName.map(([nm,n])=>['6 · Documents & Schemes','Scheme: '+nm, n])
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
    'Street':st.name,'Houses':st.houses,'Moulding':st.moulding,'Cement sheet':st.cement,'Palm leaf':st.palm,'Other':st.other
  }))), 'Streets');
  const mj = masjidData();
  const mjRows = MASJID_FIELDS.map(([k,l])=>({ Detail:l, Value:mj[k]||'' })).concat([{Detail:'Note',Value:mj.note||''},{Detail:'Photos',Value:(mj.photos||[]).length}]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mjRows), 'Masjid');
  XLSX.writeFile(wb, 'masjid-survey-'+todayStr()+'.xlsx');
  toast('Excel file downloaded');
}
function backupJSON(){
  const data = { org:CFG.ORG_NAME, exportedAt:new Date().toISOString(), families:DB.families(), masjid:DB.masjid(), admins:DB.admins().map(a=>({email:a.email,name:a.name,phone:a.phone,createdAt:a.createdAt})) };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='masjid-survey-backup-'+todayStr()+'.json'; a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}
function mjHead(){
  const m = masjidData();
  if (!m.name && !m.address && !m.imam && !(m.photos||[]).length) return '';
  return `<div class="pmasjid">
    <b>Masjid:</b> ${esc(m.name||CFG.ORG_NAME||'—')}${m.established?` · est. ${esc(m.established)}`:''}${m.imam?` · Imam: ${esc(m.imam)}`:''}${m.address?`<br>${esc(m.address)}`:''}${m.phone?` · ${esc(m.phone)}`:''}
    ${(m.photos||[]).length?`<div class="pphotos">${m.photos.map(src=>`<img src="${esc(src)}" />`).join('')}</div>`:''}
  </div>`;
}
function printFamilies(fams, title){
  if (!fams.length){ toast('Nothing to print','err'); return; }
  const s = computeStats();
  const head = `<h1>${esc(CFG.ORG_NAME||'Masjid e Mohammadi')} — ${esc(title)}</h1>
    <div class="pmeta">${esc(CFG.ORG_SUB||'Khidmath Committee')} · printed ${new Date().toLocaleDateString('en-GB')}</div>
    ${title==='All Households'?`
    <div class="psum">
      <b>1 · Location &amp; Housing</b> — streets ${s.streets.length} · houses ${s.houses} · moulding ${s.houseTypes.moulding} · cement sheet ${s.houseTypes.cement} · palm leaf ${s.houseTypes.palm}<br>
      <b>2 · Family &amp; Demographics</b> — families ${s.families} · population ${s.pop} · children ${s.children} · men ${s.men.total} (married ${s.men.married}, unmarried ${s.men.unmarried}, challenged ${s.men.disabled}) · women ${s.women.total} (married ${s.women.married}, unmarried ${s.women.unmarried}, challenged ${s.women.disabled}, widow ${s.women.widow})<br>
      <b>3 · Education</b> — students ${s.students.total} · primary ${s.students.primary} · higher secondary ${s.students.higher_secondary} · college ${s.students.college} · madarsa ${s.students.madarsa}<br>
      <b>4 · Occupations</b> — ${s.occupations.length ? s.occupations.map(o=>esc(o.name)+' '+o.total).join(' · ') : '—'}<br>
      <b>5 · Religious Education</b> — men aalim ${s.deeni.menAalim}, hafiz ${s.deeni.menHafiz} · women aalim ${s.deeni.womenAalim}, hafiz ${s.deeni.womenHafiz}<br>
      <b>6 · Documents &amp; Schemes</b> — all docs ${s.membersWithAllDocs} · no docs ${s.membersWithNoDocs} · scheme applied ${s.scheme.applied} · not applied ${s.scheme.notApplied}<br>
      <span style="font-size:9pt">${SCHEMES.map(([k,l])=>esc(l)+' '+(s.scheme.counts[k]||0)).join(' · ')}</span>
    </div>`:''}
    ${mjHead()}`;
  const body = fams.map(f=>{
    const docs = DOC_TYPES.filter(([k])=>f.docs&&f.docs[k]==='yes').map(([,l])=>l).concat((f.custom||[]).filter(c=>c.label&&c.value==='yes').map(c=>c.label));
    return `<div class="pcard">
      <h2>${esc(f.houseName||'Household')} — ${esc(f.id)}</h2>
      <div class="pmeta">Street: ${esc(streetName(f))} · House No: ${esc(f.houseNo||'—')} · Type: ${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)))} · Phone: ${esc(f.phone||'—')} · Address: ${esc(f.address||'—')}</div>
      <table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Occupation</th><th>Deeni</th><th>Marital</th><th>Docs</th><th>Schemes</th><th>Challenged</th></tr></thead><tbody>
      ${(f.members||[]).map((m,i)=>{const a=ageFromDob(m.dob);return `<tr><td>${i+1}</td><td>${esc(m.name||'')}</td><td>${esc(m.relation||'')}</td><td>${esc(m.gender||'')}</td><td>${a===null?'':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'')}</td><td>${esc(occName(m))}</td><td>${esc(DEENI_LABEL[m.religious]||'')}</td><td>${esc(m.maritalStatus||'')}</td><td>${BASIC_DOCS.filter(([k])=>m.docs&&m.docs[k]==='yes').length}/${BASIC_DOCS.length}</td><td>${esc(memberSchemes(m).join(', '))}</td><td>${m.disability==='yes'?'Yes':'No'}</td></tr>`;}).join('')}
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
  const M = (relation,name,gender,dob,marital,edu,occ,religious,opt)=>{
    const o = opt||{};
    return { relation, name, gender, dob, maritalStatus:marital, educationLevel:edu, occupation:occ||'', religious:religious||'',
      children:o.children||'0', fatherName:o.father||'', motherName:o.mother||'', disability:o.disability||'no',
      schemes:o.schemes||{}, schemeName:o.schemeName||'', docs:o.docs||{} };
  };
  const fullDocs = { aadhaar:'yes', ration:'yes', voter:'yes', bpl:'yes', bank:'yes', passport:'no', kapidu:'yes' };
  const sample = [
    { houseName:'Abdul Rahman', houseNo:'12-B', street:'Masjid Road', houseType:'moulding', phone:'9876543210', address:'Masjid Road, Block A',
      members:[ M('Self','Abdul Rahman','Male','1979-04-12','Married','college','Shop / business','', {children:'3',father:'Mohd Yusuf',mother:'Ayesha Bibi',schemes:{pm_awas:'yes'},docs:fullDocs}),
                M('Wife','Fatima Begum','Female','1984-08-20','Married','higher_secondary','Tailor','', {children:'3',father:'Ibrahim',mother:'Khatija',schemes:{magalir:'yes'},docs:{aadhaar:'yes',ration:'yes',voter:'yes',bpl:'yes',kapidu:'yes'}}),
                M('Son','Imran Khan','Male','2011-02-05','Unmarried','primary','', '', {father:'Abdul Rahman',mother:'Fatima Begum',docs:{aadhaar:'yes',ration:'yes'}}),
                M('Daughter','Ayesha Khan','Female','2014-09-11','Unmarried','primary','', 'hafiz', {father:'Abdul Rahman',mother:'Fatima Begum',schemes:{scholarship:'yes'},docs:{aadhaar:'yes',passport:'yes'}}) ] },
    { houseName:'Sayeed Ahmed', houseNo:'45', street:'Nala Road', houseType:'cement', phone:'9812345678', address:'Nala Road, Block C',
      members:[ M('Self','Sayeed Ahmed','Male','1965-11-01','Widower','higher_secondary','Painter','', {children:'2',father:'Late Karim',mother:'Rahima',disability:'yes',schemes:{disability_pension:'yes'},docs:{aadhaar:'yes',ration:'yes',voter:'yes',bpl:'yes'}}),
                M('Daughter','Sana Ahmed','Female','2009-06-18','Unmarried','higher_secondary','', '', {father:'Sayeed Ahmed',mother:'Nasreen',schemes:{scholarship:'yes'},docs:{aadhaar:'yes'}}) ] },
    { houseName:'Mohd Salim', houseNo:'7-A', street:'Idgah Lane', houseType:'moulding', phone:'9822001100', address:'Idgah Lane, Block B',
      members:[ M('Self','Mohd Salim','Male','1988-01-30','Married','college','Plumber','aalim', {children:'1',father:'Abdul Karim',mother:'Shabana',schemes:{pm_awas:'yes'}}),
                M('Wife','Rukhsana','Female','1990-09-09','Married','higher_secondary','Housewife','', {children:'1',father:'Yusuf',mother:'Zubeida',schemes:{magalir:'yes'}}),
                M('Son','Zaid Salim','Male','2016-03-21','Unmarried','primary','','', {father:'Mohd Salim',mother:'Rukhsana',docs:{aadhaar:'yes'}}) ] },
    { houseName:'Ismail Sheikh', houseNo:'88', street:'Masjid Road', houseType:'cement', phone:'9867891234', address:'Masjid Road, Block A',
      members:[ M('Self','Ismail Sheikh','Male','1972-03-15','Married','primary','Helper / daily labour','', {children:'4',father:'Rasheed',mother:'Hameeda',schemes:{pm_awas:'yes'}}),
                M('Wife','Naseem Bano','Female','1976-12-25','Married','primary','Beedi / factory worker','', {children:'4',father:'Anwar',mother:'Salma',disability:'yes',schemes:{disability_pension:'yes'}}),
                M('Son','Faizan Sheikh','Male','2004-05-02','Unmarried','college','','hafiz', {father:'Ismail Sheikh',mother:'Naseem Bano'}),
                M('Daughter','Mehjabeen','Female','2007-01-19','Unmarried','higher_secondary','','', {father:'Ismail Sheikh',mother:'Naseem Bano'}) ] },
    { houseName:'Rizwan Ali', houseNo:'23', street:'Nala Road', houseType:'moulding', phone:'9800012345', address:'Nala Road, Block D',
      members:[ M('Self','Rizwan Ali','Male','1995-07-07','Unmarried','college','Electrician','', {father:'Shakeel',mother:'Farida',docs:{aadhaar:'yes',passport:'yes'}}) ] },
    { houseName:'Hafiz Noor Alam', houseNo:'5', street:'Madarsa Gali', houseType:'moulding', phone:'9833001122', address:'Madarsa Gali, near masjid',
      members:[ M('Self','Noor Alam','Male','1983-02-14','Married','madarsa','Imam / madrasa teacher', 'both', {children:'2',father:'Siraj',mother:'Amina'}),
                M('Wife','Shabnam','Female','1987-10-30','Married','madarsa','Teacher','aalim', {children:'2',father:'Ismail',mother:'Razia'}),
                M('Daughter','Hafsa','Female','2013-12-08','Unmarried','madarsa','', 'hafiz', {father:'Noor Alam',mother:'Shabnam'}) ] },
    { houseName:'Shakeel Ahmed', houseNo:'31', street:'Idgah Lane', houseType:'palm', phone:'9845009988', address:'Idgah Lane, Block B',
      members:[ M('Self','Shakeel Ahmed','Male','1969-06-09','Married','primary','Driver','', {children:'2',father:'Yaqoob',mother:'Sakina',schemes:{old_age_pension:'yes'}}),
                M('Wife','Farida','Female','1974-04-17','Married','primary','Housewife','', {children:'2',father:'Rauf',mother:'Noorjahan',schemes:{magalir:'yes'}}),
                M('Son','Arif','Male','2001-08-25','Unmarried','college','Mechanic','', {father:'Shakeel Ahmed',mother:'Farida'}) ] },
    { houseName:'Yusuf Khan', houseNo:'64', street:'Masjid Road', houseType:'moulding', phone:'9898987676', address:'Masjid Road, Block A',
      members:[ M('Self','Yusuf Khan','Male','1990-11-11','Married','higher_secondary','Plumber','', {children:'0',father:'Latif',mother:'Saira',schemes:{pm_awas:'yes'}}),
                M('Wife','Afsana','Female','1993-03-03','Married','college','Teacher','', {father:'Naeem',mother:'Rukhsar',schemes:{magalir:'yes'}}) ] }
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

/* email link se wapas aaya? → session se admin login */
async function cloudAutoLogin(){
  if (!CLOUD.enabled()) return;
  try {
    const c = await CLOUD.get(); if (!c) return;
    const { data } = await c.auth.getSession();
    const sess = data && data.session; if (!sess) return;
    const email = (sess.user.email||'').toLowerCase();
    if (/type=recovery/.test(location.hash)){ pending = { kind:'newpass', email }; openAuth('login'); return renderNewPassword(); }
    if (isAdmin()) return;
    const md = sess.user.user_metadata || {};
    await cloudClaimAdmin(email, md.name||'', md.phone||'');
    if (!adminByEmail(email)){
      const admins = DB.admins();
      admins.push({ email, name:md.name||email.split('@')[0], phone:md.phone||'', createdAt:Date.now(), verified:true, cloud:true });
      DB.setAdmins(admins);
    }
    setSession({ kind:'admin', email });
    enterApp(); toast('Email verified — admin login');
  } catch(e){}
}

function init(){
  /* recovery link se aaya user: naya password set kare */
  try {
    if (/type=recovery/.test(location.hash) && CLOUD.enabled()){
      pending = { kind:'newpass', email:'', code:'' };
      renderAuth('login');
      renderNewPassword();
      return;
    }
  } catch(e){}
  enterApp();   // public dashboard pehle — login optional
  cloudAutoLogin();
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
