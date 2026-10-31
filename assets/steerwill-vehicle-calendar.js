/* Server-backed vehicle calendar. Availability, priority and mandatory use are independent. */
(function(root){
'use strict';
const dayRecord=(records,id,day)=>records.find(r=>r.vehicle_id===id&&r.day===day);
function weekDefault(defaults,id,day){return defaults.filter(r=>r.vehicle_id===id&&r.effective_week<=day).sort((a,b)=>b.effective_week.localeCompare(a.effective_week))[0];}
const defaultState=base=>base?.state||(base?.excluded?'out_of_service':'available');
const nextVehicleState={available:'broken',broken:'maintenance',maintenance:'out_of_service',out_of_service:'available'};
function vehicleState(vehicle,day,records=[],maintenance=[],defaults=[]){
 const row=dayRecord(records,vehicle.id,day),period=maintenance.find(r=>r.vehicle_id===vehicle.id&&r.starts_on<=day&&(!r.ends_on||r.ends_on>=day));
 const base=weekDefault(defaults,vehicle.id,day),exception=defaultState(base)!=='available'&&row?.state==='available'&&!!base.revision&&row.week_default_revision===base.revision;
 let state=row?.state||'available',reason=row?.note||'';
 if(defaultState(base)!=='available'&&state==='available'&&!exception){state=defaultState(base);reason='Stato predefinito dalla settimana del '+base.effective_week;}
 if(period){state='maintenance';reason=period.note||'Manutenzione programmata';}
 if(!vehicle.active||vehicle.listed_in_service===false){state='inactive';reason=vehicle.operational_note||'Fuori servizio in anagrafica';}
 return {state,reason,period,row,base,exception:exception&&state==='available',available:state==='available',required_morning:!!row?.required_morning,required_afternoon:!!row?.required_afternoon};
}
const shiftPhases=shift=>shift==='long'?['m','p']:shift==='morning'?['m']:shift==='afternoon'?['p']:shift==='night'?['n']:[];
function fleetCapacity(vehicles,day,records=[],maintenance=[],defaults=[]){return vehicles.filter(v=>vehicleState(v,day,records,maintenance,defaults).available).length;}
function assignmentErrors(vehicles,day,shift,plate,records=[],maintenance=[],defaults=[]){
 if(!shiftPhases(shift).length)return [];
 const v=vehicles.find(v=>v.plate===plate);
 if(!v)return ['Veicolo non presente nell’anagrafica aziendale.'];
 const s=vehicleState(v,day,records,maintenance,defaults);
 return s.available?[]:[plate+' non assegnabile il '+day+': '+(s.reason||({broken:'guasto',maintenance:'manutenzione',out_of_service:'fuori servizio',inactive:'fuori servizio'}[s.state]))];
}
function requiredGaps(vehicles,days,draft={},records=[],maintenance=[],defaults=[]){
 const gaps=[];
 for(const day of days)for(const v of vehicles){const s=vehicleState(v,day,records,maintenance,defaults);
  for(const phase of ['m','p'])if(s[phase==='m'?'required_morning':'required_afternoon']){
   const covered=s.available&&Object.entries(draft).some(([key,shift])=>key.split('|')[1]===day&&shift.vehicle===v.plate&&shiftPhases(shift.shift).includes(phase));
   if(!covered)gaps.push({day,phase,plate:v.plate,blocked:!s.available});
  }
 }
 return gaps;
}
const rules={weekDefault,defaultState,nextVehicleState,vehicleState,fleetCapacity,assignmentErrors,requiredGaps,shiftPhases};
if(typeof module!=='undefined'&&module.exports){module.exports=rules;return;}
root.SWVehicleRules=rules;
const fmt=day=>new Date(day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
const add=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function newRevision(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
root.SWVehicleCalendar=class{
 constructor({cloud,container,onChange,getDraft}){this.cloud=cloud;this.container=container;this.onChange=onChange;this.getDraft=getDraft;this.rows=[];this.maintenance=[];this.defaults=[];this.week='';this.ready=false;this.busy=false;this.loadId=0;this.snapshot='';this.message='';this.isError=false;this.dialog=null;}
 vehicles(){return this.cloud.vehicleRows;}
 days(){return Array.from({length:7},(_,i)=>add(this.week,i));}
 state(v,day){return vehicleState(v,day,this.rows,this.maintenance,this.defaults);}
 capacity(day){return this.ready&&this.days().includes(day)?fleetCapacity(this.vehicles(),day,this.rows,this.maintenance,this.defaults):null;}
 gaps(draft=this.getDraft()){return this.ready?requiredGaps(this.vehicles(),this.days(),draft,this.rows,this.maintenance,this.defaults):[];}
 errors(day,shift,plate){return !this.ready?['Calendario mezzi non disponibile. Ricarica i dati dal server.']:assignmentErrors(this.vehicles(),day,shift,plate,this.rows,this.maintenance,this.defaults);}
 async load(week,{background=false}={}){
  if(this.busy)return false;
  const id=++this.loadId;this.week=week;
  if(!background){this.ready=false;this.onChange();}
  try{
   const company=encodeURIComponent(this.cloud.companyId),last=add(week,6);
   const [rows,maintenance,vehicles,defaults]=await Promise.all([
    this.cloud.api('/rest/v1/sw_vehicle_calendar?select=*&company_id=eq.'+company+'&day=gte.'+week+'&day=lte.'+last),
    this.cloud.api('/rest/v1/sw_maintenance?select=vehicle_id,starts_on,ends_on,note&company_id=eq.'+company+'&starts_on=lte.'+last+'&or=(ends_on.is.null,ends_on.gte.'+week+')'),
    this.cloud.api('/rest/v1/sw_vehicles?select=*&company_id=eq.'+company+'&order=plate.asc'),
    this.loadDefaults(company,week)
   ]);
   if(id!==this.loadId||this.busy)return false;
   this.cloud.vehicleRows=vehicles;this.cloud.vehicles=vehicles.map(v=>this.cloud.legacyVehicle(v));
   const snapshot=JSON.stringify([rows,maintenance,this.vehicles(),defaults]);const changed=this.snapshot!==snapshot||!this.ready;
   this.rows=rows;this.maintenance=maintenance;this.defaults=defaults;this.ready=true;this.snapshot=snapshot;
   if(changed)this.onChange();return true;
  }catch(e){if(id!==this.loadId)return false;this.ready=false;this.message=e.message;this.isError=true;this.onChange();return false;}
 }
 async loadDefaults(company,week){
  const result=[];for(let offset=0;;offset+=1000){const page=await this.cloud.api('/rest/v1/sw_vehicle_week_defaults?select=*&company_id=eq.'+company+'&effective_week=lte.'+week+'&order=effective_week.desc,vehicle_id.asc&limit=1000&offset='+offset);result.push(...page);if(page.length<1000)return result;}
 }
 setMessage(message,bad=false){this.message=message;this.isError=bad;}
 async saveCell(vehicle,day,patch){
  if(this.busy||!this.ready)return false;
  const previous=dayRecord(this.rows,vehicle.id,day);
  const body={company_id:this.cloud.companyId,vehicle_id:vehicle.id,day,state:previous?.state||'available',required_morning:previous?.required_morning||false,required_afternoon:previous?.required_afternoon||false,note:previous?.note||'',...patch,week_default_revision:patch.state==='available'?(weekDefault(this.defaults,vehicle.id,day)?.revision||null):(previous?.week_default_revision||null),version:(previous?.version||0)+1,updated_at:new Date().toISOString()};
  this.loadId++;this.busy=true;this.setMessage('Salvataggio calendario sul server…');this.render();
  try{
   const query=previous?'?company_id=eq.'+this.cloud.companyId+'&vehicle_id=eq.'+vehicle.id+'&day=eq.'+day+'&version=eq.'+previous.version:'';
   const rows=await this.cloud.api('/rest/v1/sw_vehicle_calendar'+query,{method:previous?'PATCH':'POST',body,headers:{Prefer:'return=representation'}});
   if(rows.length!==1)throw Error('Calendario modificato da un altro dispositivo. Ricarica e riprova.');
   this.rows=this.rows.filter(r=>r.vehicle_id!==vehicle.id||r.day!==day);this.rows.push(rows[0]);this.setMessage(vehicle.plate+' · '+fmt(day)+' salvato sul server.');return true;
  }catch(e){this.setMessage(e.status===409?'Un altro dispositivo ha modificato questa giornata. Ricarica il calendario.':e.message,true);return false;}
  finally{this.busy=false;this.onChange();}
 }
 async saveWeekDefault(vehicle,state){
  if(this.busy||!this.ready)return false;
  const week=this.week,previous=this.defaults.find(r=>r.vehicle_id===vehicle.id&&r.effective_week===week);
  const body={company_id:this.cloud.companyId,vehicle_id:vehicle.id,effective_week:week,state,excluded:state!=='available',revision:newRevision(),version:(previous?.version||0)+1,updated_at:new Date().toISOString()};
  this.loadId++;this.busy=true;this.setMessage('Salvataggio disponibilità dalla settimana selezionata…');this.render();
  try{
   const query=previous?'?company_id=eq.'+this.cloud.companyId+'&vehicle_id=eq.'+vehicle.id+'&effective_week=eq.'+week+'&version=eq.'+previous.version:'';
   const rows=await this.cloud.api('/rest/v1/sw_vehicle_week_defaults'+query,{method:previous?'PATCH':'POST',body,headers:{Prefer:'return=representation'}});
   if(rows.length!==1)throw Error('Disponibilità modificata da un altro dispositivo. Ricarica e riprova.');
   this.defaults=this.defaults.filter(r=>r.vehicle_id!==vehicle.id||r.effective_week!==week);this.defaults.push(rows[0]);
   this.setMessage(vehicle.plate+': '+({available:'marciante',broken:'guasto',maintenance:'manutenzione programmata',out_of_service:'fuori servizio'}[state])+' dalla settimana del '+fmt(week)+'. Le singole giornate possono essere modificate.');return true;
  }catch(e){this.setMessage(e.status===409?'Un altro dispositivo ha modificato questa settimana. Ricarica il calendario.':e.message,true);return false;}
  finally{this.busy=false;this.onChange();}
 }
 async savePriority(vehicle,value){
  if(this.busy)return;this.loadId++;this.busy=true;this.setMessage('Salvataggio priorità…');this.render();
  try{const rows=await this.cloud.api('/rest/v1/sw_vehicles?company_id=eq.'+this.cloud.companyId+'&id=eq.'+vehicle.id+'&data_version=eq.'+vehicle.data_version,{method:'PATCH',body:{priority:Number(value),data_version:vehicle.data_version+1},headers:{Prefer:'return=representation'}});
   if(rows.length!==1)throw Error('Priorità modificata su un altro dispositivo. Ricarica il calendario.');
   const i=this.cloud.vehicleRows.findIndex(v=>v.id===vehicle.id);this.cloud.vehicleRows[i]=rows[0];this.cloud.vehicles=this.cloud.vehicleRows.map(v=>this.cloud.legacyVehicle(v));this.setMessage(vehicle.plate+': priorità '+value+' salvata sul server.');
  }catch(e){this.setMessage(e.message,true)}finally{this.busy=false;this.onChange();}
 }
 render(){
  const root=this.container;
  root.replaceChildren();const status=element('p',this.message||(!this.ready?'Caricamento calendario dal server…':'Calendario caricato dal server. Le modifiche si salvano automaticamente.'),this.isError?'status error':'status');status.id='vehicle-calendar-status';status.setAttribute('role','status');root.append(status);
  if(!this.ready){const retry=element('button','Ricarica calendario','secondary');retry.onclick=()=>this.load(this.week);root.append(retry);return;}
  const wrap=element('div',undefined,'vehicle-calendar-box'),table=element('table',undefined,'vehicle-calendar'),head=element('thead'),tr=element('tr');tr.append(element('th','Targa · priorità'));this.days().forEach((d,i)=>{const th=element('th',['Lun','Mar','Mer','Gio','Ven','Sab','Dom'][i]+' '+fmt(d));th.dataset.calendarDay=d;tr.append(th)});head.append(tr);table.append(head);const body=element('tbody');
  const stateNames={available:'marciante',broken:'guasto',maintenance:'manutenzione programmata',out_of_service:'fuori servizio',inactive:'fuori servizio'};
  const paths={available:'<path d="m5 12 4 4L19 6"/>',broken:'<path d="M14.5 6.5a5 5 0 0 0-6.2 6.2L3 18a2.1 2.1 0 0 0 3 3l5.3-5.3a5 5 0 0 0 6.2-6.2L14 13l-3-3z"/>',maintenance:'<rect x="3" y="4" width="17" height="17" rx="2"/><path d="M7 2v4m9-4v4M3 9h17"/><path d="M15 11a3 3 0 0 0-3.8 3.8L8 18a1.4 1.4 0 0 0 2 2l3.2-3.2A3 3 0 0 0 17 13l-2 2-2-2z"/>',out_of_service:'<path d="m6 6 12 12M18 6 6 18"/>',inactive:'<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>'};
  for(const vehicle of [...this.vehicles()].sort((a,b)=>a.plate.localeCompare(b.plate))){
   const row=element('tr'),th=element('th');th.scope='row';const title=element('div',undefined,'vehicle-title'),defaultButton=element('button',undefined,'vehicle-maintenance vehicle-default'),baseState=defaultState(weekDefault(this.defaults,vehicle.id,this.week));defaultButton.type='button';defaultButton.id='vehicle-default-'+vehicle.id;defaultButton.disabled=this.busy;defaultButton.dataset.state=baseState;defaultButton.setAttribute('aria-label',vehicle.plate+' stato predefinito: '+stateNames[baseState]);defaultButton.title='Stato predefinito da questa settimana: '+stateNames[baseState]+'. Clic per cambiare.';defaultButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[baseState]+'</svg>';defaultButton.onclick=()=>this.saveWeekDefault(vehicle,nextVehicleState[baseState]);const identity=element('div',undefined,'vehicle-identity'),controls=element('div',undefined,'vehicle-mini-controls');const seatValue=vehicle.technical_details?.seats||vehicle.technical_details?.posti||String(vehicle.category||'').match(/(\d+)\s*(?:PAX|POSTI)/i)?.[1];identity.append(element('strong',vehicle.plate),element('span',vehicle.description||vehicle.model||vehicle.category||'Modello n.d.','vehicle-model'),element('small',seatValue?seatValue+' posti':'posti n.d.','vehicle-seats'));const level=Math.max(1,Math.min(5,Number(vehicle.priority)||3)),priority=element('button','P'+level,'vehicle-priority-toggle');priority.type='button';priority.id='vehicle-priority-'+vehicle.id;priority.dataset.priority=level;priority.setAttribute('aria-label',vehicle.plate+' priorità '+level+'. Tocca per passare a '+(level%5+1));priority.title='Priorità '+level+(level===1?' · prima scelta':level===5?' · ultima scelta':'')+'. Clic per cambiare (1–5).';priority.disabled=this.busy;priority.onclick=()=>this.savePriority(vehicle,level%5+1);controls.append(defaultButton,priority);title.append(identity,controls);th.append(title);if(!vehicle.active||vehicle.listed_in_service===false)th.append(element('small','Fuori servizio','error'));row.append(th);
   for(const day of this.days()){
    const state=this.state(vehicle,day),td=element('td'),slot=element('div',undefined,'vehicle-slot');slot.dataset.plate=vehicle.plate;slot.dataset.day=day;
    const available=element('button','Disp.','vehicle-available'),middle=element('div',undefined,'vehicle-required'),maintenance=element('button',undefined,'vehicle-maintenance');
    available.title='Marciante, disponibile per entrambe le fasce';available.setAttribute('aria-label',vehicle.plate+' '+day+' disponibile');available.setAttribute('aria-pressed',state.available);available.disabled=this.busy||!!state.period||state.state==='inactive';available.onclick=()=>this.saveCell(vehicle,day,{state:'available',note:''});
    for(const phase of ['m','p']){const key=phase==='m'?'required_morning':'required_afternoon',button=element('button',phase==='m'?'AM':'PM','vehicle-required-'+phase);button.setAttribute('aria-label',vehicle.plate+' '+day+' obbligo '+(phase==='m'?'AM':'PM'));button.title='Uso obbligatorio '+(phase==='m'?'mattina':'pomeriggio');button.setAttribute('aria-pressed',state[key]);button.disabled=this.busy||(!state.available&&!state[key]);button.onclick=()=>this.saveCell(vehicle,day,{[key]:!state[key]});middle.append(button);}
    maintenance.dataset.state=state.state;maintenance.setAttribute('aria-label',vehicle.plate+' '+day+' stato: '+stateNames[state.state]);maintenance.title=state.reason||('Stato: '+stateNames[state.state]+'. Clic per cambiare.');maintenance.disabled=this.busy||!!state.period||state.state==='inactive';
    maintenance.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[state.state]+'</svg>';
    maintenance.onclick=()=>{const next=nextVehicleState[state.state];const patch={state:next};if(next!=='available'){patch.required_morning=false;patch.required_afternoon=false;}else patch.note='';this.saveCell(vehicle,day,patch);};
    td.dataset.calendarDay=day;slot.append(available,middle,maintenance);td.append(slot);if(state.reason||state.exception)td.append(element('small',state.exception?'Eccezione: disponibile solo oggi':state.reason,'vehicle-reason'));row.append(td);
   }body.append(row);
  }
  table.append(body);wrap.append(table);const filter=element('div',undefined,'vehicle-day-filter');const label=element('label','Giorno del calendario mezzi');label.htmlFor='vehicle-calendar-day';const daySelect=element('select');daySelect.id=label.htmlFor;for(const day of this.days()){const o=element('option',fmt(day));o.value=day;daySelect.append(o);}if(!this.days().includes(this.selectedDay))this.selectedDay=this.days()[0];daySelect.value=this.selectedDay;const filterDays=()=>root.querySelectorAll('[data-calendar-day]').forEach(e=>e.dataset.active=String(e.dataset.calendarDay===this.selectedDay));daySelect.onchange=()=>{this.selectedDay=daySelect.value;filterDays();};filter.append(label,daySelect);root.append(filter,wrap);filterDays();
  const actions=element('div',undefined,'actions'),reload=element('button','Ricarica dal server','secondary');reload.disabled=this.busy;reload.onclick=()=>this.load(this.week);actions.append(reload);root.append(actions);
 }
};
})(typeof window!=='undefined'?window:globalThis);
