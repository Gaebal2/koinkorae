// Original vector artwork. One silhouette and gemstone palette per earned rank.
export const rankArtwork = [
  {name:'새우',color:'#a2a7ad',dark:'#51565e',light:'#eef0f2',sea:'#25282d',body:'M39 22L47 21L42 26C38 28 34 27 30 26C24 25 20 29 20 34C20 40 26 43 32 40L36 37L40 40L35 45C26 51 15 45 14 36C12 26 21 18 30 20Z M35 43L41 39L46 41L42 44L43 49L38 47L34 49Z',path:'M40 22Q45 13 51 17M41 24Q49 18 53 23M29 28L32 33L36 34M25 30L28 35L32 37M23 34L25 39',details:'M29 21L28 26M23 21L24 26M18 25L22 29M15 31L20 32M15 37L21 36M19 43L23 39M26 46L27 42M33 44L31 40M38 44L41 43',eyes:[[38,23]]},
  {name:'게',color:'#ed7861',dark:'#9c344a',light:'#ffdfb7',path:'M22 31c-9-1-11-8-8-14l5 5 5-6c4 7 2 12-3 14m22 1c9-1 11-8 8-14l-5 5-5-6c-4 7-2 12 3 14M19 35l-7-3m8 8-8 2m11 1-6 6m28-14 7-3m-8 8 8 2m-11 1 6 6',body:'M20 30Q32 24 44 30L44 39Q32 48 20 39Z',eyes:[[27,31],[37,31]]},
  {name:'오징어',color:'#bb8aff',dark:'#6433a3',light:'#f2dcff',body:'M32 12Q43 21 42 34L22 34Q21 21 32 12ZM23 30 15 35 22 23M41 30 49 35 42 23',path:'M24 34v10q0 6-5 5m10-15v14m6-14v14m5-14v10q0 6 5 5',eyes:[[28,29],[36,29]]},
  {name:'문어',color:'#f27eb4',dark:'#9c357d',light:'#ffe1f0',body:'M21 31C16 10 48 10 43 31L40 37H24Z',path:'M23 33c-9 0-12 10-6 12 4 1 6-4 6-7m4-4c-4 9-4 15 0 15 3 0 3-6 3-11m4-4c1 12 2 15 5 14 5-1 1-9 0-12m3-4c9 1 13 11 6 12-4 1-6-5-6-7',eyes:[[27,28],[37,28]]},
  {name:'돌고래',color:'#4cd6dc',dark:'#147a9f',light:'#d6ffff',body:'M16 37C17 29 23 23 29 22Q29 17 35 15L35 22C42 22 46 26 46 29L53 31Q51 34 44 33Q39 39 31 36Q30 42 25 43L26 35Q22 34 19 39L21 46 15 42 10 43Q10 38 16 37Z',path:'M36 33Q41 35 46 32',details:'M21 31Q28 24 36 26',eyes:[[42,28]]},
  {name:'상어',color:'#6ba7ef',dark:'#254d91',light:'#e3f2ff',body:'M19 31Q24 26 29 25L34 14Q38 18 38 25Q46 27 53 33Q48 39 38 39L34 46 29 39Q24 38 19 35L11 42 13 32 10 24Z',path:'M41 35q4 2 8-1',details:'M30 29l-2 5m6-5-2 6M21 35q7 3 13 2',eyes:[[43,30]]},
  {name:'고래',color:'#e9b843',dark:'#936020',light:'#fff3bf',body:'M11 31C11 24 17 21 25 22C34 22 39 28 40 34C44 35 48 31 48 27C43 27 41 23 42 20C46 20 49 22 50 24C52 21 55 20 57 21C57 27 54 30 52 30C51 40 43 45 31 45C19 45 11 40 11 31Z',path:'M12 35Q18 39 26 36M25 21V17M25 18Q20 18 19 15M25 18Q29 14 32 16',details:'M15 39Q20 43 27 42M18 38Q20 41 22 42M22 38 25 42',fin:'M29 33C29 38 32 42 38 43C38 38 35 34 29 33Z',eyes:[[19,30]]},
];
export function rankIndex(profile){
  const value=Number(profile?.rankLevel ?? profile?.level ?? 0);
  return Number.isFinite(value)?Math.max(0,Math.min(6,Math.floor(value))):0;
}
