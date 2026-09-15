// Application-facing interface. Replace this adapter when migrating to Supabase.
import { initializeApp } from 'firebase/app';
import publicConfig from './firebase-config.json';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || publicConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || publicConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || publicConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || publicConfig.appId,
};
export const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
const auth = app && getAuth(app), db = app && getFirestore(app);
const ready = () => { if (!configured) throw Error('로그인과 거래 등록을 준비 중입니다. 잠시 후 다시 방문해 주세요.'); };
const user = () => { ready(); if (!auth.currentUser) throw Error('로그인이 필요합니다.'); return auth.currentUser; };
const toUser = u => u ? { id: u.uid, username: u.displayName || '회원' } : null;
export const data = {
  watchAuth(callback) { if (!configured) { callback(null); return () => {}; } return onAuthStateChanged(auth, u => callback(toUser(u))); },
  async login(email, password) { ready(); return toUser((await signInWithEmailAndPassword(auth, email, password)).user); },
  async register(email, password, username) {
    ready(); const { user: u } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(u, { displayName: username.trim() });
    await setDoc(doc(db, 'profiles', u.uid), { username: username.trim(), bio: '', profileImage: '' });
    return toUser(u);
  },
  async resetPassword(email) { ready(); await sendPasswordResetEmail(auth, email); },
  async logout() { ready(); await signOut(auth); },
  async listPins() {
    if (!configured) return [];
    const snapshot = await getDocs(collection(db, 'pins'));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id, owner: d.data().ownerId === auth.currentUser?.uid }));
  },
  async savePin(value, id) {
    const u = user();
    const pin = Object.fromEntries(['title', 'description', 'coin', 'tradeCoins', 'link', 'image', 'category'].map(k => [k, value[k]]));
    Object.assign(pin, { lat: +value.lat, lng: +value.lng, ownerId: u.uid, creator: u.displayName || '회원' });
    if (id) {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'pins', id), existing = await tx.get(ref);
        if (!existing.exists() || existing.data().ownerId !== u.uid) throw Error('수정할 수 없는 거래입니다.');
        tx.set(ref, { ...pin, slot: existing.data().slot });
      });
    } else {
      id = await runTransaction(db, async tx => {
        const refs = [0, 1, 2].map(slot => doc(db, 'pins', `${u.uid}_${slot}`));
        const rows = await Promise.all(refs.map(ref => tx.get(ref)));
        const slot = rows.findIndex(row => !row.exists());
        if (slot < 0) throw Error('거래는 계정당 최대 3개까지 등록할 수 있습니다.');
        tx.set(refs[slot], { ...pin, slot: String(slot) }); return refs[slot].id;
      });
    }
    return { ...pin, id, owner: true };
  },
  async deletePin(id) { user(); await deleteDoc(doc(db, 'pins', id)); },
  async profile(id) {
    if (!configured || !id) return null;
    const row = await getDoc(doc(db, 'profiles', id));
    return { id, username: auth.currentUser?.uid === id ? auth.currentUser.displayName || '회원' : '회원', bio: '', profileImage: '', ...row.data() };
  },
  async saveProfile(value) {
    const u = user(); await setDoc(doc(db, 'profiles', u.uid), { username: u.displayName || '회원', bio: value.bio, profileImage: value.profileImage });
  },
};
