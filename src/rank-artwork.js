// Original vector artwork. One silhouette and gemstone palette per earned rank.
export const rankArtwork = [
  null,
  {name:'게',color:'#ed7861',dark:'#9c344a',light:'#ffdfb7',path:'M22 31c-9-1-11-8-8-14l5 5 5-6c4 7 2 12-3 14m22 1c9-1 11-8 8-14l-5 5-5-6c-4 7-2 12 3 14M19 35l-7-3m8 8-8 2m11 1-6 6m28-14 7-3m-8 8 8 2m-11 1 6 6',body:'M20 30Q32 24 44 30L44 39Q32 48 20 39Z',eyes:[[27,31],[37,31]]},
  {name:'오징어',color:'#bb8aff',dark:'#6433a3',light:'#f2dcff',body:'M32 12Q43 21 42 34L22 34Q21 21 32 12ZM23 30 15 35 22 23M41 30 49 35 42 23',path:'M24 34v10q0 6-5 5m10-15v14m6-14v14m5-14v10q0 6 5 5',eyes:[[28,29],[36,29]]},
  {name:'문어',color:'#f27eb4',dark:'#9c357d',light:'#ffe1f0',body:'M21 31C16 10 48 10 43 31L40 37H24Z',path:'M23 33c-9 0-12 10-6 12 4 1 6-4 6-7m4-4c-4 9-4 15 0 15 3 0 3-6 3-11m4-4c1 12 2 15 5 14 5-1 1-9 0-12m3-4c9 1 13 11 6 12-4 1-6-5-6-7',eyes:[[27,28],[37,28]]},
  {name:'돌고래',color:'#4cd6dc',dark:'#147a9f',light:'#d6ffff',body:'M13 37C14 21 32 17 42 25L53 29 43 32C38 38 29 37 25 34L19 46 18 37 10 42ZM29 23 34 14 37 24M33 33 39 43 28 36',path:'M20 30q9-8 19-2',eyes:[[40,27]]},
  {name:'상어',color:'#6ba7ef',dark:'#254d91',light:'#e3f2ff',body:'M12 35C22 22 31 21 42 27L53 34 42 39 28 39 18 35 10 44 12 34 9 26 18 30M28 25 34 13 38 27M32 38 38 48 26 38',path:'M42 35h8m-19-4-2 4m7-4-2 4',eyes:[[43,30]]},
  {name:'고래',color:'#e9b843',dark:'#936020',light:'#fff3bf',body:'M13 28C13 19 39 16 42 30L46 33 46 24 53 20 52 31C53 45 31 47 20 40Q13 36 13 28ZM28 38 35 47 36 37',path:'M17 34q9 7 20 4M26 19v-6m0 1-5-3m5 3 5-3',eyes:[[21,27]]},
];
export function rankIndex(profile){
  const value=Number(profile?.rankLevel ?? profile?.level ?? 0);
  return Number.isFinite(value)?Math.max(0,Math.min(6,Math.floor(value))):0;
}
