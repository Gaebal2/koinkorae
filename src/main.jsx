import React,{useLayoutEffect} from 'react';
import { createRoot } from 'react-dom/client';
import App from './map-app.jsx';
import { FeedbackProvider } from './feedback.jsx';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './community-updates.css';
function Startup(){
  useLayoutEffect(()=>{
    // The HTML fallback covers module loading only. Do not wait for its image
    // or hold it over the ready app: that creates a second, late logo flash.
    document.querySelector('.app-launch')?.remove();
  },[]);
  return null;
}
createRoot(document.getElementById('root')).render(<FeedbackProvider><App/><Startup/></FeedbackProvider>);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => console.warn('Offline support unavailable:', error.message));
  });
}
