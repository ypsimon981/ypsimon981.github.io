(function(){
  "use strict";
  function apply(){
    document.querySelectorAll(".sw-accountbar-release,.sw-entry-release").forEach(function(el){
      if(el.textContent!=="03/10/2026 · OPS-API-2") el.textContent="03/10/2026 · OPS-API-2";
    });
    var gate=document.querySelector(".sw-entry-card");
    if(gate && !gate.querySelector(".sw-tester-hint")){
      var hint=document.createElement("div");
      hint.className="sw-tester-hint";
      hint.textContent="Per chi ha ricevuto il link per testare l'app il codice di accesso è 0000";
      hint.style.cssText="margin:14px 0 4px;padding:11px 12px;border:1px solid rgba(255,255,255,.16);border-radius:12px;font-size:13px;line-height:1.4;text-align:center;color:#f5f1ec;background:#25292d";
      var input=gate.querySelector(".sw-entry-input");
      if(input) gate.insertBefore(hint,input);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply,{once:true});
  else apply();
  window.addEventListener("pageshow",apply);
})();
