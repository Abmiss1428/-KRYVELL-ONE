async function kryvellDataCoreStatus(){
  const target=document.getElementById('controlDataCore');
  if(target)target.textContent='Vérification…';
  try{
    const r=await fetch('/api/data-core-status',{cache:'no-store',credentials:'same-origin'});
    const d=await r.json().catch(()=>({ok:false}));
    if(!r.ok||!d.ok)throw new Error('data_core_status_failed');
    if(target)target.textContent=d.supabase_configured?'Supabase · prêt':'Transition · à connecter';
    window.dispatchEvent(new CustomEvent('kryvell:data-core',{detail:d}));
    return d;
  }catch{
    if(target)target.textContent='Indisponible';
    return {ok:false,supabase_configured:false};
  }
}

window.addEventListener('load',()=>{
  kryvellDataCoreStatus();
  setInterval(kryvellDataCoreStatus,60000);
});
window.addEventListener('kryvell:refresh-data-core',kryvellDataCoreStatus);
window.KryvellDataCore={status:kryvellDataCoreStatus};
