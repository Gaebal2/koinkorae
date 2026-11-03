import {useEffect,useState} from 'react';

// Unknown is distinct from an empty/false server result. Retain confirmed data
// while refreshing, but never reuse it for a different account or query.
export function useQueryState(key,subscribe,peek=()=>undefined){
 const [state,setState]=useState(()=>({key,value:peek(),error:null}));
 const [revision,retry]=useState(0);
 useEffect(()=>{
  let active=true;
  setState(previous=>previous.key===key?previous:{key,value:peek(),error:null});
  const stop=subscribe(value=>{if(active)setState({key,value,error:null});},error=>{if(active)setState(previous=>({key,value:previous.key===key?previous.value:undefined,error}));});
  return()=>{active=false;stop?.();};
 },[key,revision]);
 const current=state.key===key?state:{key,value:peek(),error:null};
 return {...current,pending:current.value===undefined,retry:()=>retry(value=>value+1)};
}
