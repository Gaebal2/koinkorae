import React,{useLayoutEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {Modal} from './ui.jsx';
import {t} from './language.js';
export function PinLocationPicker({lat,lng,onCancel,onChoose}) {
 const element=useRef(null),[center,setCenter]=useState({lat:+lat,lng:+lng});
 useLayoutEffect(()=>{
  const valid=Number.isFinite(+lat)&&Math.abs(+lat)<=90&&Number.isFinite(+lng)&&Math.abs(+lng)<=180;
  const map=L.map(element.current,{zoomControl:false}).setView(valid?[+lat,+lng]:[37.5665,126.978],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const update=()=>{const p=map.getCenter();setCenter({lat:+Math.max(-90,Math.min(90,p.lat)).toFixed(6),lng:+(((p.lng+180)%360+360)%360-180).toFixed(6)});};
  map.on('move',update);update();const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(element.current);
  return()=>{observer.disconnect();map.remove();};
 },[]);
 return <Modal title={t('지도에서 위치 선택하기')} onClose={onCancel} className="pin-location-modal">
  <div className="pin-location-stage"><div ref={element} className="pin-location-map"/><div className="map-crosshair" aria-hidden="true"/>
   <div className="pin-location-confirm"><span>{center.lat}, {center.lng}</span><button type="button" className="primary" onClick={()=>onChoose(center)}>{t('여기로 Pin위치 이동')}</button><button type="button" onClick={onCancel}>{t('취소')}</button></div>
  </div>
 </Modal>;
}
