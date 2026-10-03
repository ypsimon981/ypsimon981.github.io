(function(){
"use strict";
var PHONE_KEY="steerwill.driver.phone.v1",DATA_KEY="steerwill.nccgest.services.test.v1";
function $(id){return document.getElementById(id)}
function digits(v){return String(v||"").replace(/\D/g,"")}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function phoneFromDriver(v){var m=String(v||"").match(/\+?\d[\d\s-]{7,}/);return m?digits(m[0]):""}
function route(v){return String(v||"").replace(/,\s*/g,", ")}
function readData(){try{var raw=JSON.parse(localStorage.getItem(DATA_KEY)||"[]");return Array.isArray(raw)?raw:[];}catch(e){return []}}
function card(s){
 var transport=s.transport_number||"",driver=String(s.driver||"").split(" - ")[0],pax=s.paxname||"Cliente",count=Number(s.pax||0),tracker=transport?(transport.replace(/\s+/g,"").match(/^\d+$/)?"treni.html":"voli.html"):"monitor.html";
 var html='<article class="sw-service"><div class="sw-service-top"><div class="sw-service-when"><span class="sw-service-time">'+esc(s.time||"--:--")+'</span><span class="sw-service-type">'+esc(s.servicetype||"SERVIZIO")+'</span></div><span class="sw-service-status">'+esc(s.status||"—")+'</span></div>';
 html+='<div class="sw-service-route">'+esc(route(s.pickup_address)||"—")+' → '+esc(route(s.dropoff_address)||"—")+'</div>';
 html+='<div class="sw-service-pax"><strong>'+esc(pax)+'</strong>'+(count?' · '+count+' pax':'')+'</div><div class="sw-service-meta">';
 if(transport)html+='<span class="sw-service-tag">✈︎ '+esc(transport)+'</span>'; if(s.cartype)html+='<span class="sw-service-tag">'+esc(s.cartype)+'</span>'; if(s.vehicle_plate)html+='<span class="sw-service-tag">'+esc(s.vehicle_plate)+'</span>'; if(driver)html+='<span class="sw-service-tag">'+esc(driver)+'</span>'; html+='</div>';
 html+='<div class="sw-service-actions"><a href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(s.dropoff_address||"")+'">NAVIGA</a><a href="cartello.html?name='+encodeURIComponent(pax)+'">CARTELLO</a><a href="'+tracker+'?q='+encodeURIComponent(transport)+'">TRACKER</a><a href="timestamp.html?name='+encodeURIComponent(pax)+'&transport='+encodeURIComponent(transport)+'">NO-SHOW</a></div></article>';
 return html;
}
function render(){
 var phone=digits(localStorage.getItem(PHONE_KEY)||""),all=readData(),list=$("swAssignedList"),meta=$("swAssignedMeta"); if(!list||!meta)return;
 if(!phone){meta.textContent="Configura autista";list.innerHTML='<div class="sw-assigned-empty">Imposta il numero di telefono dell’autista. Durante il test lo usiamo per riconoscere i servizi assegnati.</div>';return}
 var mine=all.filter(function(s){return phoneFromDriver(s.driver)===phone}).sort(function(a,b){return String(a.date||"")+String(a.time||"")>String(b.date||"")+String(b.time||"")?1:-1});
 meta.textContent=mine.length+(mine.length===1?" servizio assegnato":" servizi assegnati")+" nel dataset test";
 list.innerHTML=mine.length?mine.map(card).join(""):'<div class="sw-assigned-empty">Nessun servizio nel dataset importato per questo autista.</div>';
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