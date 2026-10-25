// Original vector artwork. One silhouette and gemstone palette per earned rank.
export const rankArtwork = [
  {name:'새우',color:'#a2a7ad',dark:'#51565e',light:'#eef0f2',sea:'#25282d',strokeWidth:1.5,lineWidth:1.2,detailOpacity:.8,body:'M40 21L47 19L44 24L46 27L38 29C33 25 28 26 25 30C21 36 25 42 31 42L34 40L37 44C30 50 20 47 16 40C11 31 16 22 24 19C30 17 36 18 40 21Z M34 42L40 37L43 39L40 43L45 44L44 48L39 47L36 50L32 46Z',path:'M43 22C48 17 48 12 42 12M44 24C53 23 55 18 51 15M32 28L35 33L40 34M28 29L30 35L35 37M25 33L27 38L31 39',details:'M33 19Q30 22 31 26M26 19Q24 23 26 27M20 22Q19 26 23 30M16 28Q17 32 22 33M15 35Q18 37 23 36M18 41Q21 41 25 39M24 45L27 42M39 43L41 40M39 45L42 46',eyes:[[39,23]]},
  {name:'게',color:'#ed7861',dark:'#9c344a',light:'#ffdfb7',path:'M22 31c-9-1-11-8-8-14l5 5 5-6c4 7 2 12-3 14m22 1c9-1 11-8 8-14l-5 5-5-6c-4 7-2 12 3 14M19 35l-7-3m8 8-8 2m11 1-6 6m28-14 7-3m-8 8 8 2m-11 1 6 6',body:'M20 30Q32 24 44 30L44 39Q32 48 20 39Z',eyes:[[27,31],[37,31]]},
  {name:'오징어',color:'#bb8aff',dark:'#6433a3',light:'#f2dcff',body:'M32 12Q43 21 42 34L22 34Q21 21 32 12ZM23 30 15 35 22 23M41 30 49 35 42 23',path:'M24 34v10q0 6-5 5m10-15v14m6-14v14m5-14v10q0 6 5 5',eyes:[[28,29],[36,29]]},
  {name:'문어',color:'#f27eb4',dark:'#9c357d',light:'#ffe1f0',body:'M21 31C16 10 48 10 43 31L40 37H24Z',path:'M23 33c-9 0-12 10-6 12 4 1 6-4 6-7m4-4c-4 9-4 15 0 15 3 0 3-6 3-11m4-4c1 12 2 15 5 14 5-1 1-9 0-12m3-4c9 1 13 11 6 12-4 1-6-5-6-7',eyes:[[27,28],[37,28]]},
  {name:'돌고래',color:'#4cd6dc',dark:'#147a9f',light:'#d6ffff',body:'M16 37C17 29 23 23 29 22Q29 17 35 15L35 22C42 22 46 26 46 29L53 31Q51 34 44 33Q39 39 31 36Q30 42 25 43L26 35Q22 34 19 39L21 46 15 42 10 43Q10 38 16 37Z',path:'M36 33Q41 35 46 32',details:'M21 31Q28 24 36 26',eyes:[[42,28]]},
  {name:'상어',color:'#6ba7ef',dark:'#254d91',light:'#e3f2ff',body:'M19 31Q24 26 29 25L34 14Q38 18 38 25Q46 27 53 33Q48 39 38 39L34 46 29 39Q24 38 19 35L11 42 13 32 10 24Z',path:'M41 35q4 2 8-1',details:'M30 29l-2 5m6-5-2 6M21 35q7 3 13 2',eyes:[[43,30]]},
  {name:'고래',color:'#e9b843',dark:'#936020',light:'#fff3bf',strokeWidth:1.5,detailOpacity:.8,body:'M11 29C11 22 18 20 26 21C35 21 40 26 41 33C44 35 48 32 48 29C44 28 42 25 42 21C46 21 49 23 50 26C51 23 54 21 57 22C57 27 54 30 52 30C51 39 43 44 31 44C19 44 11 40 11 34Z',path:'',details:'M12 34C16 37 21 37 25 35M15 38Q20 41 26 40',fin:'M29 32C28 38 31 43 37 46C39 40 36 35 29 32Z',eyes:[[20,30]]},
];
export function rankIndex(profile){
  const value=Number(profile?.rankLevel ?? profile?.level ?? 0);
  return Number.isFinite(value)?Math.max(0,Math.min(6,Math.floor(value))):0;
}
