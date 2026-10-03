// SteerWill modular shell: profile selector, module navigation, contextual sub-navigation.
(function(){
 "use strict";
 var PROFILE_KEY="steerwill.profile.v1";
 var profiles={
  private:{label:"Privato",modules:["garage"],quote:false},
  owner:{label:"Padroncino",modules:["driver","garage"],quote:true},
  small:{label:"Piccola realtà",modules:["driver","garage","fleet"],quote:true},
  complete:{label:"Flotta completa",modules:["driver","garage","fleet","ops"],quote:true},
  driver:{label:"Driver flotta",modules:["driver"],quote:false},
  office:{label:"Ufficio / Ops",modules:["garage","fleet","ops"],quote:true}
 };
 function readProfile(){var id=localStorage.getItem(PROFILE_KEY)||"small";return profiles[id]?id:"small";}
 function fileName(){return location.pathname.split("/").pop()||"index.html";}
 function moduleForFile(file){
  if(file==="driver.html"||["cartello.html","monitor.html","timestamp.html","traduttore.html","preventivo.html","preventivi-salvati.html","voli.html","treni.html","navi.html","testo-cliente.html"].indexOf(file)!==-1)return "driver";
  if(file==="garage.html"||file==="veicolo.html")return "garage";
  if(file==="fleet.html")return "fleet";
  if(file==="ops.html")return "ops";
  return "home";
 }
 function icon(path){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';}
 function addTopBar(profileId){
  if(document.querySelector(".sw-accountbar"))return;
  var bar=document.createElement("div");bar.className="sw-accountbar";
  var brand=document.createElement("div");brand.className="sw-accountbar-brand";brand.innerHTML='Steer<b>Will</b>';
  var label=document.createElement("div");label.className="sw-accountbar-label";label.textContent="Livello utente";
  var select=document.createElement("select");select.setAttribute("aria-label","Livello utente SteerWill");
  Object.keys(profiles).forEach(function(id){var o=document.createElement("option");o.value=id;o.textContent=profiles[id].label;if(id===profileId)o.selected=true;select.appendChild(o);});
  select.addEventListener("change",function(){localStorage.setItem(PROFILE_KEY,select.value);location.reload();});
  bar.appendChild(brand);bar.appendChild(label);bar.appendChild(select);document.body.insertBefore(bar,document.body.firstChild);
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
  all.filter(function(x){return allowed.indexOf(x.id)!==-1;}).forEach(function(item){var a=document.createElement("a");a.href=item.href+"?v=modular20261003";if(current===item.id)a.setAttribute("aria-current","page");a.innerHTML=icon(item.path)+"<span>"+item.label+"</span>";nav.appendChild(a);});
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
  items.forEach(function(x){var a=document.createElement("a");a.href=x[0]+(x[0].indexOf("#")===-1?"?v=modular20261003":"");a.textContent=x[1];if(x[2])a.setAttribute("aria-current","page");nav.appendChild(a);});
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
 var profileId=readProfile();
 if(fileName()==="preventivo.html"||fileName()==="preventivi-salvati.html"){
  if(!profiles[profileId].quote){location.replace("driver.html?v=modular20261003");return;}
 }
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
