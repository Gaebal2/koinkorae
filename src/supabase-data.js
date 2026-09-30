import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import publicConfig from './firebase-config.json';
import { createCommunityClient } from './supabase-client.js';
import { createQueryStorage } from './query-storage.js';
import { connectChanges, changedActions } from './change-stream.js';

const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY || publicConfig.apiKey,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || publicConfig.authDomain,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID || publicConfig.projectId,
  appId:import.meta.env.VITE_FIREBASE_APP_ID || publicConfig.appId,
};
export const googleEnabled=import.meta.env.VITE_GOOGLE_SIGNIN_ENABLED!=='false';
export const configured=Object.values(config).every(Boolean);
const auth=configured ? getAuth(getApps().length ? getApp() : initializeApp(config)) : null;
const toUser=u=>u?{id:u.uid,username:(u.displayName || '회원').slice(0,24)}:null;
const ready=()=>{if(!auth) throw Error('로그인 설정을 확인해 주세요.');};
const connection={url:import.meta.env.VITE_SUPABASE_URL || 'https://cxvznpfcmorysnwwmbna.supabase.co',key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  token:async force=>{ await auth?.authStateReady(); return await auth?.currentUser?.getIdToken(force) || null; }};
const client=createCommunityClient({
  ...connection,storage:createQueryStorage(),batch:true,
  subscribe:notify=>connectChanges({...connection,onChange:event=>{if(changedActions[event.kind])notify(changedActions[event.kind]);},onReady:()=>notify(null)}),
});
export const dayNumber=(time=Date.now())=>Math.floor((time+9*3600000)/86400000);
const call=client.call, watch=client.watch;
export const data={
  watchAuth(callback) { if(!auth){callback(null);return()=>{};} return onAuthStateChanged(auth,u=>{client.setScope(u?.uid||'guest');callback(toUser(u));}); },
  page:(options,cursor=null,force=false)=>call('page',{options,cursor,limit:20},force),
  savedPage:options=>client.saved('page',{options,cursor:null,limit:20}),
  watchPinPage:(owner,callback,error)=>watch('page',{options:{mode:'pins',owner,detail:true},cursor:null,limit:20},page=>callback(page.items),error),
  observeChanges:client.observe,
  profiles:async ids=>{const rows=[];for(let i=0;i<ids.length;i+=100)rows.push(...await call('profiles',{ids:ids.slice(i,i+100)}));return rows;},
  watchPins:(callback,error)=>watch('listPins',{},callback,error),
  async login(email,password) { ready();const {user}=await signInWithEmailAndPassword(auth,email,password);await call('ensureProfile');return toUser(user); },
  async register(email,password,username) { ready();const {user}=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(user,{displayName:username.trim()});await user.getIdToken(true);await call('ensureProfile');return toUser(user); },
  async loginGoogle() { ready();const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});const {user}=await signInWithPopup(auth,provider);await call('ensureProfile');return toUser(user); },
  async resetPassword(email) { ready();await sendPasswordResetEmail(auth,email); },
  async logout() { ready();await signOut(auth); },
  listPins:()=>call('listPins'),
  getPin:id=>call('getPin',{id}),
  watchPin:(id,callback,error)=>watch('getPin',{id},callback,error),
  savePin:(value,id)=>call('savePin',{value,id}),
  deletePin:id=>call('deletePin',{id}),
  profile:id=>id?call('profile',{id}):Promise.resolve(null),
  watchProfile:(id,callback,error)=>watch('profile',{id},callback,error),
  saveProfile:value=>call('saveProfile',{value}),
  watchBalance(uid,callback,error) { if(!uid){callback({current:0,lifetime:0,day:-1});return()=>{};}return watch('balance',{uid},callback,error); },
  checkin:()=>call('checkin'),
  watchPosts:(callback,error)=>watch('posts',{},callback,error),
  watchAuthorPosts:(uid,callback,error)=>watch('authorPosts',{uid},callback,error),
  postsById:async ids=>{
    const rows=[];for(let i=0;i<ids.length;i+=300) rows.push(...await call('postsById',{ids:ids.slice(i,i+300)}));return rows;
  },
  publish:value=>call('publish',{value}),
  deletePost:id=>call('deletePost',{id}),
  watchFollowing(uid,callback,error) { if(!uid){callback([]);return()=>{};}return watch('following',{uid},callback,error); },
  follow:(id,enabled)=>call('follow',{id,enabled}),
  watchRelationships:(callback,error,uid)=>watch('relationships',uid?{uid}:{},callback,error),
  watchReposts:(callback,error)=>watch('reposts',{},callback,error),
  repost:(postId,enabled,comment='')=>call('repost',{postId,enabled,comment}),
  like:(postId,enabled)=>call('like',{postId,enabled}),
  watchCommentCount:(postId,callback,error)=>watch('commentCount',{postId},callback,error),
  ownComments:()=>call('ownComments'),
  watchComments:(postId,callback,error)=>watch('comments',{postId},callback,error),
  comment:(postId,content,side,replyToId)=>call('comment',{postId,content,side,replyToId}),
  deleteComment:(postId,id)=>call('deleteComment',{postId,id}),
  watchFriends:(callback,error)=>watch('friends',{},callback,error,5000),
  watchMessages:(friendId,callback,error)=>watch('messages',{friendId},callback,error,2000),
  olderMessages:(friendId,before)=>call('messages',{friendId,before}),
  sendMessage:(friendId,content,requestId)=>call('sendMessage',{friendId,content,requestId}),
  startBattle:(postId,side,requestId)=>call('startBattle',{postId,side,requestId,protocol:2,gameVersion:2}),
  checkpointBattle:(sessionId,revision,inputs,ticks)=>call('checkpointBattle',{sessionId,revision,inputs,ticks}),
  continueBattle:(sessionId,revision)=>call('continueBattle',{sessionId,revision}),
  applyBattle:sessionId=>call('applyBattle',{sessionId}),
  finishBattle:(sessionId,inputs)=>call('finishBattle',{sessionId,inputs}),
};
