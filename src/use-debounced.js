import {useEffect,useState} from 'react';
import {debounce} from './query-timing.js';
export function useDebounced(value,delay=300){
  const [result,setResult]=useState(value);
  useEffect(()=>{const update=debounce(setResult,delay);update(value);return update.cancel;},[value,delay]);
  return result;
}
