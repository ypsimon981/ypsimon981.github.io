/* Simulation requests: publication never mutates availability; acceptance does. */
(function(root){
'use strict';
const sameShift=(a,b)=>!!a&&!!b&&['shift','vehicle','note'].every(k=>(a[k]||'')===(b[k]||''));
function sameDraft(draft={},published={}){const keys=Object.keys(draft);return keys.length===Object.keys(published).length&&keys.every(k=>sameShift(draft[k],published[k]));}
function availability(payload,week,driver,day){return payload.availability?.[week+'|'+driver]?.days?.find(d=>d.day===day)||{day,shift:'',note:''};}
function requestStatus(entry,currentShift){if(!entry)return 'none';if(entry.requestStatus)return entry.requestStatus;return entry.shift!==currentShift?'pending':'not_required';}
function requestToken(entry,publishedAt,key){return entry.requestId||JSON.stringify(['legacy',publishedAt||'',key,entry.shift,entry.vehicle||'',entry.note||'']);}
function publishRequests(payload,week,now,idFactory){
 const next=structuredClone(payload),p=next.office[week],old=p.published||{},published={};
 for(const [key,draft] of Object.entries(p.draft||{})){
  const [driver,day]=key.split('|'),current=availability(next,week,driver,day),previous=old[key];
  if(sameShift(draft,previous)&&previous.requestId){published[key]=structuredClone(previous);continue;}
  published[key]={...structuredClone(draft),requestId:idFactory(),previousShift:current.shift,requestedAt:now,requestStatus:draft.shift!==current.shift?'pending':'not_required'};
 }
 p.published=published;p.publishedAt=now;return next;
}
function respondToRequest(payload,{week,driver,day,token,accept,expectedShift,now,actor}){
 const next=structuredClone(payload),p=next.office?.[week],key=driver+'|'+day,entry=p?.published?.[key],current=availability(next,week,driver,day);
 if(!entry||requestToken(entry,p.publishedAt,key)!==token)throw Error('La richiesta è stata modificata o ritirata dall’ufficio. Ricarica le richieste.');
 if(requestStatus(entry,current.shift)!=='pending')throw Error('Questa richiesta ha già una risposta.');
 if(accept&&current.shift!==expectedShift)throw Error('La disponibilità è cambiata su un altro dispositivo. Controllala prima di accettare.');
 entry.requestId??=token;entry.previousShift??=current.shift;entry.requestStatus=accept?'accepted':'rejected';entry.respondedAt=now;entry.respondedBy=actor;entry.simulatedDriverId=driver;
 if(accept){
  next.availability??={};const record=next.availability[week+'|'+driver]||{days:[]},days=[...(record.days||[])];
  const index=days.findIndex(d=>d.day===day),updated={...(index<0?current:days[index]),day,shift:entry.shift};
  if(index<0)days.push(updated);else days[index]=updated;
  next.availability[week+'|'+driver]={...record,days,updatedAt:now};
 }
 return next;
}
const api={sameShift,sameDraft,requestStatus,requestToken,publishRequests,respondToRequest};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SWChangeRequests=api;
})(typeof window!=='undefined'?window:globalThis);
