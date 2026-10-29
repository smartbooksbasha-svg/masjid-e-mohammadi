/* ============================================================
   Masjid e Mohammadi · Khidmath Committee — Mohalla Survey
   Application logic (vanilla JS, local-first + optional Supabase)
   ============================================================ */
'use strict';

/* ---------------- config / constants ---------------- */
const CFG = window.APP_CONFIG || {};
const PREFIX = CFG.FAMILY_ID_PREFIX || 'MEMC';
const LS = { admins:'memc_admins', families:'memc_families', seq:'memc_seq', session:'memc_session', theme:'memc_theme', seeded:'memc_seeded', masjid:'memc_masjid', events:'memc_events', logo:'memc_logo', formDraft:'memc_form_draft', idcard:'memc_idcard', idset:'memc_idset', audit:'memc_audit', deviceId:'memc_device_id' };

const DOC_TYPES = [
  ['aadhaar','Aadhaar Card'], ['pan','PAN Card'], ['passport','Passport'],
  ['birth','Birth Certificate'], ['voter','Voter ID'], ['ration','Ration Card'],
  ['driving','Driving Licence'], ['income','Income Certificate'],
  ['disability','Disability Certificate'], ['bpl','BPL / Ayushman Card']
];
const CUSTOM_DOCS = 12; // "more than 10" empty custom boxes

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
  ['','— Select —'],
  ['illiterate','Illiterate'],
  ['primary','Primary (1-5)'],
  ['middle','Middle (6-8)'],
  ['secondary','Secondary (SSLC/10th)'],
  ['higher_secondary','Higher Secondary (HSC/12th)'],
  ['iti','ITI'],
  ['diploma','Diploma'],
  ['degree','Degree / Graduate'],
  ['postgrad','Post Graduate'],
  ['professional','Professional'],
  ['madarsa','Madarsa'],
  ['others','Others']
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
/* legacy records (purane govtScheme='yes' bina naam) — ek hi label dono jagah */
const LEGACY_SCHEME_LABEL = 'Scheme (old record)';

const DEENI = [
  ['','— none / Quran nahi seekha —'],
  ['nazira','Nazira'],
  ['hafiz','Hafiz'],
  ['aalim','Aalim'],
  ['aalima','Aalima'],
  ['mufti','Mufti'],
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

/* PBKDF2 (1,20,000 rounds) — offline admin password kabhi plain/1-round store nahi hota */
const PBKDF2_ITER = 120000;
const _hex = buf => Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
async function hashPass(pw, salt){
  const raw = String(salt||'') + '::' + String(pw||'');
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.importKey){
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(raw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:new TextEncoder().encode('memc'), iterations:PBKDF2_ITER, hash:'SHA-256' }, key, 256);
      return 'pbkdf2$' + PBKDF2_ITER + '$' + _hex(bits);
    }
    if (window.crypto && crypto.subtle && crypto.subtle.digest){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return _hex(buf);                       // purana format (compat)
    }
  } catch(e){}
  let h = 2166136261; for (let i=0;i<raw.length;i++){ h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'fnv' + (h>>>0).toString(16);
}
/* stored hash (naya ya purana) se password check */
async function checkPass(pw, admin){
  const stored = String((admin && admin.passHash) || '');
  const salt = (admin && admin.salt) || '';
  if (!stored) return false;
  if (stored.indexOf('pbkdf2$') === 0){
    const iter = Number(stored.split('$')[1]) || PBKDF2_ITER;
    const raw = String(salt) + '::' + String(pw||'');
    try {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(raw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:new TextEncoder().encode('memc'), iterations:iter, hash:'SHA-256' }, key, 256);
      return 'pbkdf2$' + iter + '$' + _hex(bits) === stored;
    } catch(e){ return false; }
  }
  /* purane records: plain sha256 hex ya 'fnv...' */
  const raw = String(salt) + '::' + String(pw||'');
  if (stored.indexOf('fnv') === 0){
    let h = 2166136261; for (let i=0;i<raw.length;i++){ h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv' + (h>>>0).toString(16) === stored;
  }
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.digest){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return _hex(buf) === stored;
    }
  } catch(e){}
  return false;
}

/* ---------- login guard: 3 galat try = 5 min lock · 6 galat try = admin panel hide ---------- */
const GUARD_KEY = 'memc_authguard';
const GUARD_TRIES = 3;                       /* iske baad 5 minute ka lock */
const GUARD_LOCK_MS = 5 * 60 * 1000;
const GUARD_HIDE_AFTER = 6;                  /* 6 galat try = panel automatic hide */
const GUARD_HIDE_MS = 30 * 60 * 1000;
function guardGet(){
  try {
    const g = JSON.parse(localStorage.getItem(GUARD_KEY) || 'null') || {};
    return { fails:+g.fails || 0, lockUntil:+g.lockUntil || 0, hiddenUntil:+g.hiddenUntil || 0 };
  } catch(e){ return { fails:0, lockUntil:0, hiddenUntil:0 }; }
}
function guardSet(g){ try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); } catch(e){} }
function guardReset(){ guardSet({ fails:0, lockUntil:0, hiddenUntil:0 }); }
function guardLeftMs(until){ return Math.max(0, (+until || 0) - Date.now()); }
function guardHidden(){
  const g = guardGet();
  if (g.hiddenUntil && Date.now() >= g.hiddenUntil){ guardReset(); return false; }
  return Date.now() < g.hiddenUntil;
}
function guardLocked(){ return Date.now() < guardGet().lockUntil; }
function mmss(sec){ sec = Math.max(0, Math.round(sec)); return pad(Math.floor(sec/60),2) + ':' + pad(sec%60,2); }
function loginFailed(){
  const g = guardGet(); g.fails = (+g.fails || 0) + 1;
  if (g.fails >= GUARD_HIDE_AFTER){ g.hiddenUntil = Date.now() + GUARD_HIDE_MS; g.lockUntil = g.hiddenUntil; }
  else if (g.fails >= GUARD_TRIES){ g.lockUntil = Date.now() + GUARD_LOCK_MS; }
  guardSet(g);
  try { renderShell(); } catch(e){}
  return g;
}
function loginOk(){ guardReset(); try { renderShell(); } catch(e){} }
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
function monthKey(d=new Date()){ return d.getFullYear()+'-'+pad(d.getMonth()+1,2); }
function recordEvent(type, note){
  try {
    const evs = DB.events();
    evs.push({id:uid(), type, note:String(note||''), at:Date.now(), mk:monthKey(), y:new Date().getFullYear()});
    DB.setEvents(evs.slice(-500));
  } catch(e){}
}
function readFileAsDataURL(file){
  return new Promise((res,rej)=>{
    if(!file){rej('no file');return;}
    const fr=new FileReader();
    fr.onload=()=>res(fr.result);
    fr.onerror=rej;
    fr.readAsDataURL(file);
  });
}
function compressImageDataURL(dataUrl, maxW=512, quality=0.72){
  return new Promise((res)=>{
    try{
      const img=new Image();
      img.onload=()=>{
        const ratio = Math.min(1, maxW/img.width);
        const w=Math.round(img.width*ratio), h=Math.round(img.height*ratio);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.onerror=()=>res(dataUrl);
      img.src=dataUrl;
    }catch(e){res(dataUrl);}
  });
}

/* ---------------- storage ---------------- */
const DB = {
  /* two-role world: owner (super admin) + admin (masjid employees). Public is read-only. */
  admins(){
    try {
      const raw = JSON.parse(localStorage.getItem(LS.admins)||'null');
      if (Array.isArray(raw)) return raw;
    } catch(e){}
    return [];
  },
  setAdmins(v, opts){
    const before = (opts && opts.silent) ? null : DB.admins();
    localStorage.setItem(LS.admins, JSON.stringify(v));
    if (before) { try{ auditAdminsDiff(before, v); }catch(e){} }
  },
  families(){ try{ return JSON.parse(localStorage.getItem(LS.families)||'[]'); }catch(e){ return []; } },
  setFamilies(v, opts){
    const before = (opts && opts.silent) ? null : DB.families();
    localStorage.setItem(LS.families, JSON.stringify(v));
    if (before) { try{ auditFamiliesDiff(before, v); }catch(e){} }
  },
  seq(){ return parseInt(localStorage.getItem(LS.seq)||'0',10)||0; },
  setSeq(n){ localStorage.setItem(LS.seq, String(n)); },
  seeded(){ return localStorage.getItem(LS.seeded)==='1'; },
  setSeeded(){ localStorage.setItem(LS.seeded,'1'); },
  masjid(){ try{ return JSON.parse(localStorage.getItem(LS.masjid)||'null') || null; }catch(e){ return null; } },
  setMasjid(v){
    const old = DB.masjid() || {};
    localStorage.setItem(LS.masjid, JSON.stringify(v));
    try{
      const nv = v || {}; const ch = [];
      Object.keys(nv).forEach(k=>{
        if (k === 'photos'){ const x=(old.photos||[]).length, y=(nv.photos||[]).length; if (x!==y) ch.push('photos ' + x + '→' + y); return; }
        if (JSON.stringify(old[k]) !== JSON.stringify(nv[k])) ch.push(k);
      });
      if (ch.length) audit('masjid_save', nv.name || 'Masjid profile', ch.slice(0,6).join(', '));
    }catch(e){}
  },
  events(){ try{ return JSON.parse(localStorage.getItem(LS.events)||'[]'); }catch(e){ return []; } },
  setEvents(v){ localStorage.setItem(LS.events, JSON.stringify(v)); },
  logo(){ try{ return localStorage.getItem(LS.logo)||''; }catch(e){ return ''; } },
  setLogo(v){ if(!v) localStorage.removeItem(LS.logo); else localStorage.setItem(LS.logo, String(v)); },
  idcard(){ try{ return JSON.parse(localStorage.getItem(LS.idcard)||'null') || null; }catch(e){ return null; } },
  setIdcard(v){
    const old = DB.idcard() || {};
    if (!v) localStorage.removeItem(LS.idcard); else localStorage.setItem(LS.idcard, JSON.stringify(v));
    try{
      const nv = v || {}; const keys = new Set(Object.keys(old).concat(Object.keys(nv))); const ch = [];
      keys.forEach(k=>{
        if (JSON.stringify(old[k]) === JSON.stringify(nv[k])) return;
        ch.push(/^sig/.test(k) ? ('signature ' + k.replace(/^sig/,'').toLowerCase()) : k);
      });
      if (ch.length) audit('settings', 'ID card design', ch.join(', '));
    }catch(e){}
  },
  idset(){ try{ return JSON.parse(localStorage.getItem(LS.idset)||'null') || null; }catch(e){ return null; } },
  setIdsSet(v){
    const old = DB.idset() || {};
    if (!v) localStorage.removeItem(LS.idset); else localStorage.setItem(LS.idset, JSON.stringify(v));
    try{
      const nv = v || {}; const ch = [];
      Object.keys(Object.assign({}, old, nv)).forEach(k=>{
        if (JSON.stringify(old[k]) === JSON.stringify(nv[k])) return;
        ch.push(k + ': ' + (old[k]||'—') + ' → ' + (nv[k]||'—'));
      });
      if (ch.length) audit('settings', 'ID & password format', ch.join(', '));
    }catch(e){}
  }
};

/* ============================================================
   AUDIT LOG — "kab kisne kya kiya" (sirf super admin dekhta hai)
   Har entry: { at, a:action, by:naam, uid, email, t:target, d:detail }
   ============================================================ */
const AUDIT_MAX = 1000;
const AUDIT_ACT = {
  login:'Login', logout:'Logout', login_fail:'Login fail',
  family_add:'Household add', family_edit:'Household edit', family_delete:'Household delete',
  admin_add:'Admin add', admin_edit:'Admin edit', admin_remove:'Admin remove',
  settings:'Setting change', masjid_save:'Masjid profile save', publish:'Public totals publish',
  backup:'Backup', backup_drive:'Drive backup', restore:'Restore', data_clear:'All data erased',
  password_change:'Password change', audit_clear:'Audit log cleared'
};
const AUDIT_GROUPS = {
  login:['login','logout','login_fail'],
  data:['family_add','family_edit','family_delete','restore','data_clear','publish'],
  admin:['admin_add','admin_edit','admin_remove'],
  settings:['settings','masjid_save','backup','backup_drive','password_change','audit_clear']
};
function auditLog(){ try{ return JSON.parse(localStorage.getItem(LS.audit)||'[]'); }catch(e){ return []; } }
function auditSave(v){ try{ localStorage.setItem(LS.audit, JSON.stringify((v||[]).slice(-AUDIT_MAX))); }catch(e){} }
function auditWho(){
  try{
    const u = currentUser();
    if (u) return { by:u.name || u.email || 'Admin', id:u.userId || '', email:u.email || '' };
  }catch(e){}
  return { by:'Public', id:'', email:'' };
}
function audit(action, target, detail, who){
  try{
    const w = who || auditWho();
    const v = auditLog();
    const row = { id:uid(), at:Date.now(), a:String(action||''), by:String(w.by||''),
                  uid:String(w.id||''), email:String(w.email||''), t:String(target||''), d:String(detail||'') };
    v.push(row);
    auditSave(v);
    /* cross-device: server par bhi bhejo (table na ho to chup-chaap skip) */
    try { if (typeof SYNC !== 'undefined' && SYNC.pushAudit) SYNC.pushAudit(row); } catch(e){}
  }catch(e){}
}
const FAM_FIELD_LABEL = { name:'naam', phone:'phone', address:'pata', street:'street', houseNo:'house no',
  houseType:'house type', notes:'notes', docs:'documents', custom:'custom docs', masjidNote:'note' };
function famLabel(f){ return (f && (f.name || f.houseName || (f.head && f.head.name))) || ('Family ' + ((f && f.id) || '')); }
function famMemberCount(f){ return Array.isArray(f && f.members) ? f.members.length : 0; }
function famChanges(a, b){
  const out = [];
  Object.keys(FAM_FIELD_LABEL).forEach(k=>{
    if (JSON.stringify(a[k]==null?'':a[k]) !== JSON.stringify(b[k]==null?'':b[k])) out.push(FAM_FIELD_LABEL[k]);
  });
  const ca = famMemberCount(a), cb = famMemberCount(b);
  if (ca !== cb) out.push('members ' + ca + '→' + cb);
  else if (JSON.stringify(a.members||[]) !== JSON.stringify(b.members||[])) out.push('member details');
  return out;
}
function auditFamiliesDiff(before, after){
  const bm = new Map((before||[]).map(f=>[String(f.id), f]));
  const am = new Map((after||[]).map(f=>[String(f.id), f]));
  am.forEach((f,id)=>{
    const old = bm.get(id);
    if (!old){ audit('family_add', famLabel(f), 'ID ' + id + ' · ' + famMemberCount(f) + ' members'); return; }
    const ch = famChanges(old, f);
    if (ch.length) audit('family_edit', famLabel(f), 'ID ' + id + ' · ' + ch.join(', '));
  });
  bm.forEach((f,id)=>{ if (!am.has(id)) audit('family_delete', famLabel(f), 'ID ' + id + ' · ' + famMemberCount(f) + ' members'); });
}
function adminVolatile(a){
  const c = Object.assign({}, a||{});
  delete c.sess; delete c.lastLogin; delete c.tempPass; delete c.firstLoginAt;
  return c;
}
function auditAdminsDiff(before, after){
  const key = a => String(a.email || a.userId || a.name || '').toLowerCase();
  const bm = new Map((before||[]).map(a=>[key(a), a]));
  const am = new Map((after||[]).map(a=>[key(a), a]));
  am.forEach((a,k)=>{
    const old = bm.get(k);
    const nm = a.name || a.email || a.userId || k;
    if (!old){
      audit('admin_add', nm, [a.userId||'', a.role==='owner'?'owner':'user', a.pending?'pending':''].filter(Boolean).join(' · '));
      return;
    }
    if (JSON.stringify(adminVolatile(old)) !== JSON.stringify(adminVolatile(a))){
      const ch = [];
      ['name','email','phone','age','status','role','userId'].forEach(f=>{
        const x = String(old[f]==null?'':old[f]), y = String(a[f]==null?'':a[f]);
        if (x !== y) ch.push(f + ': ' + (x||'—') + ' → ' + (y||'—'));
      });
      if (String(old.passHash||'') !== String(a.passHash||'')) ch.push('password changed');
      if (!!old.photo !== !!a.photo) ch.push(a.photo ? 'photo added' : 'photo removed');
      if (ch.length) audit('admin_edit', nm, ch.join(', '));
    }
  });
  bm.forEach((a,k)=>{ if (!am.has(k)) audit('admin_remove', a.name || a.email || k, a.userId || ''); });
}

function getSession(){ try{ return JSON.parse(localStorage.getItem(LS.session)||'null'); }catch(e){ return null; } }
function setSession(s){
  try {
    if (!s) { clearSession(); return; }
    // Don't store photo/dataUrl in session to save space
    const safe = { kind:s.kind, email:s.email, userId:s.userId, name:s.name, role:s.role, token:s.token, exp:s.exp };
    localStorage.setItem(LS.session, JSON.stringify(safe));
  } catch(e){ try { localStorage.setItem(LS.session, JSON.stringify(s)); } catch(x){} }
  try { cloudPulled = false; } catch(e){}
  if (!s || s.kind !== 'admin' || !s.email) return;
  const e = String(s.email).toLowerCase();
  /* pehla login = owner (agar owner set nahi hai) */
  /* owner email config se aata hai (Settings me user khud badal sakta hai) */
  /* temporary password sirf pehli baar ke liye — login hote hi hata do */
  try {
    const admins = DB.admins(); let ch = false;
    admins.forEach(a=>{
      if (String(a.email||'').toLowerCase() === e && a.tempPass && !a.firstLoginAt){
        /* temp password dikhta rehta hai — admin khud badle to hat jayega */
        a.firstLoginAt = Date.now(); ch = true;
      }
    });
    if (ch) DB.setAdmins(admins);
  } catch(x){}
}
function clearSession(){ try { localStorage.removeItem(LS.session); } catch(e){} try { cloudPulled = false; } catch(e){} try { if(window.CLOUD && CLOUD.client){ CLOUD.client.auth.signOut().catch(()=>{}); } } catch(e){} }

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

/* ---------- v94: signed session (localStorage me session nakli nahi ban sakta) ---------- */
const SESSION_MS = 12 * 60 * 60 * 1000;   /* 12 ghante */
function fnv(str){
  let h = 2166136261;
  str = String(str||'');
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h>>>0).toString(36);
}
function startSession(email, name){
  email = String(email||'').trim();
  if (!email) return;
  const admins = DB.admins();
  const i = admins.findIndex(a=>String(a.email).toLowerCase()===String(email).toLowerCase());
  if (i < 0) return;
  const token = uid(24) + uid(12);
  const exp = Date.now() + SESSION_MS;
  admins[i].sess = { h: fnv(token), exp };
  admins[i].lastLogin = Date.now();
  DB.setAdmins(admins);
  setSession({ kind:'admin', email, name: name || admins[i].name || '', token, exp });
  audit('login', '', 'session start', { by: admins[i].name || email, id: admins[i].userId || '', email });
}
let _touchAt = 0;
function touchSession(){
  try{
    if (Date.now() - _touchAt < 5*60*1000) return;
    _touchAt = Date.now();
    const s = getSession();
    if (!s || s.kind !== 'admin' || !s.token) return;
    const admins = DB.admins();
    const i = admins.findIndex(a=>String(a.email).toLowerCase()===String(s.email||'').toLowerCase());
    if (i < 0) return;
    const exp = Date.now() + SESSION_MS;
    admins[i].sess = { h: fnv(s.token), exp };
    DB.setAdmins(admins);
    setSession(Object.assign({}, s, { exp }));
  }catch(e){}
}
function currentUser(){
  const s = getSession();
  if (!s || s.kind !== 'admin' || !s.email) return null;
  const a = DB.admins().find(x=>String(x.email).toLowerCase()===String(s.email).toLowerCase());
  if (!a || adminStatus(a) !== 'active') return null;
  /* token verify — bina token ke session ghusa dena kaam nahi karega */
  if (!s.token || !a.sess || a.sess.h !== fnv(s.token)) return null;
  if (!(Number(a.sess.exp) > Date.now()) || !(Number(s.exp) > Date.now())) return null;
  const own = String(a.email).toLowerCase() === ownerEmail();
  return { id:a.email, email:a.email, name:a.name||a.email, role:(own?'owner':'user'), userId:a.userId||'', owner:own };
}
function isAdmin(){ migrateAdmins(); return !!currentUser(); }

/* ---------------- theme ---------------- */
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function themeIcon(t){ return t==='night' ? ICON_MOON : ICON_SUN; }
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem(LS.theme, t);
  const b=$('#themeBtn'); if(b) b.innerHTML = themeIcon(t) + (t==='night' ? ' Night' : ' Day'); }
function toggleTheme(){ applyTheme(document.documentElement.getAttribute('data-theme')==='night' ? 'day' : 'night'); }
applyTheme(localStorage.getItem(LS.theme) || 'day');

/* ---------------- toast ---------------- */
function toast(msg, type){
  const wrap = $('#toasts'); if(!wrap) return;
  const t = document.createElement('div'); t.className = 'toast' + (type==='err'?' err':''); t.textContent = msg;
  wrap.appendChild(t); setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),320); }, 2600);
}

/* ---------- v92: timestamps + content guards ---------- */
function fmtDateTime(ts){
  if (!ts) return '—';
  const d = new Date(typeof ts==='number' ? ts : Date.parse(ts));
  if (isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2,'0');
  return p(d.getDate()) + '-' + p(d.getMonth()+1) + '-' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
let _warnAt = 0;
/* deterrent only — asli security server (Supabase RLS) me hai */
function installGuards(){
  try{
    /* session ko active rakho, idle hone par expire */
    ['click','keydown','touchstart'].forEach(ev=>
      document.addEventListener(ev, ()=>{ try{ touchSession(); }catch(e){} }, { passive:true }));
  }catch(e){}
}

/* ---------------- caption helper icons (inline SVG) ---------------- */
const ICON = {
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  mosque:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2.5 2.4 4 4.2 4 6a4 4 0 0 1-8 0c0-1.8 1.5-3.6 4-6z"/><path d="M4 21v-6a8 8 0 0 1 16 0v6"/><path d="M9 21v-4a3 3 0 0 1 6 0v4"/><path d="M2 21h20"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M4 20h16"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 17H7A5 5 0 0 1 7 7a6 6 0 0 1 11.3 1.7A4 4 0 0 1 18 17z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 7 12 13 22 7"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  clipboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M16 6h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h5"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
};

/* ============================================================
   AUTH — ek Admin login · public visitors read-only
   ============================================================ */
let pending = null;      // { kind:'login'|'register'|'reset', email, code, name, phone, pass, expires }

function adminByEmail(email){
  const e = String(email||'').trim().toLowerCase();
  return DB.admins().find(a=>String(a.email||'').toLowerCase()===e) || null;
}
/* ---------- admin accounts: owner approval + auto user ID ---------- */
function adminStatus(a){ return (a && a.status) || 'active'; }
function activeAdmins(){ return DB.admins().filter(a=>adminStatus(a)==='active'); }
function pendingAdmins(){ return DB.admins().filter(a=>adminStatus(a)==='pending'); }
/* FIXED OWNER - LOCKED */
const FIXED_OWNER_EMAIL = 'smartbooksbasha@gmail.com';
const FIXED_OWNER_NAME = 'Isthiyaque Basha';

function ownerEmail(){
  return FIXED_OWNER_EMAIL;
}
function ownerName(){
  return FIXED_OWNER_NAME;
}
function setOwnerEmail(e){ /* locked - cannot change */ return false; }
/* purane auto-set owner ko ek baar clear karo — owner ab config se aata hai */

/* PURGE: sirf fixed owner rakho, baaki sab admins hata do */
/* owner sirf ek — fixed email. Baaki sab admin rehte hain (delete NAHI hote). */
function purgeNonOwnerAdmins(){
  try {
    const FIXED = String(FIXED_OWNER_EMAIL||'').toLowerCase();
    const admins = DB.admins();
    let changed = false;
    const ownerRec = admins.find(a=>String(a.email||'').toLowerCase() === FIXED);
    if (!ownerRec){
      admins.push({ email: FIXED, name: 'Isthiyaque Basha', role: 'owner', status: 'active',
        userId: 'ADM-OWNER-0001', createdAt: Date.now(), phone: '' });
      changed = true;
    }
  admins.forEach(a=>{
    const isOwnerRow = String(a.email||'').toLowerCase() === FIXED;
    if (isOwnerRow){
      if (a.role !== 'owner' || a.status !== 'active'){ a.role='owner'; a.status='active'; changed = true; }
      if (!a.userId){ a.userId = 'ADM-OWNER-0001'; changed = true; }
    } else if (a.role === 'owner'){       /* koi aur khud ko owner na bana sake */
      a.role = 'admin'; changed = true;
    }
    if (!Array.isArray(a.devices)) { a.devices = []; changed = true; }
    if (!Array.isArray(a.pendingDevices)) { a.pendingDevices = []; changed = true; }
  });
    /* purge sirf tab jab data placeholders ho (demo/legacy) — asli admins safe */
    const keep = admins.filter(a=>{
      const e = String(a.email||'').toLowerCase();
      if (e === FIXED) return true;
      return !!(a.passHash || a.cloud || a.status === 'pending');
    });
    if (keep.length !== admins.length){ changed = true; }
    if (changed) DB.setAdmins(keep, { silent:true });
  } catch(e){}
}
function migrateOwner(){
  try {
    if (localStorage.getItem('memc_owner_src')) return;
    const cfgOwner = String((typeof CFG!=='undefined' && CFG.OWNER_EMAIL) || '');
    if (!cfgOwner) return;
    localStorage.removeItem('memc_owner');
    localStorage.setItem('memc_owner_src','config');
  } catch(e){}
}
function isOwner(){
  const u = currentUser(); if (!u) return false;
  const e = String(u.email||'').toLowerCase();
  if (!e) return false;
  if (e === FIXED_OWNER_EMAIL) return true;
  const rec = adminByEmail(e);
  if (rec && rec.role === 'owner' && String(rec.email||'').toLowerCase() === FIXED_OWNER_EMAIL) return true;
  return false;
}
function userRole(){
  const u = currentUser();
  return u ? u.role : '';
}
/* user tier (v109): owner = sab kuch; user = sirf data add/edit/remove + find-by-ID edit.
   user ke liye BAND: settings/admins/audit/ID designer/export/print/backup/publish/sample/clear. */
/* ---------------- ID / password format (super admin settings) ---------------- */
const IDSET_DEFAULT = {
  idStyle:'random',                       /* random = AD102026#21200 jaisa, seq = ADM-2026-0101 */
  ownerPrefix:'OW', ownerStart:1,         /* super admin alag series: OW102026#48391 */
  adminPrefix:'AD', adminSuffix:'', adminStart:101,  /* har naye admin ki alag random ID */
  passPrefix:'', passSuffix:'',           /* password = <prefix><6 random><suffix> */
  famPrefix:'MEMC', famRandom:true        /* family id = MEMC-<yy><4 random> */
};
/* app version — footer/settings me dikhta hai, update confirm karne ke liye */
const APP_VER = 'v112';
const APP_VER_AT = '2026-10-29';

/* password input + show/hide eye button */
function pwBox(inputHtml){
  return `<div class="pw-wrap">${inputHtml}<button type="button" class="pw-eye" data-act="pw-eye" aria-pressed="false" aria-label="Show password" title="Show password">${ICON.eye}</button></div>`;
}

function idset(){
  const c = Object.assign({}, IDSET_DEFAULT, DB.idset() || {});
  const clean = (v, max, up) => {
    let x = String(v==null?'':v).trim().slice(0, max);
    if (up) x = x.toUpperCase();
    return x.replace(/[^A-Za-z0-9\-_]/g, '');
  };
  c.idStyle     = c.idStyle === 'seq' ? 'seq' : 'random';
  c.ownerPrefix = clean(c.ownerPrefix, 10, true) || 'OW';
  c.ownerStart  = Math.min(9999, Math.max(1, parseInt(c.ownerStart, 10) || 1));
  c.adminPrefix = clean(c.adminPrefix, 10, true) || 'ADM';
  c.adminSuffix = clean(c.adminSuffix, 10, true);
  c.adminStart  = Math.min(9999, Math.max(1, parseInt(c.adminStart, 10) || 101));
  c.passPrefix   = clean(c.passPrefix, 10, false);
  c.passSuffix   = clean(c.passSuffix, 10, false);
  c.famPrefix    = clean(c.famPrefix, 10, true) || 'MEMC';
  c.famRandom    = c.famRandom !== false;
  return c;
}
const ID_RAND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* 0/O/1/I nahi — padhne me clear */
function idRand(n){
  let out = '';
  for (let i=0;i<n;i++) out += ID_RAND_ALPHABET[Math.floor(Math.random()*ID_RAND_ALPHABET.length)];
  return out;
}
/* random-looking ID: <prefix><2 digits><year>#<5 digits>  e.g. AD102026#21200 */
function rndDigits(n){
  let out = '';
  for (let i=0;i<n;i++) out += String(Math.floor(Math.random()*10));
  return out;
}
function idTaken(id){
  const v = String(id||'').toLowerCase();
  return DB.admins().some(a => String(a.userId||'').toLowerCase() === v);
}
function makeRandomId(prefix){
  const yr = new Date().getFullYear();
  let id = '';
  for (let i=0;i<40;i++){
    id = prefix + rndDigits(2) + yr + '#' + rndDigits(5);
    if (!idTaken(id)) return id;
  }
  return prefix + rndDigits(4) + yr + '#' + rndDigits(6);
}
/* ye ID current format se match karti hai? (migrate isi se decide karta hai) */
function idMatches(id, prefix){
  const cfg = idset();
  const esc2 = v => String(v||'').replace(/[-_]/g,'\\$&');
  const p = esc2(prefix);
  if (cfg.idStyle === 'seq'){
    return new RegExp('^' + p + '-[0-9]{4}-[0-9]{1,6}(?:-' + esc2(cfg.adminSuffix) + ')?$').test(String(id||''));
  }
  return new RegExp('^' + p + '[0-9]{2}[0-9]{4}#[0-9]{5,6}$').test(String(id||''));
}
function genOwnerId(){
  const cfg = idset();
  if (cfg.idStyle === 'seq'){
    let n = Math.max(1, Number(cfg.ownerStart) || 1) - 1;
    const re = new RegExp('^' + String(cfg.ownerPrefix).replace(/[-_]/g,'\\$&') + '-[0-9]{4}-([0-9]{1,5})$');
    DB.admins().forEach(a=>{ const m = String(a.userId||'').match(re); if (m) n = Math.max(n, Number(m[1])); });
    return cfg.ownerPrefix + '-' + new Date().getFullYear() + '-' + pad(n + 1, 3);
  }
  return makeRandomId(cfg.ownerPrefix);
}
function genUserId(){
  const cfg = idset();
  if (cfg.idStyle === 'seq'){
    const esc2 = v => String(v||'').replace(/[-_]/g,'\\$&');
    /* sirf ADMIN series ginti me aati hai — owner ki OWN/OW ID chhod do */
    const re = new RegExp('^' + esc2(cfg.adminPrefix) + '-[0-9]{4}-([0-9]{1,6})(?:-' + esc2(cfg.adminSuffix) + ')?$');
    let mx = 0;
    DB.admins().forEach(a=>{ const m = String(a.userId||'').match(re); if (m) mx = Math.max(mx, Number(m[1])); });
    const n = Math.max(Math.max(1, Number(cfg.adminStart) || 101), mx + 1);
    const tail = cfg.adminSuffix ? '-' + cfg.adminSuffix : '';
    return cfg.adminPrefix + '-' + new Date().getFullYear() + '-' + pad(n, 4) + tail;
  }
  return makeRandomId(cfg.adminPrefix);
}
function genTempPass(){
  const cfg = idset();
  const U='ABCDEFGHJKLMNPQRSTUVWXYZ', L='abcdefghijkmnpqrstuvwxyz', D='23456789';
  const pick=(s,n)=>Array.from({length:n},()=>s[Math.floor(Math.random()*s.length)]).join('');
  /* beech ka 6 hamesha random — prefix/suffix fix ho to bhi password guess na ho */
  return (cfg.passPrefix||'') + pick(U,2) + pick(L,2) + pick(D,2) + (cfg.passSuffix||'');
}
function getDeviceId(){
  try {
    let id = localStorage.getItem(LS.deviceId) || '';
    if (!id){
      id = 'dev_' + uid() + '_' + Date.now().toString(36);
      localStorage.setItem(LS.deviceId, id);
    }
    return id;
  } catch(e){ return 'dev_' + uid(); }
}
function ensureAdminDevices(a){
  if (!a) return a;
  if (!Array.isArray(a.devices)) a.devices = [];
  if (!Array.isArray(a.pendingDevices)) a.pendingDevices = [];
  return a;
}
function adminHasDevice(a, did){
  did = did || getDeviceId();
  a = ensureAdminDevices(a);
  return (a.devices||[]).some(d=> d && d.id === did);
}
function addAdminDevice(a, did, meta){
  did = did || getDeviceId();
  a = ensureAdminDevices(a);
  if (adminHasDevice(a,did)) return a;
  (a.devices||[]).push({ id: did, addedAt: Date.now(), ua: (meta&&meta.ua)||navigator.userAgent||'', lastSeen: Date.now() });
  return a;
}
function requestAdminDevice(a, did, meta){
  did = did || getDeviceId();
  a = ensureAdminDevices(a);
  if (adminHasDevice(a,did)) return { ok:true };
  if ((a.pendingDevices||[]).some(d=> d && d.id === did)) return { pending:true };
  (a.pendingDevices||[]).push({ id: did, requestedAt: Date.now(), ua: (meta&&meta.ua)||navigator.userAgent||'' });
  return { pending:true };
}
function approveAdminDevice(email, did){
  const admins = DB.admins();
  const a = admins.find(x=> String(x.email||'').toLowerCase() === String(email||'').toLowerCase());
  if (!a) return false;
  ensureAdminDevices(a);
  a.pendingDevices = (a.pendingDevices||[]).filter(d=> !(d && d.id === did));
  if (!adminHasDevice(a,did)) (a.devices||[]).push({ id: did, addedAt: Date.now(), approvedBy: currentUser() && currentUser().email, approvedAt: Date.now() });
  if ((a.devices||[]).length > 2) { /* allow owner? */ }
  DB.setAdmins(admins);
  return true;
}
function rejectAdminDevice(email, did){
  const admins = DB.admins();
  const a = admins.find(x=> String(x.email||'').toLowerCase() === String(email||'').toLowerCase());
  if (!a) return false;
  ensureAdminDevices(a);
  a.pendingDevices = (a.pendingDevices||[]).filter(d=> !(d && d.id === did));
  DB.setAdmins(admins);
  return true;
}
function deviceGateLogin(a){
  if (!a) return { ok:false, reason:'notfound' };
  if (adminStatus(a) === 'pending') return { ok:false, reason:'pending' };
  const e = String(a.email||'').toLowerCase();
  if (e === FIXED_OWNER_EMAIL) return { ok:true };
  const did = getDeviceId();
  ensureAdminDevices(a);
  if (adminHasDevice(a,did)) {
    // update lastSeen
    const ds = a.devices||[];
    const di = ds.findIndex(d=> d && d.id === did);
    if (di>=0) ds[di].lastSeen = Date.now();
    return { ok:true };
  }
  // device not registered
  if ((a.devices||[]).length >= 2){
    const req = requestAdminDevice(a,did);
    if (req.pending) return { ok:false, reason:'device_limit', email:a.email };
  } else {
    // allow first device auto-register? but rule says "1 device he kaam kare" per user id? user says "ek user id mein 1 device he kaam kare" - strict 1
    const req = requestAdminDevice(a,did);
    if (req.pending) return { ok:false, reason:'device_limit', email:a.email };
  }
  return { ok:false, reason:'device_limit', email:a.email };
}
function findAdminByIdentifier(v){
  const s = String(v||'').trim(); if (!s) return null;
  if (s.includes('@')) return adminByEmail(s);
  return DB.admins().find(a=>String(a.userId||'').toUpperCase() === s.toUpperCase()) || null;
}
function credsMailto(rec){
  const sub = 'Masjid Survey admin login — ' + (rec.name||rec.email);
  const body = 'Masjid e Mohammadi · Mohalla Survey\n\n'
    + tStr('Aapko admin access de diya gaya hai.') + '\n\n'
    + tStr('Naam: ') + (rec.name||'—') + '\nEmail: ' + rec.email + '\n'
    + 'User ID: ' + rec.userId + '\n'
    + 'Password: ' + (rec.tempPass||'—') + '\n\n'
    + 'Site: ' + (location.origin + location.pathname) + '\n'
    + tStr('Topbar me "Admin" dabao → User ID + password se login karo.') + '\n'
    + tStr('Login ke baad My Profile se apna password badal lo.') + '\n';
  return 'mailto:?subject=' + encodeURIComponent(sub) + '&body=' + encodeURIComponent(body);
}
function mailMode(){ return CLOUD.enabled() ? 'cloud' : 'demo'; }
function newCode(){ return String(100000 + Math.floor(Math.random()*900000)); }
function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v||'').trim()); }

function authCard(inner){
  return `<div class="auth-wrap"><div class="auth-card" role="dialog" aria-modal="true">
    <button class="auth-x" type="button" data-act="close-auth" aria-label="Close">×</button>
    <div class="auth-brand"><span class="crest">${DB.logo() ? `<img src="${esc(DB.logo())}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;display:block"/>` : 'M'}</span><div><div class="t">${esc(CFG.ORG_NAME||'Masjid e Mohammadi')}</div><div class="s">${esc(CFG.ORG_SUB||'Khidmath Committee')}</div></div></div>
    ${inner}
    <div class="auth-ver">${APP_VER}</div>
  </div></div>`;
}

function openAuth(tab){
  if (guardHidden()){
    try { clearInterval(_lockTimer); } catch(e){}
    const box = $('#authScreen'); if (box){ box.classList.add('hidden'); box.innerHTML = ''; }
    try { toast(tF('Admin panel security lock me hai — {0} baad try karo', mmss(guardLeftMs(guardGet().hiddenUntil)/1000)), 'err'); } catch(e){}
    return;
  }
  renderAuth(tab || 'login');
}
function closeAuth(){
  pending = null;
  const a = $('#authScreen'); if (a){ a.classList.add('hidden'); a.innerHTML=''; }
  const app = $('#appScreen'); if (app) app.classList.remove('hidden');
  try { renderShell(); } catch(e){}
}

function renderAuth(tab){
  const box = $('#authScreen'); if (!box) return;
  box.classList.remove('hidden');
  pending = pending && pending.expires > Date.now() ? pending : null;
  if (pending) return renderCodeStep();

  if (tab === 'forgot')  return renderForgot();
  return renderLogin();
}

/* ---------------- login (modal) ---------------- */
function renderLogin(){
  $('#authScreen').innerHTML = authCard(`
    <h1>Admin login</h1>
    <p class="lead">Sirf admin / super admin ke liye. Baaki sab public dashboard dekh sakte hain.</p>
    <form id="loginForm">
      <div class="field"><label>User ID / Email ID</label><input class="inp" name="email" type="text" required autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="User ID ya email" /><span class="hint">Apni User ID login ke baad My Profile me dikhti hai — email se bhi login ho sakta hai.</span></div>
      <div class="field"><label>Password</label>${pwBox('<input class="inp" name="pass" type="password" required autocomplete="current-password" />')}</div>
      <div id="loginAlert"></div>
      <button class="btn block" type="submit">Login</button>
      <div class="auth-foot">
        <button class="linklike" type="button" data-act="auth-tab" data-tab="forgot">Forgot password?</button>
        <button class="linklike" type="button" data-act="close-auth">Back to public site</button>
      </div>
    </form>`);

  $('#loginForm').addEventListener('submit', loginSubmit);
  applyLoginGuard();
}

/* lock ka live countdown (05:00 → 00:00), khatam hote hi form wapas chalu */
let _lockTimer = null;
function applyLoginGuard(){
  try { clearInterval(_lockTimer); } catch(e){}
  _lockTimer = null;
  const form = $('#loginForm'); if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  const box = $('#loginAlert');
  const paint = ()=>{
    const g = guardGet();
    const hiddenLeft = guardLeftMs(g.hiddenUntil);
    const lockLeft = guardLeftMs(g.lockUntil);
    if (hiddenLeft > 0){
      if (btn){ btn.disabled = true; btn.textContent = 'Locked'; }
      if (box) box.innerHTML = '<div class="alert err">Security lock — admin panel <b>' + mmss(hiddenLeft/1000) + '</b> ke liye band hai.</div>';
      return true;
    }
    if (lockLeft > 0){
      if (btn){ btn.disabled = true; btn.textContent = 'Wait ' + mmss(lockLeft/1000); }
      if (box) box.innerHTML = '<div class="alert err">3 galat try — <b>' + mmss(lockLeft/1000) + '</b> baad try karo.</div>';
      return true;
    }
    if (btn){ btn.disabled = false; btn.textContent = 'Login'; }
    if (box && /galat try|Security lock/.test(box.textContent || '')) box.innerHTML = '';
    return false;
  };
  if (paint()){
    _lockTimer = setInterval(()=>{
      if (!paint()){
        clearInterval(_lockTimer); _lockTimer = null;
        try { renderShell(); } catch(e){}
        try { toast('Ab try kar sakte ho'); } catch(e){}
      }
    }, 1000);
  }
}

async function loginSubmit(e){
  e.preventDefault();
  const E = e.target.elements, alertBox = $('#loginAlert');
  if (guardHidden()){
    alertBox.innerHTML='<div class="alert err">'+tF('Admin panel abhi band hai (security lock) — {0} baad try karo.', '<b>'+mmss(guardLeftMs(guardGet().hiddenUntil)/1000)+'</b>')+'</div>';
    return;
  }
  if (guardLocked()){
    alertBox.innerHTML='<div class="alert err">3 galat try ho gaye — <b>'+mmss(guardLeftMs(guardGet().lockUntil)/1000)+'</b> baad try karo.</div>';
    applyLoginGuard();
    return;
  }
  const ident = E.email.value.trim(), pass = E.pass.value;
  const found = findAdminByIdentifier(ident);
  if (!found && !isEmail(ident)){ alertBox.innerHTML='<div class="alert err">User ID / email galat lag raha hai.</div>'; return; }
  if (found && adminStatus(found) === 'pending'){
    alertBox.innerHTML='<div class="alert err">'+tF('Ye account approval ka intezar kar raha hai. Owner se approval mangwa lo.')+'</div>'; return;
  }
  const email = found ? String(found.email).toLowerCase() : ident.toLowerCase();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn){ btn.disabled = true; btn.textContent = tF('Logging in…'); }

  if (mailMode() === 'cloud'){
    const c = await CLOUD.get();
    if (!c){ if (btn){ btn.disabled=false; btn.textContent='Login'; } alertBox.innerHTML='<div class="alert err">'+tF('Cloud connect nahi hua — internet check karo.')+'</div>'; return; }
    const { error } = await c.auth.signInWithPassword({ email, password: pass });
    if (error){ loginFailed(); audit('login_fail', email, String(error.message||'cloud login failed'), { by:email, id:'', email }); if (btn){ btn.disabled=false; btn.textContent='Login'; } alertBox.innerHTML='<div class="alert err">'+tF('Login fail hua — User ID/Email ya password galat hai.')+'</div>'; applyLoginGuard(); return; }
    loginOk();
    await cloudClaimAdmin(email, '', '');
    if (!adminByEmail(email)){
      const admins = DB.admins();
      admins.push({ email, name:email.split('@')[0], phone:'', createdAt:Date.now(), verified:true, cloud:true });
      DB.setAdmins(admins);
    }
    const adm = adminByEmail(email);
    const dg = deviceGateLogin(adm);
    if (!dg.ok){
      if (dg.reason === 'device_limit'){ alertBox.innerHTML='<div class="alert err">'+tF('Is device par login allowed nahi hai. Device limit (1 device per User ID) hai — owner se permission mangwa lo.')+'</div>'; if (btn){ btn.disabled=false; btn.textContent='Login'; } loginFailed(); return; }
      if (btn){ btn.disabled=false; btn.textContent='Login'; } alertBox.innerHTML='<div class="alert err">'+tF('Login nahi ho saka. Dubara try karo ya owner se contact karo.')+'</div>'; return;
    }
    startSession(email);
    closeAuth(); enterApp(); toast('Welcome back'); return;
  }

  const admin = adminByEmail(email);
  if (!admin){ if (btn){ btn.disabled=false; btn.textContent='Login'; } alertBox.innerHTML='<div class="alert err">'+tF('Is email/User ID se koi admin nahi mila.')+'</div>'; return; }
  if (!(await checkPass(pass, admin))){
    loginFailed();
    audit('login_fail', admin.name || email, 'wrong password', { by:admin.name || email, id:admin.userId || '', email });
    if (btn){ btn.disabled=false; btn.textContent='Login'; }
    const gg = guardGet();
    let m;
    if (guardHidden()) m = tF('Galat password. {0} galat try ke baad admin panel {1} ke liye band hai.', '<b>'+GUARD_HIDE_AFTER+' galat try</b>', '<b>'+mmss(guardLeftMs(gg.hiddenUntil)/1000)+'</b>');
    else if (guardLocked()) m = tF('Galat password. {0} galat try — {1} baad dobara try karo.', '<b>'+GUARD_TRIES+' galat try</b>', '<b>'+mmss(guardLeftMs(gg.lockUntil)/1000)+'</b>');
    else m = tF('Galat password. Abhi {0} try bache hain.', '<b>'+Math.max(0, GUARD_TRIES - gg.fails)+'</b>');
    alertBox.innerHTML='<div class="alert err">' + m + '</div>';
    applyLoginGuard();
    return;
  }
  const dg2 = deviceGateLogin(admin);
  if (!dg2.ok){
    if (dg2.reason === 'device_limit'){ alertBox.innerHTML='<div class="alert err">'+tF('Ye device allow nahi hai (1 device per User ID). Owner se permission le ke login karo.')+'</div>'; if (btn){ btn.disabled=false; btn.textContent='Login'; } loginFailed(); return; }
    if (btn){ btn.disabled=false; btn.textContent='Login'; } alertBox.innerHTML='<div class="alert err">'+tF('Login blocked — owner se contact karo.')+'</div>'; return;
  }
  loginOk();
  startSession(email);
  closeAuth(); enterApp(); toast('Welcome back');
}

async function cloudIsListed(email){
  try {
    const c = await CLOUD.get(); if (!c) return false;
    const { data } = await c.from('app_users').select('id').eq('id', String(email).toLowerCase()).limit(1);
    return !!(data && data.length);
  } catch(e){ return false; }
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
    <h1>${isReset?'Reset link bhej diya':isLogin?'Login link bhej diya':'Check your email'}</h1>
    <p class="lead"><b>${esc(pending.email)}</b> par ${isReset?'password reset':isLogin?'login':'confirm'} link bheja hai.</p>
    <div class="alert info">Email kholo → click the link in your email to login automatically.<br>
      <span class="small">Link na dikhe to spam folder dekho. Link 1 ghante tak chalta hai.</span></div>
    <button class="btn block" type="button" data-act="auth-check">Maine link par click kar liya</button>
    <button class="btn ghost block" type="button" data-act="auth-cancel">Cancel</button>`);
}

async function cloudLinkCheck(){
  const c = await CLOUD.get();
  if (!c){ toast('Cloud connect nahi hua','err'); return; }
  const { data } = await c.auth.getSession();
  const sess = data && data.session;
  if (!sess){ toast('Verification pending. Click the link in your email.','err'); return; }
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
  startSession(email);
  pending=null; closeAuth(); enterApp(); toast('Login successful');
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
        startSession(pending.email);
        pending=null; closeAuth(); enterApp(); toast('Admin account created'); return;
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
      startSession(pending.email);
      pending=null; closeAuth(); enterApp(); toast('Welcome back'); return;
    }
    if (pending.kind === 'register'){
      const salt = uid();
      const admins = DB.admins();
      admins.push({ email:pending.email, name:pending.name, phone:pending.phone, salt, passHash: await hashPass(pending.pass, salt), createdAt:Date.now(), verified:true });
      DB.setAdmins(admins);
      startSession(pending.email);
      pending=null; closeAuth(); enterApp(); toast('Admin account created'); return;
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
    <h1>Forgot password</h1>
    <p class="lead">Registered email ID daalo aur password reset link milega.</p>
    <div class="sec-title" style="margin-top:0;font-size:.9rem">Reset password</div>
    <form id="forgotForm">
      <div class="field"><label>Registered email ID</label><input class="inp" name="email" type="email" required placeholder="admin@example.com" /></div>
      <div id="forgotAlert"></div>
      <button class="btn block" type="submit">Send reset code</button>
    </form>
`);

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


}

function renderNewPassword(){
  $('#authScreen').innerHTML = authCard(`
    <h1>Set a new password</h1>
    <p class="lead">Enter new password. You will be logged in after.</p>
    <form id="newPassForm">
      <div class="grid g2">
        <div class="field"><label>New password</label>${pwBox('<input class="inp" name="pass" type="password" required minlength="6" />')}</div>
        <div class="field"><label>Confirm</label>${pwBox('<input class="inp" name="pass2" type="password" required minlength="6" />')}</div>
      </div>
      <div id="npAlert"></div>
      <button class="btn block" type="submit">Save password</button>
    </form>`);
  $('#newPassForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const E = e.target.elements, alertBox = $('#npAlert');
    if (E.pass.value !== E.pass2.value){ alertBox.innerHTML='<div class="alert err">Passwords do not match.</div>'; return; }
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
    audit('password_change', email, 'password reset via email', { by:email, id:'', email });
    toast('Password updated. Please login.');
    renderLogin();
  });
}

/* ============================================================
   APP SHELL
   ============================================================ */
const state = { view:'dashboard', param:null, draft:null, showAddAdmin:false, showAdmins:false, auditFilter:'all', auditQuery:'', cloudAudit:null, cloudAuditTried:false };


/* ============================================================
   CLOUD SYNC — public read, admin write (activates with keys)
   ============================================================ */
const PUB_FAM_COLS = 'id,house_name,house_no,street,house_type,notes,docs,custom,created_at';
const ADMIN_FAM_COLS = PUB_FAM_COLS + ',address,phone';
const MEMBER_COLS = ['relation','name','father_name','mother_name','gender','dob','education','education_level','occupation','sector','religious','marital_status','children','disability','schemes','scheme_name','docs'];
const MEMBER_TO_JS = { father_name:'fatherName', mother_name:'motherName', education_level:'educationLevel', marital_status:'maritalStatus', scheme_name:'schemeName' };

/* public view ke liye ANONYMOUS copy — na naam, na phone, na pata, na notes */
const ANON_MEMBER_FIELDS = ['gender','dob','educationLevel','occupation','religious','maritalStatus','children','disability','schemes','docs'];
function anonymizeFamily(f, i){
  return {
    id:'p' + (i + 1),
    street:f.street || '',
    houseType:f.houseType || 'moulding',
    createdAt:f.createdAt || 0,
    docs:{}, custom:[],
    members:(f.members||[]).filter(m=>String(m.name||'').trim() || m.gender).map(m=>{
      const o = {}; ANON_MEMBER_FIELDS.forEach(k=>{ o[k] = m[k]; });
      return o;
    })
  };
}
/* publish se pehle hard guard — koi bhi personal field galti se na jaye */
const PUBLIC_BANNED = ['name','fatherName','motherName','phone','address','bank','aadhaar','notes','houseName','createdBy','updatedBy','memberDocs'];
function stripPersonal(obj){
  if (Array.isArray(obj)) return obj.map(stripPersonal);
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  Object.keys(obj).forEach(k=>{ if (!PUBLIC_BANNED.includes(k)) out[k] = stripPersonal(obj[k]); });
  return out;
}
function publicPayload(){
  const fams = DB.families().map(anonymizeFamily).map(stripPersonal);
  const mj = DB.masjid() || {};
  return {
    v:4,
    at:new Date().toISOString(),
    families:fams,
    masjid:{ name:mj.name||'', established:mj.established||'', address:mj.address||'', phone:mj.phone||'',
             imam:mj.imam||'', muazzin:mj.muazzin||'', area:mj.area||'', capacity:mj.capacity||'',
             rooms:mj.rooms||'', madrasa:mj.madrasa||'', note:mj.note||'', photos:mj.photos||[],
             email:mj.email||'' }
  };
}

const SYNC = {
  on(){ return CLOUD.enabled(); },
  famCols(){ return isAdmin() ? ADMIN_FAM_COLS : PUB_FAM_COLS; },
  /* public snapshot = jo anon padhta hai (single row, anonymous) */
  async publishSnapshot(){
    const c = await CLOUD.get(); if (!c || !isAdmin()) return false;
    try {
      const { error } = await c.from('public_snapshot').upsert({ id:true, data:publicPayload(), updated_at:new Date().toISOString() });
      return !error;
    } catch(e){ return false; }
  },
  /* audit log server par — sirf authenticated admin likh/padh sakta hai */
  async pushAudit(row){
    try{
      if (!this.on() || !isAdmin()) return false;
      const c = await CLOUD.get(); if (!c) return false;
      const { error } = await c.from('audit_log').insert({
        id: row.id, at: new Date(row.at).toISOString(), action: row.a, who: row.by,
        user_id: row.uid || '', email: row.email || '', target: row.t || '', detail: row.d || ''
      });
      return !error;
    }catch(e){ return false; }
  },
  async fetchAudit(limit){
    try{
      if (!this.on()) return null;
      const c = await CLOUD.get(); if (!c) return null;
      const { data, error } = await c.from('audit_log')
        .select('id,at,action,who,user_id,email,target,detail')
        .order('at', { ascending:false }).limit(limit || 500);
      if (error) return null;
      return (data||[]).map(r=>({ id:r.id, at:Date.parse(r.at)||0, a:r.action, by:r.who||'',
        uid:r.user_id||'', email:r.email||'', t:r.target||'', d:r.detail||'', cloud:true }));
    }catch(e){ return null; }
  },
  async pullPublic(){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const { data, error } = await c.from('public_snapshot').select('data, updated_at').limit(1);
      if (error) throw error;
      const snap = data && data[0] && data[0].data;
      /* snapshot abhi publish nahi hua (ya SQL v4 nahi chala) — purana public read try karo
         taaki site khali na dikhe. SQL v4 chalne ke baad ye raasta khud band ho jaata hai. */
      if (!snap || !Array.isArray(snap.families) || !snap.families.length) return await this.pullPublicLegacy();
      PUBDATA = {
        at: snap.at || (data && data[0] && data[0].updated_at) || null,
        families:snap.families.map((f,i)=>Object.assign({}, f, {
          members:(f.members||[]).map((m,j)=>Object.assign({ id:'m'+i+'_'+j }, m))
        })),
        masjid:snap.masjid || null
      };
      try { localStorage.setItem('memc_pub', JSON.stringify(PUBDATA)); } catch(e){}
      return true;
    } catch(e){ return false; }
  },
  /* fallback: SQL v4 se pehle wala public read (sirf anon-safe columns) */
  async pullPublicLegacy(){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const { data, error } = await c.from('families').select(PUB_FAM_COLS + ',members(gender,dob,education_level,occupation,religious,marital_status,children,disability,schemes,docs)');
      if (error || !data || !data.length) return false;
      PUBDATA = {
        families: data.map((f,i)=>({
          id:'p' + (i+1), street:f.street||'', houseType:f.house_type||'moulding', createdAt:f.created_at?Date.parse(f.created_at):0,
          docs:{}, custom:[], members:(f.members||[]).map((m,j)=>({
            id:'m'+i+'_'+j, gender:m.gender||'', dob:m.dob||'', educationLevel:m.education_level||'',
            occupation:m.occupation||'', religious:m.religious||'', maritalStatus:m.marital_status||'',
            children:m.children||'', disability:m.disability||'', schemes:m.schemes||{}, docs:m.docs||{}
          }))
        })),
        masjid:null
      };
      try { const { data:mj } = await c.from('masjid').select('name,established,address,phone,imam,muazzin,area,capacity,rooms,madrasa,note,photos').limit(1);
        if (mj && mj[0]) PUBDATA.masjid = mj[0]; } catch(e){}
      try { localStorage.setItem('memc_pub', JSON.stringify(PUBDATA)); } catch(e){}
      return true;
    } catch(e){ return false; }
  },
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
      if (fams.length) DB.setFamilies(fams, { silent:true });
      const { data: mj } = await c.from('masjid').select('*').limit(1);
      if (mj && mj[0]) DB.setMasjid(mj[0]);
      /* public snapshot ko fresh rakho (anon sirf yahi padhta hai) */
      this.publishSnapshot();
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
      this.publishSnapshot();
      return true;
    } catch(e){ return false; }
  },
  async delFamily(id){
    const c = await CLOUD.get(); if (!c) return false;
    try { const { error } = await c.from('families').delete().eq('id', id); if (error) throw error; this.publishSnapshot(); return true; } catch(e){ return false; }
  },
  async saveMasjid(m){
    const c = await CLOUD.get(); if (!c) return false;
    try {
      const row = Object.assign({}, m, { id:true, updated_at:new Date().toISOString() });
      const { error } = await c.from('masjid').upsert(row);
      if (error) throw error; this.publishSnapshot(); return true;
    } catch(e){ return false; }
  }
};

let cloudPulled = false;
function enterApp(){
  const a = $('#authScreen'); if (a) a.classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
  renderShell();
  /* admin QR link: #qedit=FAMILY-ID → seedha edit */
  if (state._qedit && isAdmin()){
    const id = state._qedit; state._qedit=null;
    const f = DB.families().find(x=>x.id===id);
    if (f){ state.draft = JSON.parse(JSON.stringify(f)); go('add'); }
    else { if (!state.view || state.view==='myfamily') state.view = 'dashboard'; go(state.view, state.param); }
  } else {
    if (!state.view || state.view==='myfamily') state.view = 'dashboard';
    go(state.view, state.param);
  }
  if (SYNC.on() && !cloudPulled){
    cloudPulled = true;
    const job = isAdmin() ? SYNC.pull() : SYNC.pullPublic();
    job.then(ok=>{ if (ok) go(state.view, state.param); });
  }
}

/* v108 — prompt("Enter 1,2 or 3") ki jagah proper modal (birth/death/other) */
let _evReasonCB = null;
function askEventReason(cb){
  _evReasonCB = cb || null;
  const old = document.querySelector(".modal-scrim"); if (old) old.remove();
  const scr = document.createElement("div");
  scr.className = "modal-scrim no-i18n";
  scr.innerHTML = `
    <div class="modal-card">
      <h3 class="modal-title">${esc(tStr("Wajah kya hai?"))}</h3>
      <div class="modal-opts">
        <button class="btn block" type="button" data-act="evr" data-ty="birth">${esc(tStr("Janam hua hai"))}</button>
        <button class="btn block" type="button" data-act="evr" data-ty="death">${esc(tStr("Inteqal ho gaya"))}</button>
        <button class="btn ghost block" type="button" data-act="evr" data-ty="other">${esc(tStr("Aur koi wajah"))}</button>
        <button class="btn ghost sm block" type="button" data-act="evr-cancel">${esc(tStr("Cancel"))}</button>
      </div>
    </div>`;
  scr.addEventListener("click", (e)=>{ if (e.target === scr) closeEventReason(); });
  document.body.appendChild(scr);
}
function closeEventReason(){
  _evReasonCB = null;
  const old = document.querySelector(".modal-scrim"); if (old) old.remove();
}

function openPhoto(src){
  const d = document.createElement('div');
  d.className = 'lb';
  d.innerHTML = `<img src="${esc(src)}" alt="Masjid photo" /><button class="lb-x" type="button" aria-label="Close">×</button>`;
  d.addEventListener('click', ()=>d.remove());
  document.body.appendChild(d);
}

/* ---------- AUDIT LOG view (owner only) ---------- */
function auditAll(){
  const local = auditLog();
  const cloud = Array.isArray(state.cloudAudit) ? state.cloudAudit : [];
  const seen = new Set(local.map(r=>String(r.id)));
  return local.concat(cloud.filter(r=>!seen.has(String(r.id)))).sort((a,b)=>b.at-a.at);
}
async function loadCloudAudit(){
  if (state.cloudAuditTried) return;
  state.cloudAuditTried = true;
  try { state.cloudAudit = await SYNC.fetchAudit(500); } catch(e){ state.cloudAudit = null; }
  if (state.view === 'audit'){
    const c = $('#content'); if (c){ c.innerHTML = viewAudit(); afterRender('audit'); }
  }
}
function auditFiltered(){
  const f = state.auditFilter || 'all';
  const q = String(state.auditQuery||'').toLowerCase().trim();
  let rows = auditAll();
  if (f !== 'all'){ const g = AUDIT_GROUPS[f] || []; rows = rows.filter(r=>g.indexOf(r.a) >= 0); }
  if (q) rows = rows.filter(r=>((r.by||'')+' '+(r.t||'')+' '+(r.d||'')+' '+(AUDIT_ACT[r.a]||r.a)).toLowerCase().indexOf(q) >= 0);
  return rows;
}
function auditTime(ts){ const d = new Date(ts); return pad(d.getHours(),2)+':'+pad(d.getMinutes(),2); }
function auditDay(ts){
  const d = new Date(ts), t = new Date();
  const same = (a,b)=>a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  if (same(d,t)) return 'Today';
  if (same(d,new Date(t.getTime()-86400000))) return 'Yesterday';
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
const AUDIT_CLASS = { login:'ok', logout:'ok', login_fail:'err', family_add:'ok', family_edit:'info',
  family_delete:'err', admin_add:'ok', admin_edit:'info', admin_remove:'err', settings:'info',
  masjid_save:'info', publish:'ok', backup:'ok', backup_drive:'ok', restore:'warn',
  data_clear:'err', password_change:'warn', audit_clear:'warn' };

function viewAudit(){
  if (!isOwner()) return `<div class="empty"><h3>Super admin only</h3></div>`;
  const rows = auditFiltered(), total = auditAll().length;
  const cloudRows = Array.isArray(state.cloudAudit) ? state.cloudAudit.length : 0;
  const chips = [['all','Sab'],['login','Login'],['data','Data'],['admin','Admins'],['settings','Settings']];
  let html = `<div class="page-head">
    <div><h1>Audit log</h1><p><span>Kab kisne kya kiya</span> — <b>${rows.length}</b> / ${total} <span>entries</span></p></div>
    <div class="ph-actions">
      <button class="btn ghost sm" type="button" data-act="audit-export">${ICON.dl} CSV</button>
      <button class="btn danger sm" type="button" data-act="audit-clear">Clear log</button>
    </div>
  </div>
  <div class="card">
    <p class="muted small" style="margin:0 0 10px"><span>${state.cloudAudit === null && !state.cloudAuditTried ? 'Server se entries load ho rahi hain…' : (cloudRows ? 'Server entries included' : 'Is device ka log — cross-device ke liye supabase/audit.sql run karo')}</span>${cloudRows?' · <b>'+cloudRows+'</b>':''}</p>
    <div class="aud-chips">${chips.map(([k,l])=>`<button type="button" class="chip${(state.auditFilter||'all')===k?' on':''}" data-act="audit-filter" data-f="${k}">${l}</button>`).join('')}</div>
    <input class="inp" id="auditQ" type="search" placeholder="Search — naam, family, action…" value="${esc(state.auditQuery||'')}" style="margin:12px 0" />
    <div class="aud-list" id="auditList">`;
  if (!rows.length){
    html += `<div class="empty" style="padding:26px 10px"><h3>Koi entry nahi</h3><p class="muted small">Admin jab kuch add/edit karega, entry yahan dikhegi.</p></div>`;
  }
  let day = '';
  rows.forEach(r=>{
    const d = auditDay(r.at);
    if (d !== day){ day = d; html += `<div class="aud-day">${esc(d)}</div>`; }
    const label = AUDIT_ACT[r.a] || r.a;
    html += `<div class="aud-row" data-s="${esc(((r.by||'')+' '+(r.t||'')+' '+(r.d||'')+' '+label).toLowerCase())}">
      <span class="aud-badge ${AUDIT_CLASS[r.a]||'info'}">${esc(label)}</span>
      <div class="aud-main"><b>${esc(r.t||'—')}</b>${r.d?`<span class="aud-d">${esc(r.d)}</span>`:''}</div>
      <div class="aud-meta"><b>${esc(r.by||'—')}</b><span>${esc(auditTime(r.at))}${r.uid?' · '+esc(r.uid):''}${r.cloud?' · ☁':''}</span></div>
    </div>`;
  });
  return html + `</div></div>`;
}

function exportAuditCSV(){
  if (!isOwner()) return;
  const rows = [['Date','Time','Action','Who','User ID','Email','Target','Detail']];
  auditLog().forEach(r=>{
    const d = new Date(r.at);
    rows.push([d.toLocaleDateString('en-GB'), auditTime(r.at), AUDIT_ACT[r.a]||r.a, r.by||'', r.uid||'', r.email||'', r.t||'', r.d||'']);
  });
  const csv = rows.map(r=>r.map(x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'audit-log-' + todayStr() + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  audit('settings', 'Audit CSV', 'exported ' + (rows.length-1) + ' entries');
  toast('CSV download ho gaya');
}

function navItems(){
  if (!isAdmin()) return [ ['dashboard','Dashboard',ICON.dash], ['find','Find family',ICON.search] ];
  const it = [ ['dashboard','Dashboard',ICON.dash], ['families','Households',ICON.list],
           ['add','Add Household',ICON.plus], ['find','Find family',ICON.search], ['masjid','Masjid Profile',ICON.mosque] ];
  if (userRole() !== 'user') it.push(['adminpanel','Administration',ICON.gear]);
  if (isOwner()) it.push(['audit','Audit log',ICON.list]);
  return it;
}

/* website icon = jo logo owner ne upload kiya (browser tab + home screen) */
function applyFavicon(){
  let logo = '';
  try { logo = DB.logo() || ''; } catch(e){}
  const defIcon = document.querySelector('link[rel="icon"]');
  if (defIcon && !defIcon.dataset.def) defIcon.dataset.def = defIcon.getAttribute('href') || '';
  const links = Array.from(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'));
  links.forEach(l=>{
    if (!l.dataset.def) l.dataset.def = l.getAttribute('href') || '';
    l.setAttribute('href', logo || l.dataset.def);
  });
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !logo) meta.setAttribute('content', '#0e7c66');
  } catch(e){}
}

function renderShell(){
  const u = currentUser();
  $('#nav').innerHTML = navItems().map(([v,label,ic])=>`<button type="button" class="nav-item" data-view="${v}" onclick="navTo('${v}');return false;">${ic}<span>${label}</span></button>`).join('');
  const logo = DB.logo();
  const brand = document.querySelector('.sb-brand');
  if(brand){
    const crest = brand.querySelector('.crest');
    if(crest){
      crest.innerHTML = logo ? `<img src="${esc(logo)}" alt="Website logo" style="width:100%;height:100%;object-fit:cover;border-radius:12px;display:block"/>` : 'M';
      crest.style.overflow='hidden';
    }
    if(isOwner()){
      brand.style.cursor='pointer'; 
      brand.setAttribute('title','Click to upload/change website logo from gallery');
      brand.onclick = (e)=>{ 
        e.preventDefault(); e.stopPropagation(); 
        const inp=document.createElement('input'); 
        inp.type='file'; inp.accept='image/*'; 
        inp.onchange=async ev=>{ 
          const f=ev.target.files[0]; if(!f)return; 
          let d=await readFileAsDataURL(f); 
          d=await compressImageDataURL(d,640,0.78); 
          DB.setLogo(d); 
          toast('Website logo updated'); 
          applyFavicon();
          renderShell(); 
          go(state.view,state.param); 
        }; 
        inp.click(); 
      };
    } else { 
      brand.style.cursor='default'; 
      brand.removeAttribute('title'); 
      brand.onclick=null; 
    }
  }
  const chip = $('#userChip');
  if (u){
    const initials = (u.name||u.email).split(/[ @.]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const roleName = isOwner() ? 'Owner · Admin' : 'User';
    const admins = DB.admins();
    const me = admins.find(a=> (a.email===u.email) || (a.userId===u.userId)) || u;
    const ph = me.photo ? `<img src="${esc(me.photo)}" alt="Profile photo"/>` : initials;
    chip.innerHTML = `<button type="button" class="chip-btn" data-act="myprofile" title="My Profile - Edit photo/name/phone"><span class="av" style="overflow:hidden;border-radius:10px">${ph}</span><span><span class="nm">${esc(me.name||u.name||u.email)}</span><br><span class="rl">${roleName}</span></span></button> <button class="chip-logout" type="button" data-act="admin-logout" title="Log out">${ICON.exit}</button>`;
    chip.removeAttribute('data-act');
  } else {
    const g = guardGet();
    const lockTxt = guardHidden()
      ? ''
      : (guardLocked() ? `<span class="btn ghost sm" style="margin-left:8px;opacity:.6" data-act="open-auth">Admin · ${esc(mmss(guardLeftMs(g.lockUntil)/1000))}</span>`
                       : `<span class="btn ghost sm" data-act="open-auth" style="margin-left:8px">Admin</span>`);
    chip.innerHTML = `<span class="public-chip">Public view</span>${lockTxt}`;
    chip.removeAttribute('data-act');
    chip.title = 'Read-only public view';
  }
  const foot = document.querySelector('.sb-foot');
  const verLine = `<div class="ver">${APP_VER} · ${APP_VER_AT}</div>`;
  if (foot) foot.innerHTML = (u
    ? `Admin mode · you can add and edit`
    : ('Public view · read only' + (guardHidden() ? '' : '<br><button class="linklike" type="button" data-act="open-auth" style="margin-top:8px">Admin login</button>'))) + verLine;
  $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===state.view || (state.view==='add' && a.dataset.view==='add')));
  closeNav();
}

function go(view, param){
  if (view!=='find'){ try{ stopQrScan(); }catch(_e){} }
  // Save draft if leaving add form
  try {
    if (state.view === 'add' && view !== 'add' && isAdmin() && state.draft && !state.draft.id){
      saveFormDraft();
    }
  } catch(e){}
  const ADMIN_ONLY = ['add','users','settings','families','detail','masjid','adminpanel','idcard','audit'];
  if (ADMIN_ONLY.includes(view) && !isAdmin()){ toast('Ye page sirf admin ke liye hai','err'); view='dashboard'; }
  const OWNER_ONLY = ['adminpanel','users','settings','audit','idcard'];
  if (OWNER_ONLY.includes(view) && userRole()==='user'){ toast('Sirf Owner hi ye page khol sakta hai','err'); view='dashboard'; }
  // Push history state for back button
  try {
    if (state.view !== view || state.param !== (param||null)){
      history.pushState({view:view, param:param||null}, '', '#'+view+(param?'?'+encodeURIComponent(param):''));
    }
  } catch(e){}
  state.view = view; state.param = param||null;
  closeNav();
  const titles = { dashboard:'Survey Dashboard', families:'Households', add:(state.param?'Edit Household':'Add Household'), detail:'Household Record', find:'Find family', adminpanel:'Administration', users:'Admins', settings:'Settings', masjid:'Masjid Profile', cat:'Survey Category', myprofile:'My Profile', 'admin-edit':'Edit Admin', idcard:'ID Card Design', memberlist:'Members', familylist:'Households list', streetlist:'Streets', audit:'Audit log' };
  $('#pageTitle').textContent = titles[view] || 'Survey Dashboard';
  let html='';
  if (view==='dashboard') html = viewDashboard();
  else if (view==='families') html = viewFamilies();
  else if (view==='add') html = viewFamilyForm();
  else if (view==='detail') html = viewFamilyDetail(state.param);
  else if (view==='find') html = viewFind();
  else if (view==='adminpanel') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
  else if (view==='users') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
  else if (view==='settings') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
  else if (view==='masjid') html = viewMasjid();
  else if (view==='myprofile') html = isAdmin()?viewMyProfile():`<div class='empty'><h3>Admin only</h3></div>`;
  else if (view==='admin-edit') html = isOwner()?viewAdminEdit(state.param):`<div class='empty'><h3>Owner only</h3></div>`;
  else if (view==='idcard') html = isOwner()?viewIdCardDesign():`<div class='empty'><h3>Super admin only</h3></div>`;
  else if (view==='audit') html = viewAudit();
  else if (view==='cat') html = viewCat(state.param);
  else if (view==='memberlist') html = viewMembersList(state.memberListFilter||(()=>true), state.memberListTitle||'Members');
  else if (view==='familylist') html = viewFamilyList(state.familyListFilter||(()=>true), state.familyListTitle||'Households');
  else if (view==='streetlist') html = viewStreetList();
  $('#content').innerHTML = html;
  /* detail ke kv rows ek line me rehte hain — poora text title me (long-press par dikhta hai) */
  try {
    $$('#content .kv .row span:last-child').forEach(sp=>{
      const t = (sp.textContent||'').trim();
      if (t && !sp.getAttribute('title')) sp.setAttribute('title', t);
    });
  } catch(e){}
  $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===view || (view==='detail'&&a.dataset.view==='families')||(view==='add'&&a.dataset.view==='add')));
  afterRender(view);
}

// Global sidebar open function
window.openSidebar = function(){
  try {
    var s = document.getElementById('sidebar');
    var sc = document.getElementById('scrimNav');
    if (s) s.classList.add('open');
    if (sc) sc.classList.add('show');
  } catch(e){ console.error('openSidebar error:', e); }
};

// Global navigation function for inline onclick
window.navTo = function(v){
  try {
    if (v==='add') state.draft = blankDraft();
    go(v);
    closeNav();
  } catch(e){ console.error('navTo error:', e); }
};

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

/* visitor (non-admin) ke liye sirf ANONYMOUS snapshot — admin ka local data chhua nahi jaata */
let PUBDATA = null;
try { PUBDATA = JSON.parse(localStorage.getItem('memc_pub') || 'null'); } catch(e){ PUBDATA = null; }
function sourceFamilies(){
  if (!isAdmin() && PUBDATA && Array.isArray(PUBDATA.families) && PUBDATA.families.length) return PUBDATA.families;
  return DB.families();
}
function computeStats(){
  const fams = sourceFamilies();
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
    deeni: { menAalim:0, menHafiz:0, womenAalim:0, womenHafiz:0, menNazira:0, womenNazira:0, menAalima:0, womenAalima:0, menMufti:0, womenMufti:0 },
    docs: Object.fromEntries(BASIC_DOCS.map(([k])=>[k,0])),
    membersWithAllDocs: 0,
    membersWithNoDocs: 0,
    scheme: { applied:0, notApplied:0, byName:[], counts:{} },
    events: { birthMonth:0, birthYear:0, deathMonth:0, deathYear:0 }
  };
  const streetMap = new Map();
  const schemeMap = new Map();
  const occMap = new Map();
  const evs = DB.events();
  const now = new Date(); const mk = monthKey(now); const yy = now.getFullYear();
  s.events.birthMonth = evs.filter(e=>e.type==='birth' && e.mk===mk).length;
  s.events.birthYear  = evs.filter(e=>e.type==='birth' && e.y===yy).length;
  s.events.deathMonth = evs.filter(e=>e.type==='death' && e.mk===mk).length;
  s.events.deathYear  = evs.filter(e=>e.type==='death' && e.y===yy).length;

  fams.forEach(f=>{
    const name = streetName(f);
    if (!streetMap.has(name)) streetMap.set(name, { name, houses:0, moulding:0, cement:0, palm:0, other:0 });
    const st = streetMap.get(name);
    st.houses++;

    const ht = houseTypeKey(f.houseType);
    s.houseTypes[ht]++;
    st[ht]++;

    (f.members||[]).forEach(m=>{
      if (m.deceased) { s.deceased = (s.deceased||0) + 1; return; }
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
      }
      // employment tracking
      if (m.employment === 'employed') s.employed++;
      else s.unemployed = (s.unemployed||0) + 1;

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
        const nm = String(m.schemeName||'').trim() || LEGACY_SCHEME_LABEL;
        schemeMap.set(nm, (schemeMap.get(nm)||0) + 1);
      } else s.scheme.notApplied++;

      const dn = (m.religious||'').toLowerCase();
      const isF = g==='female';
      if (dn==='aalim' || dn==='both'){ if (isF) s.deeni.womenAalim++; else s.deeni.menAalim++; }
      if (dn==='hafiz' || dn==='both'){ if (isF) s.deeni.womenHafiz++; else s.deeni.menHafiz++; }
      if (dn==='nazira'){ if (isF) s.deeni.womenNazira++; else s.deeni.menNazira++; }
      if (dn==='aalima'){ if (isF) s.deeni.womenAalima++; else s.deeni.menAalima++; }
      if (dn==='mufti'){ if (isF) s.deeni.womenMufti++; else s.deeni.menMufti++; }
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
  const cls = `metric${o.hi?' hi':''}${o.sub?' sub':''}${o.f?' click':''}`;
  const plain = String(label).replace(/<[^>]*>/g,'');
  if (!o.f) return `<div class="${cls}"><span>${label}</span><b>${val}</b></div>`;
  const act = o.act || 'mlist';
  const title = esc(o.title || plain);
  return `<div class="${cls}" role="button" tabindex="0" title="${title}"
     data-act="${act}" data-f="${esc(o.f)}" data-title="${title}"><span>${label}</span><b>${val}</b></div>`;
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
      return `<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(m.relation||'')}</td><td>${esc(m.gender?tStr(m.gender):'—')}</td><td>${a===null?'':a}</td><td>${esc(m.maritalStatus?tStr(m.maritalStatus):'—')}</td><td>${esc(String(m.children||''))}</td><td>${m.disability==='yes'?'Yes':'—'}</td></tr>`;
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
    const rows = arr.map(({m,f})=>`<tr class="clickable" data-act="detail" data-id="${esc(f.id)}"><td>${esc(m.name)}</td><td>${esc(f.id)}</td><td>${esc(m.gender?tStr(m.gender):'—')}</td><td>${esc(occName(m))}</td></tr>`);
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
  return `<header class="grp-head" data-act="grp-toggle" data-g="${no}" title="Click to open full details"><span class="grp-no">${no}</span><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div></header>`;
}

function masjidHero(){
  const mj = masjidData();
  const photos = Array.isArray(mj.photos) ? mj.photos.slice(0,6) : [];
  return `
    <section class="masjid-hero">
      <div class="mh-grid">
        <div class="mh-photos">
          ${photos.length ? photos.map((p,i)=>`<button class="mh-photo ${i===0?'lead':''}" type="button" data-act="photo" data-src="${esc(p.src||p)}"><img src="${esc(p.src||p)}" alt="Masjid photo ${i+1}" loading="lazy" /></button>`).join('')
            : `<div class="mh-empty"><span class="mh-crescent">${ICON_MOON}</span><b>Masjid photos</b><span>Admin login karke Masjid Profile me photos add hongi.</span></div>`}
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
}


const CATS = [
  [1,'Location & Housing','Ghar, raste aur makan ki qism'],
  [2,'Family & Demographics','Ghar walon ki ginti, umar aur halat'],
  [3,'Education','Padhne wale bachche aur students'],
  [4,'Occupations','Kaam ke hisaab se ginti'],
  [5,'Religious Education','Aalim aur Hafiz'],
  [6,'Documents & Govt. Schemes','Documents aur scheme ka hisaab']
];

function catTile(n, title, sub, s){
  const val = n===1 ? s.houses : n===2 ? s.families : n===3 ? s.students.total : n===4 ? s.employed : n===5 ? (s.deeni.menAalim+s.deeni.menHafiz+s.deeni.womenAalim+s.deeni.womenHafiz) : s.scheme.applied;
  const unit = n===1 ? 'ghar' : n===2 ? 'families' : n===3 ? 'students' : n===4 ? 'log kaam par' : n===5 ? 'aalim / hafiz' : 'scheme li';
  return `<button class="cat-tile" type="button" data-act="goto" data-view="cat" data-param="${n}">
    <span class="ct-no">${n}</span>
    <span class="ct-body"><b>${esc(title)}</b><span class="ct-sub">${esc(sub)}</span></span>
    <span class="ct-val"><b>${val}</b><span>${esc(unit)}</span></span>
    <span class="ct-arrow">→</span>
  </button>`;
}

function publicDashboard(){
  const s = computeStats();
  const pending = (!s.families && !s.houses) ? `
      <div class="alert info" style="margin:0 0 16px">
        <span><b>Totals abhi publish nahi hue.</b> Committee jab survey save karegi, ye 6 categories bhar jaayengi — naam, phone aur pata kabhi public nahi hote.</span>
      </div>` : '';
  return `
    ${masjidHero()}
    ${pending}
    <div class="sec-title">Survey — 6 categories</div>
    <p class="muted small" style="margin:-6px 0 12px">Only totals are public. Individual household details are visible only to committee admins.</p>
    ${PUBDATA && PUBDATA.at ? `<p class="muted small" style="margin:-6px 0 12px"><span>Data updated:</span> <span>${esc(fmtDateTime(PUBDATA.at))}</span></p>` : ''}
    <div class="cat-grid">${CATS.map(([n,t,sub])=>catTile(n,t,sub,s)).join('')}</div>
    ${aboutContactBlock(masjidData())}`;
}

function viewCat(param){
  const n = Number(param) || 1;
  const s = computeStats();
  const cat = CATS.find(c=>c[0]===n) || CATS[0];
  const back = `<button class="btn ghost sm" type="button" data-act="goto" data-view="dashboard">← Dashboard</button>`;
  const tbl = (cols, rows) => rows.length ? `<div class="table-wrap small-table" style="margin-top:14px"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
  let metrics = '', extra = '';

  if (n===1){
    metrics = [['Total streets',s.streets.length],['Total houses',s.houses],['Moulding (concrete)',s.houseTypes.moulding],['Cement sheet',s.houseTypes.cement],['Palm leaf',s.houseTypes.palm],['Other / kachcha',s.houseTypes.other]].map(([l,v])=>metric(l,v)).join('');
    extra = tbl(['Street','Houses','Moulding','Cement','Palm','Other'], s.streets.map(st=>`<tr><td><b>${esc(st.name)}</b></td><td>${st.houses}</td><td>${st.moulding}</td><td>${st.cement}</td><td>${st.palm}</td><td>${st.other}</td></tr>`));
  }
  if (n===2){
    metrics = [['Total families',s.families],['Total population',s.pop],['Men',s.men.total],['Women',s.women.total],['Children (under 18)',s.children],['Married (men+women)',s.men.married+s.women.married],['Unmarried (men+women)',s.men.unmarried+s.women.unmarried],['Widow',s.women.widow],['Physically challenged',s.men.disabled+s.women.disabled]].map(([l,v])=>metric(l,v)).join('');
  }
  if (n===3){
    metrics = [['Total students',s.students.total],['Primary',s.students.primary],['Higher secondary',s.students.higher_secondary],['College',s.students.college],['Madarsa',s.students.madarsa]].map(([l,v])=>metric(l,v)).join('');
  }
  if (n===4){
    metrics = [['Members with a job',s.employed],['Different occupations',s.occupationNames]].map(([l,v])=>metric(l,v)).join('');
    extra = tbl(['Occupation','Men','Women','Total'], s.occupations.map(o=>`<tr><td><b>${esc(o.name)}</b></td><td>${o.men}</td><td>${o.women}</td><td><b>${o.total}</b></td></tr>`));
  }
  if (n===5){
    metrics = [['Nazira (men)',s.deeni.menNazira||0],['Nazira (women)',s.deeni.womenNazira||0],['Hafiz (men)',s.deeni.menHafiz],['Hafiz (women)',s.deeni.womenHafiz],['Aalim (men)',s.deeni.menAalim],['Aalim (women)',s.deeni.womenAalim],['Aalima (women)',s.deeni.womenAalima||0],['Mufti (men)',s.deeni.menMufti||0]].map(([l,v])=>metric(l,v)).join('');
  }
  if (n===6){
    metrics = [['Members with all basic documents',s.membersWithAllDocs],['Members with no basic document',s.membersWithNoDocs],['Scheme mili',s.scheme.applied],['Scheme nahi mili',s.scheme.notApplied]].map(([l,v])=>metric(l,v)).join('');
    extra = tbl(['Document','Have','Don\'t have'], BASIC_DOCS.map(([k,l])=>`<tr><td>${esc(l)}</td><td><b>${s.docs[k]}</b></td><td>${Math.max(0,s.pop-s.docs[k])}</td></tr>`))
      + tbl(['Scheme','Members'], SCHEMES.filter(([k])=>k!=='other').map(([k,l])=>`<tr><td>${esc(l)}</td><td><b>${s.scheme.counts[k]||0}</b></td></tr>`).concat(s.scheme.byName.map(([nm,c])=>`<tr><td>${esc(nm)}</td><td><b>${c}</b></td></tr>`)).concat([`<tr class="scheme-none"><td>Scheme nahi mili <span class="muted small">(koi scheme nahi)</span></td><td><b>${s.scheme.notApplied}</b></td></tr>`]));
  }

  return `<div class="page-head"><div><h1>${esc(cat[1])}</h1><p><span>${esc(cat[2])}</span> · <span>public totals</span></p></div><div class="ph-actions">${back}</div></div>
    <div class="card"><div class="metrics cols2">${metrics}</div>${extra}</div>
    <p class="muted small" style="margin-top:14px">Har ghar ki zaati tafseel (naam, umar, documents, schemes) sirf admin login ke andar hai.</p>`;
}



/* ---- clickable dashboard metrics → member / household lists ----
   Every dashboard number maps to one filter here, so the list length
   always equals the number that was clicked (deceased excluded). */
const isDead   = m => !!m.deceased;
const gOf      = m => String(m.gender||'').toLowerCase();
const msOf     = m => String(m.maritalStatus||'').toLowerCase();
const relOf    = m => String(m.religious||'').toLowerCase();
const isStudentM = m => { const e = eduKey(m), a = ageFromDob(m.dob); return !!e && e!=='none' && (a===null || a<26); };
const docsHave = m => BASIC_DOCS.filter(([k])=> (m.docs||{})[k]==='yes').length;
const mf = fn => (m) => !isDead(m) && fn(m);

window.MF = {
  all:             mf(()=>true),
  men:             mf(m=>gOf(m)==='male'),
  women:           mf(m=>gOf(m)==='female'),
  otherGender:     mf(m=>gOf(m)==='other'),
  children:        mf(m=>{ const a=ageFromDob(m.dob); return a!==null && a<18; }),
  disabled:        mf(m=>m.disability==='yes'),
  menMarried:      mf(m=>gOf(m)==='male'   && msOf(m)==='married'),
  menUnmarried:    mf(m=>gOf(m)==='male'   && msOf(m)!=='married'),
  menDisabled:     mf(m=>gOf(m)==='male'   && m.disability==='yes'),
  womenMarried:    mf(m=>gOf(m)==='female' && msOf(m)==='married'),
  womenUnmarried:  mf(m=>gOf(m)==='female' && msOf(m)!=='married'),
  womenDisabled:   mf(m=>gOf(m)==='female' && m.disability==='yes'),
  widow:           mf(m=>gOf(m)==='female' && msOf(m)==='widow'),
  students:        mf(m=>isStudentM(m)),
  allStudents:     mf(m=>isStudentM(m)),
  primary:         mf(m=>isStudentM(m) && eduKey(m)==='primary'),
  higherSecondary: mf(m=>isStudentM(m) && eduKey(m)==='higher_secondary'),
  college:         mf(m=>isStudentM(m) && eduKey(m)==='college'),
  madarsa:         mf(m=>isStudentM(m) && eduKey(m)==='madarsa'),
  employed:        mf(m=>m.employment==='employed'),
  unemployed:      mf(m=>m.employment!=='employed'),
  hasOccupation:   mf(m=>!!occName(m)),
  aalimMen:        mf(m=>gOf(m)!=='female' && (relOf(m)==='aalim' || relOf(m)==='both')),
  hafizMen:        mf(m=>gOf(m)!=='female' && (relOf(m)==='hafiz' || relOf(m)==='both')),
  aalimWomen:      mf(m=>gOf(m)==='female' && (relOf(m)==='aalim' || relOf(m)==='both')),
  hafizWomen:      mf(m=>gOf(m)==='female' && (relOf(m)==='hafiz' || relOf(m)==='both')),
  naziraMen:       mf(m=>relOf(m)==='nazira' && gOf(m)!=='female'),
  naziraWomen:     mf(m=>relOf(m)==='nazira' && gOf(m)==='female'),
  aalimaWomen:     mf(m=>relOf(m)==='aalima' && gOf(m)==='female'),
  muftiMen:        mf(m=>relOf(m)==='mufti'  && gOf(m)!=='female'),
  deeniTotal:      mf(m=>['aalim','hafiz','both'].includes(relOf(m))),
  docsAll:         mf(m=>docsHave(m)===BASIC_DOCS.length),
  docsNone:        mf(m=>docsHave(m)===0),
  schemeApplied:   mf(m=>memberSchemes(m).length>0),
  schemeNone:      mf(m=>memberSchemes(m).length===0)
};

/* parameterised filters, key format "name:argument" */
window.MFD = {
  doc:        k => mf(m=> (m.docs||{})[k]==='yes'),
  nodoc:      k => mf(m=> (m.docs||{})[k]!=='yes'),
  scheme:     k => mf(m=> !!(m.schemes && m.schemes[k]==='yes')),
  schemeName: n => mf(m=>{
    const want = String(n||'').trim().toLowerCase();
    if (!want) return false;
    const nm = String(m.schemeName||'').trim().toLowerCase();
    if (nm && nm === want) return true;
    return memberSchemes(m).some(x=> String(x).trim().toLowerCase() === want);
  }),
  occupation: n => mf(m=> occName(m).toLowerCase() === String(n).toLowerCase()),
  house:      t => (m,f)=> !isDead(m) && houseTypeKey(f && f.houseType)===t,
  street:     n => (m,f)=> !isDead(m) && streetName(f||{})===n
};

function splitFilterKey(key){
  const k = String(key||''); const i = k.indexOf(':');
  return i<0 ? [k,''] : [k.slice(0,i), k.slice(i+1)];
}
function resolveMemberFilter(key){
  const [head, arg] = splitFilterKey(key);
  if (window.MFD[head]) return window.MFD[head](arg);
  return window.MF[head] || (()=>true);
}
function resolveFamilyFilter(key){
  const [head, arg] = splitFilterKey(key);
  if (head==='house')  return f => houseTypeKey(f && f.houseType)===arg;
  if (head==='street') return f => streetName(f||{})===arg;
  return ()=>true;
}
function openList(kind, key, title){
  if (kind==='flist'){
    state.familyListFilter = resolveFamilyFilter(key);
    state.familyListTitle  = title || 'Households';
    go('familylist');
  } else {
    state.memberListFilter = resolveMemberFilter(key);
    state.memberListTitle  = title || 'Members';
    go('memberlist');
  }
}

window.filterRows = function(q, tableSel){
  try {
    const t = String(q||'').toLowerCase().trim();
    const table = document.querySelector(tableSel);
    if (!table) return;
    let shown = 0;
    Array.from(table.querySelectorAll('tbody tr')).forEach(tr=>{
      const hit = !t || tr.textContent.toLowerCase().includes(t);
      tr.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    const head = table.closest('.card').querySelector('.ph-count');
    if (head) head.textContent = shown;
  } catch(e){}
};

function viewFamilyList(filterFn, title){
  const fams = DB.families().filter(filterFn);
  const rows = fams.map(f=>{
    const n = (f.members||[]).filter(m=>String(m.name||'').trim() && !m.deceased).length;
    return `<tr>
      <td><b>${esc(f.id)}</b></td>
      <td>${esc(f.houseName||'—')}</td>
      <td>${esc(streetName(f))}</td>
      <td>${esc(f.houseNo||'—')}</td>
      <td>${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType))||'Other')}</td>
      <td>${n}</td>
      <td><button class="btn ghost sm" data-act="detail" data-id="${esc(f.id)}">View</button></td></tr>`;
  }).join('');
  return `
    <div class="page-head"><div><h1>${esc(title)}</h1><p>${fams.length} household(s) found</p></div>
      <button class="btn ghost sm" data-act="goto" data-view="dashboard">← Back to Dashboard</button></div>
    <div class="card">
      ${fams.length ? `<div class="field" style="max-width:340px;margin-bottom:12px"><input class="inp" type="search" placeholder="Family ID / ghar / street se dhoondo…" oninput="filterRows(this.value,'#flistTable')" /></div>
      <div class="table-wrap"><table id="flistTable"><thead><tr><th>Family ID</th><th>House</th><th>Street</th><th>House No</th><th>House type</th><th>Members</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
                   : '<div class="empty"><h3>No households found</h3></div>'}
    </div>`;
}

function viewMembersList(filterFn, title){
  const arr = allMembers().filter(({m,f}) => filterFn(m,f));
  const rows = arr.map(({m,f})=>{
    const addr = [f.address, f.houseNo?('House '+f.houseNo):'', streetName(f)].filter(Boolean).join(', ');
    const age = ageFromDob(m.dob);
    return `<tr>
      <td>${esc(m.name||'—')}</td>
      <td>${esc(age===null?'—':age)}</td>
      <td>${esc(m.gender?tStr(m.gender):'—')}</td>
      <td>${esc(f.id)}</td>
      <td>${esc(streetName(f))}</td>
      <td><button class="btn ghost sm" data-act="detail" data-id="${esc(f.id)}">View</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="page-head"><div><h1>${esc(title)}</h1><p>${arr.length} <span>member(s) found</span></p></div>
      <button class="btn ghost sm" data-act="goto" data-view="dashboard">← Back to Dashboard</button></div>
    <div class="card">
      ${arr.length ? `<div class="field" style="max-width:340px;margin-bottom:12px"><input class="inp" type="search" placeholder="Naam ya Family ID se dhoondo…" oninput="filterRows(this.value,'#mlistTable')" /></div>
      <div class="table-wrap"><table id="mlistTable"><thead><tr><th>Name</th><th>Age</th><th>Gender</th><th>Family ID</th><th>Street</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><h3>No members found</h3></div>'}
    </div>`;
}

function viewStreetList(){
  const s = computeStats();
  const rows = s.streets.map(st=>`<tr class="clickable" data-act="flist" data-f="street:${esc(st.name)}" data-title="${esc(st.name)} — households">
      <td><b>${esc(st.name)}</b></td><td>${st.houses}</td><td>${st.moulding}</td><td>${st.cement}</td><td>${st.palm}</td><td>${st.other}</td></tr>`).join('');
  return `
    <div class="page-head"><div><h1>All streets</h1><p>${s.streets.length} street(s) · ${s.houses} household(s)</p></div>
      <button class="btn ghost sm" data-act="goto" data-view="dashboard">← Back to Dashboard</button></div>
    <div class="card">
      ${s.streets.length ? `<div class="table-wrap street-table"><table><thead><tr><th>Street name</th><th>Houses</th><th>Moulding</th><th>Cement sheet</th><th>Palm leaf</th><th>Other</th></tr></thead><tbody>
        ${rows}
        <tr class="totals"><td>Total</td><td>${s.houses}</td><td>${s.houseTypes.moulding}</td><td>${s.houseTypes.cement}</td><td>${s.houseTypes.palm}</td><td>${s.houseTypes.other}</td></tr>
      </tbody></table></div>` : '<div class="empty"><h3>No streets yet</h3></div>'}
      <p class="muted small" style="margin-top:12px">Kisi street par tap karo → us street ke ghar dikhenge.</p>
    </div>`;
}

function viewDashboard(){
  if (!isAdmin()) return publicDashboard();
  const s = computeStats();
  const u = currentUser();
  const mj = masjidData();
  const photos = Array.isArray(mj.photos) ? mj.photos.slice(0,6) : [];
  const heroBlock = masjidHero();
  const kpis = [
    [icSmall('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'), s.streets.length, 'Total streets'],
    [icSmall('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), s.houses, 'Total houses'],
    [icSmall('<circle cx="12" cy="7" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>'), s.families, 'Total families'],
    [icSmall('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 21v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M17 5.5a3.4 3.4 0 0 1 0 6"/><path d="M18.5 21v-1a6 6 0 0 0-2-4.5"/>'), s.pop, 'Total population'],
    [icSmall('<path d="M12 5v14M5 12h14"/>'), s.events.birthMonth, 'Births this month'],
    [icSmall('<path d="M5 12h14"/>'), s.events.deathMonth, 'Deaths this month']
  ];

  const streetRows = s.streets.length ? `
    <div class="table-wrap street-table" style="margin-top:14px"><table><thead><tr><th>Street name</th><th>Houses</th><th>Moulding</th><th>Cement sheet</th><th>Palm leaf</th><th>Other</th></tr></thead><tbody>
      ${s.streets.map(st=>`<tr data-act="goto" data-view="families" data-street="${esc(st.name)}" class="clickable">
        <td><b>${esc(st.name)}</b></td><td>${st.houses}</td><td>${st.moulding}</td><td>${st.cement}</td><td>${st.palm}</td><td>${st.other}</td></tr>`).join('')}
      <tr class="totals"><td>Total</td><td>${s.houses}</td><td>${s.houseTypes.moulding}</td><td>${s.houseTypes.cement}</td><td>${s.houseTypes.palm}</td><td>${s.houseTypes.other}</td></tr>
    </tbody></table></div>` : `<p class="muted small" style="margin-top:12px">No streets yet — street names appear here as households are added.</p>`;

  const empty = s.houses ? '' : `<div class="empty" style="margin-top:18px"><div class="big">${ICON.mosque}</div><h3>No households surveyed yet</h3><p>Add the first household to get started.</p>
     <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
     ${isAdmin() ? '<button class="btn" data-act="goto" data-view="add">Add first household</button>' : ''}
     ${userRole()==='owner' ? '<button class="btn ghost" data-act="load-sample">Load sample data</button>' : ''}</div></div>`;

  const backupBanner = (isAdmin() && needsBackup()) ? `
    <div class="alert warn" style="margin:0 0 14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <span><b>Backup reminder:</b> ${esc(backupHint())} — <span>ek backup file download karke Drive me rakho.</span></span>
      <button class="btn sm" type="button" data-act="backup-json">${ICON.dl} Backup now</button>
    </div>` : '';
  return `${backupBanner}
    <div class="page-head"><div><h1>Survey Dashboard</h1><p>Complete survey of households, streets and members — live totals.</p>
      ${!isAdmin() && PUBDATA && PUBDATA.at ? `<p class="muted small"><span>Data updated:</span> <span>${esc(fmtDateTime(PUBDATA.at))}</span></p>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${userRole()==='owner'
          ? `<button class="btn ghost sm" data-act="export-excel">${ICON.dl} Excel</button>
             <button class="btn ghost sm" data-act="print-all">${ICON.print} PDF / Print</button>`
          : isAdmin() ? `<span class="badge gray">User · data entry</span>` : `<span class="badge gray">Public view · read only</span>`}
      </div></div>
    ${heroBlock}

    <div class="kpi-row">${kpis.map(k=>`<div class="stat"><div class="ic">${k[0]}</div><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('')}</div>
    ${empty}

    <div class="grp-grid">
      <section class="grp wide" data-g="1" data-act="grp-toggle">
        ${grpHead(1,'Location & Housing','Ghar aur raste ki details')}
        <div class="metrics cols2">
          ${metric('Total streets', s.streets.length, {f:'all', act:'slist', title:'All streets'})}
          ${metric('Total houses', s.houses, {f:'all', act:'flist', title:'All households'})}
          ${metric('Moulding (house type)', s.houseTypes.moulding, {f:'house:moulding', act:'flist', title:'Moulding houses'})}
          ${metric('Cement sheet (house type)', s.houseTypes.cement, {f:'house:cement', act:'flist', title:'Cement sheet houses'})}
          ${metric('Palm leaf (house type)', s.houseTypes.palm, {f:'house:palm', act:'flist', title:'Palm leaf houses'})}
          ${metric('Other / kachcha (house type)', s.houseTypes.other, {f:'house:other', act:'flist', title:'Other / kachcha houses'})}
        </div>
        ${streetRows}
      </section>

      <section class="grp wide" data-g="2" data-act="grp-toggle">
        ${grpHead(2,'Family & Demographics','Ghar walon ki details')}
        <div class="metrics cols2">
          ${metric('Total families', s.families, {f:'all', act:'flist', title:'All households'})}
          ${metric('Total population', s.pop, {f:'all', title:'All members'})}
          ${metric('Children (under 18)', s.children, {f:'children', title:'Children (under 18)'})}
          ${metric('Physically challenged (total)', s.men.disabled + s.women.disabled, {f:'disabled', title:'Physically challenged — all'})}
        </div>
        <div class="split">
          <div class="split-col">
            <h3>Men <span class="pill" role="button" tabindex="0" data-act="mlist" data-f="men" data-title="All men">${s.men.total}</span></h3>
            ${metric('Married', s.men.married, {f:'menMarried', title:'Married men'})}
            ${metric('Unmarried', s.men.unmarried, {f:'menUnmarried', title:'Unmarried men'})}
            ${metric('Physically challenged', s.men.disabled, {f:'menDisabled', title:'Physically challenged men'})}
          </div>
          <div class="split-col">
            <h3>Women <span class="pill" role="button" tabindex="0" data-act="mlist" data-f="women" data-title="All women">${s.women.total}</span></h3>
            ${metric('Married', s.women.married, {f:'womenMarried', title:'Married women'})}
            ${metric('Unmarried', s.women.unmarried, {f:'womenUnmarried', title:'Unmarried women'})}
            ${metric('Physically challenged', s.women.disabled, {f:'womenDisabled', title:'Physically challenged women'})}
            ${metric('Widow', s.women.widow, {f:'widow', title:'Widows'})}
          </div>
        </div>
      </section>

      <section class="grp" data-g="3" data-act="grp-toggle">
        ${grpHead(3,'Education','Total child / students')}
        <div class="metrics">
          ${metric('Total students', s.students.total, {hi:true, f:'students', title:'All Students'})}
          ${metric('Primary students', s.students.primary, {f:'primary', title:'Primary Students'})}
          ${metric('Higher secondary students', s.students.higher_secondary, {f:'higherSecondary', title:'Higher Secondary Students'})}
          ${metric('College students', s.students.college, {f:'college', title:'College Students'})}
          ${metric('Madarsa students', s.students.madarsa, {f:'madarsa', title:'Madarsa Students'})}
        </div>
      </section>

      <section class="grp wide" data-g="4" data-act="grp-toggle">
        ${grpHead(4,'Occupations','Kaam ke hisaab se ginti — plumber, electrician, painter, helper…')}
        <div class="metrics cols2">
          ${metric('Members with a job', s.employed, {hi:true, f:'employed', title:'Members with a job'})}
          ${metric('Different occupations', s.occupationNames, {f:'hasOccupation', title:'Members with an occupation'})}
        </div>
        ${s.occupations.length ? `<div class="table-wrap small-table" style="margin-top:14px"><table>
          <thead><tr><th>Occupation</th><th>Men</th><th>Women</th><th>Total</th></tr></thead><tbody>
          ${s.occupations.map(o=>`<tr class="clickable" data-act="mlist" data-f="occupation:${esc(o.name)}" data-title="${esc(o.name)} — members"><td><b>${esc(o.name)}</b></td><td>${o.men}</td><td>${o.women}</td><td><b>${o.total}</b></td></tr>`).join('')}
          </tbody></table></div>` : `<p class="muted small" style="margin-top:12px">Abhi kisi ka occupation nahi bhara — member form me "Kaam / occupation" likho (jaise Plumber).</p>`}
      </section>

      <section class="grp wide" data-g="5" data-act="grp-toggle">
        ${grpHead(5,'Religious Education','Deeni taleem — Aalim & Hafiz')}
        <div class="metrics cols2">
          ${metric('Men Aalim', s.deeni.menAalim, {f:'aalimMen', title:'Men Aalim'})}
          ${metric('Men Hafiz', s.deeni.menHafiz, {f:'hafizMen', title:'Men Hafiz'})}
          ${metric('Women Aalim', s.deeni.womenAalim, {f:'aalimWomen', title:'Women Aalim'})}
          ${metric('Women Hafiz', s.deeni.womenHafiz, {f:'hafizWomen', title:'Women Hafiz'})}
        </div>
        <div class="metrics" style="margin-top:10px">
          ${metric('Total Aalim & Hafiz (men + women)', s.deeni.menAalim + s.deeni.menHafiz + s.deeni.womenAalim + s.deeni.womenHafiz, {hi:true, f:'deeniTotal', title:'Total Aalim & Hafiz'})}
        </div>
        <div class="metrics cols2" style="margin-top:10px">
          ${metric('Nazira (men)', s.deeni.menNazira||0, {f:'naziraMen', title:'Nazira (men)'})}
          ${metric('Nazira (women)', s.deeni.womenNazira||0, {f:'naziraWomen', title:'Nazira (women)'})}
          ${metric('Aalima (women)', s.deeni.womenAalima||0, {f:'aalimaWomen', title:'Aalima (women)'})}
          ${metric('Mufti (men)', s.deeni.menMufti||0, {f:'muftiMen', title:'Mufti (men)'})}
        </div>
      </section>

      <section class="grp wide" data-g="6" data-act="grp-toggle">
        ${grpHead(6,'Documents & Govt. Schemes','Kitne logon ke paas documents hain · kitne ne scheme li')}
        <div class="metrics cols2">
          ${metric('Members with all basic documents', s.membersWithAllDocs, {f:'docsAll', title:'Members with all basic documents'})}
          ${metric('Members with no basic document', s.membersWithNoDocs, {f:'docsNone', title:'Members with no basic document'})}
          ${metric('Scheme mili', s.scheme.applied, {f:'schemeApplied', title:'Scheme mili'})}
          ${metric('Scheme nahi mili', s.scheme.notApplied, {f:'schemeNone', title:'Scheme nahi mili'})}
        </div>
        <div class="table-wrap small-table" style="margin-top:14px"><table>
          <thead><tr><th>Document</th><th>Have</th><th>Don't have</th></tr></thead><tbody>
          ${BASIC_DOCS.map(([k,l])=>`<tr><td>${esc(l)}</td>
            <td><b class="lnk" role="button" tabindex="0" data-act="mlist" data-f="doc:${esc(k)}" data-title="${esc(l)} — have">${s.docs[k]}</b></td>
            <td><b class="lnk" role="button" tabindex="0" data-act="mlist" data-f="nodoc:${esc(k)}" data-title="${esc(l)} — don't have">${Math.max(0, s.pop - s.docs[k])}</b></td></tr>`).join('')}
          </tbody></table></div>
        <div class="sec-title" style="margin:16px 0 4px;font-size:.88rem">Scheme-wise count</div>
        <div class="table-wrap small-table"><table>
          <thead><tr><th>Scheme</th><th>Members</th></tr></thead><tbody>
          ${SCHEMES.filter(([k])=>k!=='other').map(([k,l])=>`<tr class="clickable" data-act="mlist" data-f="scheme:${esc(k)}" data-title="${esc(l)}"><td>${esc(l)}</td><td><b>${s.scheme.counts[k]||0}</b></td></tr>`).join('')}
          ${s.scheme.byName.map(([nm,n])=>`<tr class="clickable" data-act="mlist" data-f="schemeName:${esc(nm)}" data-title="${esc(nm)}"><td>${esc(nm)}</td><td><b>${n}</b></td></tr>`).join('')}
          <tr class="clickable scheme-none" data-act="mlist" data-f="schemeNone" data-title="Scheme nahi mili — members">
            <td>Scheme nahi mili <span class="muted small">(koi scheme nahi)</span></td><td><b>${s.scheme.notApplied}</b></td></tr>
          </tbody></table></div>
        ${!s.scheme.applied ? '<p class="muted small" style="margin-top:10px">Abhi koi scheme mark nahi hui — member form me scheme chips tap karo.</p>' : ''}
      </section>
    </div>
    ${aboutContactBlock(mj)}`;
}

function aboutContactBlock(mj){
  const owner = DB.admins()[0] || null;
  const yr = new Date().getFullYear();
  const name = mj.name || CFG.ORG_NAME || 'Masjid e Mohammadi';
  const sub = CFG.ORG_SUB || 'Khidmath Committee';
  const phone = String(mj.phone||'').trim();
  const tel = phone.replace(/[^\d+]/g,'');
  const email = String(mj.email||'').trim();
  const addr = String(mj.address||'').trim();
  const ownerName = owner ? (owner.name || String(owner.email||'').split('@')[0]) : 'Committee admin';
  const ownerMail = owner ? OwnerEmail(owner) : '';
  return `
    <div class="ac-grid">
      <section class="ac-card" id="about">
        <div class="ac-kicker">About</div>
        <h2>${esc(name)}</h2>
        <p>${mj.note ? esc(mj.note) : `<span>${esc(name)}</span> ke mohalle ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka poora hisaab.`}</p>
        ${mj.established?`<p class="ac-line"><b>Qayam:</b> ${esc(mj.established)}</p>`:''}
        ${mj.imam?`<p class="ac-line"><b>Imam:</b> ${esc(mj.imam)}</p>`:''}
        ${mj.madrasa?`<p class="ac-line"><b>Madrasa:</b> ${esc(mj.madrasa)}</p>`:''}
      </section>
      <section class="ac-card" id="contact">
        <div class="ac-kicker">Contact</div>
        <h2>Rabta karo</h2>
        <ul class="ac-list">
          <li><span>Masjid phone</span>${phone?`<a href="tel:${esc(tel)}">${esc(phone)}</a>`:'<em>admin add karega</em>'}</li>
          <li><span>Masjid email</span>${email?`<a href="mailto:${esc(email)}">${esc(email)}</a>`:'<em>admin add karega</em>'}</li>
          <li><span>Address</span>${addr?`<a href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${esc(addr)}</a>`:'<em>admin add karega</em>'}</li>
          <li><span>Admin</span><span class="ac-admin"><b>${esc(ownerName)}</b>${ownerMail?` · <a href="mailto:${esc(ownerMail)}">${esc(ownerMail)}</a>`:''}</span></li>
        </ul>
      </section>
    </div>
    <footer class="site-foot">
      <span>© ${yr} ${esc(name)} · ${esc(sub)} — <span>All rights reserved.</span></span>
      <span class="small">Survey data sirf committee ke records ke liye · public view read-only</span>
    </footer>`;
}
function OwnerEmail(o){ return String(o && o.email || '').trim(); }

/* ============================================================
   HOUSEHOLDS LIST
   ============================================================ */
function viewFamilies(){
  const fams = DB.families();
  if (!fams.length) return emptyFamilies();
  const streets = Array.from(new Set(fams.map(streetName))).sort();
  const pre = state.param ? esc(state.param) : '';
  return `
    <div class="page-head"><div><h1>Households</h1><p>${fams.length} <span>households on record.</span></p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${userRole()==='owner'?`<button class="btn ghost sm" data-act="export-excel">${ICON.dl} Excel</button><button class="btn ghost sm" data-act="print-all">${ICON.print} PDF</button>`:''}${isAdmin()?`<button class="btn sm" data-act="goto" data-view="add">+ Add Household</button>`:''}</div></div>
    <div class="toolbar">
      <input class="inp grow" id="famSearch" placeholder="Search household, Family ID, phone, street…" />
      <select class="inp" id="famStreetF" style="max-width:200px"><option value="">All streets</option>${streets.map(st=>`<option ${pre===st?'selected':''}>${esc(st)}</option>`).join('')}</select>
      <select class="inp" id="famGenderF" style="max-width:170px"><option value="">All genders</option>${GENDERS.map(g=>`<option value="${g}">${esc(tStr(g))}</option>`).join('')}</select>
      <select class="inp" id="famMaritalF" style="max-width:190px"><option value="">All marital status</option>${MARITAL.map(x=>`<option value="${x}">${esc(tStr(x))}</option>`).join('')}</select>
    </div>
    <div id="famListWrap"></div>`;
}
function emptyFamilies(){
  return `<div class="page-head"><div><h1>Households</h1><p>No households on record yet.</p></div></div>
    <div class="card"><div class="empty"><div class="big">${ICON.clipboard}</div><h3>Start the survey</h3><p>Add your first household, or load sample data to explore.</p>
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
  wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Family ID</th><th>Household</th><th>Street</th><th>Type</th><th>Members</th><th>Phone</th><th>Updated</th><th></th></tr></thead><tbody>
    ${rows.map(f=>`<tr>
      <td><span class="mono">${esc(f.id)}</span></td>
      <td>${esc(f.houseName||'—')}${f.houseNo?` <span class="muted small">· ${esc(f.houseNo)}</span>`:''}</td>
      <td>${esc(streetName(f))}</td>
      <td><span class="badge gray">${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType))||'Other')}</span></td>
      <td>${(f.members||[]).length}</td>
      <td>${esc(f.phone||'—')}</td>
      <td class="muted small" style="white-space:nowrap">${esc(fmtDateTime(f.updatedAt||f.createdAt))}</td>
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
function blankMember(){ return { relation:'', name:'', fatherName:'', motherName:'', gender:'Male', dob:'', educationLevel:'', occupation:'', religious:'', maritalStatus:'Unmarried', children:'', disability:'no', schemes:{}, schemeName:'', docs:{}, employment:'unemployed', deceased:false, deceasedDate:'' }; }

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
  if (!list.length && m.govtScheme==='yes') list.push(String(m.schemeName||'').trim() || LEGACY_SCHEME_LABEL);
  return list;
}
function blankDraft(){
  return { id:null, customId:'', houseName:'', houseNo:'', street:'', houseType:'moulding', address:'', phone:'', notes:'',
    members:[ blankMember() ],
    docs: Object.fromEntries(DOC_TYPES.map(d=>[d[0],'no'])),
    custom: [] };
}
function streetOptions(current){
  const streets = Array.from(new Set(DB.families().map(streetName).filter(x=>x && x!=='Unassigned'))).sort();
  if (current && !streets.includes(current)) streets.push(current);
  return streets.map(s=>`<option value="${esc(s)}"></option>`).join('');
}

function viewFamilyForm(){
  state.docsOpen = false;
  if (!state.draft) {
    // try draft
    if (isAdmin() && !state.param){
      try {
        const saved = loadFormDraft();
        if (saved && saved.draft && !saved.draft.id){
          const age = Date.now() - (saved.ts||0);
          if (age < 24*60*60*1000){
            state.draft = saved.draft;
          }
        }
      } catch(e){}
    }
    if (!state.draft) state.draft = blankDraft();
  }
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
          <label>Family ID ${editing?'':'<span class="hint" style="font-weight:400">— <span>optional, leave empty for auto-generate</span></span>'}</label>
          ${editing
            ? `<input class="inp" value="${esc(d.id)}" readonly />`
            : `<input class="inp" data-field="customId" value="${esc(d.customId||'')}" placeholder="Auto: ${esc(previewFamilyId())}" />
               <span class="hint">Custom ID likho ya khaali chhod do — system khud ID de dega. QR isi ID se banta hai.</span>`}
        </div>
        <div class="field" style="margin-top:12px"><label>Address / landmark</label><input class="inp" data-field="address" value="${esc(d.address)}" placeholder="Mohalla, gali, landmark" /></div>
        <div class="field" style="margin-top:12px"><label>Notes (optional)</label><textarea class="inp" data-field="notes" placeholder="Any remark about this household">${esc(d.notes)}</textarea></div>
      </div>

      <div class="sec-title">2 · Members</div>
      <div id="membersWrap"></div>
      <button type="button" class="btn ghost sm" data-act="add-member">+ Add member</button>

      <div class="sec-title">Documents held</div>
      <div class="card">
        <p class="muted small" style="margin-bottom:12px">Jo document ghar ke paas hai wahi list me dikhega. Naya add karne ke liye "+ Add document" dabao.</p>
        <div id="docsList"></div>
        <div id="docsPicker"></div>
        <button type="button" class="btn ghost sm" data-act="add-doc" style="margin-top:12px">+ Add document</button>

        <div class="sec-title" style="font-size:14px;margin-top:18px">Additional Documents</div>
        <p class="muted small" style="margin-bottom:8px">Jo list me nahi hai (jaise Caste Certificate) — yahan apne naam se add karo.</p>
        <div id="customDocsList"></div>
        <button type="button" class="btn ghost sm" data-act="add-custom-doc" style="margin-top:10px">+ Add custom document</button>
      </div>

      <div id="formAlert" style="margin-top:14px"></div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn" type="submit">${editing?'Save changes':'Save & generate Family ID'}</button>
        ${editing?'':'<button class="btn ghost" type="button" data-act="save-next">Save &amp; add another</button>'}
        <button class="btn ghost" type="button" data-act="goto" data-view="families">Cancel</button>
      </div>
    </form>`;
}
function segHTML(value, key){
  return `<div class="seg" data-doc="${key}">
    <button type="button" data-v="yes" class="${value==='yes'?'on':''}">Yes</button>
    <button type="button" data-v="no" class="${value!=='yes'?'on':''}">No</button></div>`;
}

/* documents: sirf jo mark hain wahi dikhte hain, baaki picker me */
function renderDocs(){
  const list = $('#docsList'); if (!list || !state.draft) return;
  const d = state.draft; d.docs = d.docs || {};
  const on = DOC_TYPES.filter(([k])=> d.docs[k]==='yes');
  list.innerHTML = on.length
    ? `<div class="doc-grid">${on.map(([k,l])=>`
        <div class="doc-row"><span class="nm">${esc(l)}</span>
          <button type="button" class="btn ghost sm" data-act="unpick-doc" data-key="${esc(k)}" style="color:var(--danger)">Remove</button>
        </div>`).join('')}</div>`
    : `<div class="empty-mini">Abhi koi document add nahi hua.</div>`;

  const pick = $('#docsPicker');
  if (!pick) return;
  if (!state.docsOpen){ pick.innerHTML = ''; return; }
  const rest = DOC_TYPES.filter(([k])=> d.docs[k]!=='yes');
  pick.innerHTML = rest.length
    ? `<div class="docs-pick">
         <div class="dp-head">Kaunsa document add karna hai? <button type="button" class="btn ghost sm" data-act="close-docs">Close</button></div>
         <div class="dp-chips">${rest.map(([k,l])=>`<button type="button" data-act="pick-doc" data-key="${esc(k)}">+ ${esc(l)}</button>`).join('')}</div>
       </div>`
    : `<div class="docs-pick"><div class="dp-head">Saare documents already add ho chuke hain. <button type="button" class="btn ghost sm" data-act="close-docs">Close</button></div></div>`;
}

function renderCustomDocs(){
  const wrap = $('#customDocsList'); if(!wrap || !state.draft) return;
  if(!Array.isArray(state.draft.custom)) state.draft.custom = [];
  if(state.draft.custom.length === 0) {
    wrap.innerHTML = '<div class="empty-mini">Koi additional document nahi.</div>';
    return;
  }
  wrap.innerHTML = state.draft.custom.map((c,i)=>`
    <div class="member-card" style="margin-top:10px;padding:12px">
      <div class="member-head">
        <span class="idx">Document ${i+1}${c.label?' · '+esc(c.label):''}</span>
        <button type="button" class="btn ghost sm" data-act="remove-custom-doc" data-ci="${i}" style="color:var(--danger)">Remove</button>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div class="field"><label>Document Name</label><input class="inp" data-field="customLabel" data-ci="${i}" value="${esc(c.label||'')}" placeholder="e.g. Caste Certificate" /></div>
        <div class="field"><label>Status</label>${segHTML(c.value||'no', 'custom:'+i)}</div>
      </div>
    </div>
  `).join('');
}

function renderMembers(){
  const wrap = $('#membersWrap'); if(!wrap) return;
  wrap.innerHTML = state.draft.members.map((m,i)=>{
    const edu = eduKey(m);
    const age = ageFromDob(m.dob);
    const isChild = (age !== null && age >= 0 && age <= 5);
    const isStudent = String(occName(m)||'').toLowerCase().includes('student');
    return `
    <div class="member-card">
      <div class="member-head">
        <span class="idx">Member ${i+1}${m.name?' · '+esc(m.name):''}</span>
        ${state.draft.members.length>1 ? `<button type="button" class="btn ghost sm" data-act="remove-member" data-idx="${i}" style="color:var(--danger)">Remove</button>` : ''}
      </div>
      <div class="member-grid">
        <div class="field"><label>Full name *</label><input class="inp" data-field="m.name" data-idx="${i}" value="${esc(m.name)}" /></div>
        <div class="field"><label>Relation to head</label><input class="inp" data-field="m.relation" data-idx="${i}" value="${esc(m.relation)}" placeholder="Self / Wife / Son…" /></div>
        <div class="field"><label>Gender</label><select class="inp" data-field="m.gender" data-idx="${i}">${GENDERS.map(g=>`<option value="${g}" ${m.gender===g?'selected':''}>${esc(tStr(g))}</option>`).join('')}</select></div>
        <div class="field"><label>Date of birth</label><input class="inp" type="date" data-field="m.dob" data-idx="${i}" value="${esc(m.dob)}" /></div>
        <div class="field"><label>Marital status</label><select class="inp" data-field="m.maritalStatus" data-idx="${i}">${MARITAL.map(x=>`<option value="${x}" ${m.maritalStatus===x?'selected':''}>${esc(tStr(x))}</option>`).join('')}</select></div>
        <div class="field m-children" style="display:${(m.maritalStatus||'')==='Married'?'block':'none'}"><label>Number of children</label><input class="inp" inputmode="numeric" data-field="m.children" data-idx="${i}" value="${esc(m.children||'')}" placeholder="0"/></div>
        <div class="field child-hide-edu" style="display:${(isChild||isStudent)?'none':'block'}"><label>Education</label><select class="inp edu-sel" data-field="m.educationLevel" data-idx="${i}">
          ${EDU.map(([k,l])=>`<option value="${k}" ${edu===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field child-hide-occ" style="display:${(isChild||isStudent)?'none':'block'}"><label>Kaam / occupation</label>
          <input class="inp" data-field="m.occupation" data-idx="${i}" list="occList" value="${esc(occName(m))}" placeholder="Plumber, Electrician, Painter, Helper…" /></div>
        <div class="field child-hide-occ" style="display:${(isChild||isStudent)?'none':'block'}"><label>Employment status</label><select class="inp" data-field="m.employment" data-idx="${i}">
          <option value="unemployed" ${(m.employment||'unemployed')==='unemployed'?'selected':''}>Unemployed</option>
          <option value="employed" ${(m.employment||'')==='employed'?'selected':''}>Employed</option>
        </select></div>
        <div class="field child-hide-deeni" style="display:${(isChild||isStudent)?'none':'block'}"><label>Deeni taleem</label><select class="inp" data-field="m.religious" data-idx="${i}">
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
  const alive = members.filter(m=>!isDead(m));
  const men = alive.filter(m=>m.gender==='Male').length;
  const women = alive.filter(m=>m.gender==='Female').length;
  return `
    <div class="page-head"><div><h1>${esc(f.houseName||'Household')}</h1><p class="one-line">${esc(streetName(f))}${f.houseNo?' · <span>House</span> '+esc(f.houseNo):''} · ${alive.length} <span>member(s)</span>${canEdit?'':' · <span>public view (phone hidden)</span>'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${userRole()==='owner'?`<button class="btn ghost sm" data-act="print-family" data-id="${esc(f.id)}">${ICON.print} PDF</button>`:''}
        ${userRole()==='owner'?`<button class="btn ghost sm" data-act="print-idcards" data-id="${esc(f.id)}">${ICON.id||ICON.print} ID Cards</button>`:''}
        <button class="btn ghost sm" data-act="goto" data-view="families">← Back</button>
        ${canEdit?`<button class="btn sm" data-act="edit-family" data-id="${esc(f.id)}">Edit</button>`:''}
      </div></div>

    <div class="card" style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap">
      <div class="qr-panel">
        <div class="qr-box" id="qrBox"></div>
        <div><div class="muted small">FAMILY ID</div><div class="fid">${esc(f.id)}</div>
        <div class="muted small" style="margin-top:6px">Scan QR to open edit form after admin login. QR contains Family ID.</div></div>
      </div>
      <div style="min-width:240px;flex:1">
        <div class="kv">
          <div class="row"><span>Street</span><span>${esc(streetName(f))}</span></div>
          <div class="row"><span>House no.</span><span>${esc(f.houseNo||'—')}</span></div>
          <div class="row"><span>House type</span><span>${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)))}</span></div>
          <div class="row"><span>Phone</span><span>${canEdit?esc(f.phone||'—'):esc(maskPhone(f.phone))}</span></div>
          <div class="row"><span>Address</span><span>${esc(f.address||'—')}</span></div>
          <div class="row"><span>Members</span><span>${alive.length} · ${men} <span>men</span> · ${women} <span>women</span></span></div>
          <div class="row"><span>Registered</span><span>${esc(fmtDateTime(f.createdAt))}${f.createdBy?' · '+esc(f.createdBy):''}</span></div>
          <div class="row"><span>Last updated</span><span>${esc(fmtDateTime(f.updatedAt||f.createdAt))}${f.updatedBy?' · '+esc(f.updatedBy):''}</span></div>
        </div>
      </div>
    </div>

    <div class="sec-title">Members</div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Occupation</th><th>Deeni</th><th>Marital</th><th>Docs</th><th>Schemes</th><th>Challenged</th></tr></thead><tbody>
      ${members.map((m,i)=>{ const a=ageFromDob(m.dob); const md=m.docs||{}; const dc=BASIC_DOCS.filter(([k])=>md[k]==='yes').length; return `<tr>
        <td>${i+1}</td><td>${esc(m.name||'—')}</td><td>${esc(m.relation||'—')}</td><td>${esc(m.gender?tStr(m.gender):'—')}</td>
        <td>${a===null?'—':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'—')}</td><td>${esc(occName(m)||'—')}</td>
        <td>${esc(DEENI_LABEL[m.religious]||'—')}</td><td>${esc(m.maritalStatus?tStr(m.maritalStatus):'—')}</td>
        <td><span class="badge ${dc===BASIC_DOCS.length?'':'gray'}">${dc}/${BASIC_DOCS.length}</span></td>
        <td>${memberSchemes(m).length ? esc(memberSchemes(m).join(', ')) : '<span class="muted">—</span>'}</td>
        <td>${m.disability==='yes'?'Yes':'No'}</td></tr>`; }).join('')}
    </tbody></table></div>

    <div class="sec-title">Documents held</div>
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${[].concat(docsYes, customYes).length ? [].concat(docsYes,customYes).map(x=>`<span class="badge badge-ic">${ICON.check} ${esc(x)}</span>`).join('') : '<span class="muted">No documents marked.</span>'}
      </div>
    </div>
    ${f.notes?`<div class="sec-title">Notes</div><div class="card">${esc(f.notes)}</div>`:''}`;
}

/* ============================================================
   USERS (super admin)
   ============================================================ */

/* ============================================================
   SETTINGS
   ============================================================ */
/* ============================== i18n (Hinglish / English / Tamil) ==============================
   Approach: the Hinglish strings already in the UI are the KEYS. A dictionary maps each
   key to English / Tamil, and translateTree() rewrites the live text nodes. No build step,
   no data-i18n attributes to maintain — new strings simply stay Hinglish until added here. */
const LANGS = [['en','English'],['hi','Hinglish'],['ta','Tamil'],['ur','Urdu']];
const I18N = {
  en: {
    'Add Household':'Add Household',
    'Edit Household':'Edit Household',
    'Survey Dashboard':'Survey Dashboard',
    'Survey Category':'Survey Category',
    'Household Record':'Household Record',
    'Public view':'Public view',
    'Admin login':'Admin login',
    'Admin mode · you can add and edit':'Admin mode · you can add and edit',
    'Public view · read only':'Public view · read only',
    'Admin login / create admin':'Admin login / create admin',
    'Complete survey of households, streets and members — live totals.':'Every house, street and person in the mohalla — live totals.',
    'No households surveyed yet':'No households surveyed yet',
    'Add the first household to get started.':'Add the first household, or load sample data to see the dashboard.',
    'Add first household':'Add first household',
    'Load sample data':'Load sample data',
    'Ghar aur raste ki details':'Houses and streets',
    'Ghar walon ki details':'Family details',
    'Padhne wale bachche aur students':'Children and students',
    'Kaam ke hisaab se ginti':'Counted by occupation',
    'Aalim aur Hafiz':'Aalim and Hafiz',
    'Documents aur scheme ka hisaab':'Documents and schemes',
    'Ghar, raste aur makan ki qism':'Houses, streets and house type',
    'Ghar walon ki ginti, umar aur halat':'Family count, age and status',
    'Survey — 6 categories':'Survey — 6 categories',
    'Only totals are public. Individual household details are visible only to committee admins.':'Only totals are public. Each household\u2019s private detail stays with the committee admin.',
    'public totals':'public totals',
    'Har ghar ki zaati tafseel (naam, umar, documents, schemes) sirf admin login ke andar hai.':'Private household details (name, age, documents, schemes) are inside admin login only.',
    'ghar':'houses',
    'families':'families',
    'students':'students',
    'log kaam par':'people working',
    'aalim / hafiz':'aalim / hafiz',
    'scheme li':'on a scheme',
    'Moulding (concrete)':'Moulding (concrete)',
    'Cement sheet':'Cement sheet',
    'Palm leaf':'Palm leaf',
    'Other / kachcha':'Other / kachcha',
    'Total streets':'Total streets',
    'Total houses':'Total houses',
    'Total families':'Total families',
    'Total population':'Total population',
    'Total students':'Total students',
    'Total':'Total',
    'Street':'Street',
    'Street name':'Street name',
    'Houses':'Houses',
    'Moulding':'Moulding',
    'Cement':'Cement',
    'Palm':'Palm',
    'Other':'Other',
    'Men':'Men',
    'Women':'Women',
    'Primary':'Primary',
    'Higher secondary':'Higher secondary',
    'College':'College',
    'Madarsa':'Madarsa',
    'Married (men+women)':'Married (men+women)',
    'Unmarried (men+women)':'Unmarried (men+women)',
    'Widow':'Widow',
    'Physically challenged':'Physically challenged',
    'Children (under 18)':'Children (under 18)',
    'Members with a job':'Members with a job',
    'Different occupations':'Different occupations',
    'Occupation':'Occupation',
    'Members':'Members',
    'Document':'Document',
    'Have':'Have',
    "Don't have":"Don't have",
    'Scheme':'Scheme',
    'Members with all basic documents':'Members with all basic documents',
    'Members with no basic document':'Members with no basic document',
    'Scheme applied':'Scheme applied',
    'Scheme not applied':'Scheme not applied',
    'Scheme mili':'Scheme received',
    'Scheme nahi mili':'No scheme received',
    'Aalim (men)':'Aalim (men)',
    'Hafiz (men)':'Hafiz (men)',
    'Aalim (women)':'Aalim (women)',
    'Hafiz (women)':'Hafiz (women)',
    'About':'About',
    'Contact':'Contact',
    'Rabta karo':'Get in touch',
    'Masjid phone':'Masjid phone',
    'Masjid email':'Masjid email',
    'Address':'Address',
    'Admin':'Admin',
    'admin add karega':'admin will add',
    'Qayam':'Established',
    'Pata':'Address',
    'Imam':'Imam',
    'Raqba':'Area',
    'Capacity':'Capacity',
    'Masjid photos':'Masjid photos',
    'Admin login karke Masjid Profile me photos add hongi.':'Log in as admin to add photos in Masjid Profile.',
    'Masjid profile edit karo':'Edit masjid profile',
    'ke mohalle ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka poora hisaab.':'survey of the mohalla — every house, every person, education, work and religious service in one place.',
    'Survey data sirf committee ke records ke liye · public view read-only':'Survey data is for committee records only · public view is read-only',
    'Sirf committee admin ke liye. Baaki sab public dashboard dekh sakte hain.':'For committee admin only. Everyone else can view the public dashboard.',
    'Email ID':'Email ID',
    'User ID / Email':'User ID / Email',
    'Request access':'Request access',
    'Request admin access':'Request admin access',
    'Create first admin':'Create first admin',
    'Login ID ya registered email — dono chalega':'User ID or registered email — both work',
    'Password':'Password',
    'Captcha — answer the sum':'Captcha — answer the sum',
    'Answer':'Answer',
    'Login':'Login',
    'Email link se login (password ke bina)':'Log in with an email link (no password)',
    'Forgot password?':'Forgot password?',
    'Create admin':'Create admin',
    'New captcha':'New captcha',

    /* --- English gaps (v85) --- */
    '— none / Quran nahi seekha —':'— none / not studied —',
    'Admins, settings aur account.':'Admins, settings and account.',
    'Naye admins sirf owner approve kar sakta hai.':'Only the owner can approve new admins.',
    'Koi pending request nahi.':'No pending requests.',
    'Drive setup baaki — config.js me GOOGLE_CLIENT_ID daalo (guide Settings me).':'Drive setup pending — add GOOGLE_CLIENT_ID in config.js (guide in Settings).',
    'Owner details lock hain, change nahi ho sakte.':'Owner details are locked and cannot be changed.',
    'Add / Change photo (Gallery)':'Add / change photo (gallery)',
    '(koi scheme nahi)':'(no scheme)',
    'Kabhi backup nahi liya — ek backup file download karke Drive me rakho.':'No backup taken yet — download a backup file and keep it in Drive.',
    'ek backup file download karke Drive me rakho.':'download a backup file and keep it in Drive.',
    'Mohalla ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka hisaab ek jagah.':'Mohalla survey — every house, every person, education, work and religious service in one place.',
    'Kaam ke hisaab se ginti — plumber, electrician, painter, helper…':'Counts by occupation — plumber, electrician, painter, helper…',
    'Deeni taleem — Aalim & Hafiz':'Religious education — Aalim & Hafiz',
    'Kitne logon ke paas documents hain · kitne ne scheme li':'Who holds documents · who received a scheme',
    'Custom ID likho ya khaali chhod do — system khud ID de dega. QR isi ID se banta hai.':'Enter a custom ID or leave it blank — the system generates one. The QR is built from this ID.',
    'Kaam / occupation':'Work / occupation',
    'Deeni taleem':'Religious education',
    'Tap karke on/off karo — jo document jiske paas hai.':'Tap to switch on/off — the document that person holds.',
    'Jitni scheme milti hai utni tap karo. "Other scheme" chuna to niche naam likho.':'Tap every scheme the family receives. If you pick "Other scheme", type the name below.',
    '"Other scheme" ka naam':'"Other scheme" name',
    'Jo document ghar ke paas hai wahi list me dikhega. Naya add karne ke liye "+ Add document" dabao.':'Only documents the household holds are listed. Tap "+ Add document" to add one.',
    'Abhi koi document add nahi hua.':'No document added yet.',
    'Jo list me nahi hai (jaise Caste Certificate) — yahan apne naam se add karo.':'Anything not in the list (e.g. Caste Certificate) — add it here with your own name.',
    'Koi additional document nahi.':'No additional document.',
    'Phone number daalo ya QR scan karo — sirf usi ghar ka read-only detail dikhega (edit nahi).':'Enter a phone number or scan a QR — it shows that household only, read-only (no editing).',
    'Family ID daalo aur details dekho (sirf read-only).':'Enter a Family ID to view details (read-only).',
    'Camera ya gallery se QR scan karke Family ID se details khol do.':'Scan a QR from camera or gallery to open that Family ID.',
    'Masjid ki tafseel, imam/muazzin, tasveerein — report ke saath print hoti hain.':'Masjid details, imam/muazzin and photos — printed with the report.',
    'Masjid ki poori tafseel aur tasveerein — survey report ke saath chhapti hain.':'Full masjid details and photos — printed with the survey report.',
    'Masjid ka naam':'Masjid name',
    'Masjid ka email ID':'Masjid email',
    'Imam sahab ka naam':'Imam name',
    'Muazzin ka naam':'Muazzin name',
    'Masjid ki tasveerein':'Masjid photos',
    'har photo phone me hi save hoti hai':'each photo stays on this phone',
    'Abhi koi photo nahi':'No photo yet',
    'Gallery se chuno':'Choose from gallery',
    'Photo apne aap chhoti (compress) ho jati hai, isliye data bhi kam jagah leta hai.':'Photos are compressed automatically, so they take little space.',
    'e.g. 60 bachche, 3 ustad':'e.g. 60 students, 3 teachers',
    'Tareekh, khidmat, koi khaas baat':'Date, service, anything special',
    'Note / khaas baat':'Note / special remark',
    'Ghar, raste aur makan ki qism':'Houses, streets and house type',
    'Ghar walon ki ginti, umar aur halat':'Household count, age and status',
    'Padhne wale bachche aur students':'Children and students studying',
    'Kaam ke hisaab se ginti':'Counts by occupation',
    'Aalim aur Hafiz':'Aalim and Hafiz',
    'Documents aur scheme ka hisaab':'Documents and scheme records',
    'Deeni':'Religious',
    'Naam ya Family ID se dhoondo…':'Search by name or Family ID…',
    'Family ID / ghar / street se dhoondo…':'Search by Family ID / house / street…',
    'Kisi street par tap karo → us street ke ghar dikhenge.':'Tap a street to see its households.',
    'ghar':'houses',
    'log kaam par':'people working',
    'scheme li':'received scheme',
    'aalim / hafiz':'aalim / hafiz',

    /* --- runtime messages (toasts, errors, dialogs) --- */
    'Abhi koi record nahi hai.':'No record yet.',
    'Abhi koi scheme mark nahi hui — member form me scheme chips tap karo.':'No scheme marked yet — tap the scheme chips in the member form.',
    'Admin approve ho gaya — credentials usko bhej do':'Admin approved — send them the credentials',
    'Admin ban gaya — credentials dekho':'Admin created — check the credentials',
    'Admin nahi mila.':'Admin not found.',
    'Apna account nahi hata sakte':"You can't remove your own account",
    'Backup downloaded — is file ko Google Drive / laptop me rakh do':'Backup downloaded — keep this file in Google Drive or on a laptop',
    'Backup file me families nahi mili':'No households found in the backup file',
    'Camera access nahi mila. Settings se allow karo.':'Camera access denied. Allow it in Settings.',
    'Cloud connect nahi hua':'Cloud not connected',
    'Cloud connect nahi hua — internet check karo.':'Cloud not connected — check your internet.',
    'Cloud connect nahi hua.':'Cloud not connected.',
    'Cloud me save nahi hua — baad me retry karega':'Not saved to cloud — it will retry later',
    'Cloud off — public site ko totals nahi bheje ja sakte':'Cloud off — totals cannot be published to the public site',
    'Code galat hai — dobara dekho.':'Code is wrong — check again.',
    'Connect dabao to Drive on karein.':'Tap Connect to turn Drive on.',
    'Connect nahi hua — dobara try karo':'Not connected — try again',
    'Copy ho gaya':'Copied',
    'Copy nahi hua — haath se likh lo':'Copy failed — write it down by hand',
    'Deeni Taleem':'Religious Education',
    'Drive backup ho gaya':'Drive backup done',
    'Drive folder banane me fail (':'Failed to create the Drive folder (',
    'Drive ke liye Google OAuth Client ID chahiye (config.js me)':'Google OAuth Client ID needed for Drive (in config.js)',
    'Drive setup baaki hai':'Drive setup pending',
    'Email login ke liye cloud on hona chahiye.':'Cloud must be on for email login.',
    'Excel library load nahi hui — page refresh karo':'Excel library did not load — refresh the page',
    'Family ID me sirf letters, numbers, - _ / chalega (3-32 characters).':'Family ID allows only letters, numbers, - _ / (3-32 characters).',
    'File padhi nahi ja saki':'Could not read the file',
    'Google Drive se connect ho raha hai…':'Connecting to Google Drive…',
    'Google script load nahi hua':'Google script did not load',
    'Image load nahi hua.':'Image did not load.',
    'Is Family ID se koi ghar nahi mila.':'No household found for this Family ID.',
    'Is browser me camera support nahi.':'This browser has no camera support.',
    'Is email se koi admin nahi hai.':'No admin with this email.',
    'Is image me QR nahi mila. Dusri image try karo.':'No QR found in this image. Try another image.',
    'Kabhi backup nahi liya':'No backup yet',
    'Kam se kam 6 characters.':'At least 6 characters.',
    'Kam se kam ek admin rehna chahiye':'At least one admin must remain',
    'Koi record nahi mila. Family ID ya phone number check karo.':'No record found. Check the Family ID or phone number.',
    'Login link bhej diya':'Login link sent',
    'Lookup nahi hua.':'Lookup failed.',
    'Lookup nahi hua. Thodi der baad try karo.':'Lookup failed. Try again in a moment.',
    'Masjid details save ho gayi':'Masjid details saved',
    'Naam: ':'Name: ',
    'Owner email save ho gaya':'Owner email saved',
    'Owner — approvals bhi':'Owner — approvals too',
    'Pehle Drive setup karo — config.js me GOOGLE_CLIENT_ID chahiye':'Set up Drive first — GOOGLE_CLIENT_ID needed in config.js',
    'Pehle upar apna email daalo, phir ye button dabao.':'Enter your email above first, then tap this button.',
    'Photo add ho gayi':'Photo added',
    'Photo add nahi hui — dusri image try karo':'Photo not added — try another image',
    'Popup block hua hai - popup allow karo':'Popup was blocked - allow popups',
    'Public totals refresh ho gaye':'Public totals refreshed',
    'QR image scan ho raha hai...':'Scanning the QR image...',
    'QR mila':'QR found',
    'QR mila: ':'QR found: ',
    'Camera band karo':'Stop camera',
    'Camera band':'Camera stopped',
    'QR scan ho raha hai...':'Scanning QR...',
    'QR scanner load nahi hua.':'QR scanner did not load.',
    'Refresh fail — schema v4 run hua hai?':'Refresh failed — has schema v4 been run?',
    'Request nahi mili':'Request not found',
    'Request reject ho gayi':'Request rejected',
    'Reset link bhej diya':'Reset link sent',
    'Restore ho gaya':'Restore complete',
    'Save nahi hua — storage bhar gaya. Kuch photos hata ke dobara koshish karo.':'Not saved — storage is full. Remove some photos and try again.',
    'Saved — next household ke liye form ready':'Saved — form ready for the next household',
    'Scan nahi ho saka.':'Scan failed.',
    'Scheme mili — members':'Scheme received — members',
    'Scheme nahi mili — members':'Scheme not received — members',
    'Sirf admin':'Admin only',
    'Sirf owner':'Owner only',
    'Sirf owner admin hata sakta hai':'Only the owner can remove an admin',
    'Sirf owner approve kar sakta hai':'Only the owner can approve',
    'Sirf owner badal sakta hai':'Only the owner can change it',
    'Sirf owner edit kar sakta hai':'Only the owner can edit',
    'Sirf owner naya admin add kar sakta hai':'Only the owner can add a new admin',
    'Sirf owner reject kar sakta hai':'Only the owner can reject',
    'Sirf totals (naam/phone kabhi nahi)':'Totals only (never names/phone)',
    'User ID / email galat lag raha hai.':'User ID / email looks wrong.',
    'Ye Family ID pehle se kisi ghar ke paas hai — koi aur do.':'This Family ID already belongs to a household — pick another.',
    'Ye JSON backup file nahi hai':'This is not a JSON backup file',
    'Ye account abhi approval pending hai — owner approve karega tabhi login hoga.':'This account is pending approval — you can log in after the owner approves.',
    'Ye email approved admin list me nahi hai. “Request access” se owner ko request bhejo.':'This email is not an approved admin. Use “Request access” to ask the owner.',
    'Ye email pehle se admin hai':'This email is already an admin',
    'Ye email pehle se registered hai. Forgot password? par jao → email par link aayega → click karke password set karo, phir login.':'This email is already registered. Go to Forgot password? → a link comes by email → click it, set a password, then log in.',
    'Ye page sirf admin ke liye hai':'This page is for admins only',
    'Ye sirf admin kar sakta hai':'Only an admin can do this',
    'Aaj backup liya':'Backed up today',
    'din pehle backup liya':'days ago',
    'date nahi hai':'no date',
    'kabhi nahi':'never',
    'Ye admin account hata dein?':'Remove this admin account?',
    'Is device ka current data backup se replace ho jayega.':'Current data on this device will be replaced by the backup.',

    /* --- v86: roles + admin login modal + super admin panel --- */
    'Sirf admin / super admin ke liye. Baaki sab public dashboard dekh sakte hain.':'For admin / super admin only. Everyone else can use the public dashboard.',
    'Back to public site':'Back to public site',
    'User ID / Email ID':'User ID / Email ID',
    'Super admin panel — admins, settings aur account.':'Super admin panel — admins, settings and account.',
    'Super admin naye admins banata hai, password reset karta hai aur website control karta hai.':'Super admin adds admins, resets passwords and controls the website.',
    'Add a new admin':'Add a new admin',
    'Create admin':'Create admin',
    'Login isi email ya User ID se hoga':'Login works with this email or the User ID',
    'User ID aur password app khud banayegi — bante hi screen par dikhenge, admin ko bhej do.':'The app generates the User ID and password — they show on screen right away, send them to the admin.',
    'Naye admin ka login — usko bhejo':'New admin login — send it to them',
    'App ne khud banaya hai. Ye details sirf us admin ko do, kisi aur ko nahi.':'The app generated this. Give these details only to that admin.',
    'Ye login turant kaam karta hai. Admin pehli baar login karke My Profile se photo/naam badal sakta hai.':'This login works immediately. The admin can change photo/name from My Profile after the first login.',
    'Reset password':'Reset password',
    'Naya password ban gaya':'New password generated',
    'Active admins (Super Admin + Admin)':'Active admins (Owner + User)',
    'Pending requests (legacy)':'Pending requests (legacy)',
    'Change password':'Change password',
    'Current password':'Current password',
    'New password':'New password',
    'Confirm new password':'Confirm new password',
    'Update password':'Update password',
    'Kam se kam 6 characters. Password bhool jao to super admin reset kar sakta hai.':'At least 6 characters. If you forget it, the super admin can reset it.',
    'Current password galat hai':'Current password is wrong',
    'Password updated':'Password updated',
    'Aapko admin access de diya gaya hai.':'You have been given admin access.',
    'Topbar me "Admin" dabao → User ID + password se login karo.':'Tap "Admin" in the topbar → log in with your User ID and password.',
    'Login ke baad My Profile se apna password badal lo.':'After logging in, change your password from My Profile.',

    /* --- v88: ID card designer --- */
    'ID Card Design':'ID Card Design',
    'Card ka logo, background, text aur terms — sab yahan se badlo.':'Change the card logo, background, text and terms from here.',
    'Logo, background photo, colour, text aur back-side terms — sab editable.':'Logo, background photo, colour, text and back-side terms — all editable.',
    'Open designer':'Open designer',
    'Logo & background':'Logo & background',
    'Committee logo (card ke header me)':'Committee logo (in the card header)',
    'Upload logo':'Upload logo',
    'Card background photo':'Card background photo',
    'Upload background':'Upload background',
    'Remove':'Remove',
    'None':'None',
    'Background photo strength':'Background photo strength',
    '0 = sirf pattern · 60 = photo zyada dikhe':'0 = pattern only · 60 = photo shows more',
    'Card colour':'Card colour',
    'Header, Family ID aur lines ka rang':'Colour of the header, Family ID and lines',
    'Text size':'Text size',
    'Normal':'Normal',
    'Bada (default)':'Large (default)',
    'Bahut bada':'Extra large',
    'Sabse bada':'Largest',
    'Card par likha text':'Text printed on the card',
    'Committee / masjid naam':'Committee / masjid name',
    'Chhota naam (committee)':'Short name (committee)',
    'Card ka tag':'Card tag',
    'Footer — left':'Footer — left',
    'Footer — right':'Footer — right',
    'Khaali = members + date':'Empty = members + date',
    'Khaali = committee naam':'Empty = committee name',
    'Back side — Terms & Conditions':'Back side — Terms & Conditions',
    'Terms (card ke peeche chhapte hain)':'Terms (printed on the back of the card)',
    'Mutavalli se approve hone ke baad yahan final terms likh do — card ke back side par wahi chhapega.':'Once the mutavalli approves the wording, paste the final terms here — they print on the back of the card.',
    'Save card design':'Save card design',
    'Preview card':'Preview card',
    'Reset to default':'Reset to default',
    'Preview ke liye pehle ek family add karo.':'Add a family first to preview.',
    'Super admin only':'Only the Owner can open this.',
    'Sirf Owner hi ye page khol sakta hai':'Only the Owner can open this page.',
    'Aap sirf data add/edit kar sakte ho':'You can only add or edit data.',
    'Card design sirf super admin badal sakta hai.':'Only the super admin can change the card design.',
    'Card design save ho gaya':'Card design saved',
    'Card design reset ho gaya':'Card design reset',
    'Logo lag gaya':'Logo added',
    'Background lag gaya':'Background added',
    'Hata diya':'Removed',
    'Pehle ek family add karo':'Add a family first',
    'Sirf super admin':'Super admin only',

    /* --- v89: signatures + admin panel collapse --- */
    'Signature (card ke peeche)':'Signatures (on the back of the card)',
    'Mutavalli ka signature':'Mutavalli signature',
    'Secretary ka signature':'Secretary signature',
    'Member ka signature':'Member signature',
    'Abhi nahi lagaya':'Not added yet',
    'Camera':'Camera',
    'Gallery':'Gallery',
    'Signature white paper par likh kar photo lo — camera ya gallery se. Photo ka background auto white ho jata hai.':'Sign on white paper and photograph it — camera or gallery. The background turns white automatically.',
    'Signature lag gaya':'Signature added',
    'Photo load nahi hui.':'Photo could not be loaded.',
    'Galat signature slot':'Wrong signature slot',
    'Naya admin add karo ya existing admin ka login dekho.':'Add a new admin or view existing admin logins.',
    'Admins':'Admins',
    'View admins':'View admins',
    'Hide admins':'Hide admins',
    '+ Add admin':'+ Add admin',
    'Pending requests':'Pending requests',

    /* --- v92: guards + timestamps --- */
    'Right-click band hai':'Right-click is disabled',
    'Ye shortcut band hai':'This shortcut is disabled',
    'Registered':'Registered',
    'Last updated':'Last updated',
    'Updated':'Updated',
    'Data updated:':'Data updated:',

    /* --- v93: ID & password format --- */
    'ID & password format':'ID & password format',
    'User ID ya email':'User ID or email',
    'Isi ID ya apne email se login hota hai.':'Log in with this ID or your email.',
    'Apni User ID login ke baad My Profile me dikhti hai — email se bhi login ho sakta hai.':'Your User ID is shown in My Profile after login — you can also log in with your email.',
    'Site khud update hoti hai. Purana version dikh raha ho to neeche wala button dabao — cache saaf ho kar naya version khul jayega.':'The site updates itself. If you see an old version, press the button below — it clears the cache and loads the new version.',
    'User ID style':'User ID style',
    'Random (recommended)':'Random (recommended)',
    'Number series':'Number series',
    'Super admin ID prefix':'Super admin ID prefix',
    'Admin ID prefix':'Admin ID prefix',
    'Admin ID start number (series style)':'Admin ID start number (series style)',
    'Har naye admin ko alag random ID':'Every new admin gets a different random ID',
    'Sirf number-series style me — default 101':'Only for the number-series style — default 101',
    'Admin ID suffix':'Admin ID suffix',
    'ID ke aakhir me — khaali bhi chhod sakte ho':'At the end of the ID — you can leave it empty',
    'Password prefix':'Password prefix',
    'Password suffix':'Password suffix',
    'Beech ke 6 characters hamesha random rehte hain':'The middle 6 characters are always random',
    'Family ID prefix':'Family ID prefix',
    'Family ID style':'Family ID style',
    'Random (tough)':'Random (tough)',
    'Simple':'Simple',
    'Save ID format':'Save ID format',
    'ID format save ho gaya':'ID format saved',
    'ID shuru me:':'ID starts with:',
    'Card size':'Card size',
    '5 × 3 inch — landscape (default)':'5 × 3 inch — landscape (default)',
    '3 × 5 inch — portrait':'3 × 5 inch — portrait',
    'ID-1 (85.6 × 54 mm)':'ID-1 (85.6 × 54 mm)',
    '5×3 = chaudi card, QR bada aur text saaf':'5×3 = wide card, bigger QR and clearer text',

    /* --- v95: audit log --- */
    'Audit log':'Audit log',
    'Kab kisne kya kiya':'Who did what, and when',
    'Sab':'All',
    'Login':'Login',
    'Data':'Data',
    'Admins':'Admins',
    'Settings':'Settings',
    'Today':'Today',
    'Yesterday':'Yesterday',
    'Koi entry nahi':'No entries yet',
    'Admin jab kuch add/edit karega, entry yahan dikhegi.':'Every add, edit and delete will show up here.',
    'Search — naam, family, action…':'Search — name, household, action…',
    'Clear log':'Clear log',
    'Household add':'Household added',
    'Household edit':'Household edited',
    'Household delete':'Household deleted',
    'Admin add':'Admin added',
    'Admin edit':'Admin edited',
    'Admin remove':'Admin removed',
    'Setting change':'Setting changed',
    'Masjid profile save':'Masjid profile saved',
    'Public totals publish':'Public totals published',
    'Backup':'Backup',
    'Drive backup':'Drive backup',
    'Restore':'Restore',
    'All data erased':'All data erased',
    'Password change':'Password change',
    'Audit log cleared':'Audit log cleared',
    'Login fail':'Login failed',
    'Logout':'Logout',
    'Server se entries load ho rahi hain…':'Loading entries from the server…',
    'Server entries included':'Server entries included',
    'Is device ka log — cross-device ke liye supabase/audit.sql run karo':'Log from this device — run supabase/audit.sql for cross-device',
    'entries':'entries',
    'Masjid ka naam':'Masjid name',
    'Qayam saal':'Year established',
    'Pura pata':'Full address',
    'Rabta number':'Contact number',
    'Masjid ka email ID':'Masjid email',
    'Imam sahab ka naam':'Imam name',
    'Muazzin ka naam':'Muazzin name',
    'Raqba (sq ft / gaj)':'Area (sq ft / gaj)',
    'Namazi capacity':'Prayer capacity',
    'Kamre / halls':'Rooms / halls',
    'Madrasa / maktab':'Madrasa / maktab',
    'Waqf / registration no.':'Waqf / registration no.',
    'Bank / account detail':'Bank / account details',
    'Note / special remark':'Note / special remark',
    'Save masjid details':'Save masjid details',
    'Choose from gallery':'Choose from gallery',
    'each photo stays on this phone':'each photo stays on this phone',
    'Mohalla, shehar, pincode':'Mohalla, city, pincode',
    'e.g. Masjid e Mohammadi':'e.g. Masjid e Mohammadi',
    'e.g. 60 bachche, 3 ustad':'e.g. 60 students, 3 teachers',
    '10-digit mobile':'10-digit mobile',
    "Abhi kisi ka occupation nahi bhara — member form me \"Kaam / occupation\" likho (jaise Plumber).":"No occupation filled yet — write the work/occupation in the member form (e.g. Plumber).",
    "— locked":"— locked",
    "optional, leave empty for auto-generate":"optional, leave empty for auto-generate",
    "(Owner)":"(Owner)",
    "← Back":"← Back",
    "+ Add custom document":"+ Add custom document",
    "+ Add document":"+ Add document",
    "+ Add Household":"+ Add Household",
    "+ Add member":"+ Add member",
    "+ Photo":"+ Photo",
    "1 · Location & housing":"1 · Location & housing",
    "2 · Members":"2 · Members",
    "Aadhaar":"Aadhaar",
    "Aalima (women)":"Aalima (women)",
    "Account":"Account",
    "Additional Documents":"Additional Documents",
    "Address / landmark":"Address / landmark",
    "Administration":"Administration",
    "Admins & approval":"Admins & approval",
    "Age":"Age",
    "All households":"All households",
    "All members":"All members",
    "All streets":"All streets",
    "All Students":"All Students",
    "Any remark about this household":"Any remark about this household",
    "App version":"App version",
    "Appearance":"Appearance",
    "Auto: MEMC-2026-000001":"Auto: MEMC-2026-000001",
    "Ayushman Bharat":"Ayushman Bharat",
    "Backup (JSON)":"Backup (JSON)",
    "Backup now":"Backup now",
    "Backup reminder:":"Backup reminder:",
    "Backup to Drive":"Backup to Drive",
    "Bank passbook":"Bank passbook",
    "Basic government documents":"Basic government documents",
    "Birth certificate":"Birth certificate",
    "Births this month":"Births this month",
    "By Family ID":"By Family ID",
    "By QR scan":"By QR scan",
    "Cancel":"Cancel",
    "Cement sheet (house type)":"Cement sheet (house type)",
    "Cement sheet houses":"Cement sheet houses",
    "Challenged":"Challenged",
    "Click sidebar logo to change website logo • Click your avatar to edit your profile • Super admin can add/edit/remove admins with photo, email, phone and age":"Click sidebar logo to change website logo • Click your avatar to edit your profile • Super admin can add/edit/remove admins with photo, email, phone and age",
    "Click to open full details":"Click to open full details",
    "Click to upload/change website logo from gallery":"Click to upload/change website logo from gallery",
    "College students":"College students",
    "College Students":"College Students",
    "Connect Google Drive":"Connect Google Drive",
    "Dashboard":"Dashboard",
    "Data & backup":"Data & backup",
    "Date of birth":"Date of birth",
    "Day":"Day",
    "Deaths this month":"Deaths this month",
    "Del":"Del",
    "Disability pension":"Disability pension",
    "Docs":"Docs",
    "Documents & Govt. Schemes":"Documents & Govt. Schemes",
    "Documents held":"Documents held",
    "e.g. Abdul Rahman":"e.g. Abdul Rahman",
    "e.g. CM relief fund":"e.g. CM relief fund",
    "e.g. Masjid Road":"e.g. Masjid Road",
    "Edit":"Edit",
    "Editable":"Editable",
    "Education":"Education",
    "eg XXXXX01":"eg XXXXX01",
    "Email":"Email",
    "Emerald Lattice theme · day & night.":"Emerald Lattice theme · day & night.",
    "Employment status":"Employment status",
    "Export Excel (.xlsx)":"Export Excel (.xlsx)",
    "Export PDF / Print":"Export PDF / Print",
    "Family & Demographics":"Family & Demographics",
    "Family ID":"Family ID",
    "FAMILY ID":"FAMILY ID",
    "Father name":"Father name",
    "Fill the household details, then add each member.":"Fill the household details, then add each member.",
    "Find":"Find",
    "Find family":"Find family",
    "Force update":"Force update",
    "Free bus pass":"Free bus pass",
    "Full name *":"Full name *",
    "Gender":"Gender",
    "Government / welfare schemes":"Government / welfare schemes",
    "Higher secondary students":"Higher secondary students",
    "Higher Secondary Students":"Higher Secondary Students",
    "House no.":"House no.",
    "House number":"House number",
    "House type":"House type",
    "Household":"Household",
    "Household / head name *":"Household / head name *",
    "Households":"Households",
    "ID Cards":"ID Cards",
    "Kapidu Thittam card":"Kapidu Thittam card",
    "Khidmath Committee":"Khidmath Committee",
    "Khidmath Committee · Survey":"Khidmath Committee · Survey",
    "Language":"Language",
    "Location & Housing":"Location & Housing",
    "Log out":"Log out",
    "Logged in as":"Logged in as",
    "Logged in:":"Logged in:",
    "Madarsa students":"Madarsa students",
    "Madarsa Students":"Madarsa Students",
    "Magalir Urimai Thogai":"Magalir Urimai Thogai",
    "male":"male",
    "female":"female",
    "Marital":"Marital",
    "Marital status":"Marital status",
    "Married":"Married",
    "Married men":"Married men",
    "Married women":"Married women",
    "Masjid e Mohammadi":"Masjid e Mohammadi",
    "Masjid Profile":"Masjid Profile",
    "Max 6":"Max 6",
    "Member 1":"Member 1",
    "Members with an occupation":"Members with an occupation",
    "Men Aalim":"Men Aalim",
    "Men Hafiz":"Men Hafiz",
    "Mohalla, gali, landmark":"Mohalla, gali, landmark",
    "Mother name":"Mother name",
    "Moulding (house type)":"Moulding (house type)",
    "Moulding houses":"Moulding houses",
    "Mufti (men)":"Mufti (men)",
    "My Profile - Edit photo/name/phone":"My Profile - Edit photo/name/phone",
    "Name":"Name",
    "Nazira (men)":"Nazira (men)",
    "Nazira (women)":"Nazira (women)",
    "No documents marked.":"No documents marked.",
    "Notes (optional)":"Notes (optional)",
    "Number of children":"Number of children",
    "Occupations":"Occupations",
    "Old age pension":"Old age pension",
    "Open menu":"Open menu",
    "Other / kachcha (house type)":"Other / kachcha (house type)",
    "Other / kachcha houses":"Other / kachcha houses",
    "Other scheme":"Other scheme",
    "Owner":"Owner",
    "Owner (Fixed)":"Owner (Fixed)",
    "Palm leaf (house type)":"Palm leaf (house type)",
    "Palm leaf houses":"Palm leaf houses",
    "PAN card":"PAN card",
    "Passport":"Passport",
    "PDF / Print":"PDF / Print",
    "Phone":"Phone",
    "Phone number":"Phone number",
    "Physically challenged — all":"Physically challenged — all",
    "Physically challenged (total)":"Physically challenged (total)",
    "Physically challenged men":"Physically challenged men",
    "Physically challenged women":"Physically challenged women",
    "Plumber, Electrician, Painter, Helper…":"Plumber, Electrician, Painter, Helper…",
    "PM Awas Yojana":"PM Awas Yojana",
    "Primary (1-5)":"Primary (1-5)",
    "Primary students":"Primary students",
    "Primary Students":"Primary Students",
    "Public totals refresh":"Public totals refresh",
    "Read-only public view":"Read-only public view",
    "Relation":"Relation",
    "Relation to head":"Relation to head",
    "Religious Education":"Religious Education",
    "Restore & Google Drive":"Restore & Google Drive",
    "Restore from backup file":"Restore from backup file",
    "Save & add another":"Save & add another",
    "Save & generate Family ID":"Save & generate Family ID",
    "Scan from camera":"Scan from camera",
    "Scan QR to open edit form after admin login. QR contains Family ID.":"Scan QR to open edit form after admin login. QR contains Family ID.",
    "Scheme-wise count":"Scheme-wise count",
    "Schemes":"Schemes",
    "School scholarship":"School scholarship",
    "School TC":"School TC",
    "Search household, Family ID, phone, street…":"Search household, Family ID, phone, street…",
    "Self":"Self",
    "Self / Wife / Son…":"Self / Wife / Son…",
    "session start":"session start",
    "Smart card":"Smart card",
    "Street name *":"Street name *",
    "Super Admin":"Owner · Admin",
    "Total Aalim & Hafiz":"Total Aalim & Hafiz",
    "Total Aalim & Hafiz (men + women)":"Total Aalim & Hafiz (men + women)",
    "Total child / students":"Total child / students",
    "Type":"Type",
    "Ujjwala gas":"Ujjwala gas",
    "Unmarried":"Unmarried",
    "Unmarried men":"Unmarried men",
    "Unmarried women":"Unmarried women",
    "Upload QR image":"Upload QR image",
    "User ID":"User ID",
    "Version":"Version",
    "View":"View",
    "Voter ID":"Voter ID",
    "Widow pension":"Widow pension",
    "Widows":"Widows",
    "Women Aalim":"Women Aalim",
    "Women Hafiz":"Women Hafiz",
    "Yes":"Yes",
    "No":"No",
    "khaali":"khaali",
    "Separate series:":"Separate series:",
    "All rights reserved.":"All rights reserved.",
    "households on record.":"households on record.",
    "member(s) found":"member(s) found",
    "member(s)":"member(s)",
    "House":"House",
    "public view (phone hidden)":"public view (phone hidden)",
    "men":"men",
    "women":"women",
    "report":"report",
    "English":"English",
    "Hinglish":"Hinglish",
    "Tamil":"Tamil",
    "Urdu":"Urdu",
    "— optional, leave empty for auto-generate":"— optional, leave empty for auto-generate",
    "Head of family":"Head of family",
    "Scan to verify":"Scan to verify",
    "Terms & Conditions":"Terms & Conditions",
    "Mutavalli":"Mutavalli",
    "Secretary":"Secretary",
    "Member":"Member",
    "Mohalla Survey":"Mohalla Survey",
    "yrs":"yrs",
    "Issued":"Issued",
    "No members to print":"No members to print",
    "Wife":"Wife",
    "Son":"Son",
    "Daughter":"Daughter",
    "Father":"Father",
    "Mother":"Mother",
    "Brother":"Brother",
    "Sister":"Sister",
    'Wajah kya hai?':'What is the reason?',
    'Janam hua hai':'Birth',
    'Inteqal ho gaya':'Death',
    'Aur koi wajah':'Other',
    'Sample ghar add kar dein? Ye test data hai — baad me manually delete karne padenge.':'Add sample households? This is test data — they must be deleted manually later.',
    'Sample data load ho gaya':'Sample data loaded',
  },
  /* Hinglish — jo strings English me likhi gayi hain unka Hinglish version.
     (Baaki app ki source strings pehle se Hinglish hain, unka kuch nahi chahiye.) */
  hi: {
    'Aalim and Hafiz':'Aalim aur Hafiz',
    'By Family ID':'Family ID se',
    'By QR scan':'QR scan se',
    'Children and students studying':'Bachche aur padhne wale students',
    'Close':'Band karo',
    'Committee jab survey save karegi, ye 6 categories bhar jaayengi — naam, phone aur pata kabhi public nahi hote.':'Jab committee survey save karegi, ye 6 categories bhar jaayengi — naam, phone aur pata kabhi public nahi hote.',
    'Counts by occupation':'Kaam ke hisaab se ginti',
    'Day':'Din',
    'Documents & Govt. Schemes':'Documents aur Sarkari Yojana',
    'Documents and scheme records':'Documents aur yojana ke record',
    'Education':'Taleem',
    'Enter a Family ID to view details (read-only).':'Detail dekhne ke liye Family ID daalo (sirf dekhne ke liye).',
    'Enter a phone number or scan a QR — it shows that household only, read-only (no editing).':'Phone number daalo ya QR scan karo — sirf usi ghar ka record khulega, dekhne ke liye (edit nahi).',
    'Family & Demographics':'Ghar aur Aabadi',
    'Family ID':'Family ID',
    'Find':'Dhoondo',
    'Find family':'Family dhoondo',
    'For admin / super admin only. Everyone else can use the public dashboard.':'Sirf admin / super admin ke liye. Baaki sab public dashboard dekh sakte hain.',
    'Forgot password':'Password bhool gaye',
    'Get in touch':'Rabta karo',
    'Hide password':'Password chhupao',
    'Household count, age and status':'Ghar ki ginti, umar aur status',
    'Houses, streets and house type':'Ghar, galiyan aur ghar ka type',
    'Language':'Bhasha',
    'Location & Housing':'Jagah aur Ghar',
    'Log in as admin to add photos in Masjid Profile.':'Masjid Profile me photo add karne ke liye admin se login karo.',
    'Mohalla survey — every house, every person, education, work and religious service in one place.':'Mohalla survey — har ghar, har insaan, taleem, kaam aur deeni khidmat ek jagah.',
    'My Profile':'Meri Profile',
    'Occupations':'Kaam / Occupation',
    'Only totals are public. Each household’s private detail stays with the committee admin.':'Public me sirf total dikhte hain. Har ghar ki private detail committee admin ke paas rehti hai.',
    'Open menu':'Menu kholo',
    'Read-only public view':'Public view (sirf dekhne ke liye)',
    'Registered email ID':'Registered email ID',
    'Registered email ID daalo aur password reset link milega.':'Registered email ID daalo, password reset ka link aa jayega.',
    'Religious Education':'Deeni Taleem',
    'Scan a QR from camera or gallery to open that Family ID.':'Camera ya gallery se QR scan karo — usi Family ID ka record khulega.',
    'Scan from camera':'Camera se scan',
    'Send reset code':'Reset link bhejo',
    'Show password':'Password dikhao',
    'Survey data is for committee records only · public view is read-only':'Survey data sirf committee ke record ke liye · public view sirf dekhne ke liye',
    'This page is for admins only':'Ye page sirf admin ke liye hai',
    'Upload QR image':'QR image upload karo',
    'User ID or email':'User ID ya email',
    'admin will add':'admin add karega',
    'houses':'ghar',
    'people working':'kaam karne wale',
    'received scheme':'yojana mili',
    'survey of the mohalla — every house, every person, education, work and religious service in one place.':'mohalle ka survey — har ghar, har insaan, taleem, kaam aur deeni khidmat ek jagah.',
    '© 2026 Masjid e Mohammadi · Khidmath Committee — All rights reserved.':'© 2026 Masjid e Mohammadi · Khidmath Committee — saare haq surakshit.'
  },
  ta: {
    "Abhi kisi ka occupation nahi bhara — member form me \"Kaam / occupation\" likho (jaise Plumber).": 'இப்போது யாருடைய தொழிலும் பதிவாகவில்லை — உறுப்பினர் படிவத்தில் "வேலை / தொழில்" எழுதுங்கள் (உதா. Plumber).',
    'Audit log':'தணிக்கை பதிவு',
    'Kab kisne kya kiya':'யார் எப்போது என்ன செய்தார்',
    'Sab':'அனைத்தும்',
    'Login':'உள்நுழைவு',
    'Data':'தரவு',
    'Admins':'நிர்வாகிகள்',
    'Settings':'அமைப்புகள்',
    'Today':'இன்று',
    'Yesterday':'நேற்று',
    'Koi entry nahi':'பதிவுகள் இல்லை',
    'Admin jab kuch add/edit karega, entry yahan dikhegi.':'ஒவ்வொரு மாற்றமும் இங்கே தெரியும்.',
    'Search — naam, family, action…':'தேடு — பெயர், குடும்பம், செயல்…',
    'Clear log':'பதிவை அழி',
    'Household add':'குடும்பம் சேர்க்கப்பட்டது',
    'Household edit':'குடும்பம் திருத்தப்பட்டது',
    'Household delete':'குடும்பம் நீக்கப்பட்டது',
    'Admin add':'நிர்வாகி சேர்க்கப்பட்டார்',
    'Admin edit':'நிர்வாகி திருத்தப்பட்டார்',
    'Admin remove':'நிர்வாகி நீக்கப்பட்டார்',
    'Setting change':'அமைப்பு மாற்றம்',
    'Masjid profile save':'மசூதி விவரம் சேமிக்கப்பட்டது',
    'Public totals publish':'பொது எண்ணிக்கை வெளியிடப்பட்டது',
    'Backup':'காப்பு',
    'Drive backup':'Drive காப்பு',
    'Restore':'மீட்டமை',
    'All data erased':'அனைத்து தரவும் அழிக்கப்பட்டது',
    'Password change':'கடவுச்சொல் மாற்றம்',
    'Audit log cleared':'தணிக்கை பதிவு அழிக்கப்பட்டது',
    'Login fail':'உள்நுழைவு தோல்வி',
    'Logout':'வெளியேறு',
    'Dashboard':'டாஷ்போர்டு',
    'Households':'குடும்பங்கள்',
    'Add Household':'குடும்பம் சேர்',
    'Edit Household':'குடும்பம் திருத்து',
    'Masjid Profile':'மசூதி விவரம்',
    'Admins':'நிர்வாகிகள்',
    'Settings':'அமைப்புகள்',
    'Survey Dashboard':'கணக்கெடுப்பு டாஷ்போர்டு',
    'Survey Category':'கணக்கெடுப்பு பிரிவு',
    'Household Record':'குடும்பப் பதிவு',
    'Public view':'பொது பார்வை',
    'Admin login':'நிர்வாகி உள்நுழைவு',
    'Admin mode · you can add and edit':'நிர்வாகி பயன்முறை · சேர்க்கவும் திருத்தவும் முடியும்',
    'Public view · read only':'பொது பார்வை · படிக்க மட்டும்',
    'Admin login / create admin':'நிர்வாகி உள்நுழைவு / நிர்வாகி உருவாக்கு',
    'Complete survey of households, streets and members — live totals.':'ஒவ்வொரு வீடு, தெரு மற்றும் மக்களின் முழு கணக்கு — நேரடி மொத்தம்.',
    'No households surveyed yet':'இன்னும் எந்த குடும்பமும் பதிவாகவில்லை',
    'Add the first household to get started.':'முதல் குடும்பத்தைச் சேர்க்கவும், அல்லது மாதிரி தரவை ஏற்றி டாஷ்போர்டைப் பாருங்கள்.',
    'Add first household':'முதல் குடும்பத்தைச் சேர்',
    'Load sample data':'மாதிரி தரவை ஏற்று',
    'Location & Housing':'இடம் & வீடு',
    'Family & Demographics':'குடும்பம் & மக்கள்தொகை',
    'Education':'கல்வி',
    'Occupations':'தொழில்கள்',
    'Religious Education':'மதக் கல்வி',
    'Documents & Govt. Schemes':'ஆவணங்கள் & அரசு திட்டங்கள்',
    'Ghar aur raste ki details':'வீடு மற்றும் தெரு விவரம்',
    'Ghar walon ki details':'குடும்ப விவரம்',
    'Padhne wale bachche aur students':'படிக்கும் குழந்தைகள் மற்றும் மாணவர்கள்',
    'Kaam ke hisaab se ginti':'தொழில் வாரியாக எண்ணிக்கை',
    'Aalim aur Hafiz':'ஆலிம் மற்றும் ஹாபிழ்',
    'Documents aur scheme ka hisaab':'ஆவணங்கள் மற்றும் திட்டக் கணக்கு',
    'Ghar, raste aur makan ki qism':'வீடுகள், தெருக்கள் மற்றும் வீட்டு வகை',
    'Ghar walon ki ginti, umar aur halat':'குடும்ப எண்ணிக்கை, வயது மற்றும் நிலை',
    'Survey — 6 categories':'கணக்கெடுப்பு — 6 பிரிவுகள்',
    'Only totals are public. Individual household details are visible only to committee admins.':'பொதுவில் மொத்த எண்ணிக்கை மட்டும். ஒவ்வொரு வீட்டின் தனிப்பட்ட விவரம் குழு நிர்வாகியிடம் மட்டுமே.',
    'public totals':'பொது மொத்தம்',
    'Har ghar ki zaati tafseel (naam, umar, documents, schemes) sirf admin login ke andar hai.':'தனிப்பட்ட விவரங்கள் (பெயர், வயது, ஆவணங்கள், திட்டங்கள்) நிர்வாகி உள்நுழைவில் மட்டும்.',
    'ghar':'வீடுகள்',
    'families':'குடும்பங்கள்',
    'students':'மாணவர்கள்',
    'log kaam par':'வேலை செய்வோர்',
    'aalim / hafiz':'ஆலிம் / ஹாபிழ்',
    'scheme li':'திட்டம் பெற்றோர்',
    'Moulding (concrete)':'கான்கிரீட்',
    'Cement sheet':'சிமெண்ட் ஷீட்',
    'Palm leaf':'ஓலை',
    'Other / kachcha':'மற்றவை / கச்சா',
    'Total streets':'மொத்த தெருக்கள்',
    'Total houses':'மொத்த வீடுகள்',
    'Total families':'மொத்த குடும்பங்கள்',
    'Total population':'மொத்த மக்கள் தொகை',
    'Total students':'மொத்த மாணவர்கள்',
    'Total':'மொத்தம்',
    'Street':'தெரு',
    'Street name':'தெரு பெயர்',
    'Houses':'வீடுகள்',
    'Moulding':'கான்கிரீட்',
    'Cement':'சிமெண்ட்',
    'Palm':'ஓலை',
    'Other':'மற்றவை',
    'Men':'ஆண்கள்',
    'Women':'பெண்கள்',
    'Primary':'தொடக்கநிலை',
    'Higher secondary':'மேல்நிலை',
    'College':'கல்லூரி',
    'Madarsa':'மதரஸா',
    'Married (men+women)':'திருமணமானவர்கள் (ஆண்+பெண்)',
    'Unmarried (men+women)':'திருமணமாகாதவர்கள் (ஆண்+பெண்)',
    'Widow':'விதவைகள்',
    'Physically challenged':'மாற்றுத்திறனாளிகள்',
    'Children (under 18)':'குழந்தைகள் (18 வயதுக்கு கீழ்)',
    'Members with a job':'வேலை உள்ள உறுப்பினர்கள்',
    'Different occupations':'வெவ்வேறு தொழில்கள்',
    'Occupation':'தொழில்',
    'Members':'உறுப்பினர்கள்',
    'Document':'ஆவணம்',
    'Have':'உள்ளது',
    "Don't have":'இல்லை',
    'Scheme':'திட்டம்',
    'Members with all basic documents':'அனைத்து அடிப்படை ஆவணங்களும் உள்ளவர்கள்',
    'Members with no basic document':'எந்த ஆவணமும் இல்லாதவர்கள்',
    'Scheme applied':'திட்டம் பெற்றவர்',
    'Scheme not applied':'திட்டம் பெறாதவர்',
    'Scheme mili':'திட்டம் பெற்றவர்',
    'Scheme nahi mili':'திட்டம் பெறாதவர்',
    'Aalim (men)':'ஆலிம் (ஆண்)',
    'Hafiz (men)':'ஹாபிழ் (ஆண்)',
    'Aalim (women)':'ஆலிம் (பெண்)',
    'Hafiz (women)':'ஹாபிழ் (பெண்)',
    'About':'பற்றி',
    'Contact':'தொடர்பு',
    'Rabta karo':'தொடர்பு கொள்ளுங்கள்',
    'Masjid phone':'மசூதி தொலைபேசி',
    'Masjid email':'மசூதி மின்னஞ்சல்',
    'Address':'முகவரி',
    'Admin':'நிர்வாகி',
    'admin add karega':'நிர்வாகி சேர்ப்பார்',
    'Qayam':'நிறுவப்பட்டது',
    'Pata':'முகவரி',
    'Imam':'இமாம்',
    'Raqba':'பரப்பளவு',
    'Capacity':'கொள்ளளவு',
    'Masjid photos':'மசூதி படங்கள்',
    'Admin login karke Masjid Profile me photos add hongi.':'நிர்வாகி உள்நுழைந்து மசூதி விவரத்தில் படங்களைச் சேர்க்கலாம்.',
    'Masjid profile edit karo':'மசூதி விவரம் திருத்து',
    'ke mohalle ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka poora hisaab.':'முகவரி கணக்கெடுப்பு — ஒவ்வொரு வீடும், ஒவ்வொரு நபரும், கல்வி, வேலை மற்றும் மத சேவையின் முழு விவரம்.',
    'Survey data sirf committee ke records ke liye · public view read-only':'தரவு குழு பதிவுகளுக்கு மட்டும் · பொது பார்வை படிக்க மட்டும்',
    'Sirf committee admin ke liye. Baaki sab public dashboard dekh sakte hain.':'குழு நிர்வாகிக்கு மட்டும். மற்ற அனைவரும் பொது டாஷ்போர்டைப் பார்க்கலாம்.',
    'Email ID':'மின்னஞ்சல் ஐடி',
    'User ID / Email':'பயனர் ஐடி / மின்னஞ்சல்',
    'Request access':'அனுமதி கேள்',
    'Request admin access':'நிர்வாக அனுமதி கேள்',
    'Create first admin':'முதல் நிர்வாகி உருவாக்கு',
    'Login ID ya registered email — dono chalega':'பயனர் ஐடி அல்லது பதிவு மின்னஞ்சல் — இரண்டும் செல்லும்',
    'Password':'கடவுச்சொல்',
    'Captcha — answer the sum':'கேப்ட்சா — கூட்டலுக்கு பதில் சொல்லுங்கள்',
    'Answer':'பதில்',
    'Login':'உள்நுழை',
    'Email link se login (password ke bina)':'மின்னஞ்சல் இணைப்பால் உள்நுழை (கடவுச்சொல் இல்லாமல்)',
    'Forgot password?':'கடவுச்சொல் / ஐடி மறந்துவிட்டதா?',
    'Create admin':'நிர்வாகி உருவாக்கு',
    'Dashboard':'டாஷ்போர்டு',
    'Households':'வீடுகள்',
    'Add Household':'வீடு சேர்',
    'Find family':'குடும்பத்தை தேடு',
    'My Profile':'என் சுயவிவரம்',
    'Masjid Profile':'மஸ்ஜித் விவரம்',
    'ID Card Design':'ஐடி அட்டை வடிவமைப்பு',
    'Administration':'நிர்வாகம்',
    'Admins':'நிர்வாகிகள்',
    'Public view':'பொது பார்வை',
    'Language':'மொழி',
    'Log out':'வெளியேறு',
    'Day':'பகல்',
    'Night':'இரவு',
    'Save':'சேமி',
    'Cancel':'ரத்து',
    'Delete':'நீக்கு',
    'Edit':'திருத்து',
    'Search':'தேடு',
    'Print':'அச்சிடு',
    'Close':'மூடு',
    '+ Add admin':'+ நிர்வாகி சேர்',
    '10-digit mobile':'10 இலக்க மொபைல்',
    '3 × 5 inch — portrait':'3 × 5 அங்குலம் — நெட்டை',
    '5 × 3 inch — landscape (default)':'5 × 3 அங்குலம் — கிடை (இயல்பு)',
    'Admin ID prefix':'நிர்வாகி ஐடி முன்னொட்டு',
    'Admin ID start number (series style)':'நிர்வாகி ஐடி தொடக்க எண் (வரிசை முறை)',
    'Admin ID suffix':'நிர்வாகி ஐடி பின்னொட்டு',
    'Back side — Terms & Conditions':'பின் பக்கம் — விதிமுறைகள்',
    'Back to public site':'பொது தளத்திற்கு திரும்பு',
    'Background photo strength':'பின்னணி படத்தின் அளவு',
    'Camera':'கேமரா',
    'Card background photo':'அட்டை பின்னணி படம்',
    'Card colour':'அட்டை நிறம்',
    'Card size':'அட்டை அளவு',
    'Change password':'கடவுச்சொல் மாற்று',
    'Choose from gallery':'கேலரியில் இருந்து தேர்வு',
    'Confirm new password':'புதிய கடவுச்சொல் உறுதி',
    'Current password':'தற்போதைய கடவுச்சொல்',
    'Family ID prefix':'குடும்ப ஐடி முன்னொட்டு',
    'Family ID style':'குடும்ப ஐடி முறை',
    'Footer — left':'கீழ் வரி — இடது',
    'Footer — right':'கீழ் வரி — வலது',
    'Gallery':'கேலரி',
    'ID & password format':'ஐடி மற்றும் கடவுச்சொல் வடிவம்',
    'ID-1 (85.6 × 54 mm)':'ID-1 (85.6 × 54 மிமீ)',
    'Last updated':'கடைசி புதுப்பிப்பு',
    'Logo & background':'லோகோ மற்றும் பின்னணி',
    'Madrasa / maktab':'மதரஸா / மக்தப்',
    'Masjid email':'மஸ்ஜித் மின்னஞ்சல்',
    'Masjid photos':'மஸ்ஜித் புகைப்படங்கள்',
    'New password':'புதிய கடவுச்சொல்',
    'None':'இல்லை',
    'Normal':'சாதாரண',
    'Note / special remark':'குறிப்பு',
    'Open designer':'வடிவமைப்பை திற',
    'Password prefix':'கடவுச்சொல் முன்னொட்டு',
    'Password suffix':'கடவுச்சொல் பின்னொட்டு',
    'Preview card':'அட்டையை பார்',
    'Registered':'பதிவு',
    'Reset to default':'இயல்புக்கு மீட்டமை',
    'Save ID format':'ஐடி வடிவத்தை சேமி',
    'Save card design':'அட்டை வடிவமைப்பை சேமி',
    'Save masjid details':'மஸ்ஜித் விவரங்களை சேமி',
    'Super admin ID prefix':'சூப்பர் அட்மின் ஐடி முன்னொட்டு',
    'Text size':'எழுத்து அளவு',
    'Update password':'கடவுச்சொல்லை புதுப்பி',
    'Updated':'புதுப்பிக்கப்பட்டது',
    'Upload background':'பின்னணி படம் பதிவேற்று',
    'Upload logo':'லோகோ பதிவேற்று',
    'User ID / Email ID':'பயனர் ஐடி / மின்னஞ்சல்',
    'User ID style':'பயனர் ஐடி முறை',
    'View admins':'நிர்வாகிகளை பார்',
    'Waqf / registration no.':'வக்ஃப் / பதிவு எண்',
    'e.g. Masjid e Mohammadi':'எ.கா. மஸ்ஜித் ஏ முகம்மதி',
    'each photo stays on this phone':'ஒவ்வொரு படமும் இந்த போனில் இருக்கும்',
    'entries':'பதிவுகள்',
    'User ID or email':'பயனர் ஐடி அல்லது மின்னஞ்சல்',
    'Hide password':'கடவுச்சொல்லை மறை',
    'Show password':'கடவுச்சொல்லை காட்டு',
    'Masjid ka email ID':'மஸ்ஜித் மின்னஞ்சல்',
    'Masjid ki tasveerein':'மஸ்ஜித் புகைப்படங்கள்',
    'har photo phone me hi save hoti hai':'ஒவ்வொரு படமும் இந்த போனில் சேமிக்கப்படும்',
    'Gallery se chuno':'கேலரியில் இருந்து தேர்வு',
    'Note / khaas baat':'குறிப்பு',
    'New captcha':'புதிய கேப்ட்சா'
  },
  ur: {
    "Add Household":"گھر شامل کریں",
    "Edit Household":"گھر میں ترمیم",
    "Survey Dashboard":"سروے ڈیش بورڈ",
    "Survey Category":"سروے زمرہ",
    "Household Record":"گھر کا ریکارڈ",
    "Public view":"عوامی منظر",
    "Admin login":"ایڈمن لاگ ان",
    "Admin mode · you can add and edit":"ایڈمن موڈ · آپ شامل اور ترمیم کر سکتے ہیں",
    "Public view · read only":"عوامی منظر · صرف پڑھنے کے لیے",
    "Admin login / create admin":"ایڈمن لاگ ان / ایڈمن بنائیں",
    "Complete survey of households, streets and members — live totals.":"گھروں، گلیوں اور افراد کا مکمل سروے — تازہ اعداد و شمار۔",
    "No households surveyed yet":"ابھی کوئی گھر ریکارڈ نہیں ہوا",
    "Add the first household to get started.":"شروع کرنے کے لیے پہلا گھر شامل کریں، یا نمونہ ڈیٹا لوڈ کریں۔",
    "Add first household":"پہلا گھر شامل کریں",
    "Load sample data":"نمونہ ڈیٹا لوڈ کریں",
    "Ghar aur raste ki details":"گھر اور گلی کی تفصیل",
    "Ghar walon ki details":"گھر والوں کی تفصیل",
    "Padhne wale bachche aur students":"پڑھنے والے بچے اور طلبہ",
    "Kaam ke hisaab se ginti":"کام کے حساب سے گنتی",
    "Aalim aur Hafiz":"عالم اور حافظ",
    "Documents aur scheme ka hisaab":"دستاویزات اور اسکیم کا حساب",
    "Ghar, raste aur makan ki qism":"گھر، گلی اور مکان کی قسم",
    "Ghar walon ki ginti, umar aur halat":"گھر والوں کی گنتی، عمر اور حالت",
    "Survey — 6 categories":"سروے — ۶ زمرے",
    "Only totals are public. Individual household details are visible only to committee admins.":"صرف کل اعداد عوامی ہیں۔ ہر گھر کی تفصیل صرف کمیٹی ایڈمن دیکھ سکتا ہے۔",
    "public totals":"عوامی اعداد",
    "Har ghar ki zaati tafseel (naam, umar, documents, schemes) sirf admin login ke andar hai.":"ہر گھر کی ذاتی تفصیل (نام، عمر، دستاویزات، اسکیمیں) صرف ایڈمن لاگ ان میں ہے۔",
    "ghar":"گھر",
    "families":"خاندان",
    "students":"طلبہ",
    "log kaam par":"کام کرنے والے افراد",
    "aalim / hafiz":"عالم / حافظ",
    "scheme li":"اسکیم لی",
    "Moulding (concrete)":"ڈھلائی (کنکریٹ)",
    "Cement sheet":"سیمنٹ شیٹ",
    "Palm leaf":"تال پتّے کی چھت",
    "Other / kachcha":"دیگر / کچا",
    "Total streets":"کل گلیاں",
    "Total houses":"کل گھر",
    "Total families":"کل خاندان",
    "Total population":"کل آبادی",
    "Total students":"کل طلبہ",
    "Total":"کل",
    "Street":"گلی",
    "Street name":"گلی کا نام",
    "Houses":"گھر",
    "Moulding":"ڈھلائی",
    "Cement":"سیمنٹ",
    "Palm":"تال پتہ",
    "Other":"دیگر",
    "Men":"مرد",
    "Women":"خواتین",
    "Primary":"پرائمری",
    "Higher secondary":"ہائر سیکنڈری",
    "College":"کالج",
    "Madarsa":"مدرسہ",
    "Married (men+women)":"شادی شدہ (مرد + خواتین)",
    "Unmarried (men+women)":"غیر شادی شدہ (مرد + خواتین)",
    "Widow":"بیوہ",
    "Physically challenged":"معذور",
    "Children (under 18)":"بچے (۱۸ سال سے کم)",
    "Members with a job":"کام کرنے والے ارکان",
    "Different occupations":"مختلف پیشے",
    "Occupation":"پیشہ",
    "Members":"ارکان",
    "Document":"دستاویز",
    "Have":"موجود ہے",
    "Don't have":"موجود نہیں",
    "Scheme":"اسکیم",
    "Members with all basic documents":"تمام بنیادی دستاویزات والے ارکان",
    "Members with no basic document":"کوئی بنیادی دستاویز نہ رکھنے والے ارکان",
    "Scheme applied":"اسکیم حاصل کی",
    "Scheme not applied":"اسکیم حاصل نہیں کی",
    "Scheme mili":"اسکیم ملی",
    "Scheme nahi mili":"اسکیم نہیں ملی",
    "Aalim (men)":"عالم (مرد)",
    "Hafiz (men)":"حافظ (مرد)",
    "Aalim (women)":"عالمہ (خواتین)",
    "Hafiz (women)":"حافظہ (خواتین)",
    "About":"تعارف",
    "Contact":"رابطہ",
    "Rabta karo":"رابطہ کریں",
    "Masjid phone":"مسجد کا فون",
    "Masjid email":"مسجد کا ای میل",
    "Address":"پتہ",
    "Admin":"ایڈمن",
    "admin add karega":"ایڈمن شامل کرے گا",
    "Qayam":"قیام",
    "Pata":"پتہ",
    "Imam":"امام",
    "Raqba":"رقبہ",
    "Capacity":"گنجائش",
    "Masjid photos":"مسجد کی تصاویر",
    "Admin login karke Masjid Profile me photos add hongi.":"ایڈمن لاگ ان کر کے مسجد پروفائل میں تصاویر شامل کرے گا۔",
    "Masjid profile edit karo":"مسجد پروفائل میں ترمیم کریں",
    "ke mohalle ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka poora hisaab.":"محلے کا سروے — ہر گھر، ہر فرد، تعلیم، کام اور دینی خدمت کا پورا حساب۔",
    "Survey data sirf committee ke records ke liye · public view read-only":"سروے ڈیٹا صرف کمیٹی کے ریکارڈ کے لیے · عوامی منظر صرف پڑھنے کے لیے",
    "Sirf committee admin ke liye. Baaki sab public dashboard dekh sakte hain.":"صرف کمیٹی ایڈمن کے لیے۔ باقی سب عوامی ڈیش بورڈ دیکھ سکتے ہیں۔",
    "Email ID":"ای میل آئی ڈی",
    "User ID / Email":"یوزر آئی ڈی / ای میل",
    "Request access":"رسائی کی درخواست",
    "Request admin access":"ایڈمن رسائی کی درخواست",
    "Create first admin":"پہلا ایڈمن بنائیں",
    "Login ID ya registered email — dono chalega":"لاگ ان آئی ڈی یا رجسٹرڈ ای میل — دونوں چلیں گے",
    "Password":"پاس ورڈ",
    "Captcha — answer the sum":"کیپچا — جوڑ کا جواب لکھیں",
    "Answer":"جواب",
    "Login":"لاگ ان",
    "Email link se login (password ke bina)":"ای میل لنک سے لاگ ان (پاس ورڈ کے بغیر)",
    "Forgot password?":"پاس ورڈ بھول گئے؟",
    "Create admin":"ایڈمن بنائیں",
    "New captcha":"نیا کیپچا",
    "— none / Quran nahi seekha —":"— کوئی نہیں / قرآن نہیں پڑھا —",
    "Admins, settings aur account.":"ایڈمن، سیٹنگز اور اکاؤنٹ۔",
    "Koi pending request nahi.":"کوئی زیرِ التوا درخواست نہیں۔",
    "Drive setup baaki — config.js me GOOGLE_CLIENT_ID daalo (guide Settings me).":"ڈرائیو سیٹ اپ باقی ہے — config.js میں GOOGLE_CLIENT_ID ڈالیں (رہنمائی سیٹنگز میں)۔",
    "Owner details lock hain, change nahi ho sakte.":"مالک کی تفصیل مقفل ہے، تبدیل نہیں ہو سکتی۔",
    "Add / Change photo (Gallery)":"تصویر شامل / تبدیل کریں (گیلری)",
    "(koi scheme nahi)":"(کوئی اسکیم نہیں)",
    "Kabhi backup nahi liya — ek backup file download karke Drive me rakho.":"کبھی بیک اپ نہیں لیا — ایک بیک اپ فائل ڈاؤن لوڈ کر کے ڈرائیو میں رکھیں۔",
    "ek backup file download karke Drive me rakho.":"ایک بیک اپ فائل ڈاؤن لوڈ کر کے ڈرائیو میں رکھیں۔",
    "Mohalla ka survey — har ghar, har fard, taleem, kaam aur deeni khidmat ka hisaab ek jagah.":"محلے کا سروے — ہر گھر، ہر فرد، تعلیم، کام اور دینی خدمت کا حساب ایک جگہ۔",
    "Kaam ke hisaab se ginti — plumber, electrician, painter, helper…":"کام کے حساب سے گنتی — پلمبر، الیکٹریشن، پینٹر، ہیلپر…",
    "Deeni taleem — Aalim & Hafiz":"دینی تعلیم — عالم اور حافظ",
    "Kitne logon ke paas documents hain · kitne ne scheme li":"کتنے لوگوں کے پاس دستاویزات ہیں · کتنوں نے اسکیم لی",
    "Custom ID likho ya khaali chhod do — system khud ID de dega. QR isi ID se banta hai.":"اپنی آئی ڈی لکھیں یا خالی چھوڑ دیں — نظام خود آئی ڈی دے گا۔ QR اسی آئی ڈی سے بنتا ہے۔",
    "Kaam / occupation":"کام / پیشہ",
    "Deeni taleem":"دینی تعلیم",
    "Tap karke on/off karo — jo document jiske paas hai.":"ٹیپ کر کے آن/آف کریں — جو دستاویز جس کے پاس ہے۔",
    "Jitni scheme milti hai utni tap karo. \"Other scheme\" chuna to niche naam likho.":"جتنی اسکیمیں ملی ہیں اتنی ٹیپ کریں۔ «دیگر اسکیم» چنیں تو نیچے نام لکھیں۔",
    "\"Other scheme\" ka naam":"«دیگر اسکیم» کا نام",
    "Jo document ghar ke paas hai wahi list me dikhega. Naya add karne ke liye \"+ Add document\" dabao.":"جو دستاویز گھر کے پاس ہے وہی فہرست میں دکھے گی۔ نئی شامل کرنے کے لیے «+ دستاویز شامل کریں» دبائیں۔",
    "Abhi koi document add nahi hua.":"ابھی کوئی دستاویز شامل نہیں ہوئی۔",
    "Jo list me nahi hai (jaise Caste Certificate) — yahan apne naam se add karo.":"جو فہرست میں نہیں (جیسے ذات سرٹیفکیٹ) — یہاں اپنے نام سے شامل کریں۔",
    "Koi additional document nahi.":"کوئی اضافی دستاویز نہیں۔",
    "Phone number daalo ya QR scan karo — sirf usi ghar ka read-only detail dikhega (edit nahi).":"فون نمبر ڈالیں یا QR اسکین کریں — صرف اسی گھر کی تفصیل دکھے گی (ترمیم نہیں)۔",
    "Family ID daalo aur details dekho (sirf read-only).":"فیملی آئی ڈی ڈال کر تفصیل دیکھیں (صرف پڑھنے کے لیے)۔",
    "Camera ya gallery se QR scan karke Family ID se details khol do.":"کیمرہ یا گیلری سے QR اسکین کر کے فیملی آئی ڈی سے تفصیل کھولیں۔",
    "Masjid ki tafseel, imam/muazzin, tasveerein — report ke saath print hoti hain.":"مسجد کی تفصیل، امام/مؤذن، تصاویر — رپورٹ کے ساتھ پرنٹ ہوتی ہیں۔",
    "Masjid ki poori tafseel aur tasveerein — survey report ke saath chhapti hain.":"مسجد کی پوری تفصیل اور تصاویر — سروے رپورٹ کے ساتھ چھپتی ہیں۔",
    "Masjid ka naam":"مسجد کا نام",
    "Masjid ka email ID":"مسجد کا ای میل آئی ڈی",
    "Imam sahab ka naam":"امام صاحب کا نام",
    "Muazzin ka naam":"مؤذن کا نام",
    "Masjid ki tasveerein":"مسجد کی تصاویر",
    "har photo phone me hi save hoti hai":"ہر تصویر اسی فون میں محفوظ ہوتی ہے",
    "Abhi koi photo nahi":"ابھی کوئی تصویر نہیں",
    "Gallery se chuno":"گیلری سے چنیں",
    "Photo apne aap chhoti (compress) ho jati hai, isliye data bhi kam jagah leta hai.":"تصویر خود بخود چھوٹی (کمپریس) ہو جاتی ہے، اس لیے ڈیٹا بھی کم جگہ لیتا ہے۔",
    "e.g. 60 bachche, 3 ustad":"مثلاً ۶۰ بچے، ۳ استاد",
    "Tareekh, khidmat, koi khaas baat":"تاریخ، خدمت، کوئی خاص بات",
    "Note / khaas baat":"نوٹ / خاص بات",
    "Deeni":"دینی",
    "Naam ya Family ID se dhoondo…":"نام یا فیملی آئی ڈی سے تلاش کریں…",
    "Family ID / ghar / street se dhoondo…":"فیملی آئی ڈی / گھر / گلی سے تلاش کریں…",
    "Kisi street par tap karo → us street ke ghar dikhenge.":"کسی گلی پر ٹیپ کریں → اس گلی کے گھر دکھیں گے۔",
    "Abhi koi record nahi hai.":"ابھی کوئی ریکارڈ نہیں۔",
    "Abhi koi scheme mark nahi hui — member form me scheme chips tap karo.":"ابھی کوئی اسکیم نشان زد نہیں — ممبر فارم میں اسکیم چپس ٹیپ کریں۔",
    "Admin approve ho gaya — credentials usko bhej do":"ایڈمن منظور ہو گیا — اسے اسناد بھیج دیں",
    "Admin ban gaya — credentials dekho":"ایڈمن بن گیا — اسناد دیکھیں",
    "Admin nahi mila.":"ایڈمن نہیں ملا۔",
    "Apna account nahi hata sakte":"اپنا اکاؤنٹ نہیں ہٹا سکتے",
    "Backup downloaded — is file ko Google Drive / laptop me rakh do":"بیک اپ ڈاؤن لوڈ ہو گیا — یہ فائل گوگل ڈرائیو / لیپ ٹاپ میں رکھیں",
    "Backup file me families nahi mili":"بیک اپ فائل میں خاندان نہیں ملے",
    "Camera access nahi mila. Settings se allow karo.":"کیمرہ کی اجازت نہیں ملی۔ سیٹنگز سے اجازت دیں۔",
    "Cloud connect nahi hua":"کلاؤڈ سے رابطہ نہیں ہوا",
    "Cloud connect nahi hua — internet check karo.":"کلاؤڈ سے رابطہ نہیں ہوا — انٹرنیٹ چیک کریں۔",
    "Cloud connect nahi hua.":"کلاؤڈ سے رابطہ نہیں ہوا۔",
    "Cloud me save nahi hua — baad me retry karega":"کلاؤڈ میں محفوظ نہیں ہوا — بعد میں دوبارہ کوشش کرے گا",
    "Cloud off — public site ko totals nahi bheje ja sakte":"کلاؤڈ بند ہے — عوامی سائٹ کو اعداد نہیں بھیجے جا سکتے",
    "Code galat hai — dobara dekho.":"کوڈ غلط ہے — دوبارہ دیکھیں۔",
    "Connect dabao to Drive on karein.":"ڈرائیو آن کرنے کے لیے «رابطہ» دبائیں۔",
    "Connect nahi hua — dobara try karo":"رابطہ نہیں ہوا — دوبارہ کوشش کریں",
    "Copy ho gaya":"کاپی ہو گیا",
    "Copy nahi hua — haath se likh lo":"کاپی نہیں ہوا — ہاتھ سے لکھ لیں",
    "Deeni Taleem":"دینی تعلیم",
    "Drive backup ho gaya":"ڈرائیو بیک اپ ہو گیا",
    "Drive folder banane me fail (":"ڈرائیو فولڈر بنانے میں ناکامی (",
    "Drive ke liye Google OAuth Client ID chahiye (config.js me)":"ڈرائیو کے لیے گوگل OAuth کلائنٹ آئی ڈی درکار ہے (config.js میں)",
    "Drive setup baaki hai":"ڈرائیو سیٹ اپ باقی ہے",
    "Email login ke liye cloud on hona chahiye.":"ای میل لاگ ان کے لیے کلاؤڈ آن ہونا چاہیے۔",
    "Excel library load nahi hui — page refresh karo":"ایکسل لائبریری لوڈ نہیں ہوئی — صفحہ ریفریش کریں",
    "Family ID me sirf letters, numbers, - _ / chalega (3-32 characters).":"فیملی آئی ڈی میں صرف حروف، ہندسے، - _ / چلیں گے (۳-۳۲ حروف)۔",
    "File padhi nahi ja saki":"فائل پڑھی نہیں جا سکی",
    "Google Drive se connect ho raha hai…":"گوگل ڈرائیو سے رابطہ ہو رہا ہے…",
    "Google script load nahi hua":"گوگل اسکرپٹ لوڈ نہیں ہوا",
    "Image load nahi hua.":"تصویر لوڈ نہیں ہوئی۔",
    "Is Family ID se koi ghar nahi mila.":"اس فیملی آئی ڈی سے کوئی گھر نہیں ملا۔",
    "Is browser me camera support nahi.":"اس براؤزر میں کیمرہ سپورٹ نہیں۔",
    "Is email se koi admin nahi hai.":"اس ای میل سے کوئی ایڈمن نہیں ہے۔",
    "Is image me QR nahi mila. Dusri image try karo.":"اس تصویر میں QR نہیں ملا۔ دوسری تصویر آزمائیں۔",
    "Kabhi backup nahi liya":"کبھی بیک اپ نہیں لیا",
    "Kam se kam 6 characters.":"کم از کم ۶ حروف۔",
    "Kam se kam ek admin rehna chahiye":"کم از کم ایک ایڈمن رہنا چاہیے",
    "Koi record nahi mila. Family ID ya phone number check karo.":"کوئی ریکارڈ نہیں ملا۔ فیملی آئی ڈی یا فون نمبر چیک کریں۔",
    "Login link bhej diya":"لاگ ان لنک بھیج دیا",
    "Lookup nahi hua.":"تلاش نہیں ہو سکی۔",
    "Lookup nahi hua. Thodi der baad try karo.":"تلاش نہیں ہو سکی۔ کچھ دیر بعد کوشش کریں۔",
    "Masjid details save ho gayi":"مسجد کی تفصیل محفوظ ہو گئی",
    "Naam: ":"نام: ",
    "Owner email save ho gaya":"مالک کا ای میل محفوظ ہو گیا",
    "Owner — approvals bhi":"مالک — منظوری بھی",
    "Pehle Drive setup karo — config.js me GOOGLE_CLIENT_ID chahiye":"پہلے ڈرائیو سیٹ اپ کریں — config.js میں GOOGLE_CLIENT_ID درکار ہے",
    "Pehle upar apna email daalo, phir ye button dabao.":"پہلے اوپر اپنا ای میل ڈالیں، پھر یہ بٹن دبائیں۔",
    "Photo add ho gayi":"تصویر شامل ہو گئی",
    "Photo add nahi hui — dusri image try karo":"تصویر شامل نہیں ہوئی — دوسری تصویر آزمائیں",
    "Popup block hua hai - popup allow karo":"پاپ اپ بلاک ہوا ہے - پاپ اپ کی اجازت دیں",
    "Public totals refresh ho gaye":"عوامی اعداد تازہ ہو گئے",
    "QR image scan ho raha hai...":"QR تصویر اسکین ہو رہی ہے...",
    "QR mila":"QR مل گیا",
    "Camera band karo":"کیمرہ بند کریں",
    "Camera band":"کیمرہ بند",
    "QR mila: ":"QR ملا: ",
    "QR scan ho raha hai...":"QR اسکین ہو رہا ہے...",
    "QR scanner load nahi hua.":"QR اسکینر لوڈ نہیں ہوا۔",
    "Refresh fail — schema v4 run hua hai?":"ریفریش ناکام — کیا schema v4 چلا ہے؟",
    "Request nahi mili":"درخواست نہیں ملی",
    "Request reject ho gayi":"درخواست مسترد ہو گئی",
    "Reset link bhej diya":"ری سیٹ لنک بھیج دیا",
    "Restore ho gaya":"بحال ہو گیا",
    "Save nahi hua — storage bhar gaya. Kuch photos hata ke dobara koshish karo.":"محفوظ نہیں ہوا — اسٹوریج بھر گیا۔ کچھ تصاویر ہٹا کر دوبارہ کوشش کریں۔",
    "Saved — next household ke liye form ready":"محفوظ ہو گیا — اگلے گھر کے لیے فارم تیار ہے",
    "Scan nahi ho saka.":"اسکین نہیں ہو سکا۔",
    "Scheme mili — members":"اسکیم ملی — ارکان",
    "Scheme nahi mili — members":"اسکیم نہیں ملی — ارکان",
    "Sirf admin":"صرف ایڈمن",
    "Sirf owner":"صرف مالک",
    "Sirf owner admin hata sakta hai":"صرف مالک ایڈمن ہٹا سکتا ہے",
    "Sirf owner approve kar sakta hai":"صرف مالک منظور کر سکتا ہے",
    "Sirf owner badal sakta hai":"صرف مالک تبدیل کر سکتا ہے",
    "Sirf owner edit kar sakta hai":"صرف مالک ترمیم کر سکتا ہے",
    "Sirf owner naya admin add kar sakta hai":"صرف مالک نیا ایڈمن شامل کر سکتا ہے",
    "Sirf owner reject kar sakta hai":"صرف مالک مسترد کر سکتا ہے",
    "Sirf totals (naam/phone kabhi nahi)":"صرف کل اعداد (نام/فون کبھی نہیں)",
    "User ID / email galat lag raha hai.":"یوزر آئی ڈی / ای میل غلط لگ رہی ہے۔",
    "Ye Family ID pehle se kisi ghar ke paas hai — koi aur do.":"یہ فیملی آئی ڈی پہلے سے کسی گھر کے پاس ہے — کوئی دوسری دیں۔",
    "Ye JSON backup file nahi hai":"یہ JSON بیک اپ فائل نہیں ہے",
    "Ye account abhi approval pending hai — owner approve karega tabhi login hoga.":"یہ اکاؤنٹ ابھی منظوری کے انتظار میں ہے — مالک منظور کرے گا تبھی لاگ ان ہوگا۔",
    "Ye email approved admin list me nahi hai. “Request access” se owner ko request bhejo.":"یہ ای میل منظور شدہ ایڈمن فہرست میں نہیں۔ «رسائی کی درخواست» سے مالک کو درخواست بھیجیں۔",
    "Ye email pehle se admin hai":"یہ ای میل پہلے سے ایڈمن ہے",
    "Ye email pehle se registered hai. Forgot password? par jao → email par link aayega → click karke password set karo, phir login.":"یہ ای میل پہلے سے رجسٹرڈ ہے۔ «پاس ورڈ بھول گئے؟» پر جائیں → ای میل پر لنک آئے گا → اس پر کلک کر کے پاس ورڈ بنائیں، پھر لاگ ان کریں۔",
    "Ye page sirf admin ke liye hai":"یہ صفحہ صرف ایڈمن کے لیے ہے",
    "Ye sirf admin kar sakta hai":"یہ صرف ایڈمن کر سکتا ہے",
    "Aaj backup liya":"آج بیک اپ لیا",
    "din pehle backup liya":"دن پہلے بیک اپ لیا",
    "date nahi hai":"تاریخ نہیں ہے",
    "kabhi nahi":"کبھی نہیں",
    "Ye admin account hata dein?":"یہ ایڈمن اکاؤنٹ ہٹا دیں؟",
    "Is device ka current data backup se replace ho jayega.":"اس ڈیوائس کا موجودہ ڈیٹا بیک اپ سے بدل جائے گا۔",
    "Sirf admin / super admin ke liye. Baaki sab public dashboard dekh sakte hain.":"صرف ایڈمن / سپر ایڈمن کے لیے۔ باقی سب عوامی ڈیش بورڈ دیکھ سکتے ہیں۔",
    "Back to public site":"عوامی سائٹ پر واپس",
    "User ID / Email ID":"یوزر آئی ڈی / ای میل آئی ڈی",
    "Super admin panel — admins, settings aur account.":"سپر ایڈمن پینل — ایڈمن، سیٹنگز اور اکاؤنٹ۔",
    "Super admin naye admins banata hai, password reset karta hai aur website control karta hai.":"سپر ایڈمن نئے ایڈمن بناتا ہے، پاس ورڈ ری سیٹ کرتا ہے اور ویب سائٹ کنٹرول کرتا ہے۔",
    "Add a new admin":"نیا ایڈمن شامل کریں",
    "Login isi email ya User ID se hoga":"لاگ ان اسی ای میل یا یوزر آئی ڈی سے ہوگا",
    "User ID aur password app khud banayegi — bante hi screen par dikhenge, admin ko bhej do.":"یوزر آئی ڈی اور پاس ورڈ ایپ خود بنائے گی — بنتے ہی اسکرین پر دکھیں گے، ایڈمن کو بھیج دیں۔",
    "Naye admin ka login — usko bhejo":"نئے ایڈمن کا لاگ ان — اسے بھیجیں",
    "App ne khud banaya hai. Ye details sirf us admin ko do, kisi aur ko nahi.":"ایپ نے خود بنایا ہے۔ یہ تفصیل صرف اس ایڈمن کو دیں، کسی اور کو نہیں۔",
    "Ye login turant kaam karta hai. Admin pehli baar login karke My Profile se photo/naam badal sakta hai.":"یہ لاگ ان فوراً کام کرتا ہے۔ ایڈمن پہلی بار لاگ ان کر کے «میری پروفائل» سے تصویر/نام بدل سکتا ہے۔",
    "Reset password":"پاس ورڈ ری سیٹ",
    "Naya password ban gaya":"نیا پاس ورڈ بن گیا",
    "Active admins (Super Admin + Admin)":"فعال ایڈمن (مالک + صارف)",
    "Pending requests (legacy)":"زیرِ التوا درخواستیں (پرانی)",
    "Change password":"پاس ورڈ بدلیں",
    "Current password":"موجودہ پاس ورڈ",
    "New password":"نیا پاس ورڈ",
    "Confirm new password":"نیا پاس ورڈ دوبارہ",
    "Update password":"پاس ورڈ اپ ڈیٹ کریں",
    "Kam se kam 6 characters. Password bhool jao to super admin reset kar sakta hai.":"کم از کم ۶ حروف۔ پاس ورڈ بھول جائیں تو سپر ایڈمن ری سیٹ کر سکتا ہے۔",
    "Current password galat hai":"موجودہ پاس ورڈ غلط ہے",
    "Password updated":"پاس ورڈ اپ ڈیٹ ہو گیا",
    "Aapko admin access de diya gaya hai.":"آپ کو ایڈمن رسائی دے دی گئی ہے۔",
    "Topbar me \"Admin\" dabao → User ID + password se login karo.":"ٹاپ بار میں «ایڈمن» دبائیں → یوزر آئی ڈی + پاس ورڈ سے لاگ ان کریں۔",
    "Login ke baad My Profile se apna password badal lo.":"لاگ ان کے بعد «میری پروفائل» سے اپنا پاس ورڈ بدل لیں۔",
    "ID Card Design":"آئی ڈی کارڈ ڈیزائن",
    "Card ka logo, background, text aur terms — sab yahan se badlo.":"کارڈ کا لوگو، پس منظر، متن اور شرائط — سب یہاں سے بدلیں۔",
    "Logo, background photo, colour, text aur back-side terms — sab editable.":"لوگو، پس منظر تصویر، رنگ، متن اور پچھلی طرف کی شرائط — سب قابلِ ترمیم۔",
    "Open designer":"ڈیزائنر کھولیں",
    "Logo & background":"لوگو اور پس منظر",
    "Committee logo (card ke header me)":"کمیٹی لوگو (کارڈ کے سرورق میں)",
    "Upload logo":"لوگو اپ لوڈ کریں",
    "Card background photo":"کارڈ کی پس منظر تصویر",
    "Upload background":"پس منظر اپ لوڈ کریں",
    "Remove":"ہٹائیں",
    "None":"کوئی نہیں",
    "Background photo strength":"پس منظر تصویر کی شدت",
    "0 = sirf pattern · 60 = photo zyada dikhe":"۰ = صرف پیٹرن · ۶۰ = تصویر زیادہ دکھے",
    "Card colour":"کارڈ کا رنگ",
    "Header, Family ID aur lines ka rang":"سرورق، فیملی آئی ڈی اور لکیروں کا رنگ",
    "Text size":"متن کا سائز",
    "Normal":"عام",
    "Bada (default)":"بڑا (ڈیفالٹ)",
    "Bahut bada":"بہت بڑا",
    "Sabse bada":"سب سے بڑا",
    "Card par likha text":"کارڈ پر لکھا متن",
    "Committee / masjid naam":"کمیٹی / مسجد کا نام",
    "Chhota naam (committee)":"چھوٹا نام (کمیٹی)",
    "Card ka tag":"کارڈ کا ٹیگ",
    "Footer — left":"فوٹر — بائیں",
    "Footer — right":"فوٹر — دائیں",
    "Khaali = members + date":"خالی = ارکان + تاریخ",
    "Khaali = committee naam":"خالی = کمیٹی کا نام",
    "Back side — Terms & Conditions":"پچھلی طرف — شرائط و ضوابط",
    "Terms (card ke peeche chhapte hain)":"شرائط (کارڈ کے پیچھے چھپتی ہیں)",
    "Mutavalli se approve hone ke baad yahan final terms likh do — card ke back side par wahi chhapega.":"متولی سے منظوری کے بعد یہاں حتمی شرائط لکھ دیں — کارڈ کے پچھلے حصے پر وہی چھپیں گی۔",
    "Save card design":"کارڈ ڈیزائن محفوظ کریں",
    "Preview card":"کارڈ دیکھیں",
    "Reset to default":"ڈیفالٹ پر واپس",
    "Preview ke liye pehle ek family add karo.":"دیکھنے کے لیے پہلے ایک خاندان شامل کریں۔",
    "Super admin only":"صرف سپر ایڈمن",
    "Card design sirf super admin badal sakta hai.":"کارڈ ڈیزائن صرف سپر ایڈمن بدل سکتا ہے۔",
    "Card design save ho gaya":"کارڈ ڈیزائن محفوظ ہو گیا",
    "Card design reset ho gaya":"کارڈ ڈیزائن ری سیٹ ہو گیا",
    "Logo lag gaya":"لوگو لگ گیا",
    "Background lag gaya":"پس منظر لگ گیا",
    "Hata diya":"ہٹا دیا",
    "Pehle ek family add karo":"پہلے ایک خاندان شامل کریں",
    "Sirf super admin":"صرف سپر ایڈمن",
    "Signature (card ke peeche)":"دستخط (کارڈ کے پیچھے)",
    "Mutavalli ka signature":"متولی کے دستخط",
    "Secretary ka signature":"سیکرٹری کے دستخط",
    "Member ka signature":"ممبر کے دستخط",
    "Abhi nahi lagaya":"ابھی نہیں لگایا",
    "Camera":"کیمرہ",
    "Gallery":"گیلری",
    "Signature white paper par likh kar photo lo — camera ya gallery se. Photo ka background auto white ho jata hai.":"دستخط سفید کاغذ پر لکھ کر تصویر لیں — کیمرہ یا گیلری سے۔ تصویر کا پس منظر خود بخود سفید ہو جاتا ہے۔",
    "Signature lag gaya":"دستخط لگ گیا",
    "Photo load nahi hui.":"تصویر لوڈ نہیں ہوئی۔",
    "Galat signature slot":"غلط دستخط خانہ",
    "Naya admin add karo ya existing admin ka login dekho.":"نیا ایڈمن شامل کریں یا موجودہ ایڈمن کا لاگ ان دیکھیں۔",
    "Admins":"ایڈمن",
    "View admins":"ایڈمن دیکھیں",
    "Hide admins":"ایڈمن چھپائیں",
    "+ Add admin":"+ ایڈمن شامل کریں",
    "Pending requests":"زیرِ التوا درخواستیں",
    "Right-click band hai":"رائٹ کلک بند ہے",
    "Ye shortcut band hai":"یہ شارٹ کٹ بند ہے",
    "Registered":"رجسٹرڈ",
    "Last updated":"آخری اپ ڈیٹ",
    "Updated":"اپ ڈیٹ",
    "Data updated:":"ڈیٹا اپ ڈیٹ:",
    "ID & password format":"آئی ڈی اور پاس ورڈ فارمیٹ",
    "User ID ya email":"یوزر آئی ڈی یا ای میل",
    "Isi ID ya apne email se login hota hai.":"اسی آئی ڈی یا اپنے ای میل سے لاگ ان ہوتا ہے۔",
    "Apni User ID login ke baad My Profile me dikhti hai — email se bhi login ho sakta hai.":"اپنی یوزر آئی ڈی لاگ ان کے بعد «میری پروفائل» میں دکھتی ہے — ای میل سے بھی لاگ ان ہو سکتا ہے۔",
    "Site khud update hoti hai. Purana version dikh raha ho to neeche wala button dabao — cache saaf ho kar naya version khul jayega.":"سائٹ خود اپ ڈیٹ ہوتی ہے۔ پرانا ورژن دکھ رہا ہو تو نیچے والا بٹن دبائیں — کیش صاف ہو کر نیا ورژن کھل جائے گا۔",
    "User ID style":"یوزر آئی ڈی کا انداز",
    "Random (recommended)":"بے ترتیب (تجویز کردہ)",
    "Number series":"نمبر سیریز",
    "Super admin ID prefix":"سپر ایڈمن آئی ڈی پریفکس",
    "Admin ID prefix":"ایڈمن آئی ڈی پریفکس",
    "Admin ID start number (series style)":"ایڈمن آئی ڈی آغاز نمبر (سیریز انداز)",
    "Har naye admin ko alag random ID":"ہر نئے ایڈمن کو الگ بے ترتیب آئی ڈی",
    "Sirf number-series style me — default 101":"صرف نمبر سیریز انداز میں — ڈیفالٹ ۱۰۱",
    "Admin ID suffix":"ایڈمن آئی ڈی سفکس",
    "ID ke aakhir me — khaali bhi chhod sakte ho":"آئی ڈی کے آخر میں — خالی بھی چھوڑ سکتے ہیں",
    "Password prefix":"پاس ورڈ پریفکس",
    "Password suffix":"پاس ورڈ سفکس",
    "Beech ke 6 characters hamesha random rehte hain":"درمیان کے ۶ حروف ہمیشہ بے ترتیب رہتے ہیں",
    "Family ID prefix":"فیملی آئی ڈی پریفکس",
    "Family ID style":"فیملی آئی ڈی کا انداز",
    "Random (tough)":"بے ترتیب (مشکل)",
    "Simple":"سادہ",
    "Save ID format":"آئی ڈی فارمیٹ محفوظ کریں",
    "ID format save ho gaya":"آئی ڈی فارمیٹ محفوظ ہو گیا",
    "ID shuru me:":"آئی ڈی شروع میں:",
    "Card size":"کارڈ کا سائز",
    "5 × 3 inch — landscape (default)":"۵ × ۳ انچ — افقی (ڈیفالٹ)",
    "3 × 5 inch — portrait":"۳ × ۵ انچ — عمودی",
    "ID-1 (85.6 × 54 mm)":"ID-1 (۸۵.۶ × ۵۴ ملی میٹر)",
    "5×3 = chaudi card, QR bada aur text saaf":"۵×۳ = چوڑا کارڈ، QR بڑا اور متن صاف",
    "Audit log":"آڈٹ لاگ",
    "Kab kisne kya kiya":"کب کس نے کیا کیا",
    "Sab":"سب",
    "Data":"ڈیٹا",
    "Settings":"سیٹنگز",
    "Today":"آج",
    "Yesterday":"کل",
    "Koi entry nahi":"کوئی اندراج نہیں",
    "Admin jab kuch add/edit karega, entry yahan dikhegi.":"ایڈمن جب کچھ شامل/ترمیم کرے گا، اندراج یہاں دکھے گا۔",
    "Search — naam, family, action…":"تلاش — نام، خاندان، کارروائی…",
    "Clear log":"لاگ صاف کریں",
    "Household add":"گھر شامل",
    "Household edit":"گھر ترمیم",
    "Household delete":"گھر حذف",
    "Admin add":"ایڈمن شامل",
    "Admin edit":"ایڈمن ترمیم",
    "Admin remove":"ایڈمن ہٹایا",
    "Setting change":"سیٹنگ تبدیلی",
    "Masjid profile save":"مسجد پروفائل محفوظ",
    "Public totals publish":"عوامی اعداد شائع",
    "Backup":"بیک اپ",
    "Drive backup":"ڈرائیو بیک اپ",
    "Restore":"بحال کریں",
    "All data erased":"سارا ڈیٹا مٹایا",
    "Password change":"پاس ورڈ تبدیلی",
    "Audit log cleared":"آڈٹ لاگ صاف",
    "Login fail":"لاگ ان ناکام",
    "Logout":"لاگ آؤٹ",
    "Server se entries load ho rahi hain…":"سرور سے اندراجات لوڈ ہو رہے ہیں…",
    "Server entries included":"سرور کے اندراجات شامل",
    "Is device ka log — cross-device ke liye supabase/audit.sql run karo":"اس ڈیوائس کا لاگ — ہر ڈیوائس پر کے لیے supabase/audit.sql چلائیں",
    "entries":"اندراجات",
    "Qayam saal":"قیام کا سال",
    "Pura pata":"پورا پتہ",
    "Rabta number":"رابطہ نمبر",
    "Raqba (sq ft / gaj)":"رقبہ (مربع فٹ / گز)",
    "Namazi capacity":"نمازی گنجائش",
    "Kamre / halls":"کمرے / ہال",
    "Madrasa / maktab":"مدرسہ / مکتب",
    "Waqf / registration no.":"وقف / رجسٹریشن نمبر",
    "Bank / account detail":"بینک / اکاؤنٹ تفصیل",
    "Note / special remark":"نوٹ / خاص ریمارک",
    "Save masjid details":"مسجد کی تفصیل محفوظ کریں",
    "Choose from gallery":"گیلری سے چنیں",
    "each photo stays on this phone":"ہر تصویر اسی فون میں رہتی ہے",
    "Mohalla, shehar, pincode":"محلہ، شہر، پن کوڈ",
    "e.g. Masjid e Mohammadi":"مثلاً مسجدِ محمدی",
    "10-digit mobile":"۱۰ ہندسوں کا موبائل",
    "Naye admins sirf owner approve kar sakta hai.":"نئے ایڈمن صرف مالک منظور کر سکتا ہے۔",
    "Abhi kisi ka occupation nahi bhara — member form me \"Kaam / occupation\" likho (jaise Plumber).":"ابھی کسی کا پیشہ درج نہیں — ممبر فارم میں «کام / پیشہ» لکھیں (مثلاً پلمبر)۔",
    "— locked":"— مقفل",
    "optional, leave empty for auto-generate":"اختیاری — خودکار بنانے کے لیے خالی چھوڑ دیں",
    "(Owner)":"(مالک)",
    "← Back":"→ واپس",
    "+ Add custom document":"+ اپنی دستاویز شامل کریں",
    "+ Add document":"+ دستاویز شامل کریں",
    "+ Add Household":"+ گھر شامل کریں",
    "+ Add member":"+ رکن شامل کریں",
    "+ Photo":"+ تصویر",
    "1 · Location & housing":"۱ · مقام اور رہائش",
    "2 · Members":"۲ · ارکان",
    "Aadhaar":"آدھار",
    "Aalima (women)":"عالمہ (خواتین)",
    "Account":"اکاؤنٹ",
    "Additional Documents":"اضافی دستاویزات",
    "Address / landmark":"پتہ / نشانی",
    "Administration":"انتظامیہ",
    "Admins & approval":"ایڈمن اور منظوری",
    "Age":"عمر",
    "All households":"تمام گھر",
    "All members":"تمام ارکان",
    "All streets":"تمام گلیاں",
    "All Students":"تمام طلبہ",
    "Any remark about this household":"اس گھر کے بارے میں کوئی ریمارک",
    "App version":"ایپ ورژن",
    "Appearance":"ظاہری شکل",
    "Auto: MEMC-2026-000001":"خودکار: MEMC-2026-000001",
    "Ayushman Bharat":"آیوشمان بھارت",
    "Backup (JSON)":"بیک اپ (JSON)",
    "Backup now":"ابھی بیک اپ لیں",
    "Backup reminder:":"بیک اپ یاد دہانی:",
    "Backup to Drive":"ڈرائیو پر بیک اپ",
    "Bank passbook":"بینک پاس بک",
    "Basic government documents":"بنیادی سرکاری دستاویزات",
    "Birth certificate":"پیدائش سرٹیفکیٹ",
    "Births this month":"اس ماہ پیدائشیں",
    "By Family ID":"فیملی آئی ڈی سے",
    "By QR scan":"QR اسکین سے",
    "Cancel":"منسوخ",
    "Cement sheet (house type)":"سیمنٹ شیٹ (مکان کی قسم)",
    "Cement sheet houses":"سیمنٹ شیٹ کے گھر",
    "Challenged":"معذور",
    "Click sidebar logo to change website logo • Click your avatar to edit your profile • Super admin can add/edit/remove admins with photo, email, phone and age":"سائٹ کا لوگو بدلنے کے لیے سائیڈ بار کا لوگو دبائیں • پروفائل بدلنے کے لیے اپنا اوتار دبائیں • سپر ایڈمن تصویر، ای میل، فون اور عمر کے ساتھ ایڈمن شامل/ترمیم/ہٹا سکتا ہے",
    "Click to open full details":"پوری تفصیل کھولنے کے لیے دبائیں",
    "Click to upload/change website logo from gallery":"گیلری سے سائٹ کا لوگو اپ لوڈ یا تبدیل کرنے کے لیے دبائیں",
    "College students":"کالج کے طلبہ",
    "College Students":"کالج کے طلبہ",
    "Connect Google Drive":"گوگل ڈرائیو سے رابطہ",
    "Dashboard":"ڈیش بورڈ",
    "Data & backup":"ڈیٹا اور بیک اپ",
    "Date of birth":"تاریخِ پیدائش",
    "Day":"دن",
    "Deaths this month":"اس ماہ وفیات",
    "Del":"حذف",
    "Disability pension":"معذوری پنشن",
    "Docs":"دستاویزات",
    "Documents & Govt. Schemes":"دستاویزات اور سرکاری اسکیمیں",
    "Documents held":"موجود دستاویزات",
    "e.g. Abdul Rahman":"مثلاً عبدالرحمٰن",
    "e.g. CM relief fund":"مثلاً وزیراعلیٰ ریلیف فنڈ",
    "e.g. Masjid Road":"مثلاً مسجد روڈ",
    "Edit":"ترمیم",
    "Editable":"قابلِ ترمیم",
    "Education":"تعلیم",
    "eg XXXXX01":"مثلاً XXXXX01",
    "Email":"ای میل",
    "Emerald Lattice theme · day & night.":"ایمرلڈ لیٹس تھیم · دن اور رات۔",
    "Employment status":"ملازمت کی حالت",
    "Export Excel (.xlsx)":"ایکسل ایکسپورٹ (.xlsx)",
    "Export PDF / Print":"PDF ایکسپورٹ / پرنٹ",
    "Family & Demographics":"خاندان اور آبادی",
    "Family ID":"فیملی آئی ڈی",
    "FAMILY ID":"فیملی آئی ڈی",
    "Father name":"والد کا نام",
    "Fill the household details, then add each member.":"گھر کی تفصیل بھریں، پھر ہر رکن شامل کریں۔",
    "Find":"تلاش",
    "Find family":"خاندان تلاش کریں",
    "Force update":"زبردستی اپ ڈیٹ",
    "Free bus pass":"مفت بس پاس",
    "Full name *":"پورا نام *",
    "Gender":"جنس",
    "Government / welfare schemes":"سرکاری / فلاحی اسکیمیں",
    "Higher secondary students":"ہائر سیکنڈری طلبہ",
    "Higher Secondary Students":"ہائر سیکنڈری طلبہ",
    "House no.":"مکان نمبر",
    "House number":"مکان نمبر",
    "House type":"مکان کی قسم",
    "Household":"گھر",
    "Household / head name *":"گھر / سربراہ کا نام *",
    "Households":"گھر",
    "ID Cards":"آئی ڈی کارڈ",
    "Kapidu Thittam card":"کپیڈو تھٹم کارڈ",
    "Khidmath Committee":"خدمت کمیٹی",
    "Khidmath Committee · Survey":"خدمت کمیٹی · سروے",
    "Language":"زبان",
    "Location & Housing":"مقام اور رہائش",
    "Log out":"لاگ آؤٹ",
    "Logged in as":"لاگ ان بطور",
    "Logged in:":"لاگ ان:",
    "Madarsa students":"مدرسہ کے طلبہ",
    "Madarsa Students":"مدرسہ کے طلبہ",
    "Magalir Urimai Thogai":"مگلر ارمئی توگئی",
    "male":"مرد",
    "female":"خاتون",
    "Marital":"ازدواجی حالت",
    "Marital status":"ازدواجی حالت",
    "Married":"شادی شدہ",
    "Married men":"شادی شدہ مرد",
    "Married women":"شادی شدہ خواتین",
    "Masjid e Mohammadi":"مسجدِ محمدی",
    "Masjid Profile":"مسجد پروفائل",
    "Max 6":"زیادہ سے زیادہ ۶",
    "Member 1":"رکن ۱",
    "Members with an occupation":"پیشہ رکھنے والے ارکان",
    "Men Aalim":"مرد عالم",
    "Men Hafiz":"مرد حافظ",
    "Mohalla, gali, landmark":"محلہ، گلی، نشانی",
    "Mother name":"والدہ کا نام",
    "Moulding (house type)":"ڈھلائی (مکان کی قسم)",
    "Moulding houses":"ڈھلائی کے گھر",
    "Mufti (men)":"مفتی (مرد)",
    "My Profile - Edit photo/name/phone":"میری پروفائل - تصویر/نام/فون میں ترمیم",
    "Name":"نام",
    "Nazira (men)":"ناظرہ (مرد)",
    "Nazira (women)":"ناظرہ (خواتین)",
    "No documents marked.":"کوئی دستاویز نشان زد نہیں۔",
    "Notes (optional)":"نوٹس (اختیاری)",
    "Number of children":"بچوں کی تعداد",
    "Occupations":"پیشے",
    "Old age pension":"بڑھاپے کی پنشن",
    "Open menu":"مینو کھولیں",
    "Other / kachcha (house type)":"دیگر / کچا (مکان کی قسم)",
    "Other / kachcha houses":"دیگر / کچے گھر",
    "Other scheme":"دیگر اسکیم",
    "Owner":"مالک",
    "Owner (Fixed)":"مالک (مقرر)",
    "Palm leaf (house type)":"تال پتّے کی چھت (مکان کی قسم)",
    "Palm leaf houses":"تال پتّے کے گھر",
    "PAN card":"پین کارڈ",
    "Passport":"پاسپورٹ",
    "PDF / Print":"PDF / پرنٹ",
    "Phone":"فون",
    "Phone number":"فون نمبر",
    "Physically challenged — all":"معذور — سب",
    "Physically challenged (total)":"معذور (کل)",
    "Physically challenged men":"معذور مرد",
    "Physically challenged women":"معذور خواتین",
    "Plumber, Electrician, Painter, Helper…":"پلمبر، الیکٹریشن، پینٹر، ہیلپر…",
    "PM Awas Yojana":"پی ایم آواس یوجنا",
    "Primary (1-5)":"پرائمری (۱-۵)",
    "Primary students":"پرائمری طلبہ",
    "Primary Students":"پرائمری طلبہ",
    "Public totals refresh":"عوامی اعداد تازہ کریں",
    "Read-only public view":"عوامی منظر (صرف پڑھنے کے لیے)",
    "Relation":"رشتہ",
    "Relation to head":"سربراہ سے رشتہ",
    "Religious Education":"دینی تعلیم",
    "Restore & Google Drive":"بحالی اور گوگل ڈرائیو",
    "Restore from backup file":"بیک اپ فائل سے بحال کریں",
    "Save & add another":"محفوظ کریں اور اگلا شامل کریں",
    "Save & generate Family ID":"محفوظ کریں اور فیملی آئی ڈی بنائیں",
    "Scan from camera":"کیمرے سے اسکین",
    "Scan QR to open edit form after admin login. QR contains Family ID.":"ایڈمن لاگ ان کے بعد ترمیم فارم کھولنے کے لیے QR اسکین کریں۔ QR میں فیملی آئی ڈی ہے۔",
    "Scheme-wise count":"اسکیم کے حساب سے گنتی",
    "Schemes":"اسکیمیں",
    "School scholarship":"اسکول اسکالرشپ",
    "School TC":"اسکول ٹی سی",
    "Search household, Family ID, phone, street…":"گھر، فیملی آئی ڈی، فون، گلی تلاش کریں…",
    "Self":"خود",
    "Self / Wife / Son…":"خود / بیوی / بیٹا…",
    "session start":"سیشن شروع",
    "Smart card":"اسمارٹ کارڈ",
    "Street name *":"گلی کا نام *",
    "Super Admin":"مالک · ایڈمن",
    "Total Aalim & Hafiz":"کل عالم اور حافظ",
    "Total Aalim & Hafiz (men + women)":"کل عالم اور حافظ (مرد + خواتین)",
    "Total child / students":"کل بچے / طلبہ",
    "Type":"قسم",
    "Ujjwala gas":"اجولا گیس",
    "Unmarried":"غیر شادی شدہ",
    "Unmarried men":"غیر شادی شدہ مرد",
    "Unmarried women":"غیر شادی شدہ خواتین",
    "Upload QR image":"QR تصویر اپ لوڈ کریں",
    "User ID":"یوزر آئی ڈی",
    "Version":"ورژن",
    "View":"دیکھیں",
    "Voter ID":"ووٹر آئی ڈی",
    "Widow pension":"بیوہ پنشن",
    "Widows":"بیوہ",
    "Women Aalim":"خواتین عالمہ",
    "Women Hafiz":"خواتین حافظہ",
    "Yes":"ہاں",
    "No":"نہیں",
    "khaali":"خالی",
    "Separate series:":"الگ سیریز:",
    "All rights reserved.":"جملہ حقوق محفوظ ہیں۔",
    "households on record.":"گھر ریکارڈ میں ہیں۔",
    "member(s) found":"ارکان ملے",
    "member(s)":"رکن",
    "House":"مکان",
    "public view (phone hidden)":"عوامی منظر (فون چھپا ہوا)",
    "men":"مرد",
    "women":"خواتین",
    "report":"رپورٹ",
    "English":"انگریزی",
    "Hinglish":"ہنگلش",
    "Tamil":"تمل",
    "Urdu":"اردو",
    "— optional, leave empty for auto-generate":"— اختیاری، خودکار بنانے کے لیے خالی چھوڑیں",
    "Head of family":"گھر کا سربراہ",
    "Scan to verify":"تصدیق کے لیے اسکین کریں",
    "Terms & Conditions":"شرائط و ضوابط",
    "Mutavalli":"متولی",
    "Secretary":"سیکرٹری",
    "Member":"ممبر",
    "Mohalla Survey":"محلہ سروے",
    "yrs":"سال",
    "Issued":"جاری",
    "No members to print":"پرنٹ کرنے کے لیے کوئی رکن نہیں",
    "Wife":"بیوی",
    "Son":"بیٹا",
    "Daughter":"بیٹی",
    "Father":"والد",
    "Mother":"والدہ",
    "Brother":"بھائی",
        'Sirf Owner hi ye page khol sakta hai':'صرف مالک ہی یہ صفحہ کھول سکتا ہے',
    'Aap sirf data add/edit kar sakte ho':'آپ صرف ڈیٹا شامل / تبدیل کر سکتے ہیں',
    'Super admin only':'صرف مالک کے لیے',
"Sister":"بہن",
    'Wajah kya hai?':'وجہ کیا ہے؟',
    'Janam hua hai':'ولادت ہوئی',
    'Inteqal ho gaya':'انتقال ہو گیا',
    'Aur koi wajah':'دیگر وجہ',
    'Cancel':'کینسل',
    'Sample ghar add kar dein? Ye test data hai — baad me manually delete karne padenge.':'نمونہ گھر شامل کریں؟ یہ ٹیسٹ ڈیٹا ہے — بعد میں دستی طور پر حذف کرنے ہوں گے۔',
    'Sample data load ho gaya':'نمونہ ڈیٹا لوڈ ہو گیا',
    'Male':'مرد',
    'Female':'عورت',
    'Other':'دیگر',
    'Unmarried':'غیر شادی شدہ',
    'Married':'شادی شدہ',
    'Widow':'بیوہ',
    'Widower':'بیوہ مرد',
    'Divorced':'طلاق یافتہ',}
};

let LANG = 'en';                                   /* website default = English */
try { const saved = localStorage.getItem('memc_lang'); if (saved && I18N[saved]) LANG = saved; } catch(e){}
if (LANG !== 'hi' && !I18N[LANG]) LANG = 'en';
/* layout direction pehle hi set karo — Urdu par RTL, warna LTR flash hota hai */
try { document.documentElement.setAttribute('dir', LANG === 'ur' ? 'rtl' : 'ltr'); } catch(e){}

const _norm = s => String(s).replace(/\s+/g,' ').trim();
const _DICT = {};                                  // lang -> {normKey: text}
const _REV  = {};                                  // lang -> {normText: normKey}
Object.keys(I18N).forEach(lg=>{
  _DICT[lg] = {}; _REV[lg] = {};
  Object.keys(I18N[lg]).forEach(k=>{ const nk=_norm(k); _DICT[lg][nk]=I18N[lg][k]; _REV[lg][_norm(I18N[lg][k])]=nk; });
});

const _ORIGTXT = new WeakMap();                    // text node -> Hinglish source
const _ORIGATTR = new WeakMap();                   // element  -> {attr: Hinglish source}
const _TR_ATTRS = ['placeholder','title','aria-label'];

function trLookup(key){
  const d = I18N[LANG] || {};
  if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
  /* Hinglish: jo pehle se Hinglish hai use waise hi rakho (en dict use NA karo, warna
     Hinglish mode me sab English ho jata hai) */
  if (LANG === 'hi') return '';
  /* Tamil: missing string par English dikhao — aadha Tamil aadha Hinglish mix nahi */
  if (LANG !== 'en' && I18N.en && Object.prototype.hasOwnProperty.call(I18N.en, key)) return I18N.en[key];
  return '';
}

function tStr(s){
  if (s == null) return s;
  const hit = trLookup(_norm(s));
  return hit || s;
}
/* {0}/{1} placeholders ke saath translate (counts/times HTML ke saath aa sakte hain) */
function tF(key){
  let out = tStr(String(key));
  for (let i=1; i<arguments.length; i++) out = out.split('{'+(i-1)+'}').join(String(arguments[i]));
  return out;
}

function langLabel(code){ const l = LANGS.find(x=>x[0]===code); return l ? l[1] : 'Hinglish'; }

function translateTree(root){
  const base = root || document.body;
  if (!base) return;
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||p.closest('.no-i18n')) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = []; let n;
  while ((n = walker.nextNode())) nodes.push(n);

  nodes.forEach(node=>{
    if (!_ORIGTXT.has(node)) _ORIGTXT.set(node, node.nodeValue);
    const src = _ORIGTXT.get(node);
    const key = _norm(src);
    const tr = trLookup(key);
    const next = tr ? src.replace(key, tr) : src;
    if (next !== node.nodeValue) node.nodeValue = next;
  });

  base.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
    let o = _ORIGATTR.get(el);
    if (!o){ o = {}; _ORIGATTR.set(el, o); }
    _TR_ATTRS.forEach(a=>{
      const v = el.getAttribute(a); if (!v) return;
      if (o[a] == null) o[a] = v;
      const tr = trLookup(_norm(o[a]));
      if (tr && el.getAttribute(a) !== tr) el.setAttribute(a, tr);
      else if (!tr && o[a] && el.getAttribute(a) !== o[a] && !trLookup(_norm(el.getAttribute(a)))) el.setAttribute(a, o[a]);
    });
  });

  try {
    const h = document.documentElement;
    h.setAttribute('lang', LANG);
    h.setAttribute('dir', LANG === 'ur' ? 'rtl' : 'ltr');   /* Urdu = right-to-left */
  } catch(e){}
}

let _trTimer = null;
function translateSoon(){
  clearTimeout(_trTimer);
  _trTimer = setTimeout(()=>{ try { translateTree(document.body); } catch(e){} }, 25);
}

function setLang(code){
  if (code !== 'hi' && !I18N[code]) code = 'en';
  LANG = code;
  try { localStorage.setItem('memc_lang', code); } catch(e){}
  const sel = $('#langSel'); if (sel) sel.value = code;
  try {
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', code === 'ur' ? 'rtl' : 'ltr');
  } catch(e){}
  try { renderShell(); } catch(e){}
  try { go(state.view, state.param); } catch(e){}  // re-render content
  translateTree(document.body);                    // then translate what is on screen
  try { toast(tStr('Language') + ': ' + tStr(langLabel(code)), 'ok'); } catch(e){}
}

/* ============================== MASJID PROFILE ============================== */
const MASJID_FIELDS = [
  ['name','Masjid ka naam','e.g. Masjid e Mohammadi'],
  ['established','Qayam saal','e.g. 1985'],
  ['address','Pura pata','Mohalla, shehar, pincode'],
  ['phone','Rabta number','10-digit mobile'],
  ['email','Masjid ka email ID','masjid@example.com'],
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
  if (!isAdmin() && PUBDATA && PUBDATA.masjid) return Object.assign({ photos: [] }, PUBDATA.masjid);
  const m = DB.masjid() || {};
  return Object.assign({ photos: [] }, m);
}

function viewMyProfile(){
  const u = currentUser(); if(!u) return `<div class='empty'><h3>Login required</h3></div>`;
  const admins = DB.admins();
  const me = admins.find(a=> (a.email===u.email) || (a.userId===u.userId)) || u;
  const initials = (me.name||me.email||'A').split(/[ @.]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<div class='page-head'><div><h1>My Profile</h1><p>Edit your photo, name & phone number</p></div><div class='ph-actions'><button class='btn ghost sm' data-act='goto' data-view='dashboard'>← Dashboard</button></div></div>
    <div class='card' style='max-width:720px'>
      <div style='display:flex;gap:16px;align-items:center;flex-wrap:wrap'>
        <div class='av' style='width:84px;height:84px;font-size:1.6rem;border-radius:18px;overflow:hidden;border:1px solid var(--line)'>${me.photo?`<img src='${esc(me.photo)}' alt='' style='width:100%;height:100%;object-fit:cover'/>`:esc(initials)}</div>
        <div style='display:flex;gap:8px;flex-wrap:wrap'>
          <button class='btn sm' type='button' data-act='prof-photo'>Add / Change photo (Gallery)</button>
          ${me.photo?`<button class='btn ghost sm' type='button' data-act='prof-photo-rm'>Remove photo</button>`:''}
        </div>
      </div>
      <div class='grid2' style='margin-top:18px'>
        <div class='field'><label>Full name</label><input class='inp' id='profName' value='${esc(me.name||'')}'/></div>
        <div class='field'><label>Email (login)</label><input class='inp' value='${esc(me.email||'')}' readonly/></div>
        <div class='field'><label>Phone number</label><input class='inp' id='profPhone' value='${esc(me.phone||'')}' inputmode='tel'/></div>
        <div class='field'><label>User ID</label>
          <div style='display:flex;gap:8px'>
            <input class='inp mono' value='${esc(me.userId||u.userId||'—')}' readonly/>
            <button class='btn ghost sm' type='button' data-act='copy-uid' style='white-space:nowrap'>Copy</button>
          </div>
          <span class='hint'>Isi ID ya apne email se login hota hai.</span></div>
      </div>
      <div style='margin-top:18px'><button class='btn' data-act='prof-save'>Save changes</button></div>
    </div>

    <div class='card' style='max-width:720px'>
      <div class='sec-title' style='margin-top:0'>Change password</div>
      <form id='profPassForm' class='grid g3'>
        <div class='field'><label>Current password</label>${pwBox("<input class='inp' name='cur' type='password' required autocomplete='current-password' />")}</div>
        <div class='field'><label>New password</label>${pwBox("<input class='inp' name='np' type='password' required minlength='6' autocomplete='new-password' />")}</div>
        <div class='field'><label>Confirm new password</label>${pwBox("<input class='inp' name='np2' type='password' required minlength='6' autocomplete='new-password' />")}</div>
        <div class='field' style='justify-content:flex-end'><button class='btn' type='submit'>Update password</button></div>
      </form>
      <p class='muted small' style='margin-top:6px'>Kam se kam 6 characters. Password bhool jao to super admin reset kar sakta hai.</p>
    </div>`;
}

function viewAdminEdit(id){
  if(!isOwner()) return `<div class='empty'><h3>Owner only</h3></div>`;
  const admins = DB.admins();
  const a = admins.find(x=>x.email===id);
  if(!a) return `<div class='empty'><h3>Admin not found</h3></div>`;
  const initials = (a.name||a.email||'A').split(/[ @.]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<div class='page-head'><div><h1>Edit Admin</h1><p>${esc(a.email)}</p></div><div class='ph-actions'><button class='btn ghost sm' data-act='goto' data-view='adminpanel'>← Administration</button></div></div>
    <div class='card' style='max-width:720px'>
      <div style='display:flex;gap:16px;align-items:center;flex-wrap:wrap'>
        <div class='av' style='width:84px;height:84px;font-size:1.6rem;border-radius:18px;overflow:hidden;border:1px solid var(--line)'>${a.photo?`<img src='${esc(a.photo)}' alt='' style='width:100%;height:100%;object-fit:cover'/>`:esc(initials)}</div>
        <div style='display:flex;gap:8px;flex-wrap:wrap'>
          <button class='btn sm' type='button' data-act='admin-photo' data-id='${esc(a.email)}'>Add / Change photo (Gallery)</button>
          ${a.photo?`<button class='btn ghost sm' type='button' data-act='admin-photo-rm' data-id='${esc(a.email)}'>Remove photo</button>`:''}
        </div>
      </div>
      <div class='grid2' style='margin-top:18px'>
        <div class='field'><label>Full name</label><input class='inp' id='aName' value='${esc(a.name||'')}'/></div>
        <div class='field'><label>Email</label><input class='inp' id='aEmail' value='${esc(a.email||'')}'/></div>
        <div class='field'><label>Phone number</label><input class='inp' id='aPhone' value='${esc(a.phone||'')}' inputmode='tel'/></div>
        <div class='field'><label>Age</label><input class='inp' id='aAge' value='${esc(a.age||'')}' type='number' min='18' max='100'/></div>
        <div class='field'><label>User ID</label><input class='inp' value='${esc(a.userId||'—')}' readonly/></div>
      </div>
      <div style='margin-top:18px'><button class='btn' data-act='admin-save' data-id='${esc(a.email)}'>Save changes</button></div>
    </div>`;
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
    <div class="card-h"><div><h3>Masjid ki tasveerein</h3><div class="hint"><span>${m.photos.length}/6</span> · <span>har photo phone me hi save hoti hai</span></div></div>
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



/* ============================================================
   ADMINISTRATION PANEL (Admins + Settings + Logout)
   ============================================================ */
function viewAdminPanel(){
  const u = currentUser();
  return `
    <div class="page-head"><div><h1>Administration</h1><p>Super admin panel — admins, settings aur account.</p></div></div>
    ${credsCard()}
    ${isOwner()?`<div class="card">
      <div class="card-h"><div><h3>ID Card Design</h3>
        <div class="hint">Logo, background photo, colour, text aur back-side terms — sab editable.</div></div>
        <button class="btn sm" data-act="goto" data-view="idcard">Open designer</button></div>
    </div>`:''}
    <div class="card">
      <div class="sec-title" style="margin-top:0">Admins & approval</div>
      <p class="muted small"><span>Super admin naye admins banata hai, password reset karta hai aur website control karta hai.</span> <b><span>Super Admin</span>: ${esc(ownerName())} (${esc(ownerEmail())})</b> — locked<br><span class="small">Click sidebar logo to change website logo • Click your avatar to edit your profile • Super admin can add/edit/remove admins with photo, email, phone and age</span></p>
      <div style="margin-top:12px">${isOwner()?viewUsersTable():viewUsersReadonly()}</div>
    </div>
    ${viewSettingsCard('adminpanel')}
    <div class="card">
      <div class="sec-title" style="margin-top:0">Account</div>
      <div class="kv">
        <div class="row"><span>Owner</span><span><b>${esc(ownerName())}</b> (${esc(ownerEmail())})</span></div>
        <div class="row"><span>Logged in as</span><span>${esc(u.name||u.email)} ${isOwner()?'· <b>Owner</b>':''}</span></div>
        <div class="row"><span>Email</span><span>${esc(u.email)}</span></div>
      </div>
      <div style="margin-top:14px"><button class="btn danger" data-act="admin-logout">${ICON.exit} Log out</button></div>
    </div>
  `;
}
/* signature photo -> saaf white background + dark strokes (print ke liye) */
function signatureImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const maxW = 760;
        const k = Math.min(1, maxW/(img.naturalWidth||img.width||maxW));
        const w = Math.max(60, Math.round((img.naturalWidth||img.width)*k));
        const h = Math.max(40, Math.round((img.naturalHeight||img.height)*k));
        const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        const dt = ctx.getImageData(0,0,w,h); const px = dt.data;
        for (let i=0;i<px.length;i+=4){
          const lum = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
          const v = lum > 186 ? 255 : Math.max(0, Math.round(lum*0.45));
          px[i]=v; px[i+1]=v; px[i+2]=v; px[i+3]=255;
        }
        ctx.putImageData(dt,0,0);
        resolve(cv.toDataURL('image/jpeg',0.85));
      }catch(e){ reject(e); }
    };
    img.onerror = reject;
    img.src = src;
  });
}
function saveIdsetForm(form){
  if (!isOwner()){ toast('Sirf super admin','err'); return; }
  try {
    const E = form.elements || {};
    DB.setIdsSet({
      idStyle: String(E.idStyle ? E.idStyle.value : 'random') === 'seq' ? 'seq' : 'random',
      ownerPrefix: String(E.ownerPrefix ? E.ownerPrefix.value : '').trim(),
      ownerStart:  1,
      adminStart:  Number(E.adminStart ? E.adminStart.value : 101) || 101,
      adminPrefix: String(E.adminPrefix ? E.adminPrefix.value : '').trim(),
      adminSuffix: String(E.adminSuffix ? E.adminSuffix.value : '').trim(),
      passPrefix:  String(E.passPrefix ? E.passPrefix.value : '').trim(),
      passSuffix:  String(E.passSuffix ? E.passSuffix.value : '').trim(),
      famPrefix:   String(E.famPrefix ? E.famPrefix.value : '').trim(),
      famRandom:   String(E.famRandom ? E.famRandom.value : '1')!=='0'
    });
    migrateAdmins();   /* naye format par IDs turant ban jayen */
    toast('ID format save ho gaya','ok');
    go('adminpanel');
  } catch(e){ toast('Save nahi hua','err'); }
}
function saveIdcardForm(form){
  if (!isOwner()){ toast('Sirf super admin','err'); return; }
  const E = form.elements;
  const cur = Object.assign({}, DB.idcard()||{});
  cur.org = String(E.org.value||'').trim();
  cur.sub = String(E.sub.value||'').trim();
  cur.tag = String(E.tag.value||'').trim();
  cur.footLeft = String(E.footLeft.value||'').trim();
  cur.footRight = String(E.footRight.value||'').trim();
  cur.terms = String(E.terms.value||'');
  cur.accent = String(E.accent.value||'#0f5c47');
  cur.bgOpacity = Number(E.bgOpacity.value)||0;
  cur.scale = Number(E.scale.value)||1.12;
  cur.size = (E.size && ['5x3','3x5','id1'].includes(E.size.value)) ? E.size.value : '5x3';
  DB.setIdcard(cur);
  toast('Card design save ho gaya','ok');
  go('idcard');
}
function saveIdcardDraft(){
  const form = $('#idcardForm'); if (form) saveIdcardForm(form);
}
function sigEditor(src, key, label){
  return `<div class="field">
    <label>${esc(label)}</label>
    <div style="border:1px dashed var(--line);border-radius:12px;height:76px;display:grid;place-items:center;background:#fff;overflow:hidden">
      ${src?`<img src="${esc(src)}" alt="" style="max-width:96%;max-height:68px;object-fit:contain" />`:'<span class="muted small">Abhi nahi lagaya</span>'}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button class="btn ghost sm" type="button" data-act="idc-sig" data-id="${key}:cam">Camera</button>
      <button class="btn ghost sm" type="button" data-act="idc-sig" data-id="${key}:gal">Gallery</button>
      ${src?`<button class="btn ghost sm" type="button" data-act="idc-sig-rm" data-id="${key}">Remove</button>`:''}
    </div>
  </div>`;
}
function viewIdCardDesign(){
  if (!isOwner()) return `<div class='empty'><h3>Super admin only</h3><p>Card design sirf super admin badal sakta hai.</p></div>`;
  const c = idcardCfg();
  const fam = DB.families()[0] || null;
  return `
    <div class="page-head"><div><h1>ID Card Design</h1><p>Card ka logo, background, text aur terms — sab yahan se badlo.</p></div>
      <div class="ph-actions">
        <button class="btn ghost sm" data-act="goto" data-view="adminpanel">← Administration</button>
        <button class="btn sm" data-act="idc-preview" ${fam?'':'disabled'}>Preview card</button>
      </div></div>

    <form id="idcardForm" class="card">
      <div class="sec-title" style="margin-top:0">Logo &amp; background</div>
      <div class="grid g2" style="align-items:start">
        <div>
          <label class="small muted">Committee logo (card ke header me)</label>
          <div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="av" style="width:64px;height:64px;border-radius:16px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center">${c.logo?`<img src="${esc(c.logo)}" alt="" style="width:100%;height:100%;object-fit:cover"/>`:'<span class="muted small">Masjid</span>'}</span>
            <button class="btn ghost sm" type="button" data-act="idc-logo">${ICON.image||ICON.dl} Upload logo</button>
            ${c.logo?'<button class="btn ghost sm" type="button" data-act="idc-logo-rm">Remove</button>':''}
          </div>
        </div>
        <div>
          <label class="small muted">Card background photo</label>
          <div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="av" style="width:64px;height:64px;border-radius:16px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center">${c.bg?`<img src="${esc(c.bg)}" alt="" style="width:100%;height:100%;object-fit:cover"/>`:'<span class="muted small">None</span>'}</span>
            <button class="btn ghost sm" type="button" data-act="idc-bg">${ICON.image||ICON.dl} Upload background</button>
            ${c.bg?'<button class="btn ghost sm" type="button" data-act="idc-bg-rm">Remove</button>':''}
          </div>
        </div>
      </div>
      <div class="grid g3" style="margin-top:14px">
        <div class="field"><label>Background photo strength</label>
          <input class="inp" type="range" name="bgOpacity" min="0" max="60" step="2" value="${Number(c.bgOpacity)||0}" />
          <span class="hint">0 = sirf pattern · 60 = photo zyada dikhe</span></div>
        <div class="field"><label>Card colour</label>
          <input class="inp" type="color" name="accent" value="${esc(c.accent)}" style="height:44px;padding:4px" />
          <span class="hint">Header, Family ID aur lines ka rang</span></div>
        <div class="field"><label>Card size</label>
          <select class="inp" name="size">
            <option value="5x3" ${c.size==='5x3'?'selected':''}>5 × 3 inch — landscape (default)</option>
            <option value="3x5" ${c.size==='3x5'?'selected':''}>3 × 5 inch — portrait</option>
            <option value="id1" ${c.size==='id1'?'selected':''}>ID-1 (85.6 × 54 mm)</option>
          </select>
          <span class="hint">5×3 = chaudi card, QR bada aur text saaf</span></div>
        <div class="field"><label>Text size</label>
          <select class="inp" name="scale">
            <option value="1" ${c.scale===1?'selected':''}>Normal</option>
            <option value="1.12" ${c.scale===1.12?'selected':''}>Bada (default)</option>
            <option value="1.24" ${c.scale===1.24?'selected':''}>Bahut bada</option>
            <option value="1.32" ${c.scale===1.32?'selected':''}>Sabse bada</option>
          </select></div>
      </div>

      <div class="sec-title">Signature (card ke peeche)</div>
      <div class="grid g3" style="align-items:start">
        ${sigEditor(c.sigMutavalli,'sigMutavalli','Mutavalli ka signature')}
        ${sigEditor(c.sigSecretary,'sigSecretary','Secretary ka signature')}
        ${sigEditor(c.sigMember,'sigMember','Member ka signature')}
      </div>
      <span class="hint" style="display:block;margin-top:6px">Signature white paper par likh kar photo lo — camera ya gallery se. Photo ka background auto white ho jata hai.</span>

      <div class="sec-title">Card par likha text</div>
      <div class="grid g2">
        <div class="field"><label>Committee / masjid naam</label><input class="inp" name="org" value="${esc(c.org)}" placeholder="Masjid e Mohammadi" /></div>
        <div class="field"><label>Chhota naam (committee)</label><input class="inp" name="sub" value="${esc(c.sub)}" placeholder="Khidmat Committee" /></div>
        <div class="field"><label>Card ka tag</label><input class="inp" name="tag" value="${esc(c.tag)}" placeholder="Family ID Card" /></div>
        <div class="field"><label>Footer — left</label><input class="inp" name="footLeft" value="${esc(c.footLeft||'')}" placeholder="Khaali = members + date" /></div>
        <div class="field"><label>Footer — right</label><input class="inp" name="footRight" value="${esc(c.footRight||'')}" placeholder="Khaali = committee naam" /></div>
      </div>

      <div class="sec-title">Back side — Terms &amp; Conditions</div>
      <div class="field"><label>Terms (card ke peeche chhapte hain)</label>
        <textarea class="inp" name="terms" rows="7">${esc(c.terms||'')}</textarea>
        <span class="hint">Mutavalli se approve hone ke baad yahan final terms likh do — card ke back side par wahi chhapega.</span></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="btn" type="submit">Save card design</button>
        <button class="btn ghost" type="button" data-act="idc-preview" ${fam?'':'disabled'}>Preview card</button>
        <button class="btn ghost" type="button" data-act="idc-reset">Reset to default</button>
      </div>
      ${fam?'':'<p class="muted small" style="margin-top:10px">Preview ke liye pehle ek family add karo.</p>'}
    </form>`;
}
function credsCard(){
  const c = state.newCreds; if (!c) return '';
  return `<div class="card" style="border-color:var(--accent)">
    <div class="card-h"><div><h3>Naye admin ka login — usko bhejo</h3>
      <div class="hint">App ne khud banaya hai. Ye details sirf us admin ko do, kisi aur ko nahi.</div></div></div>
    <div class="kv" style="margin-top:10px">
      <div class="row"><span>Naam</span><span>${esc(c.name||'—')}</span></div>
      <div class="row"><span>User ID (login)</span><span class="mono"><b>${esc(c.userId)}</b></span></div>
      <div class="row"><span>Temporary password</span><span class="mono"><b>${esc(c.tempPass)}</b></span></div>
      <div class="row"><span>Email</span><span class="mono">${esc(c.email)}</span></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <a class="btn sm" href="${esc(c.mail||'#')}">${ICON.mail} Email the admin</a>
      <a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Masjid Survey admin login\nUser ID: '+c.userId+'\nPassword: '+c.tempPass)}">WhatsApp</a>
      <button class="btn ghost sm" data-act="copy-creds">Copy</button>
      <button class="btn ghost sm" data-act="close-creds">Close</button>
    </div>
    <p class="muted small" style="margin-top:8px">Ye login turant kaam karta hai. Admin pehli baar login karke My Profile se photo/naam badal sakta hai.</p>
  </div>`;
}
function viewUsersTable(){
  const admins = DB.admins().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const owner = ownerEmail();
  const pend = admins.filter(a=>a.status==='pending');
  const act = admins.filter(a=>a.status!=='pending');
  const showAdd = !!state.showAddAdmin;
  const showList = !!state.showAdmins;
  return `
    <div class="card-h" style="margin-bottom:10px"><div>
      <h3>Admins <span class="muted small">(${act.length})</span></h3>
      <div class="hint">Naya admin add karo ya existing admin ka login dekho.</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${showAdd?'<button class="btn ghost sm" data-act="admin-add-cancel">Cancel</button>':'<button class="btn sm" data-act="admin-add">+ Add admin</button>'}
        <button class="btn ghost sm" data-act="admin-list">${showList?'Hide admins':'View admins'}</button>
      </div>
    </div>

    ${showAdd?`<form id="addAdminForm" class="grid g3" style="margin-top:4px">
      <div class="field"><label>Name</label><input class="inp" name="name" required /></div>
      <div class="field"><label>Email ID</label><input class="inp" name="email" type="email" required /><span class="hint">Login isi email ya User ID se hoga</span></div>
      <div class="field"><label>Mobile</label><input class="inp" name="phone" inputmode="numeric" /></div>
      <div class="field"><label>Age</label><input class="inp" name="age" type="number" min="18" max="100" /></div>
      <div class="field"><label>Photo</label><input type="file" class="inp" name="photo" accept="image/*" /></div>
      <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">Create admin</button></div>
      <p class="muted small" style="grid-column:1/-1;margin:0">User ID aur password app khud banayegi — bante hi screen par dikhenge, admin ko bhej do.</p>
    </form>`:''}

    ${pend.length?`<div class="sec-title">Pending requests</div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>User ID</th><th>Action</th></tr></thead><tbody>
    ${pend.map(a=>`<tr><td>${esc(a.name||'—')}</td><td>${esc(a.email)}</td><td>${esc(a.phone||'—')}</td><td class="mono">${esc(a.userId||'—')}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="approve-admin" data-id="${esc(a.email)}">Approve</button><button class="btn sm ghost" data-act="reject-admin" data-id="${esc(a.email)}">Reject</button></td></tr>`).join('')}
    </tbody></table></div>`:''}

    ${(function(){
      const devs = [];
      (isOwner()?admins:[]).forEach(a=>{
        ensureAdminDevices(a);
        (a.pendingDevices||[]).forEach(d=>{
          devs.push({ email:a.email, name:a.name||a.email, userId:a.userId, did:d.id, ua:d.ua||'', requestedAt:d.requestedAt });
        });
      });
      if (!devs.length) return '';
      return `<div class="sec-title">Device approval (1 device per User ID)</div>
      <div class="table-wrap"><table><thead><tr><th>Admin</th><th>User ID</th><th>Device</th><th>Requested</th><th>Action</th></tr></thead><tbody>
      ${devs.map(x=>`<tr><td>${esc(x.name)}</td><td class="mono">${esc(x.userId||'—')}</td><td class="small muted" title="${esc(x.ua)}">${esc((x.did||'').slice(0,18))}…</td><td class="small">${x.requestedAt?fmtDate(x.requestedAt):'—'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="approve-device" data-email="${esc(x.email)}" data-did="${esc(x.did)}">Approve</button><button class="btn sm ghost" data-act="reject-device" data-email="${esc(x.email)}" data-did="${esc(x.did)}">Reject</button></td></tr>`).join('')}
      </tbody></table></div>`;
    })()}

    ${showList?`
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>User ID</th><th>Admin (Photo / Name / Email)</th><th>Phone</th><th>Age</th><th>Password</th><th>Devices</th><th>Role</th><th>Action</th></tr></thead><tbody>
    ${act.map(a=>{ const isO = String(a.email).toLowerCase()===owner || a.role==='owner'; const ini=(a.name||a.email).split(/[ @.]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase(); ensureAdminDevices(a); const devCount = (a.devices||[]).length; const pendCount = (a.pendingDevices||[]).length; return `<tr><td class="mono">${esc(a.userId||'—')}</td><td><div style="display:flex;gap:10px;align-items:center"><span class="av" style="width:36px;height:36px;font-size:.8rem;overflow:hidden;border-radius:12px;border:1px solid var(--line)">${a.photo?`<img src='${esc(a.photo)}' style='width:100%;height:100%;object-fit:cover'/>`:esc(ini)}</span><div><div style="font-weight:600">${esc(a.name||'—')}</div><div class="muted small">${esc(a.email)}</div></div></div></td><td>${esc(a.phone||'—')}</td><td>${esc(a.age||'—')}</td><td>${isO?'<span class="muted small">—</span>':(a.tempPass
        ? `<div class="tp" data-pw="${esc(a.tempPass)}" data-shown="0"><code>••••••</code><button class="btn ghost sm" data-act="tp-show">Show</button><button class="btn ghost sm" data-act="tp-copy" title="Copy User ID + password">${ICON.clipboard}</button></div>`
        : '<span class="muted small">Badla ja chuka hai</span>')}</td><td>${isO?'<span class="muted small">Owner (exempt)</span>':`<span class="badge ${devCount>=1?'':'gray'}">${devCount}/1</span> ${pendCount?'<span class="badge gray">'+pendCount+' pending</span>':''}`}</td><td>${isO?'<span class="badge">Owner · Admin</span>':'<span class="badge gray">User</span>'}</td><td style="display:flex;gap:6px;flex-wrap:wrap">${isO?'<span class="muted small">Locked</span>':`<button class="btn sm" data-act="admin-edit" data-id="${esc(a.email)}">Edit</button><button class="btn sm ghost" data-act="reset-admin-pass" data-id="${esc(a.email)}">Reset password</button><button class="btn sm ghost" data-act="del-admin" data-id="${esc(a.email)}">Remove</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>`:''}
  `;
}
function viewUsersReadonly(){
  const admins = DB.admins().filter(a=>a.status!=='pending');
  const owner = ownerEmail();
  return `<div class="table-wrap"><table><thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
  ${admins.map(a=>{ const isO = String(a.email).toLowerCase()===owner || a.role==='owner'; return `<tr><td class="mono">${esc(a.userId||'—')}</td><td>${esc(a.name||'—')}</td><td>${esc(a.email)}</td><td>${isO?'<span class="badge">Owner · Admin</span>':'<span class="badge gray">User</span>'}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function viewSettingsCard(ctx='adminpanel'){
  const u = currentUser();
  const cloudOn = CLOUD.enabled();
  const IS = idset();
  return `
    <div class="card">
      <div class="sec-title" style="margin-top:0">Settings</div>
      <div class="sec-title" style="margin-top:0;font-size:.9rem">Appearance</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <button class="toggle" data-act="toggle-theme" id="themeBtn2">${themeIcon(document.documentElement.getAttribute('data-theme'))} Day / Night</button>
        <span class="muted small">Emerald Lattice theme · day &amp; night.</span>
      </div>
      <div class="sec-title" style="font-size:.9rem">Data &amp; backup</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export-excel">${ICON.dl} Export Excel (.xlsx)</button>
        <button class="btn ghost sm" data-act="print-all">${ICON.print} Export PDF / Print</button>
        <button class="btn ghost sm" data-act="backup-json">${ICON.dl} Backup (JSON)</button>
        <button class="btn ghost sm" data-act="publish-public">${ICON.refresh} Public totals refresh</button>
        <button class="btn ghost sm" data-act="load-sample">Load sample data</button>
      </div>
      <div class="sec-title" style="font-size:.9rem">Restore &amp; Google Drive</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="restore-json">Restore from backup file</button>
        <button class="btn ghost sm" data-act="drive-connect">${ICON.cloud} ${driveConnected()?'Drive connected':'Connect Google Drive'}</button>
        <button class="btn ghost sm" data-act="drive-backup">${ICON.cloud} Backup to Drive</button>
      </div>
      <input type="file" id="restoreFile" accept="application/json,.json" hidden />
      <p class="muted small" style="margin:10px 0 0">${esc(driveStatusText())}</p>
      ${isOwner()?`<div class="sec-title" style="font-size:.9rem">ID &amp; password format</div>
      <form id="idsetForm" class="grid g3">
        <div class="field"><label>User ID style</label>
          <select class="inp" name="idStyle">
            <option value="random" ${IS.idStyle!=='seq'?'selected':''}>Random (recommended) — ${esc(IS.adminPrefix)}102026#21200</option>
            <option value="seq" ${IS.idStyle==='seq'?'selected':''}>Number series — ${esc(IS.adminPrefix)}-2026-0101</option>
          </select></div>
        <div class="card" style="background:linear-gradient(180deg, rgba(52,211,153,.08), transparent)">
        <div style="font-weight:600">ID aur password auto-generate hote hain</div>
        <div class="muted small" style="margin-top:4px">Ab prefix/suffix mannual add karne ki zaroorat nahi. Jab bhi naya admin add hoga, User ID aur temp password app khud bana degi. Sirf 1 device per User ID allowed hai.</div>
      </div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label>Family ID prefix</label><input class="inp" id="famPref" value="${esc(IS.famPrefix)}" placeholder="MEMC" maxlength="10" /></div>
        <div class="field"><label>Family ID style</label>
          <select class="inp" id="famStyle">
            <option value="1" ${IS.famRandom?'selected':''}>Random (tough) — ${esc(IS.famPrefix)}-26K7Q2</option>
            <option value="0" ${!IS.famRandom?'selected':''}>Simple — 2026001FM04</option>
          </select></div>
        <div class="field" style="justify-content:flex-end"><button class="btn sm" data-act="save-fam-id">Save family ID</button></div>
      </div>`:''}
      <div class="sec-title" style="font-size:.9rem">Owner (Fixed)</div>
      <div class="kv">
        <div class="row"><span>Name</span><span><b>${esc(ownerName())}</b></span></div>
        <div class="row"><span>User ID</span><span class="mono">${esc((DB.admins().find(a=>String(a.email).toLowerCase()===String(ownerEmail()).toLowerCase())||{}).userId || '—')}</span></div>
        <div class="row"><span>Email</span><span class="mono">${esc(ownerEmail())}</span></div>
      </div>
      <p class="muted small" style="margin-top:6px">Owner details lock hain, change nahi ho sakte.</p>
      <p class="muted small" style="margin-top:12px">Logged in: <b>${esc(u.email)}</b> ${isOwner()?'(Owner)':''}</p>
      <button class="btn danger sm" data-act="admin-logout" style="margin-top:10px">${ICON.exit} Log out</button>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="sec-title" style="margin-top:0">App version</div>
      <div class="kv">
        <div class="row"><span>Version</span><span class="mono"><b>${APP_VER}</b> · ${APP_VER_AT}</span></div>
      </div>
      <p class="muted small" style="margin-top:6px">Site khud update hoti hai. Purana version dikh raha ho to neeche wala button dabao — cache saaf ho kar naya version khul jayega.</p>
      <button class="btn sm ghost" data-act="force-update" style="margin-top:10px">Force update</button>
    </div>
  `;
}


/* ============================================================
   ACTIONS (event delegation)
   ============================================================ */
/* keyboard access for clickable numbers / rows (role=button) */
document.addEventListener('keydown', (e)=>{
  if (e.key!=='Enter' && e.key!==' ') return;
  const el = e.target.closest('[data-act]'); if(!el) return;
  const tag = el.tagName;
  if (tag==='BUTTON' || tag==='A' || tag==='INPUT' || tag==='SELECT') return;
  e.preventDefault(); el.click();
});

document.addEventListener('change', (e)=>{
  const sel = e.target && e.target.closest && e.target.closest('#langSel');
  if (!sel) return;
  setLang(sel.value);
});

document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-act]'); if(!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const ADMIN_ACTS = ['load-sample','clear-data','export-excel','print-all','backup-json','restore-json','drive-connect','drive-backup','edit-family','del-family','del-admin','saveMasjid','delPhoto','print-family','approve-admin','reject-admin','close-creds','copy-creds','publish-public'];
  if (ADMIN_ACTS.includes(act) && !isAdmin()){ toast('Ye sirf admin kar sakta hai','err'); return; }
  const USER_DENIED = ['export-excel','print-all','backup-json','restore-json','drive-connect','drive-backup','publish-public','clear-data','load-sample','print-family','print-idcards','del-admin','approve-admin','reject-admin','reset-admin-pass'];
  if (userRole()==='user' && USER_DENIED.includes(act)){ toast('Aap sirf data add/edit kar sakte ho','err'); return; }

  if (act==='pw-eye'){
    const wrap = el.closest('.pw-wrap'); const inp = wrap && wrap.querySelector('input');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    el.innerHTML = show ? ICON.eyeOff : ICON.eye;
    el.setAttribute('aria-pressed', show ? 'true' : 'false');
    el.setAttribute('title', show ? 'Hide password' : 'Show password');
    el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    return;
  }
  if (act==='scan-qr'){ startQrScan(); return; }
  if (act==='stop-qr'){ stopQrScan(); const _m=$('#qrScanMsg'); if(_m) _m.textContent=tStr('Camera band'); return; }

  if (act==='toggle-theme') { toggleTheme(); const b=$('#themeBtn2'); if(b){ const t=document.documentElement.getAttribute('data-theme'); b.innerHTML = themeIcon(t) + (t==='night'?' Night':' Day'); } return; }
  if (act==='goto'){ if (el.dataset.view==='add'){ state.draft=blankDraft(); go(el.dataset.view); } else go(el.dataset.view, el.dataset.param || el.dataset.street || null); return; }
  if (act==='mlist' || act==='flist'){ openList(act, el.dataset.f, el.dataset.title); return; }
  if (act==='slist'){ state.streetBack = state.view; go('streetlist'); return; }
  if (act==='auth-check'){ cloudLinkCheck(); return; }
  if (act==='grp-toggle'){
    const sec = el.closest('.grp'); if (!sec) return;
    if (!sec.dataset.filled){ sec.insertAdjacentHTML('beforeend', groupDetail(Number(sec.dataset.g)||0)); sec.dataset.filled='1'; }
    sec.classList.toggle('open');
    if (sec.classList.contains('open')) sec.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (act==='photo'){ const src = el.dataset.src; if (src) openPhoto(src); return; }
  if (act==='evr'){
    const ty = el.dataset.ty || 'other';
    const f = _evReasonCB;
    closeEventReason();
    if (f) f(ty);
    return;
  }
  if (act==='evr-cancel'){ closeEventReason(); return; }
  if (act==='open-auth'){ openAuth('login'); return; }
  if (act==='close-auth'){ closeAuth(); return; }
  if (act==='auth-tab'){ pending=null; renderAuth(el.dataset.tab||'login'); return; }
  if (act==='auth-cancel'){ pending=null; renderAuth('login'); return; }
  if (act==='admin-logout'){ try { if(!isAdmin()){ clearSession(); renderShell(); go('dashboard'); return; } } catch(e){} audit('logout', '', ''); clearSession(); state.draft=null; renderShell(); go('dashboard'); return; }
  if (act==='myprofile'){ if(!isAdmin()){toast('Admin only','err');return;} go('myprofile'); return; }
  if (act==='admin-edit'){ if(!isOwner()){toast('Sirf owner edit kar sakta hai','err');return;} go('admin-edit', el.dataset.id); return; }
  if (act==='reset-admin-pass'){
    if (!isOwner()){ toast('Sirf owner badal sakta hai','err'); return; }
    (async ()=>{
      const email = String(el.dataset.id||'').toLowerCase();
      const admins = DB.admins();
      const i = admins.findIndex(a=>String(a.email||'').toLowerCase()===email);
      if (i < 0){ toast('Admin nahi mila.','err'); return; }
      const tempPass = genTempPass();
      const salt = uid();
      admins[i].salt = salt;
      admins[i].passHash = await hashPass(tempPass, salt);
      admins[i].tempPass = tempPass;
      DB.setAdmins(admins);
      state.newCreds = { userId:admins[i].userId, tempPass, name:admins[i].name, email:admins[i].email, mail:credsMailto(admins[i]) };
      toast('Naya password ban gaya','ok');
      go('users');
    })();
    return;
  }
  if (act==='admin-photo'){ if(!isOwner()){toast('Sirf owner','err');return;} const email=el.dataset.id; const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=async e=>{ const f=e.target.files[0]; if(!f)return; let d=await readFileAsDataURL(f); d=await compressImageDataURL(d,256,0.7); const admins=DB.admins(); const i=admins.findIndex(a=>a.email===email); if(i>=0){ admins[i].photo=d; DB.setAdmins(admins); toast('Photo updated'); go('adminpanel'); }}; inp.click(); return; }
  if (act==='admin-photo-rm'){ if(!isOwner()){toast('Sirf owner','err');return;} const email=el.dataset.id; const admins=DB.admins(); const i=admins.findIndex(a=>a.email===email); if(i>=0){ delete admins[i].photo; DB.setAdmins(admins); toast('Photo removed'); go('adminpanel'); } return; }
  if (act==='admin-save'){ if(!isOwner()){toast('Sirf owner','err');return;} const email=el.dataset.id; const admins=DB.admins(); const i=admins.findIndex(a=>a.email===email); if(i>=0){ admins[i].name=$('#aName').value.trim(); admins[i].phone=$('#aPhone').value.trim(); admins[i].email=$('#aEmail').value.trim().toLowerCase(); if($('#aAge')) admins[i].age=$('#aAge').value.trim(); DB.setAdmins(admins); toast('Saved'); go('adminpanel'); } return; }
  if (act==='prof-photo'){ if(!isAdmin())return; const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=async e=>{ const f=e.target.files[0]; if(!f)return; let d=await readFileAsDataURL(f); d=await compressImageDataURL(d,256,0.7); const admins=DB.admins(); const u=currentUser(); const i=admins.findIndex(a=>(a.email===u.email)||(a.userId===u.userId)); if(i>=0){ admins[i].photo=d; DB.setAdmins(admins); if(getSession() && getSession().email===admins[i].email){ const s2=getSession(); s2.photo=d; localStorage.setItem(LS.session, JSON.stringify(s2)); } toast('Photo updated'); renderShell(); go('myprofile'); }}; inp.click(); return; }
  if (act==='prof-photo-rm'){ if(!isAdmin())return; const admins=DB.admins(); const u=currentUser(); const i=admins.findIndex(a=>(a.email===u.email)||(a.userId===u.userId)); if(i>=0){ delete admins[i].photo; DB.setAdmins(admins); const ss=getSession(); if(ss){ delete ss.photo; localStorage.setItem(LS.session, JSON.stringify(ss)); } toast('Photo removed'); renderShell(); go('myprofile'); } return; }
  if (act==='prof-save'){ if(!isAdmin())return; const admins=DB.admins(); const u=currentUser(); const i=admins.findIndex(a=>(a.email===u.email)||(a.userId===u.userId)); if(i<0)return; const name=$('#profName')?.value||''; const phone=$('#profPhone')?.value||''; if(isOwner() || admins[i].email===u.email){ admins[i].name=name.trim(); admins[i].phone=phone.trim(); DB.setAdmins(admins); const ss=getSession(); if(ss){ ss.name=name.trim(); ss.phone=phone.trim(); if(admins[i].photo) ss.photo=admins[i].photo; localStorage.setItem(LS.session, JSON.stringify(ss)); } toast('Profile updated successfully'); renderShell(); go('myprofile'); } else toast('Not allowed','err'); return; }
  if (act==='logout'){ clearSession(); state.draft=null; renderShell(); go('dashboard'); return; }
  if (act==='del-admin'){
    if (!isOwner()){ toast('Sirf owner admin hata sakta hai','err'); return; }
    const me = currentUser();
    if (String(id).toLowerCase()===String(me.email).toLowerCase()){ toast('Apna account nahi hata sakte','err'); return; }
    if (DB.admins().length <= 1){ toast('Kam se kam ek admin rehna chahiye','err'); return; }
    if (!confirm(tStr('Ye admin account hata dein?'))) return;
    DB.setAdmins(DB.admins().filter(a=>a.email!==id));
    toast('Admin hata diya'); go('users'); return;
  }
  if (act==='load-sample'){
    if (!DB.families().length && !confirm(tStr('Sample ghar add kar dein? Ye test data hai — baad me manually delete karne padenge.'))) return;
    loadSample(); enterApp(); go('dashboard'); toast(tStr('Sample data load ho gaya')); return;
  }
  if (act==='clear-data'){ if(confirm('Erase ALL household records on this device? This cannot be undone.')){
    const n = DB.families().length;
    DB.setFamilies([], { silent:true }); DB.setSeq(0);
    audit('data_clear', 'All households', n + ' records erased from this device');
    toast('All household records erased'); go('dashboard'); } return; }
  if (act==='export-excel'){ exportExcel(); return; }
  if (act==='print-all'){ printFamilies(DB.families(), 'All Households'); return; }
  if (act==='print-family'){ const f=DB.families().find(x=>x.id===id); if(f) printFamilies([f], f.houseName||f.id); return; }
  if (act==='print-idcards'){ const f=DB.families().find(x=>x.id===id); if(f) printIdCards(f); return; }
  if (act==='admin-add'){ state.showAddAdmin = true; go(state.view||'adminpanel'); return; }
  if (act==='admin-add-cancel'){ state.showAddAdmin = false; go(state.view||'adminpanel'); return; }
  if (act==='admin-list'){ state.showAdmins = !state.showAdmins; go(state.view||'adminpanel'); return; }
  if (act==='idc-preview'){ if(!isOwner()){ toast('Sirf super admin','err'); return; } const f=DB.families()[0]; if(!f){ toast('Pehle ek family add karo','err'); return; } if(state.view==='idcard'){ try{ saveIdcardDraft(); }catch(e){} } printIdCards(f); return; }
  if (act==='idc-reset'){ if(!isOwner()){ toast('Sirf super admin','err'); return; } DB.setIdcard(null); toast('Card design reset ho gaya','ok'); go('idcard'); return; }
  if (act==='idc-logo' || act==='idc-bg'){
    if(!isOwner()){ toast('Sirf super admin','err'); return; }
    const which = act==='idc-logo' ? 'logo' : 'bg';
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=async ev=>{
      const f=ev.target.files[0]; if(!f) return;
      try{
        let d=await readFileAsDataURL(f);
        d=await compressImageDataURL(d, which==='logo'?420:1200, which==='logo'?0.86:0.72);
        const cur = Object.assign({}, DB.idcard()||{});
        cur[which]=d; DB.setIdcard(cur);
        toast(which==='logo'?'Logo lag gaya':'Background lag gaya','ok');
        go('idcard');
      }catch(e){ toast('Image load nahi hua.','err'); }
    };
    inp.click(); return;
  }
  if (act==='idc-sig'){
    if(!isOwner()){ toast('Sirf super admin','err'); return; }
    const raw = String(id||''); const parts = raw.split(':'); const key = parts[0]; const mode = parts[1]||'gal';
    if (!/^sig(Mutavalli|Secretary|Member)$/.test(key)){ toast('Galat signature slot','err'); return; }
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    if (mode==='cam'){ inp.setAttribute('capture','environment'); }
    inp.onchange=async ev=>{
      const f=ev.target.files[0]; if(!f) return;
      try{
        const d = await signatureImage(await readFileAsDataURL(f));
        const cur = Object.assign({}, DB.idcard()||{});
        cur[key]=d; DB.setIdcard(cur);
        toast('Signature lag gaya','ok');
        go('idcard');
      }catch(e){ toast('Photo load nahi hui.','err'); }
    };
    inp.click(); return;
  }
  if (act==='idc-sig-rm'){
    if(!isOwner()){ toast('Sirf super admin','err'); return; }
    const cur = Object.assign({}, DB.idcard()||{}); delete cur[String(id||'')]; DB.setIdcard(cur);
    toast('Hata diya','ok'); go('idcard'); return;
  }
  if (act==='idc-logo-rm' || act==='idc-bg-rm'){
    if(!isOwner()){ toast('Sirf super admin','err'); return; }
    const which = act==='idc-logo-rm' ? 'logo' : 'bg';
    const cur = Object.assign({}, DB.idcard()||{}); delete cur[which]; DB.setIdcard(cur);
    toast('Hata diya','ok'); go('idcard'); return;
  }
  if (act==='backup-json'){ backupJSON(); return; }
  if (act==='restore-json'){ const inp=$('#restoreFile'); if(inp){ inp.value=''; inp.click(); } return; }
  if (act==='approve-admin'){
    if (!isOwner()){ toast('Sirf owner approve kar sakta hai','err'); return; }
    const admins = DB.admins();
    const a = admins.find(x=>String(x.userId||'').toLowerCase()===String(id).toLowerCase() || String(x.email).toLowerCase()===String(id).toLowerCase());
    if (!a){ toast('Request nahi mili','err'); return; }
    a.status = 'active'; a.approvedAt = Date.now(); a.approvedBy = currentUser().email;
    DB.setAdmins(admins);
    const creds = { userId:a.userId, tempPass:a.tempPass||'', name:a.name, email:a.email };
    if (CLOUD.enabled() && a.tempPass){
      (async ()=>{ try {
        const c = await CLOUD.get();
        const { data } = await c.auth.signUp({ email:a.email, password:a.tempPass, options:{ data:{ name:a.name, phone:a.phone }, emailRedirectTo: location.origin + location.pathname } });
        /* owner approve karta hai = app_users me row owner banata hai (RLS: sirf admin likh sakta hai) */
        const uid = data && data.user && data.user.id;
        if (uid) await c.from('app_users').upsert({ id:a.email, user_id:uid, role:'admin', name:a.name||'', phone:a.phone||'' });
      } catch(e){} })();
    }
    state.showAddAdmin = false;
    state.newCreds = Object.assign(creds, { mail: credsMailto(a) });
    toast('Admin approve ho gaya — credentials usko bhej do','ok');
    go('users'); return;
  }
  if (act==='reject-admin'){
    if (!isOwner()){ toast('Sirf owner reject kar sakta hai','err'); return; }
    const admins = DB.admins().filter(x=>String(x.userId||'').toLowerCase()!==String(id).toLowerCase() && String(x.email).toLowerCase()!==String(id).toLowerCase());
    DB.setAdmins(admins); toast('Request reject ho gayi'); go('users'); return;
  }
  if (act==='find-edit' || act==='find-open'){
    if (!isAdmin()){ toast('Ye sirf admin kar sakta hai','err'); return; }
    const f = DB.families().find(x=>String(x.id)===String(id));
    if (!f){ toast('Ye record is device par nahi hai — pehle cloud se sync karo','err'); return; }
    if (act==='find-open'){ go('detail', f.id); return; }
    state.draft = JSON.parse(JSON.stringify(f));
    go('add');
    return;
  }
  if (act==='copy-uid'){
    const u = currentUser();
    const rec = u ? (DB.admins().find(a=>String(a.email).toLowerCase()===String(u.email).toLowerCase())||{}) : {};
    const v = rec.userId || (u && u.userId) || '';
    if (!v){ toast('User ID nahi mili','err'); return; }
    try { navigator.clipboard.writeText(v); toast('User ID copy ho gayi: ' + v,'ok'); }
    catch(e){ toast('Copy nahi hua — haath se likh lo: ' + v,'err'); }
    return;
  }
  if (act==='force-update'){
    (async ()=>{
      try { toast('Naya version laa raha hoon…'); } catch(e){}
      try {
        if ('serviceWorker' in navigator){
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r=>r.unregister()));
        }
      } catch(e){}
      try { if (window.caches){ const ks = await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); } } catch(e){}
      const u = new URL(location.href);
      u.searchParams.set('v', String(Date.now()));
      location.replace(u.toString());
    })();
    return;
  }
  if (act==='save-fam-id'){
    if (!isOwner()){ toast('Sirf owner','err'); return; }
    const famPrefix = ($('#famPref')?.value||'MEMC').trim().toUpperCase().replace(/[^A-Z0-9\-]/g,'') || 'MEMC';
    const famRandom = $('#famStyle')?.value === '1';
    const c = Object.assign({}, idset(), { famPrefix, famRandom });
    DB.setIdset(c);
    toast('Family ID settings save ho gayi','ok');
    go('settings');
    return;
  }
  if (act==='approve-device'){
    if (!isOwner()){ toast('Sirf owner','err'); return; }
    const email = el.dataset.email; const did = el.dataset.did;
    if (approveAdminDevice(email,did)){ toast('Device approve ho gaya','ok'); go('users'); }
    else toast('Approve nahi hua','err');
    return;
  }
  if (act==='reject-device'){
    if (!isOwner()){ toast('Sirf owner','err'); return; }
    const email = el.dataset.email; const did = el.dataset.did;
    if (rejectAdminDevice(email,did)){ toast('Device reject ho gaya','ok'); go('users'); }
    else toast('Reject nahi hua','err');
    return;
  }
  if (act==='tp-show'){
    const cell = el.closest('.tp'); if(!cell) return;
    const code = cell.querySelector('code'); if(!code) return;
    const shown = cell.dataset.shown === '1';
    cell.dataset.shown = shown ? '0' : '1';
    code.textContent = shown ? '••••••' : (cell.dataset.pw || '');
    el.textContent = shown ? 'Show' : 'Hide';
    return;
  }
  if (act==='tp-copy'){
    const cell = el.closest('.tp'); if(!cell) return;
    const row = cell.closest('tr'); const uidEl = row && row.querySelector('td.mono');
    const txt = 'User ID: ' + (uidEl ? uidEl.textContent.trim() : '') + '\nPassword: ' + (cell.dataset.pw||'') + '\nLogin: ' + location.href;
    try { navigator.clipboard.writeText(txt); toast('User ID + password copy ho gaya','ok'); }
    catch(e){ toast('Copy nahi hua — haath se likh lo','err'); }
    return;
  }
  if (act==='close-creds'){ state.newCreds = null; go('users'); return; }
  if (act==='copy-creds'){
    const c = state.newCreds || {};
    const txt = 'User ID: ' + (c.userId||'') + '\nPassword: ' + (c.tempPass||'') + '\nLogin: ' + location.href;
    try { navigator.clipboard.writeText(txt); toast('Copy ho gaya'); }
    catch(e){ toast('Copy nahi hua — haath se likh lo','err'); }
    return;
  }
  if (act==='audit-filter'){ state.auditFilter = el.dataset.f || 'all'; go('audit'); return; }
  if (act==='audit-export'){ exportAuditCSV(); return; }
  if (act==='audit-clear'){
    if (!isOwner()){ toast('Sirf super admin','err'); return; }
    if (!confirm('Poora audit log clear karna hai? Ye undo nahi hoga.')) return;
    const n = auditLog().length;
    auditSave([]);
    audit('audit_clear', 'Audit log', n + ' entries removed');
    toast('Audit log clear ho gaya'); go('audit'); return;
  }
  if (act==='publish-public'){
    if (!isAdmin()){ toast('Sirf admin','err'); return; }
    if (!CLOUD.enabled()){ toast('Cloud off — public site ko totals nahi bheje ja sakte','err'); return; }
    SYNC.publishSnapshot().then(ok=>{
      audit('publish', 'Public totals', ok ? 'success' : 'failed');
      toast(ok?'Public totals refresh ho gaye':'Refresh fail — schema v4 run hua hai?','' + (ok?'':'err'));
    });
    return;
  }
  if (act==='drive-connect'){ driveConnect(); return; }
  if (act==='drive-backup'){ backupToDrive(); return; }
  if (act==='view-family'){ go('detail', id); return; }
  if (act==='detail'){ go('detail', id); return; }
  if (act==='edit-family'){ const f=DB.families().find(x=>x.id===id); if(f){ state.draft = JSON.parse(JSON.stringify(f)); state.draft.docs = Object.assign(Object.fromEntries(DOC_TYPES.map(d=>[d[0],'no'])), state.draft.docs||{}); state.draft.custom = normCustom(state.draft.custom); if(!state.draft.houseType) state.draft.houseType='moulding'; go('add', id); } return; }
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
  if (act==='add-member'){
    askEventReason(ty=>{ recordEvent(ty, 'Member added to household'); state.draft.members.push(blankMember()); renderMembers(); });
    return;
  }
  if (act==='remove-member'){
    askEventReason(ty=>{
      recordEvent(ty, 'Member removed from household');
      const idx = +el.dataset.idx;
      if (ty === 'death'){
        if (state.draft.members[idx]){
          state.draft.members[idx].deceased = true;
          state.draft.members[idx].deceasedDate = todayStr();
        }
      } else {
        state.draft.members.splice(idx,1);
      }
      renderMembers();
    });
    return;
  }
  if (act==='save-next'){
    const f = $('#famForm');
    if (!f) return;
    state.saveNext = true;
    if (typeof f.requestSubmit === 'function') f.requestSubmit();
    else saveFamily();
    return;
  }
  if (act==='add-doc'){
    if(!state.draft) return;
    state.docsOpen = true;
    renderDocs();
    return;
  }
  if (act==='close-docs'){
    state.docsOpen = false;
    renderDocs();
    return;
  }
  if (act==='pick-doc'){
    if(!state.draft) return;
    const k = el.dataset.key; if(!k) return;
    state.draft.docs = state.draft.docs || {};
    state.draft.docs[k] = 'yes';
    state.docsOpen = false;
    renderDocs();
    try { saveFormDraft(); } catch(ex){}
    return;
  }
  if (act==='unpick-doc'){
    if(!state.draft) return;
    const k = el.dataset.key; if(!k) return;
    state.draft.docs = state.draft.docs || {};
    state.draft.docs[k] = 'no';
    renderDocs();
    try { saveFormDraft(); } catch(ex){}
    return;
  }
  if (act==='add-custom-doc'){
    if(!state.draft) return;
    if(!Array.isArray(state.draft.custom)) state.draft.custom = [];
    if(state.draft.custom.length >= 12){ toast('Max 12 documents allowed','err'); return; }
    state.draft.custom.push({label:'', value:'no'});
    renderCustomDocs();
    try { saveFormDraft(); } catch(ex){}
    return;
  }
  if (act==='remove-custom-doc'){
    if(!state.draft) return;
    const ci = +el.dataset.ci;
    if(Array.isArray(state.draft.custom)){
      state.draft.custom.splice(ci,1);
      renderCustomDocs();
      try { saveFormDraft(); } catch(ex){}
    }
    return;
  }
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
  // custom doc toggle
  const cpill = e.target.closest('.doc-row.custom .seg button');
  if(cpill && state.draft){
    const seg = cpill.closest('.seg');
    if(seg && seg.dataset.doc && seg.dataset.doc.startsWith('custom:')){
      const ci = +seg.dataset.doc.split(':')[1];
      if(Array.isArray(state.draft.custom) && state.draft.custom[ci]){
        state.draft.custom[ci].value = cpill.dataset.v;
        seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===cpill));
        try { saveFormDraft(); } catch(ex){}
        return;
      }
    }
  }
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
 
      // Auto-hide for age 1-5 or student
      try {
        const card = el.closest ? el.closest('.member-card') : null;
        if(card){
          const dob = card.querySelector('[data-field="m.dob"]')?.value;
          let age = null;
          if(dob){
            const d = new Date(dob+'T00:00:00');
            if(!isNaN(d)){ const now=new Date(); age = now.getFullYear()-d.getFullYear(); const mo=now.getMonth()-d.getMonth(); if(mo<0||(mo===0&&now.getDate()<d.getDate())) age--; }
          }
          const occ = (card.querySelector('[data-field="m.occupation"]')?.value||'').toLowerCase();
          const hide = (age !== null && age >=0 && age <=5) || occ.includes('student');
          card.querySelectorAll('.child-hide-edu, .child-hide-occ, .child-hide-deeni').forEach(x=>x.style.display = hide ? 'none' : 'block');
          if(hide){
            card.querySelectorAll('.child-hide-edu select, .child-hide-edu input').forEach(x=>{ if(x.tagName==='SELECT') x.value=''; if(x.tagName==='INPUT') x.value=''; });
            card.querySelectorAll('.child-hide-occ input').forEach(x=>{ x.value=''; });
            card.querySelectorAll('.child-hide-deeni select').forEach(x=>{ x.value=''; });
          }
        }
      } catch(ex){}  if(el.id==='famSearch') renderFamilyList();
});
document.addEventListener('change', (e)=>{
  const el=e.target;
  if (el.id==='restoreFile'){ restoreJSON(el.files && el.files[0]); return; }
  if(el.dataset&&el.dataset.field){ 
    applyField(el); 
    // Custom doc label
    if(el.dataset.field === 'customLabel' && state.draft && Array.isArray(state.draft.custom)){
      const ci = +el.dataset.ci;
      if(state.draft.custom[ci]) state.draft.custom[ci].label = el.value;
      try { saveFormDraft(); } catch(ex){}
      return;
    }
    // Marital status - hide/show children
    if(el.dataset.field === 'm.maritalStatus'){
      const card = el.closest('.member-card');
      if(card){
        const kids = card.querySelector('.m-children');
        if(kids){
          if(el.value === 'Married'){ kids.style.display='block'; }
          else { kids.style.display='none'; const inp=kids.querySelector('input'); if(inp) inp.value=''; }
        }
      }
    }
    // Education - no auto-hide
    return; 
  }
  if(el.id==='famGenderF'||el.id==='famMaritalF'||el.id==='famStreetF') renderFamilyList();
});

// form submissions
document.addEventListener('submit', async (e)=>{
  const form = e.target;
  if (form.id==='famForm'){ e.preventDefault(); saveFamily(); }
  else if (form.id==='addAdminForm'){ e.preventDefault(); await addAdmin(form); }
  else if (form.id==='idcardForm'){ e.preventDefault(); saveIdcardForm(form); }
  else if (form.id==='idsetForm'){ e.preventDefault(); saveIdsetForm(form); }
  else if (form.id==='profPassForm'){ e.preventDefault();
    const u = currentUser(); if (!u) return;
    const E = form.elements, box = form;
    const admins = DB.admins();
    const i = admins.findIndex(a=>String(a.email||'').toLowerCase()===String(u.email||'').toLowerCase());
    if (i < 0){ toast('Admin nahi mila.','err'); return; }
    if (E.np.value !== E.np2.value){ toast('Passwords do not match.','err'); return; }
    if (String(E.np.value).length < 6){ toast('Kam se kam 6 characters.','err'); return; }
    if (!(await checkPass(E.cur.value, admins[i]))){ toast('Current password galat hai','err'); return; }
    const salt = uid();
    admins[i].salt = salt;
    admins[i].passHash = await hashPass(E.np.value, salt);
    delete admins[i].tempPass;
    DB.setAdmins(admins);
    if (mailMode() === 'cloud'){ try { const c = await CLOUD.get(); if (c) await c.auth.updateUser({ password: E.np.value }); } catch(err){} }
    toast('Password updated','ok');
    go('myprofile');
  }
  else if (form.id==='ownerForm'){ e.preventDefault();
    if (!isOwner()) { toast('Sirf owner badal sakta hai','err'); return; }
    const v = String(form.elements.owner.value||'').trim().toLowerCase();
    if (!isEmail(v)) { toast('Valid email daalo','err'); return; }
    setOwnerEmail(v); toast('Owner email save ho gaya'); go('settings'); }
});

// hamburger
document.addEventListener('change', (e)=>{
  if (e.target && e.target.id === 'langSel'){ setLang(e.target.value); }
});

document.addEventListener('DOMContentLoaded', ()=>{
  const b=$('#burger'); if(b) b.addEventListener('click', ()=>{ $('#sidebar').classList.add('open'); $('#scrimNav').classList.add('show'); });
  const sc=$('#scrimNav'); if(sc) sc.addEventListener('click', closeNav);
  const tb=$('#themeBtn'); if(tb) tb.addEventListener('click', toggleTheme);
});

/* ---------------- render side-effects ---------------- */
function afterRender(view){
  if (view==='add' && state.draft){ renderMembers(); try { renderDocs(); } catch(e){} try { renderCustomDocs(); } catch(e){} }
  if (view==='detail'){ const f=DB.families().find(x=>x.id===state.param); const box=$('#qrBox'); if(f&&box){
    try {
      const url = location.origin + location.pathname + '#qedit=' + encodeURIComponent(f.id);
      renderQR(box, url);
    } catch(e){ renderQR(box, f.id + ' | ' + (f.houseName||'')); }
  }}
  if (view==='families'){ renderFamilyList(); }
  if (view==='find'){
    setTimeout(()=>{
      const pf2 = $('#findPhoneForm');
      if (pf2 && !pf2._boundFind){ pf2._boundFind=true; pf2.addEventListener('submit',e=>{ e.preventDefault(); lookupByPhone(pf2.elements.phone.value); }); }
      const qf = $('#qrFile');
      if (qf && !qf._bound){ qf._bound=true; qf.addEventListener('change',e=>{ const f=e.target.files&&e.target.files[0]; if(f) scanQrImage(f); e.target.value=''; }); }
    }, 50);
  }
  if (view==='adminpanel'){
    const of = $('#ownerForm');
    if (of && !of._bound){ of._bound=true; of.addEventListener('submit',e=>{ e.preventDefault(); const v=of.elements.oemail.value.trim().toLowerCase(); if(!isEmail(v)){toast('Valid email daalo','err');return;} const prev=ownerEmail(); setOwnerEmail(v); localStorage.setItem('memc_owner_src','user'); audit('settings','Owner email', prev + ' → ' + v); toast('Owner email save ho gaya'); go('adminpanel'); }); }
  }
  if (view==='audit'){
    if (!state.cloudAuditTried && SYNC.on()) loadCloudAudit();
    const q = $('#auditQ');
    if (q && !q._boundAudit){
      q._boundAudit = true;
      q.addEventListener('input', ()=>{
        const v = q.value.toLowerCase().trim();
        state.auditQuery = q.value;
        $$('#auditList .aud-row').forEach(r=>{ r.style.display = (!v || String(r.dataset.s||'').indexOf(v) >= 0) ? '' : 'none'; });
      });
    }
  }
  const tb=$('#themeBtn2'); if(tb){ const t=document.documentElement.getAttribute('data-theme'); tb.innerHTML = themeIcon(t) + (t==='night'?' Night':' Day'); }
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

function saveFormDraft(){
  try {
    if (!isAdmin()) return;
    if (state.view !== 'add' || !state.draft) return;
    localStorage.setItem(LS.formDraft, JSON.stringify({
      draft: state.draft,
      ts: Date.now(),
      view: state.view,
      param: state.param
    }));
  } catch(e){}
}
function loadFormDraft(){
  try {
    const raw = localStorage.getItem(LS.formDraft);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e){ return null; }
}
function clearFormDraft(){
  try { localStorage.removeItem(LS.formDraft); } catch(e){}
}

function saveFamily(){
  const d = state.draft, u = currentUser();
  const andNext = !!state.saveNext;
  state.saveNext = false;
  const alertBox = $('#formAlert');
  const fail = (msg)=>{ state.saveNext = false; if(alertBox) alertBox.innerHTML='<div class="alert err">'+esc(msg)+'</div>'; window.scrollTo({top:0,behavior:'smooth'}); };
  if (!String(d.street||'').trim()) return fail('Street name is required (section 1).');
  if (!String(d.houseName||'').trim()) return fail('Household / head name is required.');
  const members = d.members.filter(m=> (m.name||'').trim());
  if (!members.length) return fail('Add at least one member with a name.');
  if (d.phone && !/^[0-9+\-\s]{6,15}$/.test(d.phone)) return fail('Phone number looks invalid.');

  d.street = d.street.trim();
  d.houseType = d.houseType || 'moulding';
  d.members = members;
  d.custom = normCustom(d.custom);
  const fams = DB.families();
  if (d.id){
    const i = fams.findIndex(f=>f.id===d.id);
    d.updatedAt = Date.now();
    d.updatedBy = (currentUser() && (currentUser().name || currentUser().email)) || d.updatedBy || '';
    if (i>=0) fams[i]=d; else fams.push(d);
  } else {
    const custom = String(d.customId||'').trim().toUpperCase();
    if (custom){
      if (!/^[A-Z0-9\-_/]{3,32}$/.test(custom)) return fail('Family ID me sirf letters, numbers, - _ / chalega (3-32 characters).');
      if (fams.some(f=>f.id.toUpperCase()===custom)) return fail('Ye Family ID pehle se kisi ghar ke paas hai — koi aur do.');
      d.id = custom;
    } else {
      d.id = nextFamilyId(d.members ? d.members.length : 0);
    }
    d.createdAt = Date.now();
    d.updatedAt = d.createdAt;
    d.createdBy = d.createdBy || ((currentUser() && (currentUser().name || currentUser().email)) || '');
    d.createdBy = u.id;
    fams.push(d);
  }
  DB.setFamilies(fams);
  const wasNew = !state.param;
  state.draft = null;
  try { clearFormDraft(); } catch(e){}
  if (SYNC.on() && isAdmin()){
    SYNC.saveFamily(d).then(ok=>{ if (!ok) toast('Cloud me save nahi hua — baad me retry karega','err'); });
  }
  if (andNext){
    const nd = blankDraft();
    nd.street = d.street; nd.houseType = d.houseType;
    state.draft = nd; state.docsOpen = false;
    toast('Saved — next household ke liye form ready');
    go('add');
    return;
  }
  toast(wasNew ? 'Household saved — ID generated' : 'Changes saved');
  go('detail', d.id);
}
function previewFamilyId(){ return PREFIX+'-'+new Date().getFullYear()+'-'+pad(DB.seq()+1,6); }
function nextFamilyId(membersCount){
  const cfg = idset();
  const yy = String(new Date().getFullYear()).slice(-2);
  /* random mode: MEMC-26K7Q2 — sequential se guess karna mushkil */
  if (cfg.famRandom){
    const taken = new Set(DB.families().map(f=>String(f.id||'').toUpperCase()));
    for (let i=0;i<40;i++){
      const id = cfg.famPrefix + '-' + yy + idRand(4);
      if (!taken.has(id.toUpperCase())) return id;
    }
    return cfg.famPrefix + '-' + yy + idRand(6);
  }
  /* simple mode: 2026001FM04 */
  const n=DB.seq()+1; DB.setSeq(n);
  const year = new Date().getFullYear();
  return year + pad(n, 3) + 'FM' + pad(Number(membersCount)||0, 2);
}
/* custom documents: khaali rows kabhi store/ dikhaye nahi jaate */
function normCustom(custom){
  const arr = Array.isArray(custom) ? custom : [];
  return arr
    .filter(c => c && String(c.label||'').trim())
    .slice(0, CUSTOM_DOCS)
    .map(c => ({ label:String(c.label).trim().slice(0,60), value:c.value==='yes'?'yes':'no' }));
}

/* ============================================================
   USERS create
   ============================================================ */
/* ek hi jagah se admin request banti hai — owner form aur public "request access" dono */
async function createAdminRequest(name, email, phone, age, photo, requestedBy){
  email = String(email||'').trim().toLowerCase();
  if (!isEmail(email)) return { error:'Valid email ID daalo' };
  if (adminByEmail(email)) return { error:'Ye email pehle se admin hai' };
  const userId = genUserId();
  const tempPass = genTempPass();
  const salt = uid();
  const rec = {
    email, name:String(name||'').trim() || email.split('@')[0], phone:String(phone||'').trim(),
    age: age||'', photo: photo||'', userId, status:'active', salt, passHash: await hashPass(tempPass, salt), tempPass,
    createdAt:Date.now(), verified:true, requestedBy: requestedBy || 'owner'
  };
  const admins = DB.admins(); admins.push(rec); DB.setAdmins(admins);
  return { rec };
}

async function addAdmin(form){
  const E = form.elements;
  if (!isOwner()){ toast('Sirf owner naya admin add kar sakta hai','err'); return; }
  let photo = '';
  const photoFile = E.photo && E.photo.files && E.photo.files[0];
  if (photoFile){
    try { photo = await compressImageDataURL(await readFileAsDataURL(photoFile), 256, 0.7); } catch(e){}
  }
  const out = await createAdminRequest(E.name.value, E.email.value, E.phone.value, E.age.value, photo, currentUser().email);
  if (out.error){ toast(out.error,'err'); return; }
  const rec = out.rec;
  state.newCreds = { userId:rec.userId, tempPass:rec.tempPass, name:rec.name, email:rec.email, mail: credsMailto(rec) };
  toast('Admin ban gaya — credentials dekho','ok');
  go('users');
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
    ['6 · Documents & Schemes','Scheme mili', s.scheme.applied],
    ['6 · Documents & Schemes','Scheme nahi mili', s.scheme.notApplied],
    ...BASIC_DOCS.map(([k,l])=>['6 · Documents & Schemes','Have '+l, s.docs[k]]),
    ...SCHEMES.filter(([k])=>k!=='other').map(([k,l])=>['6 · Documents & Schemes','Scheme: '+l, s.scheme.counts[k]||0]),
    ...s.scheme.byName.map(([nm,n])=>['6 · Documents & Schemes','Scheme: '+nm, n])
  ].map(([group,metric,value])=>({ Group:group, Metric:metric, Total:value }));
}
function exportExcel(){
  if (typeof XLSX === 'undefined'){ toast('Excel library load nahi hui — page refresh karo','err'); return; }
  const rows = collectRows();
  if (!rows.length){ toast('No data to export','err'); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Members');
  const famRows = DB.families().map(f=>({
    'Family ID':f.id,'Street':streetName(f),'House No':f.houseNo||'','House Type':labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)),
    'Household':f.houseName||'','Phone':f.phone||'','Address':f.address||'',
    'Members':(f.members||[]).length,
    'Men':(f.members||[]).filter(m=>m.gender==='Male' && !m.deceased).length,
    'Women':(f.members||[]).filter(m=>m.gender==='Female' && !m.deceased).length,
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
const LS_LASTBACKUP = 'memc_lastbackup';
function lastBackupAt(){ return Number(localStorage.getItem(LS_LASTBACKUP)||0); }
function backupAgeDays(){ const t=lastBackupAt(); return t ? Math.floor((Date.now()-t)/86400000) : null; }
function needsBackup(){ const d=backupAgeDays(); return d===null || d>=7; }
function backupHint(){
  const d = backupAgeDays();
  return d===null ? tStr('Kabhi backup nahi liya') : (d===0 ? tStr('Aaj backup liya') : d+' '+tStr('din pehle backup liya'));
}

function backupPayload(){
  return { org:CFG.ORG_NAME, exportedAt:new Date().toISOString(), families:DB.families(), masjid:DB.masjid(),
           admins:DB.admins().map(a=>({email:a.email,name:a.name,phone:a.phone,createdAt:a.createdAt})) };
}

function backupJSON(){
  const data = backupPayload();
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='masjid-survey-backup-'+todayStr()+'.json'; a.click(); URL.revokeObjectURL(a.href);
  try { localStorage.setItem(LS_LASTBACKUP, String(Date.now())); } catch(e){}
  audit('backup', 'JSON file', (data.families||[]).length + ' households');
  toast('Backup downloaded — is file ko Google Drive / laptop me rakh do');
}

/* ---------------- RESTORE (backup file wapas) ---------------- */
function restoreJSON(file){
  if (!file) return;
  const rd = new FileReader();
  rd.onerror = ()=> toast('File padhi nahi ja saki','err');
  rd.onload = ()=>{
    let data = null;
    try { data = JSON.parse(String(rd.result||'')); } catch(e){ toast('Ye JSON backup file nahi hai','err'); return; }
    const fams = Array.isArray(data && data.families) ? data.families : (Array.isArray(data) ? data : null);
    if (!fams){ toast('Backup file me families nahi mili','err'); return; }

    const before = DB.families().length;
    const when = data && data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-GB') : tStr('date nahi hai');
    const okToGo = confirm('Restore backup?\n\nBackup date: ' + when + '\nFamilies in file: ' + fams.length + '\nFamilies now on device: ' + before + '\n\n' + tStr('Is device ka current data backup se replace ho jayega.'));
    if (!okToGo) return;

    const clean = fams.filter(f=>f && typeof f==='object' && (f.id||f.houseName||(f.members&&f.members.length)))
      .map(f=> Object.assign({}, f, { id:String(f.id||'').trim() || ('MEMC-' + Date.now() + '-' + Math.floor(Math.random()*900+100)) }));

    DB.setFamilies(clean, { silent:true });
    if (data.masjid) DB.setMasjid(data.masjid);
    const maxSeq = clean.reduce((n,f)=>{ const m = String(f.id||'').match(/(\d+)\s*$/); return m ? Math.max(n, Number(m[1])) : n; }, 0);
    if (maxSeq) DB.setSeq(maxSeq);

    /* admins: sirf missing wale add karo — khud ka login kabhi na toote */
    const admins = DB.admins();
    const seen = new Set(admins.map(a=>String(a.email||'').toLowerCase()));
    let added = 0;
    (Array.isArray(data.admins) ? data.admins : []).forEach(a=>{
      const e = String(a && a.email || '').toLowerCase();
      if (e && !seen.has(e)){ admins.push({ email:e, name:a.name||e.split('@')[0], phone:a.phone||'', createdAt:a.createdAt||Date.now(), verified:true }); seen.add(e); added++; }
    });
    if (added) DB.setAdmins(admins, { silent:true });

    try { localStorage.setItem(LS_LASTBACKUP, String(Date.now())); } catch(e){}
    audit('restore', 'Backup file', clean.length + ' households restored · ' + added + ' admins added');
    toast(tStr('Restore ho gaya')+' — ' + clean.length + ' families' + (added ? ' · ' + added + ' admin added' : ''), 'ok');
    try { go('dashboard'); } catch(e){}

    if (SYNC.on()){
      (async ()=>{
        for (const f of clean){ try { await SYNC.saveFamily(f); } catch(e){} }
        try { if (data.masjid) await SYNC.saveMasjid(data.masjid); } catch(e){}
        try { go(state.view, state.param); } catch(e){}
      })();
    }
  };
  rd.readAsText(file);
}

/* ---------------- GOOGLE DRIVE backup ----------------
   Needs an OAuth Client ID (free) in config.js → GOOGLE_CLIENT_ID.
   Scope `drive.file` = app sirf apni banayi files dekh/save kar sakti hai. */
const LS_DRIVE = 'memc_drive';
const DRIVE = { token:'', exp:0, folderId:'' };
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function driveMeta(){ try { return JSON.parse(localStorage.getItem(LS_DRIVE) || 'null'); } catch(e){ return null; } }
function setDriveMeta(m){ try { localStorage.setItem(LS_DRIVE, JSON.stringify(m)); } catch(e){} }
function driveReady(){ return !!(CFG.GOOGLE_CLIENT_ID && String(CFG.GOOGLE_CLIENT_ID).trim()); }
function driveConnected(){ return !!(DRIVE.token && DRIVE.exp > Date.now() + 30000); }
function driveLastText(){ const m = driveMeta(); return m && m.lastAt ? new Date(m.lastAt).toLocaleString('en-GB') : tStr('kabhi nahi'); }
function driveStatusText(){
  if (!driveReady()) return 'Drive setup baaki — config.js me GOOGLE_CLIENT_ID daalo (guide Settings me).';
  if (driveConnected()) return 'Drive connected · last Drive backup: ' + driveLastText();
  const m = driveMeta();
  return (m && m.lastAt ? 'Last Drive backup: ' + driveLastText() + ' · ' : '') + 'Connect dabao to Drive on karein.';
}

function loadGis(){
  return new Promise((res, rej)=>{
    try { if (window.google && google.accounts && google.accounts.oauth2) return res(); } catch(e){}
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = ()=>res();
    s.onerror = ()=>rej(new Error('Google script load nahi hua'));
    document.head.appendChild(s);
  });
}

async function driveToken(interactive){
  if (driveConnected()) return DRIVE.token;
  if (!driveReady()) throw new Error('setup');
  await loadGis();
  return new Promise((res, rej)=>{
    let settled = false;
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: CFG.GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (r)=>{
        settled = true;
        if (r && r.access_token){ DRIVE.token = r.access_token; DRIVE.exp = Date.now() + Number(r.expires_in||3600)*1000; res(r.access_token); }
        else rej(new Error('cancelled'));
      },
      error_callback: ()=>{ if (!settled) rej(new Error('cancelled')); }
    });
    try { tc.requestAccessToken({ prompt: interactive ? 'consent' : 'none' }); }
    catch(e){ rej(e); }
  });
}

async function driveFindFolder(token){
  const folder = CFG.DRIVE_FOLDER || 'Masjid Records Backup';
  const q = encodeURIComponent("name = '" + folder.replace(/'/g,"\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=' + q, { headers:{ Authorization:'Bearer ' + token } });
  if (!r.ok) throw new Error('Drive folder check fail (' + r.status + ')');
  const j = await r.json();
  return (j.files && j.files[0] && j.files[0].id) || '';
}
async function driveMakeFolder(token){
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + token, 'Content-Type':'application/json' },
    body: JSON.stringify({ name: CFG.DRIVE_FOLDER || 'Masjid Records Backup', mimeType:'application/vnd.google-apps.folder' })
  });
  if (!r.ok) throw new Error('Drive folder banane me fail (' + r.status + ')');
  const j = await r.json();
  return j.id;
}
async function driveEnsureFolder(token){
  if (DRIVE.folderId) return DRIVE.folderId;
  const m = driveMeta();
  let id = (m && m.folderId) || await driveFindFolder(token) || await driveMakeFolder(token);
  DRIVE.folderId = id;
  return id;
}
async function driveUpload(token, name, text, folderId){
  const boundary = '----memc' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const meta = { name: name, mimeType: 'application/json' };
  if (folderId) meta.parents = [folderId];
  const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
    '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + text + '\r\n--' + boundary + '--';
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + token, 'Content-Type':'multipart/related; boundary=' + boundary },
    body: body
  });
  if (!r.ok) throw new Error('Drive upload fail (' + r.status + ')');
  return r.json();
}

async function backupToDrive(){
  if (!driveReady()){ toast('Pehle Drive setup karo — config.js me GOOGLE_CLIENT_ID chahiye','err'); return false; }
  toast('Google Drive se connect ho raha hai…');
  try {
    let token = '';
    try { token = await driveToken(false); } catch(e){ token = await driveToken(true); }
    const folderId = await driveEnsureFolder(token);
    const data = backupPayload();
    const stamp = new Date().toTimeString().slice(0,5).replace(':','');
    const name = 'masjid-survey-backup-' + todayStr() + '-' + stamp + '.json';
    const res = await driveUpload(token, name, JSON.stringify(data, null, 2), folderId);
    setDriveMeta({ lastAt:Date.now(), fileName:name, fileId:res.id, link:res.webViewLink || '', folderId:folderId, families:(data.families||[]).length });
    try { localStorage.setItem(LS_LASTBACKUP, String(Date.now())); } catch(e){}
    toast(tStr('Drive backup ho gaya')+' — ' + name, 'ok');
    try { go(state.view, state.param); } catch(e){}
    return true;
  } catch(e){
    const msg = String((e && e.message) || 'error');
    toast(msg === 'setup' ? 'Drive setup baaki hai' : 'Drive backup fail: ' + msg, 'err');
    return false;
  }
}

async function driveConnect(){
  if (!driveReady()){ toast('Drive ke liye Google OAuth Client ID chahiye (config.js me)','err'); return; }
  try {
    await driveToken(true);
    try { await driveEnsureFolder(DRIVE.token); } catch(e){}
    toast('Google Drive connected', 'ok');
    try { go('settings'); } catch(e){}
  } catch(e){
    toast('Connect nahi hua — dobara try karo', 'err');
  }
}

function mjHead(){
  const m = masjidData();
  if (!m.name && !m.address && !m.imam && !(m.photos||[]).length) return '';
  return `<div class="pmasjid">
    <b>Masjid:</b> ${esc(m.name||CFG.ORG_NAME||'—')}${m.established?` · est. ${esc(m.established)}`:''}${m.imam?` · Imam: ${esc(m.imam)}`:''}${m.address?`<br>${esc(m.address)}`:''}${m.phone?` · ${esc(m.phone)}`:''}
    ${(m.photos||[]).length?`<div class="pphotos">${m.photos.map(src=>`<img src="${esc(src)}" />`).join('')}</div>`:''}
  </div>`;
}

/* ---- family ID card (v88): editable design + terms on the back ---- */
const IDCARD_DEFAULT = {
  org:'', sub:'', tag:'Family ID Card', size:'5x3',
  logo:'', bg:'', bgOpacity:14, accent:'#0f5c47',
  scale:1.12,
  footLeft:'', footRight:'',
  terms:'1. Ye card is mohalla ke survey record ka proof hai — kisi aur kaam ke liye valid nahi.\n2. Card sirf head of family ke naam par jari hota hai; ghar badalne par committee ko batana zaroori hai.\n3. QR scan karne par sirf is ghar ki registered tafseel dikhti hai.\n4. Card kho jaye to turant Masjid e Mohammadi Khidmat Committee ko suchit karein.\n5. Committee ka faisla final hoga — galat jaankari par card cancel ho sakta hai.\n\n(Mutavalli se approve hone ke baad ye terms update honge.)'
};
function idcardCfg(){
  const c = Object.assign({}, IDCARD_DEFAULT, DB.idcard() || {});
  c.org = String(c.org||'').trim() || (CFG.ORG_NAME || 'Masjid e Mohammadi');
  c.sub = String(c.sub||'').trim() || (CFG.ORG_SUB || 'Khidmat Committee');
  c.tag = String(c.tag||'').trim() || 'Family ID Card';
  const sc = Number(c.scale)||1.12;
  c.scale = Math.min(1.4, Math.max(1, sc));
  c.bgOpacity = Math.min(60, Math.max(0, Number(c.bgOpacity)||0));
  if (!/^#[0-9a-f]{3,8}$/i.test(c.accent||'')) c.accent = '#0f5c47';
  c.size = (c.size==='3x5' || c.size==='id1') ? c.size : '5x3';
  return c;
}
function idCrestSVG(cfg){
  const logo = (cfg && cfg.logo) || DB.logo();
  if (logo) return `<img src="${esc(logo)}" alt="" />`;
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 7c4.2 3.6 6.4 7.6 6.4 11.4 0 2.3-.9 4.3-2.4 5.9h-8c-1.5-1.6-2.4-3.6-2.4-5.9C17.6 14.6 19.8 10.6 24 7z"/>
    <path d="M24 5.2v1.8"/>
    <path d="M14.5 20.5h19"/>
    <path d="M15.6 24.3v13.4M32.4 24.3v13.4"/>
    <path d="M11.6 37.7V27.4c0-2 1.3-3.4 3.2-3.4M36.4 37.7V27.4c0-2-1.3-3.4-3.2-3.4"/>
    <path d="M8.8 37.7h30.4"/>
    <path d="M20.5 37.7v-6.1c0-1.9 1.6-3.4 3.5-3.4s3.5 1.5 3.5 3.4v6.1"/>
  </svg>`;
}
function girihBg(color){
  const c = encodeURIComponent(color || '#0f5c47');
  const star = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><g fill='none' stroke='${c}' stroke-opacity='.18' stroke-width='1'><path d='M17 3l3.4 6.8L28 7l-2.8 7 7 2.9-6.8 3.4L28 28l-7.6-2.8L17 32l-3.4-6.8L6 28l2.8-7L1.8 18l6.8-3.4L6 7l7.6 2.8z'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${star}")`;
}
function idCardCSS(c){
  const k = c.scale;
  const mode = (c.size==='3x5') ? '3x5' : (c.size==='id1' ? 'id1' : '5x3');   /* 5x3 = default, landscape */
  const portrait = mode==='3x5';
  /* bada card -> text bhi bada */
  const s = mode==='3x5' ? 1.5 : (mode==='id1' ? 1 : 1.32);
  const pt = n => (n*k*s).toFixed(2)+'pt';
  const W = mode==='3x5' ? '76.2mm' : (mode==='id1' ? '85.6mm' : '127mm');
  const H = mode==='3x5' ? '127mm'  : (mode==='id1' ? '53.98mm' : '76.2mm');
  const QR = mode==='3x5' ? 33 : (mode==='id1' ? 21 : 32);
  return `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#eef2f0;padding:16px;font-family:"Segoe UI",Roboto,Arial,Helvetica,sans-serif;color:#0d2b22}
.bar{display:flex;gap:10px;justify-content:center;margin-bottom:14px;flex-wrap:wrap}
.bar button{padding:9px 16px;border-radius:9px;border:1px solid ${c.accent};background:${c.accent};color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.bar button.ghost{background:#fff;color:${c.accent}}

.idcard{position:relative;width:${W};height:${H};margin:0 auto;border-radius:3.2mm;overflow:hidden;
  display:flex;flex-direction:column;background:#fff;
  box-shadow:0 6px 22px rgba(6,32,24,.22);page-break-inside:avoid;break-inside:avoid;
  border:0.3mm solid ${c.accent}}
.idcard+.idcard{margin-top:6mm}
.idcard .photo{position:absolute;inset:0;background-size:cover;background-position:center;opacity:${(c.bgOpacity/100).toFixed(2)};pointer-events:none}
.idcard .bg{position:absolute;inset:0;background-image:${girihBg(c.accent)};background-size:9mm 9mm;opacity:.45;pointer-events:none}
.idcard .glow{position:absolute;inset:0;background:
  radial-gradient(70mm 40mm at 100% 0%, ${c.accent}22, transparent 60%),
  radial-gradient(60mm 40mm at 0% 100%, ${c.accent}18, transparent 62%);pointer-events:none}
.idcard .dome{position:absolute;right:${portrait?'9mm':'18mm'};bottom:-7mm;width:${portrait?'48mm':'44mm'};height:${portrait?'48mm':'44mm'};color:${c.accent};opacity:.06;pointer-events:none}
.idcard .dome svg{width:100%;height:100%}

.idtop{position:relative;flex:none;display:flex;align-items:center;gap:2.3mm;
  height:${portrait?'auto':(mode==='id1'?'11.6mm':'15.4mm')};padding:${portrait?'2.6mm 3mm':(mode==='id1'?'0 3mm':'0 3.6mm')};
  background:linear-gradient(100deg,${c.accent} 0%,${c.accent}dd 100%);color:#fff}
.crest{width:${portrait?'10mm':'7.8mm'};height:${portrait?'10mm':'7.8mm'};flex:none;border-radius:2mm;background:#fff;color:${c.accent};display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 .3mm rgba(255,255,255,.55)}
.crest svg{width:${portrait?'7.6mm':'6mm'};height:${portrait?'7.6mm':'6mm'}}
.crest img{width:100%;height:100%;object-fit:cover}
.org{min-width:0;line-height:1.2}
.org b{display:block;font-size:${pt(6.9)};letter-spacing:.3pt;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.org span{display:block;font-size:${pt(4.7)};letter-spacing:.45pt;text-transform:uppercase;opacity:.86}
.tag{margin-left:auto;font-size:${pt(4.4)};letter-spacing:.6pt;text-transform:uppercase;border:0.25mm solid rgba(255,255,255,.55);
  border-radius:1.2mm;padding:${portrait?'1mm 1.8mm':'.8mm 1.5mm'};white-space:nowrap}

.idbody{position:relative;flex:1;min-height:0;display:flex;flex-direction:${portrait?'column':'row'}}
.idleft{flex:1;min-width:0;display:flex;flex-direction:column;
  padding:${portrait?'3.4mm 3.2mm 2mm':(mode==='id1'?'2.6mm 2.4mm 1.6mm 3.2mm':'4mm 3.4mm 2.6mm 4mm')}}
.fidlab{font-size:${pt(4.3)};letter-spacing:.8pt;text-transform:uppercase;color:#5c7a70;font-weight:700}
.fid{font-family:"Courier New",monospace;font-size:${pt(9.4)};font-weight:700;letter-spacing:.1pt;color:${c.accent};line-height:1.15;word-break:break-all}
.rule{height:0.3mm;background:linear-gradient(90deg,${c.accent},${c.accent}22);margin:${portrait?'2mm 0 1.8mm':'1.4mm 0 1.2mm'}}
.rows{display:flex;flex-direction:column;gap:${portrait?'1.6mm':'1.05mm'}}
.r{display:flex;gap:1.8mm;font-size:${pt(6.1)};line-height:1.24;align-items:baseline}
.r .k{color:#63837a;min-width:${portrait?'23mm':(mode==='id1'?'17mm':'24mm')};flex:none;font-size:${pt(4.7)};letter-spacing:.15pt;text-transform:uppercase;font-weight:700}
.r .v{color:#0d2b22;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.idright{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${portrait?'1.8mm':'1.3mm'};
  width:${portrait?'auto':(QR+7)+'mm'};padding:${portrait?'2mm 3mm 3mm':(mode==='id1'?'1.8mm 2mm':'2.4mm 3mm')};
  border-left:${portrait?'0':'0.25mm dashed '+c.accent+'55'};
  border-top:${portrait?'0.25mm dashed '+c.accent+'55':'0'};
  background:rgba(255,255,255,.8)}
.qrbox{width:${QR}mm;height:${QR}mm;background:#fff;padding:1.1mm;border-radius:1.2mm;box-shadow:0 0 0 .25mm ${c.accent}33}
.qrbox canvas,.qrbox img,.qrbox svg{width:100%!important;height:100%!important;display:block;object-fit:contain}
.qrlab{font-size:${pt(4.2)};letter-spacing:.5pt;text-transform:uppercase;color:#5c7a70;font-weight:700}
.qrid{font-family:"Courier New",monospace;font-size:${pt(4.6)};font-weight:700;color:${c.accent};text-align:center;max-width:${portrait?'60mm':(QR+3)+'mm'};word-break:break-all;line-height:1.15}

.idfoot{position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;gap:2mm;
  height:${portrait?'8.4mm':(mode==='id1'?'5.2mm':'7.4mm')};padding:0 3.6mm;background:#f3f7f5;border-top:0.25mm solid ${c.accent}28;
  font-size:${pt(4.3)};color:#5c7a70;letter-spacing:.2pt}
.idfoot b{color:${c.accent}}

/* back side */
.idterms{position:relative;flex:1;min-height:0;padding:${portrait?'3.4mm 3.4mm':'2.4mm 3.2mm'};overflow:hidden;
  display:flex;flex-direction:column}
.idterms h4{font-size:${pt(5.4)};letter-spacing:.5pt;text-transform:uppercase;color:${c.accent};margin-bottom:${portrait?'2mm':'1.2mm'};flex:none}
.idterms p{font-size:${pt(5.2)};line-height:1.45;color:#173a2f;white-space:pre-wrap;word-break:break-word;
  flex:1;min-height:0;overflow:hidden}
.idsign{display:flex;gap:4.5mm;margin-top:${portrait?'3mm':'1.4mm'};font-size:${pt(4.3)};color:#5c7a70;flex:none}
.idsign .sg{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:${portrait?'17mm':'10.5mm'}}
.idsign .sg img{max-width:96%;max-height:${portrait?'13mm':'7.4mm'};object-fit:contain;margin-bottom:.3mm}
.idsign .sg em{width:100%;text-align:center;border-top:0.25mm solid #9db3aa;padding-top:.6mm;font-style:normal;line-height:1.1}

@media print{
  body{background:#fff;padding:0}
  .bar{display:none}
  .idcard{box-shadow:none;margin:0}
  .idcard+.idcard{margin-top:0;page-break-before:always;break-before:page}
  @page{size:auto;margin:8mm}
}`;
}
/* QR ko pehle se image bana lete hain — print popup me hamesha dikhega */
/* QR ko inline SVG banao — print/PDF me image load ka koi risk nahi */
function qrSvgTag(text){
  try{
    if (typeof qrcode === 'function'){
      const qr = qrcode(0,'M'); qr.addData(String(text||'')); qr.make();
      return qr.createSvgTag({ cellSize:4, margin:0, scalable:true });
    }
  }catch(e){}
  return '';
}
function idCardFront(fam, c, base){
  const mem = fam.members || [];
  const head = mem.find(m=>/(head|self)/i.test(m.relation||'')) || mem[0] || {};
  const addr = [fam.houseNo?('House '+fam.houseNo):'', streetName(fam), fam.address && fam.address!==streetName(fam) ? fam.address : ''].filter(Boolean).join(', ');
  const a = ageFromDob(head.dob);
  const dobText = head.dob ? (fmtDate(head.dob) || head.dob) : '—';
  const issued = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const footL = String(c.footLeft||'').trim() || (tStr('Members')+' '+mem.filter(m=>!m.deceased).length+' · '+tStr('Issued')+' '+issued);
  const footR = String(c.footRight||'').trim() || (c.org+' · '+c.sub);
  const qrText = location.origin + location.pathname + '#qedit=' + encodeURIComponent(fam.id);
  const qrMarkup = qrSvgTag(qrText);
  return `
<div class="idcard">
  ${c.bg?`<div class="photo" style="background-image:url('${esc(c.bg)}')"></div>`:''}
  <div class="bg"></div><div class="glow"></div>
  <div class="dome">${idCrestSVG(c).startsWith('<svg') ? idCrestSVG(c) : ''}</div>
  <div class="idtop">
    <div class="crest">${idCrestSVG(c)}</div>
    <div class="org"><b>${esc(c.org)}</b><span>${esc(c.sub)} · ${esc(tStr('Mohalla Survey'))}</span></div>
    <div class="tag">${esc(c.tag)}</div>
  </div>
  <div class="idbody">
    <div class="idleft">
      <div class="fidlab">${esc(tStr('Family ID'))}</div>
      <div class="fid">${esc(fam.id)}</div>
      <div class="rule"></div>
      <div class="rows">
        <div class="r"><span class="k">${esc(tStr('Head of family'))}</span><span class="v">${esc(head.name||'—')}</span></div>
        <div class="r"><span class="k">${esc(tStr('Relation'))}</span><span class="v">${esc(tStr(head.relation||'Self'))}</span></div>
        <div class="r"><span class="k">${esc(tStr('Date of birth'))}</span><span class="v">${esc(dobText)}${a!==null?' · '+a+' '+esc(tStr('yrs')):''}</span></div>
        <div class="r"><span class="k">${esc(tStr('Phone'))}</span><span class="v">${esc(fam.phone||'—')}</span></div>
        <div class="r"><span class="k">${esc(tStr('Address'))}</span><span class="v">${esc(addr||'—')}</span></div>
      </div>
    </div>
    <div class="idright">
      <div class="qrbox" data-qr="${esc(qrText)}">${qrMarkup || `<div style="font-size:6pt;color:#0f5c47;text-align:center;padding:4mm 1mm">QR: ${esc(fam.id)}</div>`}</div>
      <div class="qrlab">${esc(tStr('Scan to verify'))}</div>
      <div class="qrid">${esc(fam.id)}</div>
    </div>
  </div>
  <div class="idfoot"><span>${esc(footL)}</span><span>${esc(footR)}</span></div>
</div>`;
}
function sigBox(src,label){
  return `<span class="sg">${src?`<img src="${esc(src)}" alt="" />`:''}<em>${esc(label)}</em></span>`;
}
function idCardBack(c){
  const terms = String(c.terms||'').trim();
  return `
<div class="idcard">
  ${c.bg?`<div class="photo" style="background-image:url('${esc(c.bg)}')"></div>`:''}
  <div class="bg"></div><div class="glow"></div>
  <div class="idtop">
    <div class="crest">${idCrestSVG(c)}</div>
    <div class="org"><b>${esc(c.org)}</b><span>${esc(c.sub)}</span></div>
    <div class="tag">${esc(tStr('Terms & Conditions'))}</div>
  </div>
  <div class="idterms">
    <h4>${esc(tStr('Terms & Conditions'))}</h4>
    <p>${esc(terms||'—')}</p>
    <div class="idsign">
      ${sigBox(c.sigMutavalli,tStr('Mutavalli'))}
      ${sigBox(c.sigSecretary,tStr('Secretary'))}
      ${sigBox(c.sigMember,tStr('Member'))}
    </div>
  </div>
  <div class="idfoot"><span>${esc(c.org)}</span><span>${esc(c.sub)}</span></div>
</div>`;
}
function printIdCards(fam){
  if(!fam) return;
  const mem = fam.members || [];
  if(!mem.length){ toast(tStr('No members to print'),'err'); return; }
  const c = idcardCfg();
  const base = location.href.replace(/[^/]*$/,'');
  const qrText = location.origin + location.pathname + '#qedit=' + encodeURIComponent(fam.id);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ID Card - ${esc(fam.id)}</title>
<style>${idCardCSS(c)}</style>
</head><body>
<div class="bar">
  <button onclick="window.print()">Print / Save as PDF</button>
  <button class="ghost" onclick="window.close()">Close</button>
</div>
${idCardFront(fam, c, base)}
${idCardBack(c)}
<script>
(function(){
  var imgs = [].slice.call(document.images), left = imgs.length;
  function go(){ try{ window.print(); }catch(e){} }
  if (!left){ setTimeout(go, 350); return; }
  imgs.forEach(function(im){
    if (im.complete){ if (--left === 0) setTimeout(go, 250); return; }
    im.onload = im.onerror = function(){ if (--left === 0) setTimeout(go, 250); };
  });
})();
</script>
</body></html>`;
  const w = window.open('','_blank','width=900,height=760');
  if(!w){ toast('Popup block hua hai - popup allow karo','err'); return; }
  w.document.write(html);
  w.document.close();
}

function printFamilies(fams, title){
  if (!fams.length){ toast('Nothing to print','err'); return; }
  const s = computeStats();
  const head = `<h1>${esc(CFG.ORG_NAME||'Masjid e Mohammadi')} — ${esc(title)}</h1>
    <div class="pmeta">${esc(CFG.ORG_SUB||'Khidmath Committee')} · printed ${new Date().toLocaleDateString('en-GB')}${DB.admins()[0]?' · by '+esc(DB.admins()[0].name||DB.admins()[0].email):''}</div>
    ${(masjidData().photos||[]).length?`<div class="pphotos">${(masjidData().photos||[]).slice(0,3).map(p=>`<img src="${esc(p.src||p)}" alt="Masjid" />`).join('')}</div>`:''}
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
    const mem = f.members || [];
    const famDocs = DOC_TYPES.filter(([k])=>f.docs&&f.docs[k]==='yes').map(([,l])=>l);
    const custom = (f.custom||[]).filter(c=>c.label);
    const males = mem.filter(m=>/^m/i.test(String(m.gender||'')) && !m.deceased).length;
    const totalKids = mem.reduce((n,m)=>n + (Number(m.children)||0), 0);
    const qrText = [f.id, f.houseName, streetName(f)].filter(Boolean).join(' | ');
    const docList = m => BASIC_DOCS.filter(([k])=>m.docs&&m.docs[k]==='yes').map(([,l])=>l);

    const rows = mem.map((m,i)=>{
      const a = ageFromDob(m.dob);
      return `<tr><td>${i+1}</td><td>${esc(m.name||'')}</td><td>${esc(m.relation||'')}</td><td>${esc(m.gender?tStr(m.gender):'')}</td>
        <td>${a===null?'':a}</td><td>${esc(EDU_LABEL[eduKey(m)]||m.education||'')}</td><td>${esc(occName(m))}</td>
        <td>${esc(DEENI_LABEL[m.religious]||'')}</td><td>${esc(m.maritalStatus?tStr(m.maritalStatus):'')}</td>
        <td>${docList(m).length}/${BASIC_DOCS.length}</td><td>${esc(memberSchemes(m).join(', '))}</td>
        <td>${m.disability==='yes'?'Yes':'No'}</td></tr>`;
    }).join('');

    const memberDetails = mem.map((m,i)=>{
      const a = ageFromDob(m.dob);
      const d = docList(m);
      const sch = memberSchemes(m);
      return `<li><b>${i+1}. ${esc(m.name||'—')}</b>${m.relation?` (${esc(m.relation)})`:''} — DOB: ${esc(m.dob||'—')}${a!==null?` (${a} yrs)`:''} · Gender: ${esc(m.gender?tStr(m.gender):'—')} · Marital: ${esc(m.maritalStatus?tStr(m.maritalStatus):'—')}
        ${m.fatherName?` · Father: ${esc(m.fatherName)}`:''}${m.motherName?` · Mother: ${esc(m.motherName)}`:''}
        ${m.children && String(m.children)!=='0'?` · Children: ${esc(m.children)}`:''}
        ${m.disability==='yes'?` · Challenged: Yes${m.disabilityNote?' ('+esc(m.disabilityNote)+')':''}`:''}
        <br><span class="psub">Education: ${esc(EDU_LABEL[eduKey(m)]||m.education||'—')} · Occupation: ${esc(occName(m)||'—')} · Deeni: ${esc(DEENI_LABEL[m.religious]||'—')}
        <br>Documents (${d.length}/${BASIC_DOCS.length}): ${d.length?esc(d.join(', ')):'none'}${sch.length?` · Govt. schemes: ${esc(sch.join(', '))}`:''}${m.schemeName?` · ${esc(m.schemeName)}`:''}</span></li>`;
    }).join('');

    return `<div class="pcard">
      <div class="pchead">
        <div class="pchead-t">
          <h2>${esc(f.houseName||'Household')} — ${esc(f.id)}</h2>
          <div class="pmeta">Family ID: <b>${esc(f.id)}</b> · Street: ${esc(streetName(f))} · House No: ${esc(f.houseNo||'—')} · House type: ${esc(labelOf(HOUSE_TYPES, houseTypeKey(f.houseType)))}</div>
          <div class="pmeta">Phone: ${esc(f.phone||'—')} · Address: ${esc(f.address||'—')}</div>
          <div class="pmeta">Members: ${mem.length} (men ${males}, women ${mem.length-males}${totalKids?`, children ${totalKids}`:''}) · Registered: ${f.createdAt?new Date(f.createdAt).toLocaleDateString('en-GB'):'—'}${f.createdBy?' · by '+esc(f.createdBy):''}</div>
        </div>
        <div class="pqr"><div class="qr" data-qr="${esc(qrText)}"></div><div class="pqr-cap">${esc(f.id)}</div></div>
      </div>
      ${mem.length?`<table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Occupation</th><th>Deeni</th><th>Marital</th><th>Docs</th><th>Schemes</th><th>Challenged</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="psec-t">Member details</div><ul class="pmem">${memberDetails}</ul>`
      : '<div class="pmeta">No members recorded.</div>'}
      <div class="pmeta" style="margin-top:5pt"><b>Family documents:</b> ${famDocs.length?esc(famDocs.join(', ')):'none'}</div>
      ${custom.length?`<div class="pmeta"><b>Other documents:</b> ${esc(custom.map(c=>c.label+': '+(c.value==='yes'?'Yes':'No')).join(' · '))}</div>`:''}
      ${f.notes?`<div class="pmeta"><b>Notes:</b> ${esc(f.notes)}</div>`:''}
    </div>`;
  }).join('');
  const yr = new Date().getFullYear();
  const foot = `<div class="pfoot">© ${yr} ${esc(CFG.ORG_NAME||'Masjid e Mohammadi')} · ${esc(CFG.ORG_SUB||'Khidmath Committee')} — <span>All rights reserved.</span> · ${esc(String(title))} <span>report</span></div>`;
  const area = $('#printArea'); area.innerHTML = head + body + foot;
  /* har family ka apna QR — Family ID se generate hota hai, isliye print/PDF me bhi aata hai */
  Array.prototype.forEach.call(area.querySelectorAll('.qr[data-qr]'), el => renderQR(el, el.dataset.qr || ''));
  setTimeout(()=>{ window.print(); }, 220);
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
    const id = nextFamilyId(state.draft && state.draft.members ? state.draft.members.length : 0);
    const docs = {}; DOC_TYPES.forEach(([k],idx)=>{ docs[k] = (idx % 2 === 0 && i % 2 === 0) ? 'yes' : 'no'; });
    fams.push(Object.assign({ id, createdAt:Date.now()- (sample.length-i)*86400000, createdBy:'sample', notes:'Sample record', docs, custom:[] }, s));
  });
  DB.setFamilies(fams, { silent:true });
  audit('settings', 'Sample data', 'demo records loaded');
}

/* ============================================================
   INIT
   ============================================================ */

/* email link se wapas aaya? → session se admin login */
async function cloudAutoLogin(){
  /* DISABLED (v108): auto-login on refresh password flow ke sath conflict karta tha.
     Email-link login sirf forgot-password flow se aata hai. */
  return;
}

/* purane admin records me userId/status bhar do (ek baar) */
/* v100: purani ID settings (OWN-/ADM- series) → naya random format */
function migrateIdsSet(){
  try {
    const raw = DB.idset();
    if (!raw || raw.idStyle) return;              /* pehle se naya format */
    const next = Object.assign({}, raw, { idStyle:'random' });
    if (!raw.ownerPrefix || raw.ownerPrefix === 'OWN') next.ownerPrefix = 'OW';
    if (!raw.adminPrefix || raw.adminPrefix === 'ADM') next.adminPrefix = 'AD';
    next.adminSuffix = '';                         /* random style me suffix nahi lagta */
    DB.setIdsSet(next);
  } catch(e){}
}

function migrateAdmins(){
  try {
    const admins = DB.admins(); let ch = false;
    const cfg = idset();
    admins.forEach(a=>{
      const isOwn = String(a.email||'').toLowerCase() === String(ownerEmail()||'').toLowerCase();
      if (isOwn){
        if (!idMatches(a.userId, cfg.ownerPrefix)){ a.userId = genOwnerId(); ch = true; }   /* super admin alag series */
      } else if (!idMatches(a.userId, cfg.adminPrefix)){
        a.userId = genUserId(); ch = true;
      }
      if (!a.status){ a.status = 'active'; ch = true; }
      const wantRole = isOwn ? 'owner' : 'user';   /* v109: purana 'admin' role ab 'user' */
      if (a.role !== wantRole){ a.role = wantRole; ch = true; }
    });
    /* owner sirf config OWNER_EMAIL ya manually set memc_owner se decide hota hai */
    if (ch) DB.setAdmins(admins, { silent:true });
  } catch(e){}
}

function init(){
  /* boot hash yaad rakho — enterApp() baad me hash badal deta hai (#dashboard) */
  let _bootHash = '';
  try { _bootHash = String(typeof BOOT_HASH === 'string' ? BOOT_HASH : '').toLowerCase(); } catch(e){}
  installGuards();
  migrateIdsSet();
  migrateAdmins();
  migrateOwner();
  purgeNonOwnerAdmins();
  /* Security: validate session on boot */
  try {
    const ss = getSession();
    if (ss && ss.kind === 'admin' && ss.email){
      const a = DB.admins().find(x=>String(x.email).toLowerCase()===String(ss.email).toLowerCase());
      if (!a || adminStatus(a) !== 'active' || String(a.email).toLowerCase() !== ownerEmail() && a.status === 'pending'){
        clearSession();
      } else if (!currentUser()){
        clearSession();
      }
    }
  } catch(e){}
  try {
    const h = (location.hash||'').replace(/^#/,'');
    if (h.indexOf('qedit=')===0){
      state._qedit = decodeURIComponent(h.slice(6)).trim();
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch(e){}
  /* recovery link se aaya user: naya password set kare */
  try {
    if (/type=recovery/.test(location.hash) && CLOUD.enabled()){
      pending = { kind:'newpass', email:'', code:'' };
      renderAuth('login');
      renderNewPassword();
      return;
    }
  } catch(e){}
  /* language select ka listener document par delegated hai (neeche) — renderShell select dobara
     banata hai, isliye element par lagane se dusri baar switch kaam nahi karta tha */
  // Don't auto-login on refresh - always show public dashboard first
  // Backup burger handler
  try {
    const b = $('#burger');
    if (b){ b.onclick = ()=>{ const s=$('#sidebar'); const sc=$('#scrimNav'); if(s) s.classList.add('open'); if(sc) sc.classList.add('show'); }; }
  } catch(e){}
  try { applyFavicon(); } catch(e){}
  enterApp();   // public dashboard pehle — login optional
  /* direct admin link: #login (ya #admin) → seedha login box khulta hai */
  try {
    const hh = _bootHash;
    if (hh === 'login' || hh === 'admin'){
      setTimeout(()=>{ try { openAuth('login'); } catch(e){} }, 120);
    }
  } catch(e){}
  // cloudAutoLogin() disabled - prevents auto-login on refresh
  try { new MutationObserver(()=>translateSoon()).observe(document.body, { childList:true, subtree:true }); } catch(e){}
  translateSoon();
}
// Handle browser back button
document.addEventListener('visibilitychange', ()=>{ try{ if (document.hidden) stopQrScan(); }catch(_e){} });
window.addEventListener('popstate', (e)=>{
  try {
    if (e.state && e.state.view){
      state.view = e.state.view;
      if (state.view!=='find'){ try{ stopQrScan(); }catch(_e){} }
      state.param = e.state.param||null;
      // Re-render without pushing history
      const view = state.view;
      const ADMIN_ONLY = ['add','users','settings','families','detail','masjid','adminpanel','idcard','audit'];
      if (ADMIN_ONLY.includes(view) && !isAdmin()){ toast('Ye page sirf admin ke liye hai','err'); state.view='dashboard'; state.param=null; }
      const OWNER_ONLY = ['adminpanel','users','settings','audit','idcard'];
      if (OWNER_ONLY.includes(view) && userRole()==='user'){ toast('Sirf Owner hi ye page khol sakta hai','err'); state.view='dashboard'; state.param=null; }
      const titles = { dashboard:'Survey Dashboard', families:'Households', add:(state.param?'Edit Household':'Add Household'), detail:'Household Record', find:'Find family', adminpanel:'Administration', users:'Admins', settings:'Settings', masjid:'Masjid Profile', cat:'Survey Category', myprofile:'My Profile', 'admin-edit':'Edit Admin', idcard:'ID Card Design', memberlist:'Members', familylist:'Households list', streetlist:'Streets', audit:'Audit log' };
      $('#pageTitle').textContent = titles[state.view] || 'Survey Dashboard';
      let html='';
      if (state.view==='dashboard') html = viewDashboard();
      else if (state.view==='families') html = viewFamilies();
      else if (state.view==='add') html = viewFamilyForm();
      else if (state.view==='detail') html = viewFamilyDetail(state.param);
      else if (state.view==='find') html = viewFind();
      else if (state.view==='adminpanel') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
      else if (state.view==='users') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
      else if (state.view==='settings') html = isAdmin()?viewAdminPanel():`<div class="empty"><h3>Admin only</h3></div>`;
      else if (state.view==='masjid') html = viewMasjid();
      else if (state.view==='myprofile') html = isAdmin()?viewMyProfile():`<div class='empty'><h3>Admin only</h3></div>`;
      else if (state.view==='admin-edit') html = isOwner()?viewAdminEdit(state.param):`<div class='empty'><h3>Owner only</h3></div>`;
      else if (state.view==='idcard') html = isOwner()?viewIdCardDesign():`<div class='empty'><h3>Super admin only</h3></div>`;
      else if (state.view==='cat') html = viewCat(state.param);
      else if (state.view==='memberlist') html = viewMembersList(state.memberListFilter||(()=>true), state.memberListTitle||'Members');
      else if (state.view==='familylist') html = viewFamilyList(state.familyListFilter||(()=>true), state.familyListTitle||'Households');
      else if (state.view==='streetlist') html = viewStreetList();
      $('#content').innerHTML = html;
      $$('#nav .nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===state.view || (state.view==='detail'&&a.dataset.view==='families')||(state.view==='add'&&a.dataset.view==='add')));
      afterRender(state.view);
    } else {
      // No state - go to dashboard
      if (state.view !== 'dashboard'){ state.view='dashboard'; state.param=null; go('dashboard'); }
    }
  } catch(e){ console.error('popstate error:', e); }
});

// Prevent back button from closing app - push initial state
/* boot hash yaad rakho — neeche replaceState use #dashboard kar deta hai */
const BOOT_HASH = (function(){ try { return (location.hash||'').replace(/^#/,'').toLowerCase(); } catch(e){ return ''; } })();
try { history.replaceState({view:'dashboard', param:null}, '', '#dashboard'); } catch(e){}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* debug/test hooks (harmless) */
try { window.setLang = setLang; window.translateTree = translateTree; window.getLang = ()=>LANG; } catch(e){}


/* ============================================================
   FIND FAMILY BY PHONE / QR (public read-only)
   ============================================================ */
function viewFind(){
  return `
    <div class="page-head"><div><h1>Find family</h1><p>Phone number daalo ya QR scan karo — sirf usi ghar ka read-only detail dikhega (edit nahi).</p></div></div>

    <div class="grid g2">
      <div class="card">
        <div class="sec-title" style="margin-top:0">By Family ID</div>
        <form id="findPhoneForm">
          <div class="field"><label>Family ID</label><input class="inp" name="phone" placeholder="eg XXXXX01" autocomplete="off" /></div>
          <button class="btn" type="submit">${ICON.search} Find</button>
        </form>
        <p class="muted small" style="margin-top:10px">Family ID daalo aur details dekho (sirf read-only).</p>
      </div>
      <div class="card">
        <div class="sec-title" style="margin-top:0">By QR scan</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button class="btn ghost" type="button" data-act="scan-qr">${ICON.camera} Scan from camera</button>
          <button class="btn ghost" type="button" data-act="stop-qr">${ICON.x||ICON.close} ${tStr('Camera band karo')}</button>
          <label class="btn ghost" style="cursor:pointer">${ICON.image||ICON.camera} Upload QR image
            <input type="file" id="qrFile" accept="image/*" hidden />
          </label>
          <span class="muted small">Camera ya gallery se QR scan karke Family ID se details khol do.</span>
        </div>
        <video id="qrVideo" class="qr-video" playsinline></video>
        <canvas id="qrCanvas" hidden></canvas>
        <div id="qrScanMsg" class="muted small" style="margin-top:8px"></div>
      </div>
    </div>

    <div id="findResult"></div>
  `;
}

let qrStream = null, qrTimer = null;

async function scanQrImage(file){
  const msg = $('#qrScanMsg'); if(!msg) return;
  if (!file) return;
  if (typeof jsQR !== 'function'){ msg.textContent='QR scanner load nahi hua.'; return; }
  msg.textContent='QR image scan ho raha hai...';
  try {
    const img = new Image();
    img.onload = ()=>{
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      try {
        const data = ctx.getImageData(0,0,canvas.width,canvas.height);
        const res = jsQR(data.data, data.width, data.height);
        if (res && res.data){
          msg.textContent=tStr('QR mila');
          handleQrFind(res.data);
        } else {
          msg.textContent='Is image me QR nahi mila. Dusri image try karo.';
        }
      } catch(e){ msg.textContent='Scan fail hua.'; }
    };
    img.onerror = ()=>{ msg.textContent='Image load nahi hua.'; };
    img.src = URL.createObjectURL(file);
  } catch(e){ msg.textContent='Scan nahi ho saka.'; }
}

async function startQrScan(){
  const video = $('#qrVideo'), msg = $('#qrScanMsg');
  if (!video) return;
  if (!('mediaDevices' in navigator)) { if(msg) msg.textContent='Is browser me camera support nahi.'; return; }
  try {
    if (qrStream){ qrStream.getTracks().forEach(t=>t.stop()); qrStream=null; }
    qrStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    if (typeof state==='object' && state.view!=='find'){ qrStream.getTracks().forEach(t=>t.stop()); qrStream=null; return; }
    video.srcObject = qrStream; await video.play();
    if(msg) msg.textContent='QR scan ho raha hai...';
    scanLoop();
  } catch(e){ if(msg) msg.textContent='Camera access nahi mila. Settings se allow karo.'; }
}
function stopQrScan(){ if(qrTimer){ clearInterval(qrTimer); qrTimer=null; } if(qrStream){ qrStream.getTracks().forEach(t=>t.stop()); qrStream=null; } const video=$('#qrVideo'); if(video){ video.srcObject=null; } }
function scanLoop(){
  const video=$('#qrVideo'), canvas=$('#qrCanvas'), msg=$('#qrScanMsg');
  if(!video||!canvas) return;
  const ctx = canvas.getContext('2d');
  qrTimer = setInterval(()=>{
    if(video.readyState===video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      try {
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        if (typeof jsQR === 'function'){
          const res = jsQR(img.data, img.width, img.height);
          if(res && res.data){
            const txt = String(res.data);
            stopQrScan();
            if(msg) msg.textContent=tStr('QR mila: ')+esc(txt);
            handleQrFind(txt);
            return;
          }
        }
      } catch(e){}
    }
  }, 250);
}
function handleQrFind(txt){
  const t = String(txt||'').trim();
  // support full link #qedit=ID or plain FAMILY-ID
  let id = t;
  const m = t.match(/qedit=([^&\s]+)/i);
  if (m) id = decodeURIComponent(m[1]);
  id = id.split(/\s*\|\s*/)[0].trim();
  lookupById(id);
}
async function lookupById(id){
  const box = $('#findResult'); if(!box) return;
  box.innerHTML = '<div class="card"><p class="muted">Searching...</p></div>';
  try {
    // try local first (admin logged in) else RPC
    if (CLOUD.enabled()){
      const c = await CLOUD.get();
      if (c){
        // try get_family_by_phone not directly; fallback: fetch families by id? anon blocked
        const { data, error } = await c.rpc('get_family_by_id_public', { p_id: id });
        if (data && data.found){ renderFindResult(data); return; }
      }
    }
    // local lookup
    const f = DB.families().find(x=>x.id===id);
    if (f){
      const pub = { found:true, family:{ id:f.id, houseName:f.houseName||'', houseNo:f.houseNo||'', street:streetName(f), houseType:f.houseType||'' }, members:(f.members||[]).map(m=>({ name:m.name||'', relation:m.relation||'', gender:m.gender||'', dob:m.dob||null, education_level:m.education_level||m.education||'', occupation:m.occupation||'', religious:m.religious||'', marital_status:m.marital_status||'', disability:m.disability||'no' })) };
      renderFindResult(pub); return;
    }
    box.innerHTML = '<div class="card"><div class="alert err">Koi record nahi mila. Family ID ya phone number check karo.</div></div>';
  } catch(e){
    box.innerHTML = '<div class="card"><div class="alert err">Lookup nahi hua. Thodi der baad try karo.</div></div>';
  }
}
async function lookupByPhone(id){
  const box = $('#findResult'); if(!box) return;
  const p = String(id||'').trim().toUpperCase();
  if (!p){ box.innerHTML='<div class="card"><div class="alert err">Family ID daalo.</div></div>'; return; }
  box.innerHTML = '<div class="card"><p class="muted">Searching...</p></div>';
  try {
    const f = DB.families().find(x=>String(x.id||'').toUpperCase()===p);
    if (f){
      const pub = { found:true, family:{ id:f.id, houseName:f.houseName||'', houseNo:f.houseNo||'', street:streetName(f), houseType:f.houseType||'' }, members:(f.members||[]).map(m=>({ name:m.name||'', relation:m.relation||'', gender:m.gender||'', dob:m.dob||null, education_level:m.education_level||m.education||'', occupation:m.occupation||'', religious:m.religious||'', marital_status:m.marital_status||'', disability:m.disability||'no' })) };
      renderFindResult(pub); return;
    }
    box.innerHTML = '<div class="card"><div class="alert err">Is Family ID se koi ghar nahi mila.</div></div>';
  } catch(e){
    box.innerHTML = '<div class="card"><div class="alert err">Lookup nahi hua.</div></div>';
  }
}
function renderFindResult(res){
  const box = $('#findResult'); if(!box) return;
  const fam = res.family || {}, members = res.members || [];
  const rows = members.map((m,i)=>`<tr>
    <td>${i+1}</td><td>${esc(m.name||'—')}</td><td>${esc(m.relation||'—')}</td><td>${esc(m.gender?tStr(m.gender):'—')}</td>
    <td>${ageFromDob(m.dob)===null?'—':ageFromDob(m.dob)}</td><td>${esc(m.education_level||'—')}</td>
    <td>${esc(m.occupation||'—')}</td><td>${esc(m.religious||'—')}</td><td>${esc(m.marital_status||'—')}</td>
    <td>${m.disability && m.disability!=='no'?esc(m.disability):'—'}</td>
  </tr>`).join('');
  box.innerHTML = `
    <div class="card" style="margin-top:18px">
      <div class="sec-title" style="margin-top:0">Household (Read-only)</div>
      <div class="kv">
        <div class="row"><span>Family ID</span><span class="mono">${esc(fam.id||'—')}</span></div>
        <div class="row"><span>House name / no</span><span>${esc(fam.houseName||'—')}${fam.houseNo?' · '+esc(fam.houseNo):''}</span></div>
        <div class="row"><span>Street</span><span>${esc(fam.street||'—')}</span></div>
        <div class="row"><span>House type</span><span>${esc(labelOf(HOUSE_TYPES, houseTypeKey(fam.houseType)))}</span></div>
      </div>
      ${isAdmin()
        ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
             <button class="btn sm" data-act="find-edit" data-id="${esc(fam.id||'')}">Edit household</button>
             <button class="btn ghost sm" data-act="find-open" data-id="${esc(fam.id||'')}">Full record</button>
           </div>`
        : `<div class="alert info small" style="margin-top:12px">Phone number aur address nahi dikhaya gaya (privacy). Ye view sirf dikhata hai, edit nahi kar sakte.</div>`}
      <div class="sec-title" style="margin-top:16px">Members</div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Gender</th><th>Age</th><th>Education</th><th>Occupation</th><th>Deeni</th><th>Marital</th><th>Challenged</th></tr></thead><tbody>${rows||'<tr><td colspan="10" class="muted">No members</td></tr>'}</tbody></table></div>
    </div>
  `;
}

window.addEventListener('beforeunload', function(){
  try {
    if (isAdmin() && state.view === 'add' && state.draft && !state.draft.id){
      saveFormDraft();
    }
  } catch(e){}
});

window.onerror = function(msg, url, line){ console.error('ERR:', msg, line); return false; };
