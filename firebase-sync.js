// firebase-sync.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const cfg = window.FIREBASE_CONFIG || {};
if (!cfg.apiKey || String(cfg.apiKey).includes('PASTE')) {
  console.warn('[Firebase] Config missing. Fill firebase-config.js');
}

let app, auth, db;
try {
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
} catch(e) {
  console.error('[Firebase] init error', e);
}

window.FIREBASE = { app, auth, db, user: null, ready: false };

const syncEl = () => document.getElementById('syncStatus');
function setSync(txt){
  const el = syncEl();
  if (el) el.textContent = 'Cloud sync: ' + txt;
}

onAuthStateChanged(auth, (user) => {
  window.FIREBASE.user = user || null;
  window.FIREBASE.ready = true;
  if (user) {
    setSync('Synced');
    startSync();
  } else {
    setSync('Offline (Login required)');
    stopSync();
  }
  if (typeof window.onFirebaseAuthChange === 'function') window.onFirebaseAuthChange(user);
});

let unsub = null;
function startSync(){
  if (unsub || !db) return;
  try {
    unsub = onSnapshot(collection(db, 'families'), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (data.deleted) return;
        list.push({ id: d.id, ...data });
      });
      try {
        localStorage.setItem('memc_families_fb_cache', JSON.stringify(list));
        if (typeof window.onFirestoreFamilies === 'function') window.onFirestoreFamilies(list);
      } catch(e){}
      setSync('Synced');
    }, () => setSync('Offline'));
  } catch(e){ setSync('Offline'); }
}
function stopSync(){
  if (unsub){ try{ unsub(); }catch(e){} unsub = null; }
}

window.fbLogin = async (email, pass) => {
  if (!auth) throw new Error('firebase-not-ready');
  try { await signInWithEmailAndPassword(auth, email.trim(), pass); return true; }
  catch(e){ console.error(e); throw e; }
};
window.fbLogout = async () => { if (!auth) return; try { await signOut(auth); } catch(e){} };

window.fbMigrateLocal = async () => {
  const user = window.FIREBASE.user;
  if (!user){ alert('Pehle login karo'); return; }
  if (localStorage.getItem('memc_fb_migrated') === '1'){ alert('Pehle se migrate ho chuka hai'); return; }
  if (!db){ alert('Firebase nahi chala. Config check karo.'); return; }
  try {
    const fam = JSON.parse(localStorage.getItem('memc_families')||'[]');
    const admins = JSON.parse(localStorage.getItem('memc_admins')||'[]');
    const masjid = JSON.parse(localStorage.getItem('memc_masjid')||'null');
    const idcard = JSON.parse(localStorage.getItem('memc_idcard')||'null');
    const idset = JSON.parse(localStorage.getItem('memc_idset')||'null');
    const audit = JSON.parse(localStorage.getItem('memc_audit')||'[]');

    if (Array.isArray(fam)){
      for (let i=0;i<fam.length;i++){
        const f = fam[i]; if (!f || !f.id) continue;
        await setDoc(doc(db, 'families', String(f.id)), { ...f, _migratedAt: serverTimestamp(), _by: user.uid }, { merge: true });
      }
    }
    await setDoc(doc(db, 'settings', 'admins'), { list: Array.isArray(admins)?admins:[], updatedAt: serverTimestamp() }, { merge: true });
    if (masjid) await setDoc(doc(db, 'settings', 'masjid'), { ...masjid, updatedAt: serverTimestamp() }, { merge: true });
    if (idcard) await setDoc(doc(db, 'settings', 'idcard'), { ...idcard, updatedAt: serverTimestamp() }, { merge: true });
    if (idset) await setDoc(doc(db, 'settings', 'idset'), { ...idset, updatedAt: serverTimestamp() }, { merge: true });
    if (Array.isArray(audit)) await setDoc(doc(db, 'settings', 'audit'), { list: audit.slice(-1000), updatedAt: serverTimestamp() }, { merge: true });

    localStorage.setItem('memc_fb_migrated', '1');
    alert('Migrate ho chuka hai. Ab data Firestore par save hoga.');
    location.reload();
  } catch(e){
    console.error(e);
    alert('Migrate fail hua. Console check karo.');
  }
};

window.fbSaveFamily = async (fam) => {
  const user = window.FIREBASE.user;
  if (!user) throw new Error('not-auth');
  if (!db) throw new Error('firebase-not-ready');
  await setDoc(doc(db, 'families', String(fam.id)), { ...fam, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
};
window.fbDeleteFamily = async (id) => {
  const user = window.FIREBASE.user;
  if (!user) throw new Error('not-auth');
  if (!db) throw new Error('firebase-not-ready');
  await setDoc(doc(db, 'families', String(id)), { deleted: true, deletedAt: serverTimestamp(), deletedBy: user.uid }, { merge: true });
};
