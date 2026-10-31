/* Simulation requests: publication never mutates availability; acceptance does. */
(function(root){
'use strict';
const sameShift=(a,b)=>!!a&&!!b&&['shift','vehicle','note'].every(k=>(a[k]||'')===(b[k]||''));
function sameDraft(draft={},published={}){const keys=Object.keys(draft);return keys.length===Object.values(published).filter(e=>e.kind!=='availability_change').length&&keys.every(k=>sameShift(draft[k],published[k]));}
function availability(payload,week,driver,day){return payload.availability?.[week+'|'+driver]?.days?.find(d=>d.day===day)||{day,shift:'',note:''};}
const forcedCodes={long:'r1',morning:'rm',afternoon:'rp'};
function forcedRest(plan,driver,day){return plan?.forcedRest?.[driver+'|'+day]||null;}
function effectiveShift(plan,driver,day,originalShift){return forcedRest(plan,driver,day)?'off':originalShift;}
function setForcedRest(payload,{week,driver,day,enabled,now,actor}){
 const next=structuredClone(payload);next.office??={};const p=next.office[week]??={draft:{},published:null};p.forcedRest??={};const key=driver+'|'+day;
 if(enabled){const original=availability(next,week,driver,day);if(!forcedCodes[original.shift])throw Error('Il riposo forzato si applica solo a Lunga, AM o PM.');if(!p.forcedRest[key])p.forcedRest[key]={originalShift:original.shift,code:forcedCodes[original.shift],createdAt:now,createdBy:actor};}
 else delete p.forcedRest[key];
 return next;
}
function activeDraft(plan){return Object.fromEntries(Object.entries(plan?.draft||{}).filter(([key])=>!plan.forcedRest?.[key]));}
function requestStatus(entry,currentShift){if(!entry)return 'none';if(entry.requestStatus)return entry.requestStatus;return entry.shift!==currentShift?'pending':'not_required';}
function requestToken(entry,publishedAt,key){return entry.requestId||JSON.stringify(['legacy',publishedAt||'',key,entry.shift,entry.vehicle||'',entry.note||'']);}
function publishRequests(payload,week,now,idFactory){
 const next=structuredClone(payload),p=next.office[week],old=p.published||{},published=Object.fromEntries(Object.entries(old).filter(([key,entry])=>entry.kind==='availability_change'&&!p.draft?.[key]));
 for(const [key,draft] of Object.entries(p.draft||{})){
  const [driver,day]=key.split('|'),current=availability(next,week,driver,day),previous=old[key];
  if(sameShift(draft,previous)&&previous.requestId){published[key]=structuredClone(previous);continue;}
  published[key]={...structuredClone(draft),requestId:idFactory(),previousShift:current.shift,requestedAt:now,requestStatus:draft.shift!==current.shift?'pending':'not_required'};
 }
 p.published=published;p.publishedAt=now;return next;
}
function setChangeDraft(payload,{week,driver,day,shift}){
 if(!['long','morning','afternoon','off','unavailable'].includes(shift))throw Error('Disponibilità richiesta non valida.');
 if(day<week||day>new Date(new Date(week+'T12:00:00Z').getTime()+6*86400000).toISOString().slice(0,10))throw Error('Giorno fuori dalla settimana.');
 const next=structuredClone(payload);next.office??={};const p=next.office[week]??={draft:{},published:null};
 if(forcedRest(p,driver,day))throw Error('Revoca il riposo forzato prima di richiedere una modifica.');
 p.changeDrafts??={};const key=driver+'|'+day,current=availability(next,week,driver,day);
 if(shift===current.shift)delete p.changeDrafts[key];
 else p.changeDrafts[key]={shift,previousShift:current.shift};
 return next;
}
function sendWeekRequests(payload,{week,driver,now,idFactory}){
 const next=structuredClone(payload),p=next.office?.[week];
 const edits=Object.entries(p?.changeDrafts||{}).filter(([key])=>key.split('|')[0]===driver);
 if(!edits.length)throw Error('Seleziona almeno una modifica da inviare.');
 p.published??={};let count=0;
 for(const [key,edit] of edits){const day=key.split('|')[1],current=availability(next,week,driver,day);
  if(forcedRest(p,driver,day))throw Error('Una giornata è in riposo forzato. Revocalo prima di inviare.');
  if(current.shift!==edit.previousShift)throw Error('La disponibilità del '+day+' è cambiata. Rivedi il toggle prima di inviare.');
  if(!['long','morning','afternoon','off','unavailable'].includes(edit.shift))throw Error('Disponibilità richiesta non valida.');
  if(current.shift===edit.shift){delete p.changeDrafts[key];continue;}
  const previous=p.published[key],note=(p.changeMessages?.[driver]||'').trim();
  if(previous&&requestStatus(previous,current.shift)==='pending'&&previous.shift===edit.shift&&previous.note===note){delete p.changeDrafts[key];continue;}
  p.published[key]={kind:'availability_change',shift:edit.shift,vehicle:'',note,previousShift:current.shift,requestId:idFactory(),requestedAt:now,requestStatus:'pending'};
  delete p.changeDrafts[key];count++;
 }
 if(!count)throw Error('Queste modifiche sono già in attesa di risposta.');
 p.publishedAt=now;if(p.changeMessages)delete p.changeMessages[driver];return next;
}
function respondToRequest(payload,{week,driver,day,token,accept,expectedShift,now,actor}){
 const next=structuredClone(payload),p=next.office?.[week],key=driver+'|'+day,entry=p?.published?.[key],current=availability(next,week,driver,day);
 if(!entry||requestToken(entry,p.publishedAt,key)!==token)throw Error('La richiesta è stata modificata o ritirata dall’ufficio. Ricarica le richieste.');
 if(requestStatus(entry,current.shift)!=='pending')throw Error('Questa richiesta ha già una risposta.');
 if(accept&&forcedRest(p,driver,day))throw Error('Riposo imposto dall’azienda: la richiesta è sospesa fino alla revoca.');
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
const api={setChangeDraft,sendWeekRequests,forcedCodes,forcedRest,effectiveShift,setForcedRest,activeDraft,sameShift,sameDraft,requestStatus,requestToken,publishRequests,respondToRequest};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SWChangeRequests=api;
})(typeof window!=='undefined'?window:globalThis);
