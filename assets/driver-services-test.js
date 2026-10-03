(function(){
"use strict";
var PHONE_KEY="steerwill.driver.phone.v1",DATA_KEY="steerwill.nccgest.services.test.v1",CTX_KEY="steerwill.service.context.v1",EVENT_KEY="steerwill.driver.events.test.v1";
var FLIGHT_KEY="codriver_monitored_flights_v1",TRAIN_KEY="codriver_monitored_trains_v1";
var EVENT_STEPS=["VADO","SUL POSTO","PRESI","LASCIATI"];
function $(id){return document.getElementById(id)}
function digits(v){return String(v||"").replace(/\D/g,"")}
function phoneKey(v){var d=digits(v);return d.length>10?d.slice(-10):d}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function phoneFromDriver(v){var all=String(v||"").match(/\+?\d[\d\s().-]{7,}\d/g)||[];return all.length?phoneKey(all[all.length-1]):""}
function sameDriver(driver,phone){var a=phoneFromDriver(driver),b=phoneKey(phone);return !!a&&!!b&&(a===b||a.endsWith(b)||b.endsWith(a))}
function route(v){return String(v||"").replace(/,\s*/g,", ")}
function readData(){try{var raw=JSON.parse(localStorage.getItem(DATA_KEY)||"[]");return Array.isArray(raw)?raw:[];}catch(e){return []}}
function readList(key){try{var v=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(v)?v:[]}catch(e){return []}}
function writeList(key,v){try{localStorage.setItem(key,JSON.stringify(v))}catch(e){}}
function readEvents(){try{var v=JSON.parse(localStorage.getItem(EVENT_KEY)||"{}");return v&&typeof v==="object"?v:{}}catch(e){return {}}}
function writeEvents(v){try{localStorage.setItem(EVENT_KEY,JSON.stringify(v))}catch(e){}}
function eventId(s){return String(s.id||[s.date||"",s.time||"",s.paxname||""].join("|"))}
function eventState(s){var e=readEvents()[eventId(s)];return e&&typeof e==="object"?e:{step:0,status:"active"}}
function setEventState(s,state){var all=readEvents();all[eventId(s)]=state;writeEvents(all)}
function normPlace(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function stationSlug(pickup){var p=normPlace(pickup);if(/termini/.test(p))return "roma_termini";if(/tiburtina/.test(p))return "roma_tiburtina";if(/fiumicino.*aeroporto|aeroporto.*fiumicino/.test(p))return "fiumicino_aeroporto";if(/milano.*centrale|centrale.*milano/.test(p))return "milano_centrale";if(/firenze.*(s\.?\s?m\.?\s?novella|santa maria novella)/.test(p))return "firenze_smn";if(/bologna.*centrale/.test(p))return "bologna_centrale";if(/napoli.*centrale/.test(p))return "napoli_centrale";if(/torino.*porta nuova/.test(p))return "torino_porta_nuova";if(/venezia.*(s\.?\s?lucia|santa lucia)/.test(p))return "venezia_s_lucia";if(/salerno/.test(p)&&/staz|station|ferroviar/.test(p))return "salerno";if(/stazion|station|ferroviar/.test(p))return "other_station";return ""}
function airportCode(pickup){var p=normPlace(pickup);if(/\bfco\b|fiumicino|leonardo da vinci/.test(p))return "FCO";if(/\bcia\b|ciampino/.test(p))return "CIA";return ""}
function syncAssignedTrips(items,configured){
 var mine=(items||[]).filter(function(s){return sameDriver(s.driver,configured)}),flights=readList(FLIGHT_KEY),trains=readList(TRAIN_KEY),flightChanged=false,trainChanged=false;
 mine.forEach(function(s){var transport=String(s.transport_number||"").trim();if(!transport)return;var airport=airportCode(s.pickup_address),station=stationSlug(s.pickup_address);
  if(airport){var ident=transport.toUpperCase().replace(/\s+/g,"");var exists=flights.some(function(f){return String(f.ident||"").toUpperCase().replace(/\s+/g,"")===ident&&String(f.target_date||"")===String(s.date||"")});if(!exists){flights.push({ident:ident,target_date:s.date||"",customerName:s.paxname||"",steerwill_service_id:s.id||"",steerwill_auto:true,pickup_airport:airport});flightChanged=true}return}
  if(station){var train=transport.replace(/\s+/g,"");var existsT=trains.some(function(t){return String(t.train||"").replace(/\s+/g,"")===train&&String(t.service_date||"")===String(s.date||"")});if(!existsT){trains.push({train:train,station_slug:station==="other_station"?"":station,station:s.pickup_address||"",mode:"arrivals",service_date:s.date||"",customerName:s.paxname||"",steerwill_service_id:s.id||"",steerwill_auto:true});trainChanged=true}}
 });
 if(flightChanged)writeList(FLIGHT_KEY,flights);if(trainChanged)writeList(TRAIN_KEY,trains);
}
function trackerFor(s){var t=String(s.transport_number||"").trim(),pickup=String(s.pickup_address||"");if(stationSlug(pickup))return "treni.html";if(airportCode(pickup))return "voli.html";var where=(pickup+" "+String(s.dropoff_address||"")).toLowerCase();if(/civitavecchia|porto|port\b/.test(where))return "navi.html";if(t&&/^\d+$/.test(t.replace(/\s+/g,"")))return "treni.html";return t?"voli.html":"monitor.html"}
function contextObject(s){return {id:s.id||"",date:s.date||"",time:s.time||"",pickup_address:s.pickup_address||"",dropoff_address:s.dropoff_address||"",paxname:s.paxname||"",pax:s.pax||"",transport_number:s.transport_number||"",transport_from:s.transport_from||"",servicetype:s.servicetype||"",vehicle_plate:s.vehicle_plate||"",cartype:s.cartype||"",driver:s.driver||"",customer:s.customer||"",service_note:s.service_note||""}}
function contextAttr(s){return esc(encodeURIComponent(JSON.stringify(contextObject(s))))}
function navUrl(address){return "https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(address||"")}
function addressRow(label,address){return '<div class="sw-service-address"><div class="sw-service-address-copy"><span class="sw-service-address-label">'+label+'</span><span class="sw-service-address-text">'+esc(route(address)||"—")+'</span></div><a class="sw-service-pin" target="_blank" rel="noopener" href="'+navUrl(address)+'" aria-label="Naviga verso '+label.toLowerCase()+'" title="Naviga verso '+label.toLowerCase()+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-13a7 7 0 1 0-14 0c0 6.9 7 13 7 13Z"/><circle cx="12" cy="8" r="2.5"/></svg></a></div>'}
function card(s){
 var transport=s.transport_number||"",driver=String(s.driver||"").split(" - ")[0],pax=s.paxname||"Cliente",count=Number(s.pax||0),tracker=trackerFor(s),ctx=contextAttr(s),state=eventState(s),done=state.status==="done",noShow=state.status==="no_show",step=Math.max(0,Math.min(4,Number(state.step||0))),nextLabel=EVENT_STEPS[Math.min(step,3)];
 var cls="sw-service"+(done?" is-done":"")+(noShow?" is-noshow":"");
 var html='<article class="'+cls+'" data-service-id="'+esc(eventId(s))+'"><div class="sw-service-top"><div class="sw-service-when"><span class="sw-service-time">'+esc(s.time||"--:--")+'</span><span class="sw-service-type">'+esc(s.servicetype||"SERVIZIO")+'</span></div><div class="sw-service-topright"><span class="sw-service-status">'+esc(s.status||"—")+'</span>';
 if(!done&&!noShow)html+='<button class="sw-driver-event" type="button" data-event-service="'+esc(eventId(s))+'">'+esc(nextLabel)+'</button>';
 else html+='<span class="sw-service-result '+(done?"ok":"bad")+'">'+(done?'SERVIZIO OK':'NO SHOW')+'</span>';
 html+='</div></div>';
 if(step>0&&!done&&!noShow)html+='<div class="sw-driver-progress">'+step+'/4 · '+esc(EVENT_STEPS[step-1])+'</div>';
 html+='<div class="sw-service-addresses">'+addressRow("Pickup",s.pickup_address)+addressRow("Destinazione",s.dropoff_address)+'</div>';
 html+='<div class="sw-service-pax"><strong>'+esc(pax)+'</strong>'+(count?' · '+count+' pax':'')+'</div><div class="sw-service-meta">';
 if(transport)html+='<span class="sw-service-tag">'+(/civitavecchia|porto|port\b/i.test((s.pickup_address||"")+" "+(s.dropoff_address||""))?'⚓':'✈︎')+' '+esc(transport)+'</span>';if(s.cartype)html+='<span class="sw-service-tag">'+esc(s.cartype)+'</span>';if(s.vehicle_plate)html+='<span class="sw-service-tag">'+esc(s.vehicle_plate)+'</span>';if(driver)html+='<span class="sw-service-tag">'+esc(driver)+'</span>';html+='</div>';
 html+='<div class="sw-service-actions"><a class="sw-context-link" data-ctx="'+ctx+'" href="cartello.html">CARTELLO</a><a class="sw-context-link" data-ctx="'+ctx+'" href="'+tracker+'">TRACKER</a>'+(done||noShow?'':'<button class="sw-noshow" type="button" data-noshow-service="'+esc(eventId(s))+'" data-ctx="'+ctx+'">NO-SHOW</button>')+'</div></article>';
 return html;
}
function findService(id){return readData().find(function(s){return eventId(s)===String(id)})||null}
function bindContext(){document.querySelectorAll(".sw-context-link").forEach(function(a){a.addEventListener("click",function(){try{sessionStorage.setItem(CTX_KEY,decodeURIComponent(a.getAttribute("data-ctx")||""))}catch(e){}})})}
function bindEvents(){
 document.querySelectorAll(".sw-driver-event").forEach(function(btn){btn.addEventListener("click",function(){var s=findService(btn.getAttribute("data-event-service"));if(!s)return;var st=eventState(s),next=Math.min(4,Number(st.step||0)+1);setEventState(s,{step:next,status:next>=4?"done":"active",updated_at:new Date().toISOString()});render();if(next>=4)setTimeout(function(){alert("Servizio completato")},20)})});
 document.querySelectorAll(".sw-noshow").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Vuoi dichiarare no show?"))return;var s=findService(btn.getAttribute("data-noshow-service"));if(!s)return;setEventState(s,{step:eventState(s).step||0,status:"no_show",updated_at:new Date().toISOString()});try{sessionStorage.setItem(CTX_KEY,decodeURIComponent(btn.getAttribute("data-ctx")||""))}catch(e){}render();setTimeout(function(){location.href="timestamp.html"},30)})});
}
function render(){
 var configured=localStorage.getItem(PHONE_KEY)||"",all=readData(),list=$("swAssignedList"),meta=$("swAssignedMeta");if(!list||!meta)return;
 if(!phoneKey(configured)){meta.textContent="Configura autista";list.innerHTML='<div class="sw-assigned-empty">Imposta il numero di telefono dell’autista. Durante il test lo usiamo per riconoscere i servizi assegnati.</div>';return}
 syncAssignedTrips(all,configured);
 var mine=all.filter(function(s){return sameDriver(s.driver,configured)}).sort(function(a,b){var aa=String(a.date||"")+String(a.time||""),bb=String(b.date||"")+String(b.time||"");return aa===bb?0:(aa>bb?1:-1)});
 meta.textContent=mine.length+(mine.length===1?" servizio assegnato":" servizi assegnati")+" · "+all.length+" nel dataset";
 list.innerHTML=mine.length?mine.map(card).join(""):'<div class="sw-assigned-empty">Nessun servizio nel dataset importato per questo autista.</div>';bindContext();bindEvents();
}
function init(){
 var setup=$("swAssignedSetup"),phone=$("swAssignedPhone"),json=$("swAssignedJson");
 $("swAssignedConfig").onclick=function(){setup.classList.toggle("open");phone.value=localStorage.getItem(PHONE_KEY)||""};
 $("swAssignedSave").onclick=function(){localStorage.setItem(PHONE_KEY,phone.value.trim());setup.classList.remove("open");render()};
 $("swAssignedImport").onclick=function(){try{var parsed=JSON.parse(json.value),items=Array.isArray(parsed)?parsed:(Array.isArray(parsed.data)?parsed.data:[]);localStorage.setItem(DATA_KEY,JSON.stringify(items));json.value="";render()}catch(e){alert("JSON non valido")}};
 render();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();