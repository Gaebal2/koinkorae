import { t } from './language.js';
import React, { useRef,useState } from 'react';
import { Modal, Field,AppSelect } from './ui.jsx';
import {cropGeometry} from './photo-editing.js';
export function PhotoCropper({ source,onClose,onApply,profile=true }) {
  const [image,setImage]=useState(null),[zoom,setZoom]=useState(1),[aspect,setAspect]=useState(profile?'1':'original');
  const [x,setX]=useState(50),[y,setY]=useState(50),[error,setError]=useState('');
  const contacts=useRef(new Map());
  const ratio=aspect==='original'?(image?image.naturalWidth/image.naturalHeight:1):Number(aspect);
  const geometry=image?cropGeometry(image.naturalWidth,image.naturalHeight,ratio,zoom,x,y,profile?512:960):null;
  const width=geometry?image.naturalWidth/geometry.sw:1,height=geometry?image.naturalHeight/geometry.sh:1;
  const apply=()=>{
    try{
      const canvas=document.createElement('canvas');canvas.width=geometry.width;canvas.height=geometry.height;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,geometry.sx,geometry.sy,geometry.sw,geometry.sh,0,0,canvas.width,canvas.height);
      for(const quality of [.85,.7,.5,.35]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=300000){onApply(result);return;}}
      setError('사진 용량이 큽니다. 다른 사진을 선택해 주세요.');
    }catch{setError('사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.');}
  };
  const move=event=>{
    const previous=contacts.current.get(event.pointerId);if(!previous)return;
    const before=[...contacts.current.values()];contacts.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(contacts.current.size===2){const after=[...contacts.current.values()];const distance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);const initial=distance(before);if(initial)setZoom(value=>Math.max(1,Math.min(4,value*distance(after)/initial)));return;}
    const rect=event.currentTarget.getBoundingClientRect();
    if(width>1)setX(value=>Math.max(0,Math.min(100,value-(event.clientX-previous.x)/((width-1)*rect.width)*100)));
    if(height>1)setY(value=>Math.max(0,Math.min(100,value-(event.clientY-previous.y)/((height-1)*rect.height)*100)));
  };
  return <Modal title={t(profile?'프로필 사진 자르기':'사진 편집')} onClose={onClose} className="photo-editor-modal">
    <p className="form-help">{t('사진을 드래그하거나 확대해 표시할 부분을 맞춰 주세요.')}</p>
    {!profile&&<Field label={t('자르기 비율')}><AppSelect title={t('자르기 비율')} value={aspect} options={[{value:'original',label:'원본 비율'},{value:'1',label:'1:1'},{value:String(4/3),label:'4:3'},{value:String(3/4),label:'3:4'},{value:String(16/9),label:'16:9'}]} onChange={value=>{setAspect(value);setZoom(1);setX(50);setY(50);}} floating/></Field>}
    <div className="photo-editor-stage"><div className={'photo-editor-preview'+(profile?' is-profile':'')} style={{aspectRatio:ratio,width:`min(100%, ${Math.min(340,340*ratio)}px)`}} onContextMenu={e=>e.preventDefault()}
      onPointerDown={e=>{e.preventDefault();contacts.current.set(e.pointerId,{x:e.clientX,y:e.clientY});e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={e=>contacts.current.delete(e.pointerId)} onPointerCancel={e=>contacts.current.delete(e.pointerId)} onLostPointerCapture={e=>contacts.current.delete(e.pointerId)}>
      <img src={source} draggable={false} alt={t('사진 편집 미리보기')} onLoad={e=>setImage(e.currentTarget)} onError={()=>setError('사진을 열지 못했습니다. PNG, JPEG 또는 WebP 사진을 선택해 주세요.')} style={{width:`${width*100}%`,height:`${height*100}%`,left:`${(1-width)*x}%`,top:`${(1-height)*y}%`}}/>
    </div></div>
    <Field label={t('확대 · {0}배',zoom.toFixed(1))}><input aria-label={t('확대')} type="range" min="1" max="4" step="0.01" value={zoom} onChange={e=>setZoom(+e.target.value)}/></Field>
    <Field label={t('가로 위치')}><input aria-label={t('가로 위치')} type="range" min="0" max="100" value={x} onChange={e=>setX(+e.target.value)}/></Field>
    <Field label={t('세로 위치')}><input aria-label={t('세로 위치')} type="range" min="0" max="100" value={y} onChange={e=>setY(+e.target.value)}/></Field>
    {error&&<p className="error" role="alert">{t(error)}</p>}
    <button type="button" className="primary" disabled={!image||!!error} onClick={apply}>{t('사진 적용')}</button><button type="button" className="secondary" onClick={onClose}>{t('취소')}</button>
  </Modal>;
}
