// SteerWill modular shell: protected profile selector, release controls, module navigation.
(function(){
 "use strict";
 var RELEASE="2026.10.03-1932-modular";
 var RELEASE_LABEL="03/10/2026 · 19:32";
 var PROFILE_KEY="steerwill.profile.v1";
 var PROFILE_SCHEMA_KEY="steerwill.profile.schema.v2";
 var PROFILE_SCHEMA="2";
 // Test/admin code 1981 stored only as SHA-256, not in clear text.
 var ADMIN_HASH="a78f19952edd18bf02b3c9eb704b088e2120941d6acb22f6f795c42796e60252";
 var profiles={
  private:{label:"Privato",modules:["garage"],quote:false},
  owner:{label:"Padroncino",modules:["driver","garage"],quote:true},
  small:{label:"Piccola realtà",modules:["driver","garage","fleet"],quote:true},
  complete:{label:"Flotta completa",modules:["driver","garage","fleet","ops"],quote:true},
  driver:{label:"Driver flotta",modules:["driver"],quote:false},
  office:{label:"Ufficio / Ops",modules:["garage","fleet","ops"],quote:true}
 };
 function migrateProfile(){
  try{
   if(localStorage.getItem(PROFILE_SCHEMA_KEY)!==PROFILE_SCHEMA){
    localStorage.setItem(PROFILE_KEY,"driver");
    localStorage.setItem(PROFILE_SCHEMA_KEY,PROFILE_SCHEMA);
   }
  }catch(e){}
 }
 function readProfile(){var id="driver";try{id=localStorage.getItem(PROFILE_KEY)||"driver";}catch(e){}return profiles[id]?id:"driver";}
 function fileName(){return location.pathname.split("/").pop()||"index.html";}
 function moduleForFile(file){
  if(file==="driver.html"||["cartello.html","monitor.html","timestamp.html","traduttore.html","preventivo.html","preventivi-salvati.html","voli.html","treni.html","navi.html","testo-cliente.html"].indexOf(file)!==-1)return "driver";
  if(file==="garage.html"||file==="veicolo.html")return "garage";
  if(file==="fleet.html")return "fleet";
  if(file==="ops.html")return "ops";
  return "home";
 }
 function icon(path){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';}
 function hex(buffer){return Array.from(new Uint8Array(buffer)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
 async function validAdminCode(value){
  if(!value||!window.crypto||!crypto.subtle)return false;
  var data=new TextEncoder().encode(String(value));
  return hex(await crypto.subtle.digest("SHA-256",data))===ADMIN_HASH;
 }
 function refreshApp(button){
  if(button){button.disabled=true;button.textContent="…";}
  (async function(){
   try{
    if("caches" in window){var keys=await caches.keys();await Promise.all(keys.filter(function(k){return k.indexOf("steerwill-")===0;}).map(function(k){return caches.delete(k);}));}
    if("serviceWorker" in navigator){var regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(function(reg){return reg.update().catch(function(){});}));}
   }catch(e){}
   var u=new URL(location.href);u.searchParams.set("release",RELEASE);u.searchParams.set("_refresh",Date.now());location.replace(u.toString());
  })();
 }
 function adminDialog(onSuccess,onCancel){
  var old=document.querySelector(".sw-admin-lock");if(old)old.remove();
  var overlay=document.createElement("div");overlay.className="sw-admin-lock";
  overlay.innerHTML='<div class="sw-admin-card" role="dialog" aria-modal="true" aria-labelledby="swAdminTitle"><div class="sw-admin-title" id="swAdminTitle">Cambio livello utente</div><div class="sw-admin-copy">Inserisci il codice amministratore per modificare il profilo di SteerWill.</div><input class="sw-admin-input" type="password" inputmode="numeric" autocomplete="off" placeholder="Password" aria-label="Password amministratore"><div class="sw-admin-error" aria-live="polite"></div><div class="sw-admin-actions"><button type="button" class="sw-admin-cancel">Annulla</button><button type="button" class="sw-admin-confirm">Sblocca</button></div></div>';
  document.body.appendChild(overlay);
  var input=overlay.querySelector(".sw-admin-input"),error=overlay.querySelector(".sw-admin-error"),confirm=overlay.querySelector(".sw-admin-confirm"),cancel=overlay.querySelector(".sw-admin-cancel");
  function close(ok){overlay.remove();if(ok){if(onSuccess)onSuccess();}else if(onCancel)onCancel();}
  async function check(){
   confirm.disabled=true;error.textContent="";
   var ok=false;try{ok=await validAdminCode(input.value);}catch(e){}
   if(ok){close(true);return;}
   error.textContent="Password non corretta.";input.value="";input.focus();confirm.disabled=false;
  }
  confirm.addEventListener("click",check);cancel.addEventListener("click",function(){close(false);});overlay.addEventListener("click",function(e){if(e.target===overlay)close(false);});input.addEventListener("keydown",function(e){if(e.key==="Enter")check();});
  setTimeout(function(){input.focus();},40);
 }
 function addTopBar(profileId){
  if(document.querySelector(".sw-accountbar"))return;
  var bar=document.createElement("div");bar.className="sw-accountbar";
  var top=document.createElement("div");top.className="sw-accountbar-top";
  var brand=document.createElement("div");brand.className="sw-accountbar-brand";brand.innerHTML='Steer<b>Will</b>';
  var release=document.createElement("div");release.className="sw-accountbar-release";release.textContent=RELEASE_LABEL;
  var refresh=document.createElement("button");refresh.type="button";refresh.className="sw-refresh-btn";refresh.setAttribute("aria-label","Aggiorna SteerWill");refresh.title="Aggiorna SteerWill";refresh.textContent="↻";refresh.addEventListener("click",function(){refreshApp(refresh);});
  var releaseWrap=document.createElement("div");releaseWrap.className="sw-release-wrap";releaseWrap.appendChild(release);releaseWrap.appendChild(refresh);
  top.appendChild(brand);top.appendChild(releaseWrap);

  var profileRow=document.createElement("div");profileRow.className="sw-accountbar-profile";
  var label=document.createElement("div");label.className="sw-accountbar-label";label.innerHTML='Livello utente <span aria-hidden="true">🔒</span>';
  var select=document.createElement("select");select.setAttribute("aria-label","Livello utente SteerWill protetto da password");
  Object.keys(profiles).forEach(function(id){var o=document.createElement("option");o.value=id;o.textContent=profiles[id].label;if(id===profileId)o.selected=true;select.appendChild(o);});
  select.addEventListener("change",function(){
   var requested=select.value,current=profileId;if(requested===current)return;
   select.value=current;
   adminDialog(function(){try{localStorage.setItem(PROFILE_KEY,requested);}catch(e){}location.href=(requested==="driver"?"driver.html":"index.html")+"?v="+encodeURIComponent(RELEASE);},function(){select.value=current;});
  });
  profileRow.appendChild(label);profileRow.appendChild(select);
  bar.appendChild(top);bar.appendChild(profileRow);document.body.insertBefore(bar,document.body.firstChild);
 }
 function addBottomNav(profileId){
  var old=document.querySelector(".sw-mobile-nav");if(old)old.remove();
  var profile=profiles[profileId],file=fileName(),current=moduleForFile(file);
  var all=[
   {id:"home",href:"index.html",label:"Home",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
   {id:"driver",href:"driver.html",label:"Driver",path:"M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M5 21c.8-4 3.1-6 7-6s6.2 2 7 6"},
   {id:"garage",href:"garage.html",label:"Garage",path:"M4 18v-7l3-5h10l3 5v7 M6 18h12 M7 13h10 M8 18v2m8-2v2"},
   {id:"fleet",href:"fleet.html",label:"Fleet",path:"M4 17h16M6 17l1-7h10l1 7M8 10l1-4h6l1 4M8 20h.01M16 20h.01"},
   {id:"ops",href:"ops.html",label:"Ops",path:"M4 5h16v14H4z M8 9h8M8 13h5M8 17h3"}
  ];
  var allowed=["home"].concat(profile.modules);
  var nav=document.createElement("nav");nav.className="sw-mobile-nav";nav.setAttribute("aria-label","Moduli SteerWill");
  all.filter(function(x){return allowed.indexOf(x.id)!==-1;}).forEach(function(item){var a=document.createElement("a");a.href=item.href+"?v="+encodeURIComponent(RELEASE);if(current===item.id)a.setAttribute("aria-current","page");a.innerHTML=icon(item.path)+"<span>"+item.label+"</span>";nav.appendChild(a);});
  nav.style.gridTemplateColumns="repeat("+nav.children.length+",minmax(0,1fr))";document.body.appendChild(nav);
 }
 function subItems(module,file){
  if(module==="driver")return [
   ["driver.html","Driver",file==="driver.html"],
   ["monitor.html","Viaggi",file==="monitor.html"],
   ["cartello.html","Cartello",file==="cartello.html"],
   ["driver.html#tracker","Tracker",["voli.html","treni.html","navi.html"].indexOf(file)!==-1],
   ["timestamp.html","Timestamp",file==="timestamp.html"],
   ["driver.html#altro","Altro",["traduttore.html","preventivo.html","preventivi-salvati.html","testo-cliente.html"].indexOf(file)!==-1]
  ];
  if(module==="garage")return [["garage.html","Garage",file==="garage.html"],["veicolo.html","Veicoli",file==="veicolo.html"],["garage.html#scadenze","Scadenze",false],["garage.html#manutenzione","Manutenzione",false],["garage.html#documenti","Documenti",false]];
  if(module==="fleet")return [["fleet.html","Fleet",true],["fleet.html#mappa","Mappa",false],["fleet.html#stato","Stato",false],["fleet.html#percorsi","Percorsi",false],["fleet.html#alert","Alert",false]];
  if(module==="ops")return [["ops.html","Ops",true],["ops.html#servizi","Servizi",false],["ops.html#dispatch","Dispatch",false],["ops.html#turni","Turni",false],["ops.html#clienti","Clienti",false]];
  return [];
 }
 function addSubNav(){
  var file=fileName(),module=moduleForFile(file),items=subItems(module,file);if(!items.length)return;
  var nav=document.createElement("nav");nav.className="sw-module-subnav";nav.setAttribute("aria-label","Navigazione "+module);
  items.forEach(function(x){var a=document.createElement("a");a.href=x[0]+(x[0].indexOf("#")===-1?"?v="+encodeURIComponent(RELEASE):"");a.textContent=x[1];if(x[2])a.setAttribute("aria-current","page");nav.appendChild(a);});
  var main=document.querySelector("main")||document.querySelector(".wrap")||document.querySelector(".shell")||document.body;
  if(main===document.body){document.body.insertBefore(nav,document.body.children[1]||null);}else{main.insertBefore(nav,main.firstChild);}
 }
 function applyVisibility(profileId){
  var p=profiles[profileId];document.documentElement.setAttribute("data-sw-profile",profileId);
  document.querySelectorAll("[data-module-card]").forEach(function(el){el.setAttribute("data-sw-hidden",p.modules.indexOf(el.getAttribute("data-module-card"))===-1?"true":"false");});
  document.querySelectorAll("[data-permission='quote']").forEach(function(el){el.setAttribute("data-sw-hidden",p.quote?"false":"true");});
  document.querySelectorAll("[data-profile-label]").forEach(function(el){el.textContent=p.label;});
  document.querySelectorAll("[data-active-modules]").forEach(function(el){el.textContent=p.modules.map(function(x){return x.charAt(0).toUpperCase()+x.slice(1);}).join(" + ")||"Core";});
 }
 function enhanceHomeLinks(){
  var homeIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="flex:0 0 18px"><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/></svg>';
  document.querySelectorAll('a[href]').forEach(function(link){var href=link.getAttribute("href")||"";if(!/^(?:\.\/)?index\.html(?:[?#]|$)/.test(href)||!/^\s*(?:←\s*)?Home\s*$/i.test(link.textContent))return;link.innerHTML=homeIcon+'<span>Home</span>';link.style.display="inline-flex";link.style.alignItems="center";link.style.justifyContent="center";link.style.gap="7px";});
 }
 function guardProfile(profileId){
  var file=fileName(),module=moduleForFile(file),p=profiles[profileId];
  if((file==="preventivo.html"||file==="preventivi-salvati.html")&&!p.quote){location.replace("driver.html?v="+encodeURIComponent(RELEASE));return false;}
  if(module!=="home"&&p.modules.indexOf(module)===-1){location.replace((p.modules.indexOf("driver")!==-1?"driver.html":"index.html")+"?v="+encodeURIComponent(RELEASE));return false;}
  if(module==="home"&&profileId==="driver"){location.replace("driver.html?v="+encodeURIComponent(RELEASE));return false;}
  return true;
 }
 migrateProfile();
 var profileId=readProfile();
 if(!guardProfile(profileId))return;
 function init(){addTopBar(profileId);applyVisibility(profileId);addSubNav();addBottomNav(profileId);enhanceHomeLinks();}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

// Daily first-party module counts; random ID is replaced each Rome calendar day.
// No names, form values, query strings, IP addresses or user agents are sent.
(function(){
 "use strict";
 var modules={"index.html":"home","driver.html":"driver","garage.html":"garage","fleet.html":"fleet","ops.html":"ops","cartello.html":"cartello","timestamp.html":"timestamp","monitor.html":"monitor","navi.html":"navi","voli.html":"voli","treni.html":"treni","preventivo.html":"preventivo","preventivi-salvati.html":"preventivi-salvati","testo-cliente.html":"testo-cliente","traduttore.html":"traduttore","veicolo.html":"veicolo"};
 var module=modules[location.pathname.split("/").pop()||"index.html"];
 if(!module||navigator.webdriver||navigator.globalPrivacyControl||navigator.doNotTrack==="1"||window.doNotTrack==="1")return;
 var pending=false,volatile=null;
 function track(){
  if(pending||document.visibilityState==="hidden"||!navigator.onLine)return;
  try{
   var parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),p={};parts.forEach(function(x){p[x.type]=x.value;});
   var day=p.year+"-"+p.month+"-"+p.day,visitor=volatile;try{visitor=JSON.parse(localStorage.getItem("steerwill.dailyVisitor.v1")||"null");}catch(e){}
   if(!visitor||visitor.day!==day||!visitor.id){if(!crypto.randomUUID)return;visitor={day:day,id:crypto.randomUUID()};volatile=visitor;try{localStorage.setItem("steerwill.dailyVisitor.v1",JSON.stringify(visitor));}catch(e){}}
   var sentKey="steerwill.usage.sent.v1",sent=null;try{sent=JSON.parse(sessionStorage.getItem(sentKey)||"null");}catch(e){}
   if(sent&&sent.day===day&&sent.id===visitor.id&&sent.modules&&sent.modules.indexOf(module)!==-1)return;
   pending=true;fetch("https://bboijzuzhgvfxqrsfatw.supabase.co/functions/v1/usage",{method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_IYGuSSUStiK95becoD-OQQ_aj_2sGIN"},body:JSON.stringify({day:day,visitor_id:visitor.id,module:module}),keepalive:true,credentials:"omit"}).then(function(response){if(!response.ok)return;try{var state=JSON.parse(sessionStorage.getItem(sentKey)||"null");if(!state||state.day!==day||state.id!==visitor.id)state={day:day,id:visitor.id,modules:[]};if(state.modules.indexOf(module)===-1)state.modules.push(module);sessionStorage.setItem(sentKey,JSON.stringify(state));}catch(e){}}).catch(function(){}).finally(function(){pending=false;});
  }catch(e){pending=false;}
 }
 track();document.addEventListener("visibilitychange",track);window.addEventListener("online",track);
})();
