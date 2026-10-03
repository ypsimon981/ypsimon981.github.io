(function(){
"use strict";
function enhance(){
  var gate=document.querySelector(".sw-entry-card");
  if(gate&&!gate.querySelector(".sw-tester-hint")){
    var hint=document.createElement("div");
    hint.className="sw-tester-hint";
    hint.textContent="Per chi ha ricevuto il link per testare l’app il codice di accesso è 0000";
    hint.style.cssText="margin:14px 0 4px;padding:11px 12px;border:1px solid #555;border-radius:12px;font-size:13px;line-height:1.4;text-align:center;color:#f5f1ec;background:#25292d";
    var input=gate.querySelector(".sw-entry-input");
    if(input) gate.insertBefore(hint,input);
  }
  var select=document.querySelector(".sw-profile-select");
  if(select&&!select.querySelector('option[value="api"]')){
    var option=document.createElement("option");
    option.value="api"; option.textContent="API Test"; select.appendChild(option);
    select.addEventListener("change",function(e){
      if(e.target.value==="api"){
        try{localStorage.setItem("steerwill.profile.v1","api");}catch(err){}
        location.href="nccgest-test.html?release=2026.10.03-apitest";
      }
    },true);
  }
}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",enhance);else enhance();
})();