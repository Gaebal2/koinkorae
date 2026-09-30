export function createReadBatcher(request) {
  const queues=new Map();
  return function read(action,args){
    if(action!=='profile' && action!=='commentCount')return request(action,args);
    const key=action==='profile'?args.id:args.postId;
    return new Promise((resolve,reject)=>{
      if(!queues.has(action)){
        const queue=[];queues.set(action,queue);
        queueMicrotask(async()=>{
          queues.delete(action);
          const ids=[...new Set(queue.map(item=>item.key))];
          try{
            const values=new Map();
            for(let offset=0;offset<ids.length;offset+=100){
              const result=await request(action==='profile'?'profiles':'commentCounts',{ids:ids.slice(offset,offset+100)});
              for(const [id,value] of action==='profile'?result.map(row=>[row.id,row]):Object.entries(result))values.set(id,value);
            }
            for(const item of queue)item.resolve(values.get(item.key)??(action==='profile'?{id:item.key,username:'회원',bio:'',profileImage:''}:0));
          }catch(error){queue.forEach(item=>item.reject(error));}
        });
      }
      queues.get(action).push({key,resolve,reject});
    });
  };
}
