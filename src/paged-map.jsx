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
  const [detailRevision,retryDetail]=useState(0);
  useEffect(()=>{
    if(!props.selected?.id)return;
    let active=true;
    const receive=detail=>{if(!active)return;props.select(detail);setError(detail?'':'삭제된 Pin입니다.');};
    const fail=()=>{if(active)setError('Pin을 불러오지 못했습니다.');};
    const stop=data.watchPin?.(props.selected.id,receive,fail);
    if(!data.watchPin)void data.getPin(props.selected.id).then(receive,fail);
    return()=>{active=false;stop?.();};
  },[props.selected?.id,detailRevision]);
  const select=pin=>{
    setError('');
    if(!pin){props.select(null);return;}
    if(pin.id===props.selected?.id&&error)retryDetail(value=>value+1);
    const detail=ownPins.find(item=>item.id===pin.id)||(props.selected?.id===pin.id&&!props.selected._detailPending?props.selected:null);
    props.select(detail||{...pin,_detailPending:!('description' in pin)});
  };
  return <Map {...props} pins={pins} select={select} onBounds={onBounds} ownPinCount={ownPins.length}
    moreControl={<div className="map-results">{(error||page.error)&&<p role="alert">{t(error||"지도를 불러오지 못했습니다.")}<button onClick={()=>error&&props.selected?.id?retryDetail(value=>value+1):page.retry()}>{t("다시 시도")}</button></p>}{page.loading?(!items.length&&<span role="status">{t("주변 Pin 불러오는 중…")}</span>):page.nextCursor?<button onClick={page.more}>{t("주변 Pin 20개 더 보기")}</button>:null}</div>}/>;
}
