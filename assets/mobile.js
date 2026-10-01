(function(){var file=location.pathname.split('/').pop()||'index.html';var items=[['index.html','Home','M3 10 12 3l9 7v11h-6v-7H9v7H3z'],['monitor.html','Viaggi salvati','M4 5h16v16H4z M8 2v6m8-6v6M4 11h16'],['cartello.html','Cartello','M2 5h20v14H2z M7 14l3-6 3 6m-5-2h4m4-4v6'],['timestamp.html','Timestamp','M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0']];var nav=document.createElement('nav');nav.className='sw-mobile-nav';nav.setAttribute('aria-label','Navigazione principale');items.forEach(function(item){var a=document.createElement('a');a.href=item[0]+'?v=mobile20260930';if(file===item[0])a.setAttribute('aria-current','page');a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+item[2]+'"/></svg><span>'+item[1]+'</span>';nav.appendChild(a);});document.body.appendChild(nav);})();

// Daily first-party module counts; random ID is replaced each Rome calendar day.
// No names, form values, query strings, IP addresses or user agents are sent.
(function(){
 "use strict";
 var modules={"index.html":"home","cartello.html":"cartello","timestamp.html":"timestamp","monitor.html":"monitor","navi.html":"navi","voli.html":"voli","treni.html":"treni","preventivo.html":"preventivo","preventivi-salvati.html":"preventivi-salvati","testo-cliente.html":"testo-cliente","traduttore.html":"traduttore","veicolo.html":"veicolo"};
 var module=modules[location.pathname.split("/").pop()||"index.html"];
 if(!module||navigator.webdriver||navigator.globalPrivacyControl||navigator.doNotTrack==="1"||window.doNotTrack==="1")return;
 var pending=false, volatile=null;
 function track(){
  if(pending||document.visibilityState==="hidden"||!navigator.onLine)return;
  try{
   var parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()), p={};
   parts.forEach(function(x){p[x.type]=x.value;});
   var day=p.year+"-"+p.month+"-"+p.day, visitor=volatile;
   try{visitor=JSON.parse(localStorage.getItem("steerwill.dailyVisitor.v1")||"null");}catch(e){}
   if(!visitor||visitor.day!==day||!visitor.id){
    if(!crypto.randomUUID)return;
    visitor={day:day,id:crypto.randomUUID()};
    volatile=visitor;
    try{localStorage.setItem("steerwill.dailyVisitor.v1",JSON.stringify(visitor));}catch(e){}
   }
   var sentKey="steerwill.usage.sent.v1",sent=null;
   try{sent=JSON.parse(sessionStorage.getItem(sentKey)||"null");}catch(e){}
   if(sent&&sent.day===day&&sent.id===visitor.id&&sent.modules&&sent.modules.indexOf(module)!==-1)return;
   pending=true;
   fetch("https://bboijzuzhgvfxqrsfatw.supabase.co/functions/v1/usage",{
    method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_IYGuSSUStiK95becoD-OQQ_aj_2sGIN"},
    body:JSON.stringify({day:day,visitor_id:visitor.id,module:module}),keepalive:true,credentials:"omit"
   }).then(function(response){
    if(!response.ok)return;
    try{
     var state=JSON.parse(sessionStorage.getItem(sentKey)||"null");
     if(!state||state.day!==day||state.id!==visitor.id)state={day:day,id:visitor.id,modules:[]};
     if(state.modules.indexOf(module)===-1)state.modules.push(module);
     sessionStorage.setItem(sentKey,JSON.stringify(state));
    }catch(e){}
   }).catch(function(){}).finally(function(){pending=false;});
  }catch(e){pending=false;}
 }
 track();
 document.addEventListener("visibilitychange",track);
 window.addEventListener("online",track);
})();
