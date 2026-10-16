export const MEASUREMENT_ID='G-B3XY29KSPH';
const screens={home:'Home',map:'Map',check:'Check-in',chat:'Chat',battle:'Practice',profile:'Profile',points:'Points policy'};
export function createAnalytics(win,doc){
 let started=false,last=null;
 return function trackScreen(screen){
  if(!screens[screen]||!['koinkorae.com','www.koinkorae.com'].includes(win.location.hostname)||win.navigator?.globalPrivacyControl===true)return;
  try{
   if(!started){
    win.dataLayer=win.dataLayer||[];
    win.gtag=win.gtag||function(){win.dataLayer.push(arguments);};
    win.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
    win.gtag('js',new Date());
    let referrer='';try{referrer=doc.referrer?new URL(doc.referrer).origin+'/':'';}catch{}
    win.gtag('config',MEASUREMENT_ID,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:win.location.origin+'/',page_referrer:referrer});
    const script=doc.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+MEASUREMENT_ID;doc.head.appendChild(script);
    started=true;
   }
   if(last===screen)return;
   win.gtag('event','page_view',{send_to:MEASUREMENT_ID,page_title:'Koin Korae · '+screens[screen],page_location:win.location.origin+'/?screen='+screen,page_referrer:last?win.location.origin+'/?screen='+last:undefined});
   last=screen;
  }catch{}
 };
}
export const trackScreen=typeof window==='undefined'?()=>{}:createAnalytics(window,document);
