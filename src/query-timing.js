export function debounce(callback,delay=300){
  let timer;
  const run=(...args)=>{clearTimeout(timer);timer=setTimeout(()=>{timer=null;callback(...args);},delay);};
  run.cancel=()=>{clearTimeout(timer);timer=null;};return run;
}
