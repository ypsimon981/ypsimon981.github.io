(function(){
  function landing(f){var t=Date.parse(f.actual_on||'');return Number.isFinite(t)&&t<=Date.now()?t:null;}
  function duration(min,clock){return clock?String(Math.floor(min/60)).padStart(2,'0')+'h:'+String(min%60).padStart(2,'0')+'m':min<60?min+' min':Math.floor(min/60)+'h '+String(min%60).padStart(2,'0')+' min';}
  function info(f,clock){
    var t=landing(f);if(t!==null){var m=Math.max(0,Math.floor((Date.now()-t)/60000));return {text:'Atterrato da '+duration(m,clock),state:m<=45?'ok':m<=60?'warn':'bad'};}
    if(f.cancelled) return {text:'Cancellato',state:''};
    if(f.actual_in||/landed|arriv|complete/i.test(f.status||'')) return {text:'Atterrato · orario reale non disponibile',state:''};
    var e=Date.parse(f.estimated_on||f.estimated_in||f.scheduled_on||f.scheduled_in||'');
    return {text:Number.isFinite(e)?e>Date.now()?(clock?'In atterraggio tra ':'Atterra tra ')+duration(Math.max(1,Math.ceil((e-Date.now())/60000)),clock):'In attesa di conferma atterraggio':f.status||'Orario non disponibile',state:''};
  }
  function link(f){var p=new URLSearchParams({flight:f.ident||''});if(f.target_date)p.set('date',f.target_date);if(f.customerName)p.set('client',f.customerName);if(f.actual_on)p.set('actual_on',f.actual_on);if(f.provider||f.source)p.set('source',f.provider||f.source);p.set('route',((f.origin||{}).code||'—')+' → '+((f.destination||{}).code||'—'));return 'timestamp.html?'+p;}
  function update(){document.querySelectorAll('[data-landing]').forEach(function(el){try{var x=info(JSON.parse(el.dataset.landing),el.dataset.landingFormat==='clock');el.textContent=x.text;var card=el.closest('article,.result');if(card){card.classList.remove('sw-ok','sw-warn','sw-bad');if(x.state)card.classList.add('sw-'+x.state);}}catch(e){}});}
  function escape(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function comparisonHtml(c){
    if(!c) return '<section class="sw-comparison"><div class="sw-comparison-meta">Aggiorna il volo per confrontare FlightAware e AeroDataBox.</div></section>';
    function date(v){var d=new Date(v||'');return isNaN(d)?'—':d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',timeZone:'Europe/Rome'})+' · '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});}
    function source(name,s){
      s=s||{};var kinds={estimated:'Stimato',scheduled:'Programmato',actual:'Reale'};
      var errors={no_matching_flight:'Volo non confrontabile',flight_not_found:'Volo non trovato',refresh_pending:'Aggiornamento in corso',not_configured:'Fonte non configurata'};
      return '<div class="sw-comparison-source"><div class="sw-comparison-provider">'+name+'</div><div class="sw-comparison-time">'+escape(s.arrival_at?date(s.arrival_at):'—')+'</div><div class="sw-comparison-meta">'+escape(s.error?(errors[s.error]||'Dati non disponibili'):(kinds[s.kind]||'Stimato'))+(s.stale?' · dati non aggiornati':'')+'</div><div class="sw-comparison-meta">Ultimo aggiornamento: '+escape(date(s.updated_at))+'</div></div>';
    }
    var diff=typeof c.difference_minutes==='number'&&Number.isFinite(c.difference_minutes)?(c.difference_minutes>0?'+':'')+c.difference_minutes+' min':'—';
    return '<section class="sw-comparison" aria-label="Confronto arrivi"><div class="sw-comparison-title">Confronto arrivi · orari Italia</div><div class="sw-comparison-grid">'+source('FlightAware',c.flightaware)+source('AeroDataBox',c.aerodatabox)+'</div><div class="sw-comparison-diff">Differenza AeroDataBox − FlightAware: '+escape(diff)+'</div><div class="sw-comparison-note">'+(c.basis==='runway'?'Confronto degli orari in pista.':'Arrivo segnalato dalle fonti: può riferirsi al gate o alla pista.')+(diff==='—'?' Differenza non disponibile per dati mancanti o non omogenei.':'')+'</div></section>';
  }
  window.SWFlight={info:info,link:link,update:update,comparisonHtml:comparisonHtml};setInterval(update,1000);
})();
