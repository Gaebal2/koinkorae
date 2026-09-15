// Application-facing interface. Replace this adapter when migrating to Supabase.
import { initializeApp } from 'firebase/app';
import publicConfig from './firebase-config.json';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, runTransaction, serverTimestamp, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || publicConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || publicConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || publicConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || publicConfig.appId,
};
export const googleEnabled = import.meta.env.VITE_GOOGLE_SIGNIN_ENABLED !== 'false';
export const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
const auth = app && getAuth(app), db = app && getFirestore(app);
const ready = () => { if (!configured) throw Error('로그인과 거래 등록을 준비 중입니다. 잠시 후 다시 방문해 주세요.'); };
const user = () => { ready(); if (!auth.currentUser) throw Error('로그인이 필요합니다.'); return auth.currentUser; };
const displayName = u => (u.displayName || '회원').slice(0, 24);
const toUser = u => u ? { id: u.uid, username: displayName(u) } : null;
export const dayNumber = (time = Date.now()) => Math.floor((time + 9 * 3600000) / 86400000);
const normalize = row => ({ ...row.data(), id: row.id, createdAt: row.data().createdAt?.toMillis?.() || 0 });
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
  async loginGoogle() {
    ready();
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    // Invoke immediately from the click, before any asynchronous work, to avoid popup blocking.
    const { user: u } = await signInWithPopup(auth, provider);
    const ref = doc(db, 'profiles', u.uid);
    await runTransaction(db, async tx => {
      const current = await tx.get(ref);
      if (!current.exists()) tx.set(ref, { username: displayName(u), bio: '', profileImage: '' });
    });
    return toUser(u);
  },
  async logout() { ready(); await signOut(auth); },
  async listPins() {
    if (!configured) return [];
    const snapshot = await getDocs(collection(db, 'pins'));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id, owner: d.data().ownerId === auth.currentUser?.uid }));
  },
  async savePin(value, id) {
    const u = user();
    const pin = Object.fromEntries(['title', 'description', 'coin', 'tradeCoins', 'link', 'image', 'category'].map(k => [k, value[k]]));
    Object.assign(pin, { lat: +value.lat, lng: +value.lng, ownerId: u.uid, creator: displayName(u) });
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
    const u = user(); await setDoc(doc(db, 'profiles', u.uid), { username: displayName(u), bio: value.bio, profileImage: value.profileImage });
  },
  watchBalance(uid, callback, error) {
    if (!configured || !uid) { callback({ current: 0, lifetime: 0, day: -1 }); return () => {}; }
    return onSnapshot(doc(db, 'balances', uid), row => callback(row.data() || { current: 0, lifetime: 0, day: -1 }), error);
  },
  async checkin() {
    const u = user(), ref = doc(db, 'balances', u.uid), day = dayNumber();
    await runTransaction(db, async tx => {
      const row = await tx.get(ref), old = row.data() || { current: 0, lifetime: 0, day: -1 };
      if (old.day === day) return;
      tx.set(ref, { current: old.current + 10, lifetime: old.lifetime + 10, day, updatedAt: serverTimestamp() });
    });
  },
  watchPosts(callback, error) {
    if (!configured) { callback([]); return () => {}; }
    return onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(300)), rows => callback(rows.docs.map(normalize)), error);
  },
  async publish(value) {
    const u = user();
    await setDoc(doc(collection(db, 'posts')), { authorId: u.uid, author: displayName(u), content: value.content.trim(), coin: value.coin, image: value.image || '', createdAt: serverTimestamp(), support: 0, oppose: 0 });
  },
  async deletePost(id) { user(); await deleteDoc(doc(db, 'posts', id)); },
  watchFollowing(uid, callback, error) {
    if (!configured || !uid) { callback([]); return () => {}; }
    return onSnapshot(collection(db, 'profiles', uid, 'following'), rows => callback(rows.docs.map(row => row.id)), error);
  },
  async follow(id, enabled) {
    const u = user(), ref = doc(db, 'profiles', u.uid, 'following', id);
    if (id === u.uid) return;
    if (enabled) await setDoc(ref, { createdAt: serverTimestamp() }); else await deleteDoc(ref);
  },
  watchComments(postId, callback, error) {
    return onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt'), limit(100)), rows => callback(rows.docs.map(normalize)), error);
  },
  async comment(postId, content) {
    const u = user(); await setDoc(doc(collection(db, 'posts', postId, 'comments')), { authorId: u.uid, author: displayName(u), content: content.trim(), createdAt: serverTimestamp() });
  },
};
