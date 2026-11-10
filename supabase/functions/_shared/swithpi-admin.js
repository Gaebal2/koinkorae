export async function readSwithpiApplications(client, identity, value = {}) {
 if (!identity?.uid || identity.emailVerified !== true || identity.email?.toLowerCase() !== 'gaebal2017@gmail.com') throw Error('관리자만 사용할 수 있습니다.');
 const eventId=String(value.eventId||''),after=String(value.after||'0'),status=value.status||'all';
 if(!/^\d{1,18}$/.test(after)||!['all','pending','allocated','paid'].includes(status))throw Error('잘못된 요청입니다.');
 const events=await client.from('korae_airdrop_events').select('id,title,closes_at,completed_at').order('opens_at',{ascending:false});
 if(events.error)throw Error('이벤트 조회에 실패했습니다.');
 const selected=eventId||events.data[0]?.id;
 if(!selected)return {events:events.data,entries:[],total:0,next:null};
 if(!events.data.some(event=>event.id===selected))throw Error('이벤트를 찾을 수 없습니다.');
 const makeQuery=(head=false)=>{let query=client.from('korae_airdrop_entries').select('sequence,uid,pi_address,psl_address,applied_at,allocation,snapshot_balance,paid_at,payout_tx',{count:'exact',head}).eq('event_id',selected);
 if(status==='pending')query=query.is('allocation',null);
 if(status==='allocated')query=query.not('allocation','is',null).is('paid_at',null);
 if(status==='paid')query=query.not('paid_at','is',null);
 return query;};
 const count=await makeQuery(true);
 if(count.error)throw Error('신청 내역 조회에 실패했습니다.');
 const result=await makeQuery().gt('sequence',after).order('sequence',{ascending:true}).limit(51);
 if(result.error)throw Error('신청 내역 조회에 실패했습니다.');
 const entries=result.data.slice(0,50);
 return {events:events.data,eventId:selected,entries,total:count.count,next:result.data.length>50?String(entries.at(-1).sequence):null};
}
