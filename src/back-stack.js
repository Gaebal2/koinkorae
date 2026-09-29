// One browser-history guard. Closing UI never calls history.back().
export function createBackStack(history, target) {
  const layers=[];let started=false,order=0;
  const arm=()=>history.pushState({...history.state,koraeBackGuard:true},'');
  const back=()=>{arm();[...layers].sort((a,b)=>b.priority-a.priority||b.order-a.order)[0]?.close();};
  return {
    start(){if(started)return;started=true;if(!history.state?.koraeBackGuard)arm();target.addEventListener('popstate',back);},
    add(close,priority=100){this.start();const layer={close,priority,order:order++};layers.push(layer);return()=>{const index=layers.indexOf(layer);if(index>=0)layers.splice(index,1);};},
  };
}
