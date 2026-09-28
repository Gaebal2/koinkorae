import { text, id, photo, coin, side, enabled, pin } from './validation.js';
import { replayBattle, scoreResult } from '../_shared/battle-validation.js';

export const publicActions = new Set(['listPins','getPin','profile','posts','authorPosts','postsById','following','relationships','reposts','commentCount','comments']);
const present = row => row ? { ...row.body, id: row.id } : null;
const newest = (a,b) => (b.createdAt || 0) - (a.createdAt || 0);

// db exposes only server-side queries. Identity comes from verified Firebase tokens.
export async function dispatch(db, identity, action, args = {}) {
  if (!publicActions.has(action) && !identity) throw Object.assign(Error('로그인이 필요합니다.'), { status: 401 });
  const uid = identity?.uid;
  const storedProfile = uid ? present(await db.one('profiles',uid,'')) : null;
  const name = (storedProfile?.username || identity?.name || '회원').slice(0,24);
  const get = async (kind, key, parent = '') => present(await db.one(kind, id(key), parent));
  const list = async (kind, filter = {}) => (await db.list(kind, filter)).map(present);
  const mutate = (op, key = '', value = {}) => db.mutate(op, uid, key, value);
  const put = (kind, key, body, parent = '', ignore = false) => db.put({ kind, id:key, parent, owner:uid, body }, ignore);
  switch (action) {
    case 'listPins': return (await list('pins')).map(p => ({ ...p, owner:p.ownerId===uid }));
    case 'getPin': { const p=await get('pins',args.id); return p && { ...p, owner:p.ownerId===uid }; }
    case 'profile': return await get('profiles',args.id) || { id:id(args.id), username:'회원', bio:'', profileImage:'' };
    case 'posts': return (await list('posts', { recent:true, limit:300 })).sort(newest);
    case 'authorPosts': return (await list('posts',{owner:id(args.uid)})).sort(newest);
    case 'postsById': {
      if (!Array.isArray(args.ids) || args.ids.length>300) throw Error('조회할 피드를 확인해 주세요.');
      return (await Promise.all(args.ids.map(key=>get('posts',key)))).filter(Boolean);
    }
    case 'following': return (await list('following',{parent:id(args.uid)})).map(row=>row.id);
    case 'relationships': return (await db.list('following')).map(row=>({from:row.parent,to:row.id}));
    case 'reposts': return (await db.list('reposts')).map(row=>({...present(row),userId:row.id,postId:row.parent}));
    case 'commentCount': return await get('posts',args.postId) ? db.count('comments',id(args.postId)) : 0;
    case 'comments': return await get('posts',args.postId) ? (await list('comments',{parent:id(args.postId),oldest:true})).sort((a,b)=>a.createdAt-b.createdAt) : [];
    case 'balance': {
      if (args.uid !== uid) throw Object.assign(Error('본인 BP만 조회할 수 있습니다.'),{status:403});
      return await get('balances',uid) || {current:0,lifetime:0,day:-1};
    }
    case 'ensureProfile': {
      await put('profiles',uid,{username:name,bio:'',profileImage:''},'',true); return null;
    }
    case 'saveProfile': await put('profiles',uid,{username:args.value?.username === undefined ? name : text(args.value.username,24,true),bio:text(args.value?.bio,200),profileImage:photo(args.value?.profileImage)}); return null;
    case 'savePin': return mutate('savePin',args.id ? id(args.id) : '',{...pin(args.value || {}),creator:name});
    case 'deletePin': await db.remove('pins',id(args.id),'',uid); return null;
    case 'checkin': return mutate('checkin');
    case 'publish': {
      const value=args.value || {};
      if (value.pinId && !await get('pins',value.pinId)) throw Error('삭제된 거래입니다.');
      await put('posts',crypto.randomUUID(),{authorId:uid,author:name,content:text(value.content,200,true),coin:coin(value.coin),image:photo(value.image),...(value.pinId?{pinId:id(value.pinId)}:{}),createdAt:Date.now(),support:0,oppose:0}); return null;
    }
    case 'deletePost': return mutate('deletePost',id(args.id));
    case 'follow': {
      const target=id(args.id), on=enabled(args.enabled); if(target===uid) return null;
      if(on) await put('following',target,{createdAt:Date.now()},uid,true);
      else await db.remove('following',target,uid,uid);
      return null;
    }
    case 'repost': return mutate('repost','',{postId:id(args.postId),enabled:enabled(args.enabled)});
    case 'comment': {
      const parent = args.replyToId ? await get('comments',args.replyToId,id(args.postId)) : null;
      if (args.replyToId && !parent) throw Error('원댓글을 찾을 수 없습니다.');
      return mutate('comment',crypto.randomUUID(),{postId:id(args.postId),author:name,content:text(args.content,1000,true),side:side(args.side),...(parent ? {replyTo:{id:parent.id,author:parent.author,content:parent.content.slice(0,120)}} : {})});
    }
    case 'deleteComment': {
      const comment=await get('comments',args.id,id(args.postId));
      if (!comment || comment.authorId !== uid) throw Object.assign(Error('본인 댓글만 삭제할 수 있습니다.'),{status:403});
      await db.remove('comments',id(args.id),id(args.postId),uid); return null;
    }
    case 'ownComments': {
      const rows=await db.list('comments',{owner:uid});
      const ids=[...new Set(rows.map(row=>row.parent))];
      const posts=new Map(await Promise.all(ids.map(async key=>[key,await get('posts',key)])));
      return rows.map(row=>({...present(row),post:posts.get(row.parent)})).filter(row=>row.post).sort(newest);
    }
    case 'startBattle': {
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      const session=await mutate('startBattle',id(args.requestId),{postId:id(args.postId),side:side(args.side),kind:seed<2147483648?'flappy':'runner',seed});
      return {id:session.id,kind:session.kind,seed:session.seed,side:session.side};
    }
    case 'finishBattle': {
      const session=(await db.one('battleSessions',uid,''))?.body;
      if (!session || session.id!==id(args.sessionId)) throw Error('다른 배틀이 시작되었습니다. 다시 참여해 주세요.');
      if (session.status==='finished') return session.result;
      const elapsed=Date.now()-session.startedAt;
      if(elapsed>1800000) throw Error('배틀 유효 시간이 지났습니다.');
      const result=replayBattle(session.kind,session.seed,args.inputs,elapsed);
      return mutate('finishBattle',session.id,{...scoreResult(session.side,result.score),sessionSeed:session.seed,sessionStartedAt:session.startedAt,postId:session.postId});
    }
    default: throw Error('지원하지 않는 작업입니다.');
  }
}
