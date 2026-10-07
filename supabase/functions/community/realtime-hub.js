// One service-authenticated transport per Edge isolate. Private topic names come
// exclusively from verified Firebase IDs; events never cross topic boundaries.
export function createRealtimeHub(makeClient) {
  const topics=new Map(),removals=new Map();let clientPromise;
  const client=()=>clientPromise ||= Promise.resolve().then(makeClient).catch(error=>{clientPromise=undefined;throw error;});
  function subscribe(topic,onReady,onChange,onError){
    let entry=topics.get(topic);
    const listener={onReady,onChange,onError};
    if(!entry){
      entry={listeners:new Set(),ready:false,channel:null};topics.set(topic,entry);
      void client().then(async api=>{
        await removals.get(topic);
        if(topics.get(topic)!==entry)return;
        entry.channel=api.channel(topic,{config:{private:true}}).on('broadcast',{event:'change'},({payload})=>{
          if(topics.get(topic)===entry)for(const item of [...entry.listeners])item.onChange(payload);
        });
        entry.channel.subscribe(status=>{
          if(topics.get(topic)!==entry)return;
          if(status==='SUBSCRIBED'){entry.ready=true;for(const item of [...entry.listeners])item.onReady();}
          else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){entry.ready=false;for(const item of [...entry.listeners])item.onError(status);}
        });
      }).catch(()=>{if(topics.get(topic)===entry)for(const item of [...entry.listeners])item.onError('CHANNEL_ERROR');});
    }
    entry.listeners.add(listener);if(entry.ready)queueMicrotask(()=>{if(entry.listeners.has(listener))onReady();});
    return()=>{
      entry.listeners.delete(listener);
      if(!entry.listeners.size && topics.get(topic)===entry){
        topics.delete(topic);
        if(entry.channel){
          const removal=client().then(api=>api.removeChannel(entry.channel)).catch(()=>{});
          removals.set(topic,removal);
          void removal.then(()=>{if(removals.get(topic)===removal)removals.delete(topic);});
        }
      }
    };
  }
  return {subscribe};
}
