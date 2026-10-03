(function(){
"use strict";
var PHONE_KEY="steerwill.driver.phone.v1",DATA_KEY="steerwill.nccgest.services.test.v1",CTX_KEY="steerwill.service.context.v1";
var FLIGHT_KEY="codriver_monitored_flights_v1",TRAIN_KEY="codriver_monitored_trains_v1";
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
function contextAttr(s){return esc(encodeURIComponent(JSON.stringify({id:s.id||"",date:s.date||"",time:s.time||"",pickup_address:s.pickup_address||"",dropoff_address:s.dropoff_address||"",paxname:s.paxname||"",pax:s.pax||"",transport_number:s.transport_number||"",transport_from:s.transport_from||"",servicetype:s.servicetype||"",vehicle_plate:s.vehicle_plate||"",cartype:s.cartype||"",driver:s.driver||"",customer:s.customer||"",service_note:s.service_note||""})))}
function card(s){
 var transport=s.transport_number||"",driver=String(s.driver||"").split(" - ")[0],pax=s.paxname||"Cliente",count=Number(s.pax||0),tracker=trackerFor(s),ctx=contextAttr(s);
 var html='<article class="sw-service"><div class="sw-service-top"><div class="sw-service-when"><span class="sw-service-time">'+esc(s.time||"--:--")+'</span><span class="sw-service-type">'+esc(s.servicetype||"SERVIZIO")+'</span></div><span class="sw-service-status">'+esc(s.status||"—")+'</span></div>';
 html+='<div class="sw-service-route">'+esc(route(s.pickup_address)||"—")+' → '+esc(route(s.dropoff_address)||"—")+'</div>';
 html+='<div class="sw-service-pax"><strong>'+esc(pax)+'</strong>'+(count?' · '+count+' pax':'')+'</div><div class="sw-service-meta">';
 if(transport)html+='<span class="sw-service-tag">'+(/civitavecchia|porto|port\b/i.test((s.pickup_address||"")+" "+(s.dropoff_address||""))?'⚓':'✈︎')+' '+esc(transport)+'</span>'; if(s.cartype)html+='<span class="sw-service-tag">'+esc(s.cartype)+'</span>'; if(s.vehicle_plate)html+='<span class="sw-service-tag">'+esc(s.vehicle_plate)+'</span>'; if(driver)html+='<span class="sw-service-tag">'+esc(driver)+'</span>'; html+='</div>';
 html+='<div class="sw-service-actions"><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(s.pickup_address||"")+'">PICKUP</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(s.dropoff_address||"")+'">DEST.</a><a class="sw-context-link" data-ctx="'+ctx+'" href="cartello.html">CARTELLO</a><a class="sw-context-link" data-ctx="'+ctx+'" href="'+tracker+'">TRACKER</a><a class="sw-context-link" data-ctx="'+ctx+'" href="timestamp.html">NO-SHOW</a></div></article>';
 return html;
}
function bindContext(){document.querySelectorAll(".sw-context-link").forEach(function(a){a.addEventListener("click",function(){try{sessionStorage.setItem(CTX_KEY,decodeURIComponent(a.getAttribute("data-ctx")||""))}catch(e){}})})}
function render(){
 var configured=localStorage.getItem(PHONE_KEY)||"",all=readData(),list=$("swAssignedList"),meta=$("swAssignedMeta");if(!list||!meta)return;
 if(!phoneKey(configured)){meta.textContent="Configura autista";list.innerHTML='<div class="sw-assigned-empty">Imposta il numero di telefono dell’autista. Durante il test lo usiamo per riconoscere i servizi assegnati.</div>';return}
 syncAssignedTrips(all,configured);
 var mine=all.filter(function(s){return sameDriver(s.driver,configured)}).sort(function(a,b){var aa=String(a.date||"")+String(a.time||""),bb=String(b.date||"")+String(b.time||"");return aa===bb?0:(aa>bb?1:-1)});
 meta.textContent=mine.length+(mine.length===1?" servizio assegnato":" servizi assegnati")+" · "+all.length+" nel dataset";
 list.innerHTML=mine.length?mine.map(card).join(""):'<div class="sw-assigned-empty">Nessun servizio nel dataset importato per questo autista.</div>';bindContext();
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