import React,{useEffect} from 'react';
import { createRoot } from 'react-dom/client';
import App from './map-app.jsx';
import { FeedbackProvider } from './feedback.jsx';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './community-updates.css';
function Startup(){
  useEffect(()=>{
    const launch=document.querySelector('.app-launch');
    if(!launch)return;
    if(!navigator.standalone&&!window.matchMedia('(display-mode: standalone)').matches){launch.remove();return;}
    let cancelled=false,timer,frame;
    const image=launch.querySelector('img');
    // Keep the shared Android artwork outside React's root until the first
    // rendered app frame; cached JS used to remove it before it could paint.
    Promise.race([image.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]).then(()=>{
      if(cancelled)return;
      timer=setTimeout(()=>{frame=requestAnimationFrame(()=>{launch.remove();});},Math.max(0,450-(performance.now()-(window.appLaunchStarted||0))));
    });
    return()=>{cancelled=true;clearTimeout(timer);cancelAnimationFrame(frame);};
  },[]);
  return null;
}
createRoot(document.getElementById('root')).render(<FeedbackProvider><App/><Startup/></FeedbackProvider>);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => console.warn('Offline support unavailable:', error.message));
  });
}
