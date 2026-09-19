import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { replayBattle, scoreResult } from './battle-validation.js';
initializeApp();
const db = getFirestore(), settings = { region: 'asia-northeast3', maxInstances: 10 };
function uid(request) { if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.'); return request.auth.uid; }
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
const publicSession = value => ({ id: value.id, kind: value.kind, seed: value.seed, side: value.side });

export const startBattle = onCall(settings, async request => {
  const userId = uid(request), { postId, side, requestId } = request.data || {};
  if (!validId(postId) || !validId(requestId) || !['support', 'oppose'].includes(side)) throw new HttpsError('invalid-argument', '피드와 입장을 선택해 주세요.');
  const ref = db.doc(`battleSessions/${userId}`);
  return db.runTransaction(async tx => {
    const [existing, post] = await Promise.all([tx.get(ref), tx.get(db.doc(`posts/${postId}`))]);
    if (!post.exists) throw new HttpsError('not-found', '삭제된 피드입니다.');
    const old = existing.data();
    if (old?.id === requestId) {
      if (old.postId !== postId || old.side !== side || old.status !== 'playing') throw new HttpsError('failed-precondition', '이미 종료한 배틀입니다.');
      return publicSession(old);
    }
    // A new start replaces any abandoned game; only the current session can score.
    const value = { id: requestId, postId, side, kind: randomBytes(1)[0] < 128 ? 'flappy' : 'runner', seed: randomBytes(4).readUInt32LE(), startedAt: Timestamp.now(), status: 'playing' };
    tx.set(ref, value); return publicSession(value);
  });
});

export const finishBattle = onCall(settings, async request => {
  const userId = uid(request), { sessionId, inputs } = request.data || {};
  if (!validId(sessionId)) throw new HttpsError('invalid-argument', '잘못된 배틀입니다.');
  const ref = db.doc(`battleSessions/${userId}`);
  return db.runTransaction(async tx => {
    const row = await tx.get(ref), session = row.data();
    if (!session || session.id !== sessionId) throw new HttpsError('failed-precondition', '다른 배틀이 시작되었습니다. 다시 참여해 주세요.');
    if (session.status === 'finished') return session.result;
    const elapsed = Date.now() - session.startedAt.toMillis();
    if (elapsed > 30 * 60 * 1000) throw new HttpsError('deadline-exceeded', '배틀 유효 시간이 지났습니다.');
    let replay;
    try { replay = replayBattle(session.kind, session.seed, inputs, elapsed); }
    catch (error) { throw new HttpsError('invalid-argument', error.message); }
    const postRef = db.doc(`posts/${session.postId}`), post = await tx.get(postRef);
    if (!post.exists) throw new HttpsError('not-found', '삭제된 피드에는 점수를 반영할 수 없습니다.');
    const result = scoreResult(session.side, replay.score);
    tx.update(postRef, { [session.side]: (post.data()[session.side] || 0) + result.score });
    tx.update(ref, { status: 'finished', result, finishedAt: Timestamp.now() });
    return result;
  });
});
