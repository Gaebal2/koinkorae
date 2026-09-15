import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
let env;
const pin = { ownerId: 'alice', slot: '0', creator: 'Alice', title: 'BTC 거래', description: '공개 장소에서 만나요', coin: 'BTC', tradeCoins: ['BTC'], link: '', image: '', category: '판매', lat: 37.5, lng: 127 };
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-koinkorae', firestore: { rules: await readFile('firestore.rules', 'utf8') } }); });
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
