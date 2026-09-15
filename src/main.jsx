import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './map-app.jsx';
import { FeedbackProvider } from './feedback.jsx';
import 'leaflet/dist/leaflet.css';
import './styles.css';
createRoot(document.getElementById('root')).render(<FeedbackProvider><App/></FeedbackProvider>);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => console.warn('Offline support unavailable:', error.message));
  });
}
