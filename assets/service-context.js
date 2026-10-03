(function(){
"use strict";
var KEY="steerwill.service.context.v1";
function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(e){return null}}
function norm(v){return String(v||"").trim()}
function fire(el){try{el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}catch(e){}}
function set(id,value){var el=document.getElementById(id);if(!el||!norm(value))return false;el.value=value;fire(el);return true}
function click(id){var el=document.getElementById(id);if(el)setTimeout(function(){el.click()},80)}
function apply(){var c=read();if(!c)return;var file=(location.pathname.split("/").pop()||"").toLowerCase();var pax=norm(c.paxname),transport=norm(c.transport_number);
 if(file==="cartello.html"){set("passenger",pax);return}
 if(file==="timestamp.html"){
   set("timestampClient",pax);
   if(set("tripCodeInput",transport))click("tripCodeBtn");
   return;
 }
 if(file==="voli.html"){
   if(set("flightInput",transport))click("searchBtn");
   return;
 }
 if(file==="treni.html"){
   if(set("searchInput",transport))click("searchBtn");
   return;
 }
 if(file==="navi.html"){
   if(set("shipInput",transport))click("searchBtn");
   return;
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(apply,180)});else setTimeout(apply,180);
window.addEventListener("pageshow",function(){setTimeout(apply,180)});
})();