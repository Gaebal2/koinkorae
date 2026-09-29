import React,{useEffect,useRef,useState} from 'react';
import {MessageCircle,Send,ArrowLeft} from 'lucide-react';
import {data} from './data.js';
import {Empty,PageTitle,profileImage} from './ui.jsx';
import {useLiveProfile} from './live-profile.js';
import {useBackDismiss} from './use-back-dismiss.js';

function Conversation({friend,me,onClose}) {
  const profile=useLiveProfile(friend.id), [items,setItems]=useState([]), [older,setOlder]=useState([]), [content,setContent]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false), [loading,setLoading]=useState(true), [more,setMore]=useState(false);
  const end=useRef(null),scroll=useRef(null),nearBottom=useRef(true),first=useRef(true),request=useRef(null),lock=useRef(false),pending=useRef(null);
  useEffect(()=>data.watchMessages(friend.id,rows=>{setItems(previous=>[...new Map([...previous,...rows].map(row=>[row.id,row])).values()]);setLoading(false);setError('');if(first.current)setMore(rows.length===100);},e=>{setError(e.message);setLoading(false);}),[friend.id]);
  const rows=[...new Map([...older,...items].map(row=>[row.id,row])).values()].sort((a,b)=>a.createdAt-b.createdAt);
  const last=rows.at(-1)?.id;
  useEffect(()=>{
    if (!last) return;
    if(first.current || nearBottom.current || rows.some(row=>row.id===pending.current)) {end.current?.scrollIntoView({behavior:first.current?'instant':'smooth',block:'nearest'});pending.current=null;}
    first.current=false;
  },[last]);
  const send=async e=>{
    e.preventDefault();if(lock.current||!content.trim())return;lock.current=true;setBusy(true);setError('');
    if(!request.current || request.current.content!==content.trim())request.current={id:crypto.randomUUID(),content:content.trim()};
    try {pending.current=request.current.id;await data.sendMessage(friend.id,request.current.content,request.current.id);setContent('');request.current=null;nearBottom.current=true;}
    catch(e){setError(e.message);}finally{setBusy(false);lock.current=false;}
  };
  const loadOlder=async()=>{
    if(busy||!rows.length)return;setBusy(true);const beforeHeight=scroll.current.scrollHeight, beforeTop=scroll.current.scrollTop;
    try{const previous=await data.olderMessages(friend.id,rows[0].createdAt);setOlder(all=>[...previous,...all]);setMore(previous.length===100);requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=beforeTop+scroll.current.scrollHeight-beforeHeight;});}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <main className="friend-conversation"><header className="friend-chat-head"><button onClick={onClose} aria-label="친구 목록으로"><ArrowLeft/></button><img src={(profile ? profile.profileImage : friend.profileImage) || profileImage()} alt=""/><b>{profile?.username || friend.username}</b></header>
    <div className="chat-messages direct-messages" ref={scroll} onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} aria-label="친구와의 대화">
      {more&&<button className="text-action" disabled={busy} onClick={loadOlder}>이전 메시지 보기</button>}
      {loading ? <p role="status">대화를 불러오는 중…</p> : !rows.length && <Empty text="친구에게 첫 메시지를 보내보세요."/>}
      {rows.map(row=><article key={row.id} className={'chat-message direct-message '+(row.senderId===me.id?'mine':'theirs')}><div className="chat-message-head"><b>{row.senderId===me.id?'나':profile?.username||friend.username}</b></div><div className="chat-bubble"><p>{row.content}</p></div><small>{new Date(row.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></article>)}<div ref={end}/>
    </div>{error&&<p role="alert" className="error">{error}</p>}
    <form className="chat-composer direct-composer" onSubmit={send}><div className="chat-input-row"><textarea aria-label="메시지" maxLength={1000} disabled={busy} value={content} onChange={e=>setContent(e.target.value)} placeholder="메시지를 입력하세요"/><button className="primary" disabled={busy||!content.trim()} aria-label="메시지 보내기"><Send/></button></div></form>
  </main>;
}
function SignedInChat({me}) {
  const [friends,setFriends]=useState(null),[selected,setSelected]=useState(null),[error,setError]=useState('');
  useEffect(()=>data.watchFriends(setFriends,e=>setError(e.message)),[me.id]);
  useEffect(()=>{if(selected&&friends&&!friends.some(friend=>friend.id===selected.id))setSelected(null);},[friends,selected]);
  useBackDismiss(!!selected,()=>setSelected(null),40);
  if(selected)return <Conversation key={selected.id} friend={selected} me={me} onClose={()=>setSelected(null)}/>;
  return <main><PageTitle icon={MessageCircle} title="맞팔 친구와 채팅" sub="친구와 이야기를 나누세요"/>{error&&<p className="error" role="alert">{error}</p>}{friends===null?<p role="status">친구를 불러오는 중…</p>:!friends.length?<Empty text="등록 된 친구가 없습니다."/>:<div className="chat-friends">{friends.map(friend=><button key={friend.id} onClick={()=>setSelected(friend)}><img src={friend.profileImage||profileImage()} alt=""/><span><b>{friend.username}</b><small>{friend.bio}</small></span><MessageCircle/></button>)}</div>}</main>;
}
export function FriendChat({me,login}) {
  if(!me)return <main><PageTitle icon={MessageCircle} title="맞팔 친구와 채팅"/><p>로그인하고 친구와 채팅하세요.</p><button className="primary" onClick={login}>로그인</button></main>;
  return <SignedInChat key={me.id} me={me}/>;
}
