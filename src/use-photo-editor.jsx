import React,{useEffect,useState} from 'react';
import {PhotoCropper} from './photo-cropper.jsx';
import {validatePhotoFile} from './photo-editing.js';
export function usePhotoEditor(onApply,{profile=false,onError=()=>{}}={}) {
  const [source,setSource]=useState(null);
  useEffect(()=>()=>{if(source)URL.revokeObjectURL(source);},[source]);
  const choose=event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{validatePhotoFile(file);setSource(URL.createObjectURL(file));onError('');}catch(error){onError(error.message);}
  };
  return {choose,editor:source&&<PhotoCropper key={source} source={source} profile={profile} onClose={()=>setSource(null)} onApply={value=>{onApply(value);setSource(null);}}/>};
}
