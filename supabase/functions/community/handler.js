import { chooseGame } from '../_shared/battle-engine.js';
import { text, id, photo, coin, side, enabled, pin } from './validation.js';
import { replayBattle, scoreResult } from '../_shared/battle-validation.js';
import { newBattleProgress, advanceBattle, continueBattleProgress } from '../_shared/battle-progress.js';

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
  const profiles=new Map();
  const currentAuthor=async (row,isPin=false)=>{
    if(!row)return row;
    const authorId=isPin?row.ownerId:row.authorId;
    if(!authorId)return row;
    if(!profiles.has(authorId))profiles.set(authorId,get('profiles',authorId));
    const profile=await profiles.get(authorId);
    return profile ? {...row,...(isPin?{creator:profile.username}:{author:profile.username})} : row;
  };
  const friendship = async friendId => {
    const target=id(friendId);
    if (target===uid || !await db.one('following',target,uid) || !await db.one('following',uid,target)) throw Object.assign(Error('서로 팔로우한 친구와만 채팅할 수 있습니다.'),{status:403});
    return {target,parent:JSON.stringify([uid,target].sort())};
  };
  switch (action) {
    case 'friends': {
      const following=await db.list('following',{parent:uid});
      const friends=await Promise.all(following.map(async row => await db.one('following',uid,row.id) ? (await get('profiles',row.id) || {id:row.id,username:'회원',profileImage:''}) : null));
      return friends.filter(Boolean).sort((a,b)=>a.username.localeCompare(b.username));
    }
    case 'messages': {
      const {parent}=await friendship(args.friendId);
      if (args.before !== undefined && (!Number.isSafeInteger(args.before) || args.before<0)) throw Error('잘못된 메시지 위치입니다.');
      return (await list('messages',{parent,recent:true,limit:100,before:args.before})).sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
    }
    case 'sendMessage': {
      const {target,parent}=await friendship(args.friendId);
      return mutate('sendMessage',id(args.requestId),{friendId:target,parent,content:text(args.content,1000,true)});
    }
    case 'listPins': return Promise.all((await list('pins')).map(async p => ({ ...await currentAuthor(p,true), owner:p.ownerId===uid })));
    case 'getPin': { const p=await currentAuthor(await get('pins',args.id),true); return p && { ...p, owner:p.ownerId===uid }; }
    case 'profile': return await get('profiles',args.id) || { id:id(args.id), username:'회원', bio:'', profileImage:'' };
    case 'posts': return Promise.all((await list('posts', { recent:true, limit:300 })).sort(newest).map(p=>currentAuthor(p)));
    case 'authorPosts': return Promise.all((await list('posts',{owner:id(args.uid)})).sort(newest).map(p=>currentAuthor(p)));
    case 'postsById': {
      if (!Array.isArray(args.ids) || args.ids.length>300) throw Error('조회할 피드를 확인해 주세요.');
      return (await Promise.all(args.ids.map(async key=>currentAuthor(await get('posts',key))))).filter(Boolean);
    }
    case 'following': return (await list('following',{parent:id(args.uid)})).map(row=>row.id);
    case 'relationships': return (await db.list('following')).map(row=>({from:row.parent,to:row.id}));
    case 'reposts': return (await db.list('reposts')).map(row=>({...present(row),userId:row.id,postId:row.parent}));
    case 'commentCount': return await get('posts',args.postId) ? db.count('comments',id(args.postId)) : 0;
    case 'comments': return await get('posts',args.postId) ? Promise.all((await list('comments',{parent:id(args.postId),oldest:true})).sort((a,b)=>a.createdAt-b.createdAt).map(c=>currentAuthor(c))) : [];
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
      const commentId=crypto.randomUUID();
      await mutate('comment',commentId,{postId:id(args.postId),author:name,content:text(args.content,1000,true),side:side(args.side),...(parent ? {replyTo:{id:parent.id,author:parent.author,content:parent.content.slice(0,120),side:parent.side || null,authorId:parent.authorId}} : {})});
      return {id:commentId};
    }
    case 'deleteComment': {
      const comment=await get('comments',args.id,id(args.postId));
      if (!comment || comment.authorId !== uid) throw Object.assign(Error('본인 댓글만 삭제할 수 있습니다.'),{status:403});
      await db.remove('comments',id(args.id),id(args.postId),uid); return null;
    }
    case 'ownComments': {
      const rows=await db.list('comments',{owner:uid});
      const ids=[...new Set(rows.map(row=>row.parent))];
      const posts=new Map(await Promise.all(ids.map(async key=>[key,await currentAuthor(await get('posts',key))])));
      return rows.map(row=>({...present(row),post:posts.get(row.parent)})).filter(row=>row.post).sort(newest);
    }
    case 'startBattle': {
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      const kind=args.protocol===2 && args.gameVersion===2 ? chooseGame(seed/4294967296) : seed<2147483648?'flappy':'runner';
      const session=await mutate('startBattle',id(args.requestId),{postId:id(args.postId),side:side(args.side),kind,seed,...(args.protocol===2 ? {protocol:2,progress:newBattleProgress(kind,seed)} : {})});
      return {id:session.id,kind:session.kind,seed:session.seed,side:session.side,...(session.progress ? {progress:session.progress} : {})};
    }
    case 'checkpointBattle':
    case 'continueBattle': {
      const session=(await db.one('battleSessions',uid,''))?.body;
      if(!session || session.id!==id(args.sessionId) || session.protocol!==2 || session.status!=='playing')throw Error('진행 중인 배틀이 아닙니다.');
      const op=action==='checkpointBattle'?'checkpoint':'continue';
      if(!Number.isSafeInteger(args.revision)||args.revision<0)throw Error('잘못된 게임 순서입니다.');
      if(session.progress.revision===args.revision+1 && session.progress.lastOp===op)return session.progress;
      if(session.progress.revision!==args.revision)throw Error('게임 기록 순서가 일치하지 않습니다.');
      const next=op==='checkpoint'?advanceBattle(session.progress,args.inputs,args.ticks,Date.now()-session.startedAt):continueBattleProgress(session.progress);
      return mutate('battleProgress',session.id,{expectedRevision:args.revision,next,op});
    }
    case 'applyBattle': return mutate('applyBattle',id(args.sessionId));
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
