// SteerWill modular shell: entry gate, admin profile switcher, release controls and navigation.
(function(){
 "use strict";
 var RELEASE="2026.10.03-2313-apitest";
 var RELEASE_LABEL="03/10/2026 · 23:13";
 var PROFILE_KEY="steerwill.profile.v1";
 var ACCESS_KEY="steerwill.access.v1";
 var ACCESS_SCHEMA_KEY="steerwill.access.schema.v1";
 var ACCESS_SCHEMA="1";
 var ADMIN_HASH="a78f19952edd18bf02b3c9eb704b088e2120941d6acb22f6f795c42796e60252"; // 1981
 var DRIVER_HASH="9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0"; // 0000
 var profiles={
  private:{label:"Privato",modules:["garage"],quote:false},
  owner:{label:"Padroncino",modules:["driver","garage"],quote:true},
  small:{label:"Flotta",modules:["driver","garage","fleet"],quote:true},
  complete:{label:"Gestionale NCC",modules:["driver","garage","fleet","ops"],quote:true},
  driver:{label:"Autista di flotta",modules:["driver"],quote:false},
  office:{label:"Ufficio / Ops",modules:["garage","fleet","ops"],quote:true}
 };
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
 async function hash(value){if(!window.crypto||!crypto.subtle)return "";return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value||""))));}
 function readAccess(){try{return localStorage.getItem(ACCESS_KEY)||"";}catch(e){return "";}}
 function readProfile(access){
  if(access==="driver")return "driver";
  var id="small";try{id=localStorage.getItem(PROFILE_KEY)||"small";}catch(e){}
  return profiles[id]?id:"small";
 }
 function prepareGate(){
  try{
   if(localStorage.getItem(ACCESS_SCHEMA_KEY)!==ACCESS_SCHEMA){
    localStorage.removeItem(ACCESS_KEY);
    localStorage.setItem(PROFILE_KEY,"driver");
    localStorage.setItem(ACCESS_SCHEMA_KEY,ACCESS_SCHEMA);
   }
  }catch(e){}
 }
 function showGate(){
  document.documentElement.classList.add("sw-locked");
  var overlay=document.createElement("div");overlay.className="sw-entry-gate";
  overlay.innerHTML='<div class="sw-entry-card" role="dialog" aria-modal="true" aria-labelledby="swEntryTitle"><div class="sw-entry-brand">Steer<span>Will</span></div><div class="sw-entry-title" id="swEntryTitle">Codice di accesso</div><div class="sw-entry-copy">Inserisci il codice per entrare in SteerWill.</div><input class="sw-entry-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="••••" aria-label="Codice di accesso"><button class="sw-entry-submit" type="button">Entra</button><div class="sw-entry-error" aria-live="polite"></div><div class="sw-entry-release">'+RELEASE_LABEL+'</div></div>';
  document.body.appendChild(overlay);
  var input=overlay.querySelector(".sw-entry-input"),button=overlay.querySelector(".sw-entry-submit"),error=overlay.querySelector(".sw-entry-error");
  async function enter(){
   button.disabled=true;error.textContent="";
   var digest="";try{digest=await hash(input.value);}catch(e){}
   var access="";
   if(digest===ADMIN_HASH)access="admin";
   if(digest===DRIVER_HASH)access="driver";
   if(!access){error.textContent="Codice non corretto.";input.value="";input.focus();button.disabled=false;return;}
   try{localStorage.setItem(ACCESS_KEY,access);if(access==="driver")localStorage.setItem(PROFILE_KEY,"driver");else if((localStorage.getItem(PROFILE_KEY)||"driver")==="driver")localStorage.setItem(PROFILE_KEY,"small");}catch(e){}
   var target=access==="driver"?"driver.html":"index.html";
   location.replace(target+"?release="+encodeURIComponent(RELEASE));
  }
  button.addEventListener("click",enter);input.addEventListener("keydown",function(e){if(e.key==="Enter")enter();});setTimeout(function(){input.focus();},60);
 }
 function logout(){try{localStorage.removeItem(ACCESS_KEY);}catch(e){}location.replace("index.html?locked="+Date.now());}
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
 function addTopBar(profileId,access){
  if(document.querySelector(".sw-accountbar"))return;
  document.documentElement.setAttribute("data-sw-access",access);
  document.documentElement.setAttribute("data-sw-file",fileName());
  var bar=document.createElement("div");bar.className="sw-accountbar";
  var brand=document.createElement("div");brand.className="sw-accountbar-brand";brand.innerHTML='Steer<b>Will</b>';
  var release=document.createElement("div");release.className="sw-accountbar-release";release.textContent=RELEASE_LABEL;
  var refresh=document.createElement("button");refresh.type="button";refresh.className="sw-refresh-btn";refresh.setAttribute("aria-label","Aggiorna SteerWill");refresh.title="Aggiorna SteerWill";refresh.textContent="↻";refresh.addEventListener("click",function(){refreshApp(refresh);});
  var lock=document.createElement("button");lock.type="button";lock.className="sw-lock-btn";lock.setAttribute("aria-label","Esci e cambia codice");lock.title="Esci e cambia codice";lock.textContent="⌁";lock.addEventListener("click",logout);
  bar.appendChild(brand);bar.appendChild(release);bar.appendChild(refresh);
  if(access==="admin"){
   var select=document.createElement("select");select.className="sw-profile-select";select.setAttribute("aria-label","Livello utente SteerWill");
   Object.keys(profiles).forEach(function(id){var o=document.createElement("option");o.value=id;o.textContent=profiles[id].label;if(id===profileId)o.selected=true;select.appendChild(o);});
   select.addEventListener("change",function(){var requested=select.value;try{localStorage.setItem(PROFILE_KEY,requested);}catch(e){}var target=requested==="driver"?"driver.html":"index.html";location.href=target+"?release="+encodeURIComponent(RELEASE);});
   bar.appendChild(select);
  }else{
   var mode=document.createElement("div");mode.className="sw-driver-mode";mode.textContent="Autista";bar.appendChild(mode);
  }
  bar.appendChild(lock);document.body.insertBefore(bar,document.body.firstChild);
 }
 function garageAlertCounts(){
  var empty={orange:0,red:0,deadlineOrange:0,deadlineRed:0,maintenanceOrange:0,maintenanceRed:0};
  var vehicles=[];
  try{vehicles=JSON.parse(localStorage.getItem("codriver_vehicles_v1")||"[]");}catch(e){return empty;}
  if(!Array.isArray(vehicles))return empty;
  function dateStatus(value){
   if(!value)return 0;
   var date=new Date(String(value)+"T12:00:00");if(isNaN(date.getTime()))return 0;
   var today=new Date();today.setHours(0,0,0,0);
   var days=Math.ceil((date.getTime()-today.getTime())/86400000);
   return days<0?2:days<=30?1:0;
  }
  function kmStatus(target,current){
   var t=Number(target||0),c=Number(current||0);if(!t)return 0;
   var left=t-c;return left<0?2:left<=1000?1:0;
  }
  function add(status,kind){
   if(!status)return;
   if(kind==="deadline"){if(status===2)empty.deadlineRed++;else empty.deadlineOrange++;}
   else{if(status===2)empty.maintenanceRed++;else empty.maintenanceOrange++;}
  }
  vehicles.forEach(function(v){
   ["revision","insurance","ztl","tax"].forEach(function(k){add(dateStatus(v[k]),"deadline");});
   [["serviceKm","serviceDate"],["tyresKm","tyresDate"]].forEach(function(pair){
    var status=Math.max(kmStatus(v[pair[0]],v.km),dateStatus(v[pair[1]]));add(status,"maintenance");
   });
  });
  empty.orange=empty.deadlineOrange+empty.maintenanceOrange;
  empty.red=empty.deadlineRed+empty.maintenanceRed;
  return empty;
 }
 function garageAlertMarkup(orange,red){
  if(!orange&&!red)return "";
  var labels=[];
  if(orange)labels.push('<span class="sw-alert-count sw-alert-orange" aria-label="'+orange+' avvisi in scadenza">'+orange+'</span>');
  if(red)labels.push('<span class="sw-alert-count sw-alert-red" aria-label="'+red+' avvisi scaduti o da fare">'+red+'</span>');
  return '<span class="sw-alert-badges" aria-label="Avvisi: '+orange+' arancioni, '+red+' rossi">'+labels.join("")+'</span>';
 }
 function renderGarageAlertBadges(){
  var totals=garageAlertCounts();
  document.querySelectorAll("[data-garage-alerts]").forEach(function(el){
   var type=el.getAttribute("data-garage-alerts"),orange=totals.orange,red=totals.red;
   if(type==="deadlines"){orange=totals.deadlineOrange;red=totals.deadlineRed;}
   if(type==="maintenance"){orange=totals.maintenanceOrange;red=totals.maintenanceRed;}
   var badge=el.querySelector(":scope > .sw-alert-badges");
   if(!badge){badge=document.createElement("span");badge.className="sw-alert-badges";el.appendChild(badge);}
   badge.outerHTML=garageAlertMarkup(orange,red)||'<span class="sw-alert-badges" hidden></span>';
  });
 }
 function addBottomNav(profileId){
  var old=document.querySelector(".sw-mobile-nav");if(old)old.remove();
  var profile=profiles[profileId],file=fileName(),current=moduleForFile(file);
  var nav=document.createElement("nav");nav.className="sw-mobile-nav";
  var contextual={
   driver:[
    {href:"index.html",label:"Home",title:"Home SteerWill",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
    {href:"driver.html",label:"Driver",title:"Area Driver",path:"M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M5 21c.8-4 3.1-6 7-6s6.2 2 7 6"},
    {href:"monitor.html",label:"Viaggi",title:"Viaggi salvati",path:"M4 5h16v16H4z M8 2v6m8-6v6M4 11h16"},
    {href:"cartello.html",label:"Cartello",title:"Cartello accoglienza",path:"M2 5h20v14H2z M7 14l3-6 3 6m-5-2h4m4-4v6"},
    {href:"timestamp.html",label:"Timestamp",title:"Timestamp e prova no-show",path:"M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0"}
   ],
   garage:[
    {href:"index.html",label:"Home",title:"Home SteerWill",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
    {href:"garage.html#amministrazione",label:"Admin",title:"Amministrazione veicoli",alerts:"all",path:"M4 4h16v16H4z M8 8h8M8 12h8M8 16h5"},
    {href:"garage.html#scadenze",label:"Scadenze",title:"Scadenze",alerts:"deadlines",path:"M4 5h16v16H4z M8 2v6m8-6v6M4 11h16"},
    {href:"garage.html#manutenzione",label:"Manutenzione",title:"Manutenzione",alerts:"maintenance",path:"M14 6a5 5 0 0 0-6 6l-4 4a2 2 0 1 0 3 3l4-4a5 5 0 0 0 6-6l-3 3-3-3z"},
    {href:"garage.html#impostazioni",label:"Impost.",title:"Impostazioni Garage",path:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19 13a7 7 0 0 0 0-2l2-1-2-3-2 1a7 7 0 0 0-2-1l-.3-2h-4L10 7a7 7 0 0 0-2 1L6 7 4 10l2 1a7 7 0 0 0 0 2l-2 1 2 3 2-1a7 7 0 0 0 2 1l.7 2h4l.3-2a7 7 0 0 0 2-1l2 1 2-3z"}
   ],
   fleet:[
    {href:"index.html",label:"Home",title:"Home SteerWill",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
    {href:"fleet.html#mappa",label:"Live",title:"Live flotta",path:"M4 17h16M6 17l1-7h10l1 7M8 10l1-4h6l1 4"},
    {href:"fleet.html#percorsi",label:"Storico",title:"Storico percorsi",path:"M4 19V5m0 14h17M8 15l3-4 3 2 5-7"},
    {href:"fleet.html#impostazioni",label:"Impost.",title:"Impostazioni Fleet",path:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19 13a7 7 0 0 0 0-2l2-1-2-3-2 1a7 7 0 0 0-2-1l-.3-2h-4L10 7a7 7 0 0 0-2 1L6 7 4 10l2 1a7 7 0 0 0 0 2l-2 1 2 3 2-1a7 7 0 0 0 2 1l.7 2h4l.3-2a7 7 0 0 0 2-1l2 1 2-3z"}
   ],
   ops:[
    {href:"index.html",label:"Home",title:"Home SteerWill",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
    {href:"ops.html#servizi",label:"Servizi",title:"Servizi",path:"M4 5h16v14H4z M8 9h8M8 13h5M8 17h3"},
    {href:"ops.html#dispatch",label:"Dispatch",title:"Dispatch",path:"M3 12h18M12 3v18M5 5l14 14M19 5 5 19"},
    {href:"ops.html#turni",label:"Turni",title:"Turni",path:"M4 5h16v16H4z M8 2v6m8-6v6M4 11h16"},
    {href:"ops.html#clienti",label:"Clienti",title:"Clienti e booking",path:"M4 5h16v14H4z M8 9h8M8 13h6"}
   ]
  };
  var items=contextual[current];
  if(items){
   nav.setAttribute("aria-label","Navigazione "+current.charAt(0).toUpperCase()+current.slice(1));
   items.forEach(function(item){
    var a=document.createElement("a"),parts=item.href.split("#"),path=parts[0],hashPart=parts.length>1?"#"+parts.slice(1).join("#"):"";
    a.href=path+(path.indexOf("?")===-1?"?":"&")+"release="+encodeURIComponent(RELEASE)+hashPart;
    a.title=item.title||item.label;a.setAttribute("aria-label",item.title||item.label);
    if(item.alerts)a.setAttribute("data-garage-alerts",item.alerts);
    var activePath=path.split("?")[0];
    if(file===activePath&&location.hash===(hashPart||""))a.setAttribute("aria-current","page");
    a.innerHTML=icon(item.path)+"<span>"+item.label+"</span>";nav.appendChild(a);
   });
   nav.style.gridTemplateColumns="repeat("+nav.children.length+",minmax(0,1fr))";document.body.appendChild(nav);return;
  }
  nav.setAttribute("aria-label","Moduli SteerWill");
  var all=[
   {id:"home",href:"index.html",label:"Home",path:"M3 10 12 3l9 7v11h-6v-7H9v7H3z"},
   {id:"driver",href:"driver.html",label:"Driver",path:"M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M5 21c.8-4 3.1-6 7-6s6.2 2 7 6"},
   {id:"garage",href:"garage.html",label:"Garage",alerts:"all",path:"M4 18v-7l3-5h10l3 5v7 M6 18h12 M7 13h10 M8 18v2m8-2v2"},
   {id:"fleet",href:"fleet.html",label:"Fleet",path:"M4 17h16M6 17l1-7h10l1 7M8 10l1-4h6l1 4M8 20h.01M16 20h.01"},
   {id:"ops",href:"ops.html",label:"Ops",path:"M4 5h16v14H4z M8 9h8M8 13h5M8 17h3"}
  ];
  var allowed=["home"].concat(profile.modules);
  all.filter(function(x){return allowed.indexOf(x.id)!==-1;}).forEach(function(item){var a=document.createElement("a");a.href=item.href+"?release="+encodeURIComponent(RELEASE);if(current===item.id)a.setAttribute("aria-current","page");if(item.alerts)a.setAttribute("data-garage-alerts",item.alerts);a.innerHTML=icon(item.path)+"<span>"+item.label+"</span>";nav.appendChild(a);});
  nav.style.gridTemplateColumns="repeat("+nav.children.length+",minmax(0,1fr))";document.body.appendChild(nav);
 }
 function subItems(module,file){
  if(module==="garage"&&file==="garage.html")return [["garage.html","Garage",true],["veicolo.html","Veicoli",false],["garage.html#scadenze","Scadenze",false],["garage.html#manutenzione","Manutenzione",false],["garage.html#documenti","Documenti",false]];
  if(module==="fleet"&&file==="fleet.html")return [["fleet.html","Fleet",true],["fleet.html#mappa","Mappa",false],["fleet.html#stato","Stato",false],["fleet.html#percorsi","Percorsi",false],["fleet.html#alert","Alert",false]];
  if(module==="ops"&&file==="ops.html")return [["ops.html","Ops",true],["ops.html#servizi","Servizi",false],["ops.html#dispatch","Dispatch",false],["ops.html#turni","Turni",false],["ops.html#clienti","Clienti",false]];
  return [];
 }
 function addSubNav(){
  var file=fileName(),module=moduleForFile(file),items=subItems(module,file);if(!items.length)return;
  var nav=document.createElement("nav");nav.className="sw-module-subnav";nav.setAttribute("aria-label","Navigazione "+module);
  items.forEach(function(x){var a=document.createElement("a");a.href=x[0]+(x[0].indexOf("#")===-1?"?release="+encodeURIComponent(RELEASE):"");a.textContent=x[1];if(x[2])a.setAttribute("aria-current","page");nav.appendChild(a);});
  var main=document.querySelector("main");if(main)main.insertBefore(nav,main.firstChild);
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
 function guardProfile(profileId,access){
  var file=fileName(),module=moduleForFile(file),p=profiles[profileId];
  if(access==="driver"&&module!=="driver"){location.replace("driver.html?release="+encodeURIComponent(RELEASE));return false;}
  if((file==="preventivo.html"||file==="preventivi-salvati.html")&&!p.quote){location.replace("driver.html?release="+encodeURIComponent(RELEASE));return false;}
  if(module!=="home"&&p.modules.indexOf(module)===-1){location.replace((p.modules.indexOf("driver")!==-1?"driver.html":"index.html")+"?release="+encodeURIComponent(RELEASE));return false;}
  return true;
 }
 prepareGate();
 var access=readAccess();
 if(!access){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",showGate);else showGate();return;}
 var profileId=readProfile(access);
 if(!guardProfile(profileId,access))return;
 function init(){document.documentElement.classList.remove("sw-locked");addTopBar(profileId,access);applyVisibility(profileId);addSubNav();addBottomNav(profileId);enhanceHomeLinks();renderGarageAlertBadges();window.addEventListener("pageshow",renderGarageAlertBadges);window.addEventListener("storage",function(e){if(!e.key||e.key==="codriver_vehicles_v1")renderGarageAlertBadges();});window.addEventListener("steerwill:vehicles-updated",renderGarageAlertBadges);document.querySelectorAll("a[href]").forEach(function(a){try{if(new URL(a.href,location.href).origin===location.origin)a.target="_self";}catch(e){}});}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

// Daily first-party module counts; random ID is replaced each Rome calendar day.
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
