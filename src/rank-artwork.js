// Original vector artwork. One silhouette and gemstone palette per earned rank.
export const rankArtwork = [
  {name:'새우',color:'#f1a178',dark:'#a95242',light:'#ffe6cc',body:'M39 22C32 17 22 20 19 28C15 38 24 46 34 43L39 39 34 35C29 39 23 35 25 30C27 26 33 28 37 29L43 26ZM35 42 43 44 41 37 35 36Z',path:'M38 23Q43 14 48 19M38 25Q47 21 49 26M21 26l5 3m-7 3 6 1m-4 5 5-2m0 7 3-5M28 28l2 5m3-5 2 4',eyes:[[36,24]]},
  {name:'게',color:'#ed7861',dark:'#9c344a',light:'#ffdfb7',path:'M22 31c-9-1-11-8-8-14l5 5 5-6c4 7 2 12-3 14m22 1c9-1 11-8 8-14l-5 5-5-6c-4 7-2 12 3 14M19 35l-7-3m8 8-8 2m11 1-6 6m28-14 7-3m-8 8 8 2m-11 1 6 6',body:'M20 30Q32 24 44 30L44 39Q32 48 20 39Z',eyes:[[27,31],[37,31]]},
  {name:'오징어',color:'#bb8aff',dark:'#6433a3',light:'#f2dcff',body:'M32 12Q43 21 42 34L22 34Q21 21 32 12ZM23 30 15 35 22 23M41 30 49 35 42 23',path:'M24 34v10q0 6-5 5m10-15v14m6-14v14m5-14v10q0 6 5 5',eyes:[[28,29],[36,29]]},
  {name:'문어',color:'#f27eb4',dark:'#9c357d',light:'#ffe1f0',body:'M21 31C16 10 48 10 43 31L40 37H24Z',path:'M23 33c-9 0-12 10-6 12 4 1 6-4 6-7m4-4c-4 9-4 15 0 15 3 0 3-6 3-11m4-4c1 12 2 15 5 14 5-1 1-9 0-12m3-4c9 1 13 11 6 12-4 1-6-5-6-7',eyes:[[27,28],[37,28]]},
  {name:'돌고래',color:'#4cd6dc',dark:'#147a9f',light:'#d6ffff',body:'M16 37C17 29 23 23 29 22Q29 17 35 15L35 22C42 22 46 26 46 29L53 31Q51 34 44 33Q39 39 31 36Q30 42 25 43L26 35Q22 34 19 39L21 46 15 42 10 43Q10 38 16 37Z',path:'M36 33Q41 35 46 32',details:'M21 31Q28 24 36 26',eyes:[[42,28]]},
  {name:'상어',color:'#6ba7ef',dark:'#254d91',light:'#e3f2ff',body:'M19 31Q24 26 29 25L34 14Q38 18 38 25Q46 27 53 33Q48 39 38 39L34 46 29 39Q24 38 19 35L11 42 13 32 10 24Z',path:'M41 35q4 2 8-1',details:'M30 29l-2 5m6-5-2 6M21 35q7 3 13 2',eyes:[[43,30]]},
  {name:'고래',color:'#e9b843',dark:'#936020',light:'#fff3bf',body:'M12 30C12 22 20 20 28 22C36 23 38 29 39 34Q44 36 47 31Q42 28 43 24L49 27 54 23Q56 32 51 38C44 46 25 47 17 40Q12 36 12 30Z',path:'M16 35q3 3 7 1M27 22v-5m0 1q-6 0-6-4m6 4q6 0 6-4',details:'M19 40q7 4 15 2',fin:'M28 34Q28 41 35 43Q38 38 34 34',eyes:[[20,29]]},
];
export function rankIndex(profile){
  const value=Number(profile?.rankLevel ?? profile?.level ?? 0);
  return Number.isFinite(value)?Math.max(0,Math.min(6,Math.floor(value))):0;
}
