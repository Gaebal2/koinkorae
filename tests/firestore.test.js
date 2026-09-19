import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collectionGroup, query, where, deleteDoc, serverTimestamp } from 'firebase/firestore';
let env;
const pin = { ownerId: 'alice', slot: '0', creator: 'Alice', title: 'BTC 거래', description: '공개 장소에서 만나요', coin: 'BTC', tradeCoins: ['BTC'], link: '', image: '', category: '판매', lat: 37.5, lng: 127 };
before(async () => { env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT || 'demo-koinkorae', firestore: { rules: await readFile('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });
test('public reads; signed-out writes denied', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'pins', 'alice_0')));
  await assertFails(setDoc(doc(db, 'pins', 'alice_0'), pin));
});
test('three fixed slots; fourth or alternative document id denied', async () => {
  const db = env.authenticatedContext('alice').firestore();
  for (const slot of ['0', '1', '2']) await assertSucceeds(setDoc(doc(db, 'pins', `alice_${slot}`), { ...pin, slot }));
  await assertFails(setDoc(doc(db, 'pins', 'alice_3'), { ...pin, slot: '3' }));
  await assertFails(setDoc(doc(db, 'pins', 'extra'), pin));
});
test('only owner can edit/delete; owner can reuse a deleted slot', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore();
  await setDoc(doc(alice, 'pins', 'alice_0'), pin);
  await assertFails(setDoc(doc(bob, 'pins', 'alice_0'), { ...pin, title: 'hijacked' }));
  await assertFails(deleteDoc(doc(bob, 'pins', 'alice_0')));
  await assertSucceeds(setDoc(doc(alice, 'pins', 'alice_0'), { ...pin, title: '수정' }));
  await assertSucceeds(deleteDoc(doc(alice, 'pins', 'alice_0')));
  await assertSucceeds(setDoc(doc(alice, 'pins', 'alice_0'), pin));
});
test('unsafe URLs, invalid coordinates and oversized photos denied', async () => {
  const ref = doc(env.authenticatedContext('alice').firestore(), 'pins', 'alice_0');
  for (const patch of [{ link: 'javascript:alert(1)' }, { lat: 91 }, { lng: -181 }, { image: 'x'.repeat(300001) }, { ownerId: 'bob' }]) await assertFails(setDoc(ref, { ...pin, ...patch }));
});
test('public profiles exclude emails and cannot be edited by others', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore();
  const profile = { username: 'Alice', bio: '', profileImage: '' };
  await assertSucceeds(setDoc(doc(alice, 'profiles', 'alice'), profile));
  await assertFails(setDoc(doc(bob, 'profiles', 'alice'), profile));
  await assertFails(setDoc(doc(alice, 'profiles', 'alice'), { ...profile, email: 'private@example.com' }));
});
test('check-in grants 10 BP once per server-validated Korean calendar day', async () => {
  const db = env.authenticatedContext('alice').firestore(), ref = doc(db, 'balances', 'alice');
  const day = Math.floor((Date.now() + 32400000) / 86400000);
  const value = { current: 10, lifetime: 10, day, updatedAt: serverTimestamp() };
  await assertFails(setDoc(ref, { ...value, current: 1000 }));
  await assertFails(setDoc(ref, { ...value, day: day + 1 }));
  await assertFails(setDoc(ref, { ...value, day: day - 1 }));
  await assertSucceeds(setDoc(ref, value));
  await assertFails(setDoc(ref, { ...value, current: 20, lifetime: 20 }));
  await assertFails(deleteDoc(ref));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'balances', 'alice')));
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'balances', 'alice'), { ...value, day: day - 1 }));
  await assertSucceeds(setDoc(ref, { ...value, current: 20, lifetime: 20 }));
});
test('posts cannot forge owners, timestamps or battle scores; comments require a live post', async () => {
  const db = env.authenticatedContext('alice').firestore(), ref = doc(db, 'posts', 'post-a');
  const post = { authorId: 'alice', author: 'Alice', coin: 'BTC', content: 'Hello', image: '', createdAt: serverTimestamp(), support: 0, oppose: 0 };
  await assertFails(setDoc(ref, { ...post, support: 100 }));
  await assertFails(setDoc(ref, { ...post, authorId: 'bob' }));
  await assertFails(setDoc(ref, { ...post, createdAt: 0 }));
  await assertSucceeds(setDoc(ref, post));
  await assertFails(setDoc(ref, { ...post, support: 100 }));
  await assertFails(deleteDoc(doc(env.authenticatedContext('bob').firestore(), 'posts', 'post-a')));
  const comment = { authorId: 'alice', author: 'Alice', content: 'Reply', side: 'support', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'posts', 'post-a', 'comments', 'reply'), comment));
  await assertFails(setDoc(doc(db, 'posts', 'missing', 'comments', 'reply'), comment));
  await assertSucceeds(deleteDoc(ref));
});
test('comments require an explicit valid side; clients cannot write battle sessions', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await setDoc(doc(db, 'posts', 'p'), {authorId:'alice',author:'Alice',coin:'PI',content:'Test',image:'',createdAt:serverTimestamp(),support:0,oppose:0});
  const base = {authorId:'alice',author:'Alice',content:'Reply',createdAt:serverTimestamp()};
  for (const side of ['support','oppose']) await assertSucceeds(setDoc(doc(db,'posts','p','comments',side), {...base,side}));
  await assertFails(setDoc(doc(db,'posts','p','comments','missing'), base));
  await assertFails(setDoc(doc(db,'posts','p','comments','invalid'), {...base,side:'anything'}));
  await assertFails(setDoc(doc(db,'battleSessions','alice'), {score:600,status:'finished'}));
});

test('posts can attach existing pins but reject missing or malformed pin references', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await setDoc(doc(db, 'pins', 'alice_0'), pin);
  const post = { authorId: 'alice', author: 'Alice', coin: 'BTC', content: 'Attached pin', image: '', createdAt: serverTimestamp(), support: 0, oppose: 0 };
  await assertSucceeds(setDoc(doc(db, 'posts', 'attached'), { ...post, pinId: 'alice_0' }));
  for (const pinId of ['missing', '', '../alice_0', 123, null]) {
    await assertFails(setDoc(doc(db, 'posts', 'invalid'), { ...post, pinId }));
  }
});
test('feed body and pin description accept 200 characters and reject 201 on create and edit', async () => {
  const db = env.authenticatedContext('alice').firestore();
  const post = { authorId: 'alice', author: 'Alice', coin: 'BTC', content: '가'.repeat(200), image: '', createdAt: serverTimestamp(), support: 0, oppose: 0 };
  await assertSucceeds(setDoc(doc(db, 'posts', 'limit-ok'), post));
  await assertFails(setDoc(doc(db, 'posts', 'limit-bad'), { ...post, content: '가'.repeat(201) }));
  await assertFails(setDoc(doc(db, 'pins', 'alice_0'), { ...pin, description: '가'.repeat(201) }));
  await assertSucceeds(setDoc(doc(db, 'pins', 'alice_0'), { ...pin, description: '가'.repeat(200) }));
  await assertFails(setDoc(doc(db, 'pins', 'alice_0'), { ...pin, description: '가'.repeat(201) }));
});
test('following lists can only be changed by their owner', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(setDoc(doc(alice, 'profiles', 'alice', 'following', 'bob'), { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob, 'profiles', 'alice', 'following', 'charlie'), { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(alice, 'profiles', 'alice', 'following', 'alice'), { createdAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(alice, 'profiles', 'alice', 'following', 'bob')));
});

test('public relationship queries include existing follow records without migrating them', async () => {
  const alice = env.authenticatedContext('alice').firestore(), visitor = env.unauthenticatedContext().firestore();
  await setDoc(doc(alice, 'profiles', 'alice', 'following', 'bob'), { createdAt: serverTimestamp() });
  await assertSucceeds(getDocs(collectionGroup(visitor, 'following')));
  await assertFails(setDoc(doc(visitor, 'profiles', 'alice', 'following', 'charlie'), { createdAt: serverTimestamp() }));
});

test('profile comment history query is restricted to the signed-in author', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore();
  await setDoc(doc(alice,'posts','p'), { authorId:'alice',author:'Alice',coin:'PI',content:'Test',image:'',createdAt:serverTimestamp(),support:0,oppose:0 });
  await setDoc(doc(alice,'posts','p','comments','c'), { authorId:'alice',author:'Alice',content:'Reply',side:'support',createdAt:serverTimestamp() });
  await assertSucceeds(getDocs(query(collectionGroup(alice,'comments'),where('authorId','==','alice'))));
  await assertFails(getDocs(query(collectionGroup(bob,'comments'),where('authorId','==','alice'))));
});

test('reposts are unique per account and post, owner removable, and cannot forge scores', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore(), visitor = env.unauthenticatedContext().firestore();
  await setDoc(doc(alice, 'posts', 'post-a'), { authorId:'alice', author:'Alice', coin:'BTC', content:'Hello', image:'', createdAt:serverTimestamp(), support:0, oppose:0 });
  const path = ['posts','post-a','reposts','bob'];
  await assertSucceeds(setDoc(doc(bob, ...path), { createdAt:serverTimestamp() }));
  await assertFails(setDoc(doc(bob, ...path), { createdAt:serverTimestamp() }));
  await assertSucceeds(getDocs(collectionGroup(visitor, 'reposts')));
  await assertFails(deleteDoc(doc(alice, ...path)));
  await assertFails(setDoc(doc(visitor, 'posts','post-a','reposts','guest'), { createdAt:serverTimestamp() }));
  await assertFails(setDoc(doc(bob, 'posts','missing','reposts','bob'), { createdAt:serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(bob, ...path)));
  await assertFails(setDoc(doc(bob, ...path), { createdAt:serverTimestamp(), support:100 }));
  await assertSucceeds(setDoc(doc(bob, ...path), { createdAt:serverTimestamp() }));
  await deleteDoc(doc(alice,'posts','post-a'));
  await assertSucceeds(deleteDoc(doc(bob,...path)));
});
