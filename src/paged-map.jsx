import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {data} from './data.js';
import {useCursorPage} from './paged-feed.jsx';
export function PagedMap({component:Map,ownPins=[],...props}){
  const [bounds,setBounds]=useState([37.50,126.90,37.63,127.06]);
  const page=useCursorPage({mode:'pins',bounds},props.me?.id);
  const pins=useMemo(()=>props.selected&&!page.items.some(p=>p.id===props.selected.id)?[...page.items,props.selected]:page.items,[page.items,props.selected]);
  const onBounds=useCallback(value=>setBounds(previous=>JSON.stringify(previous)===JSON.stringify(value)?previous:value),[]);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!props.selected?.id || !data.watchPin)return;
    return data.watchPin(props.selected.id,props.select,()=>setError('Pin을 불러오지 못했습니다.'));
  },[props.selected?.id]);
  const select=async pin=>{
    if(!pin){props.select(null);return;}
    try{const detail=await data.getPin(pin.id);props.select(detail);setError(detail?'':'삭제된 Pin입니다.');}
    catch{setError('Pin을 불러오지 못했습니다.');}
  };
  return <Map {...props} pins={pins} select={select} onBounds={onBounds} ownPinCount={ownPins.length}
    moreControl={<div className="map-results">{(error||page.error)&&<p role="alert">{error||'지도를 불러오지 못했습니다.'}<button onClick={page.retry}>다시 시도</button></p>}{page.loading?<span>주변 Pin 불러오는 중…</span>:page.nextCursor?<button onClick={page.more}>주변 Pin 20개 더 보기</button>:null}</div>}/>;
}
