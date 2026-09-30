import { t } from './language.js';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {bufferedBounds,containsBounds,retainMapResult} from './map-updates.js';
import {data} from './data.js';
import {useCursorPage} from './paged-feed.jsx';
export function PagedMap({component:Map,ownPins=[],...props}){
  const [bounds,setBounds]=useState(null);
  const scope=props.me?.id || 'guest';
  const page=useCursorPage({mode:'pins',bounds},scope,!!bounds);
  const previous=useRef(null);
  const retained=retainMapResult(previous.current,page,scope);
  useEffect(()=>{previous.current=retained;},[retained]);
  const items=retained.items;
  const pins=useMemo(()=>props.selected&&!items.some(p=>p.id===props.selected.id)?[...items,props.selected]:items,[items,props.selected]);
  const onBounds=useCallback(value=>setBounds(previous=>containsBounds(previous,value)?previous:bufferedBounds(value)),[]);
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
    moreControl={<div className="map-results">{(error||page.error)&&<p role="alert">{t(error||"지도를 불러오지 못했습니다.")}<button onClick={page.retry}>{t("다시 시도")}</button></p>}{page.loading?(!items.length&&<span role="status">{t("주변 Pin 불러오는 중…")}</span>):page.nextCursor?<button onClick={page.more}>{t("주변 Pin 20개 더 보기")}</button>:null}</div>}/>;
}
