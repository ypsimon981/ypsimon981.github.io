(function(){
  function landing(f){var t=Date.parse(f.actual_on||'');return Number.isFinite(t)&&t<=Date.now()?t:null;}
  function duration(min,clock){return clock?String(Math.floor(min/60)).padStart(2,'0')+'h:'+String(min%60).padStart(2,'0')+'m':min<60?min+' min':Math.floor(min/60)+'h '+String(min%60).padStart(2,'0')+' min';}
  function gateEstimate(f){return Object.prototype.hasOwnProperty.call(f,'estimated_gate_in')?f.estimated_gate_in:f.estimated_in!==f.estimated_on?f.estimated_in:null;}
  function timing(f){
    function pick(actual,estimated,scheduled){return {time:actual||estimated||scheduled||null,kind:actual?'actual':estimated?'estimated':'scheduled'};}
    var gate=pick(f.actual_in,gateEstimate(f),f.scheduled_in),runway=pick(f.actual_on,f.estimated_on,f.scheduled_on);
    return {landing:runway.time?runway:gate,landingBasis:runway.time?'runway':'gate',gate:gate};
  }
  function info(f,clock){
    var t=landing(f);if(t!==null){var m=Math.max(0,Math.floor((Date.now()-t)/60000));return {text:'Atterrato da '+duration(m,clock),state:m<=45?'ok':m<=60?'warn':'bad'};}
    if(f.cancelled) return {text:'Cancellato',state:''};
    if(f.actual_in||/landed|arriv|complete/i.test(f.status||'')) return {text:'Atterrato · orario reale non disponibile',state:''};
    var x=timing(f),e=Date.parse(x.landing.time||'');
    return {text:Number.isFinite(e)?e>Date.now()?(x.landingBasis==='runway'?(clock?'In atterraggio tra ':'Atterra tra '):'Arrivo previsto tra ')+duration(Math.max(1,Math.ceil((e-Date.now())/60000)),clock):'In attesa di conferma arrivo':f.status||'Orario non disponibile',state:''};
  }
  function link(f){var p=new URLSearchParams({flight:f.ident||''});if(f.target_date)p.set('date',f.target_date);if(f.customerName)p.set('client',f.customerName);if(f.actual_on)p.set('actual_on',f.actual_on);if(f.provider||f.source)p.set('source',f.provider||f.source);p.set('route',((f.origin||{}).code||'—')+' → '+((f.destination||{}).code||'—'));return 'timestamp.html?'+p;}
  function update(){document.querySelectorAll('[data-landing]').forEach(function(el){try{var x=info(JSON.parse(el.dataset.landing),el.dataset.landingFormat==='clock');el.textContent=x.text;var card=el.closest('article,.result');if(card){card.classList.remove('sw-ok','sw-warn','sw-bad');if(x.state)card.classList.add('sw-'+x.state);}}catch(e){}});}
  function escape(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function comparisonHtml(c){
    if(!c||c.version!==2) return '<section class="sw-comparison"><div class="sw-comparison-meta">Aggiorna il volo per confrontare FlightAware e AeroDataBox.</div></section>';
    function date(v){var d=new Date(v||'');return isNaN(d)?'—':d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',timeZone:'Europe/Rome'})+' · '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});}
    function source(name,s){
      s=s||{};var kinds={estimated:'Previsto',scheduled:'Programmato',actual:'Reale'};
      var events={gate:'Arrivo al gate',runway:'Atterraggio in pista',unspecified:'Arrivo · punto non indicato'};
      var errors={no_matching_flight:'Volo non confrontabile',flight_not_found:'Volo non trovato',refresh_pending:'Aggiornamento in corso',not_configured:'Fonte non configurata'};
      return '<div class="sw-comparison-source"><div class="sw-comparison-provider">'+name+'</div><div class="sw-comparison-event">'+escape(events[s.basis]||events.unspecified)+'</div><div class="sw-comparison-time">'+escape(s.arrival_at?date(s.arrival_at):'—')+'</div><div class="sw-comparison-meta">'+escape(s.error?(errors[s.error]||'Dati non disponibili'):(kinds[s.kind]||'Previsto'))+(s.stale?' · dati non aggiornati':'')+'</div><div class="sw-comparison-meta">Dati acquisiti: '+escape(date(s.updated_at))+'</div></div>';
    }
    var diff=typeof c.difference_minutes==='number'&&Number.isFinite(c.difference_minutes)?(c.difference_minutes>0?'+':'')+c.difference_minutes+' min':'—';
    var note=diff!=='—'?(c.basis==='runway'?'Confronto dello stesso evento: pista.':'Confronto dello stesso evento: gate.'):(c.difference_reason==='different_events'?'Scarto non calcolato: punto di arrivo differente o non specificato.':'Scarto non calcolato: orari mancanti, programmati o di tipo diverso.');
    return '<section class="sw-comparison" aria-label="Confronto arrivi"><div class="sw-comparison-title">Orari delle fonti · ora italiana</div><div class="sw-comparison-grid">'+source('FlightAware',c.flightaware)+source('AeroDataBox',c.aerodatabox)+'</div><div class="sw-comparison-diff">Differenza AeroDataBox − FlightAware: '+escape(diff)+'</div><div class="sw-comparison-note">'+note+'</div></section>';
  }
  window.SWFlight={info:info,link:link,update:update,timing:timing,comparisonHtml:comparisonHtml};setInterval(update,1000);
})();
