import { useEffect, useRef } from 'react';
import { createBackStack } from './back-stack.js';
let stack;
export function useBackDismiss(enabled, onClose, priority=100) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    stack ??= createBackStack(window.history,window);stack.start();
    if(enabled)return stack.add(()=>close.current(),priority);
  }, [enabled,priority]);
}
export function usePageBack(page,profileId,setPage,setProfileId) {
  const visits=useRef([]),previous=useRef({page,profileId}),restoring=useRef(false);
  useEffect(()=>{
    const before=previous.current;
    if(before.page!==page || (page==='profile'&&before.profileId!==profileId)) {
      if(!restoring.current)visits.current.push(before);
      restoring.current=false;previous.current={page,profileId};
    }
  },[page,profileId]);
  useBackDismiss(true,()=>{
    const destination=visits.current.pop() || {page:'home',profileId:null};
    if(destination.page===page&&destination.profileId===profileId)return;
    restoring.current=true;setProfileId(destination.profileId);setPage(destination.page);
  },0);
}
