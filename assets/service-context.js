(function(){
"use strict";
var KEY="steerwill.service.context.v1";
function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(e){return null}}
function norm(v){return String(v||"").trim()}
function fire(el){try{el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}catch(e){}}
function labelText(el){var t=[el.id,el.name,el.placeholder,el.getAttribute("aria-label")].filter(Boolean).join(" ");if(el.id){var l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)t+=" "+l.textContent}var p=el.closest("label,.field,.form-group,.input-group,.row");if(p)t+=" "+p.textContent.slice(0,120);return t.toLowerCase()}
function setFirst(value,patterns,exactIds){if(!norm(value))return false;for(var i=0;i<(exactIds||[]).length;i++){var x=document.getElementById(exactIds[i]);if(x&&/^(INPUT|TEXTAREA)$/.test(x.tagName)){x.value=value;fire(x);return true}}var els=[].slice.call(document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]),textarea'));for(var j=0;j<els.length;j++){var txt=labelText(els[j]);if(patterns.some(function(r){return r.test(txt)})){if(!els[j].value){els[j].value=value;fire(els[j])}return true}}return false}
function apply(){var c=read();if(!c)return;var file=(location.pathname.split("/").pop()||"").toLowerCase();var pax=norm(c.paxname),transport=norm(c.transport_number);
 if(file==="cartello.html"){setFirst(pax,[/passegger/,/cliente/,/nome/],["passenger"]);return}
 if(file==="timestamp.html"){setFirst(pax,[/passegger/,/cliente/,/nome/],["passenger","clientName","customerName","paxname"]);setFirst(transport,[/volo/,/flight/,/treno/,/train/,/nave/,/ship/,/trasporto/,/codice/],["flightCode","flight","transport","transportNumber"]);return}
 if(file==="voli.html"){setFirst(transport,[/volo/,/flight/,/codice/,/numero/],["flightCode","flight","ident","query"]);return}
 if(file==="treni.html"){setFirst(transport,[/treno/,/train/,/codice/,/numero/],["train","trainNumber","query"]);return}
 if(file==="navi.html"){setFirst(transport,[/nave/,/ship/,/codice/,/numero/],["ship","shipName","query"]);return}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(apply,0)});else setTimeout(apply,0);
window.addEventListener("pageshow",function(){setTimeout(apply,0)});
})();