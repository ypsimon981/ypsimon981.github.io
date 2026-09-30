(function(){
  function landing(f){var t=Date.parse(f.actual_on||'');return Number.isFinite(t)&&t<=Date.now()?t:null;}
  function duration(min){return min<60?min+' min':Math.floor(min/60)+'h '+String(min%60).padStart(2,'0')+' min';}
  function info(f){
    var t=landing(f);if(t!==null){var m=Math.max(0,Math.floor((Date.now()-t)/60000));return {text:'Atterrato da '+duration(m),state:m<=45?'ok':m<=60?'warn':'bad'};}
    if(f.cancelled) return {text:'Cancellato',state:''};
    if(f.actual_in||/landed|arriv|complete/i.test(f.status||'')) return {text:'Atterrato · orario reale non disponibile',state:''};
    var e=Date.parse(f.estimated_on||f.estimated_in||f.scheduled_on||f.scheduled_in||'');
    return {text:Number.isFinite(e)?e>Date.now()?'Atterra tra '+duration(Math.max(1,Math.ceil((e-Date.now())/60000))):'In attesa di conferma atterraggio':f.status||'Orario non disponibile',state:''};
  }
  function link(f){var p=new URLSearchParams({flight:f.ident||''});if(f.target_date)p.set('date',f.target_date);if(f.customerName)p.set('client',f.customerName);if(f.actual_on)p.set('actual_on',f.actual_on);if(f.provider||f.source)p.set('source',f.provider||f.source);p.set('route',((f.origin||{}).code||'—')+' → '+((f.destination||{}).code||'—'));return 'timestamp.html?'+p;}
  function update(){document.querySelectorAll('[data-landing]').forEach(function(el){try{var x=info(JSON.parse(el.dataset.landing));el.textContent=x.text;var card=el.closest('article,.result');if(card){card.classList.remove('sw-ok','sw-warn','sw-bad');if(x.state)card.classList.add('sw-'+x.state);}}catch(e){}});}
  window.SWFlight={info:info,link:link,update:update};setInterval(update,1000);
})();
