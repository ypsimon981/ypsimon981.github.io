/* Server-backed vehicle calendar. Availability, priority and mandatory use are independent. */
(function(root){
'use strict';
const dayRecord=(records,id,day)=>records.find(r=>r.vehicle_id===id&&r.day===day);
function vehicleState(vehicle,day,records=[],maintenance=[]){
 const row=dayRecord(records,vehicle.id,day),period=maintenance.find(r=>r.vehicle_id===vehicle.id&&r.starts_on<=day&&(!r.ends_on||r.ends_on>=day));
 let state=row?.state||'available',reason=row?.note||'';
 if(period){state='maintenance';reason=period.note||'Manutenzione programmata';}
 if(!vehicle.active||vehicle.listed_in_service===false){state='inactive';reason=vehicle.operational_note||'Fuori servizio in anagrafica';}
 return {state,reason,period,row,available:state==='available',required_morning:!!row?.required_morning,required_afternoon:!!row?.required_afternoon};
}
const shiftPhases=shift=>shift==='long'?['m','p']:shift==='morning'?['m']:shift==='afternoon'?['p']:shift==='night'?['n']:[];
function fleetCapacity(vehicles,day,records=[],maintenance=[]){return vehicles.filter(v=>vehicleState(v,day,records,maintenance).available).length;}
function assignmentErrors(vehicles,day,shift,plate,records=[],maintenance=[]){
 if(!shiftPhases(shift).length)return [];
 const v=vehicles.find(v=>v.plate===plate);
 if(!v)return ['Veicolo non presente nell’anagrafica aziendale.'];
 const s=vehicleState(v,day,records,maintenance);
 return s.available?[]:[plate+' non assegnabile il '+day+': '+(s.reason||({broken:'guasto',maintenance:'manutenzione',inactive:'fuori servizio'}[s.state]))];
}
function requiredGaps(vehicles,days,draft={},records=[],maintenance=[]){
 const gaps=[];
 for(const day of days)for(const v of vehicles){const s=vehicleState(v,day,records,maintenance);
  for(const phase of ['m','p'])if(s[phase==='m'?'required_morning':'required_afternoon']){
   const covered=s.available&&Object.entries(draft).some(([key,shift])=>key.split('|')[1]===day&&shift.vehicle===v.plate&&shiftPhases(shift.shift).includes(phase));
   if(!covered)gaps.push({day,phase,plate:v.plate,blocked:!s.available});
  }
 }
 return gaps;
}
const rules={vehicleState,fleetCapacity,assignmentErrors,requiredGaps,shiftPhases};
if(typeof module!=='undefined'&&module.exports){module.exports=rules;return;}
root.SWVehicleRules=rules;
const fmt=day=>new Date(day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
const add=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
root.SWVehicleCalendar=class{
 constructor({cloud,container,onChange,getDraft}){this.cloud=cloud;this.container=container;this.onChange=onChange;this.getDraft=getDraft;this.rows=[];this.maintenance=[];this.week='';this.ready=false;this.busy=false;this.loadId=0;this.snapshot='';this.message='';this.isError=false;this.dialog=null;}
 vehicles(){return this.cloud.vehicleRows;}
 days(){return Array.from({length:7},(_,i)=>add(this.week,i));}
 state(v,day){return vehicleState(v,day,this.rows,this.maintenance);}
 capacity(day){return this.ready&&this.days().includes(day)?fleetCapacity(this.vehicles(),day,this.rows,this.maintenance):null;}
 gaps(draft=this.getDraft()){return this.ready?requiredGaps(this.vehicles(),this.days(),draft,this.rows,this.maintenance):[];}
 errors(day,shift,plate){return !this.ready?['Calendario mezzi non disponibile. Ricarica i dati dal server.']:assignmentErrors(this.vehicles(),day,shift,plate,this.rows,this.maintenance);}
 async load(week,{background=false}={}){
  if(this.busy)return false;
  const id=++this.loadId;this.week=week;
  if(!background){this.ready=false;this.onChange();}
  try{
   const company=encodeURIComponent(this.cloud.companyId),last=add(week,6);
   const [rows,maintenance,vehicles]=await Promise.all([
    this.cloud.api('/rest/v1/sw_vehicle_calendar?select=*&company_id=eq.'+company+'&day=gte.'+week+'&day=lte.'+last),
    this.cloud.api('/rest/v1/sw_maintenance?select=vehicle_id,starts_on,ends_on,note&company_id=eq.'+company+'&starts_on=lte.'+last+'&or=(ends_on.is.null,ends_on.gte.'+week+')'),
    this.cloud.api('/rest/v1/sw_vehicles?select=*&company_id=eq.'+company+'&order=plate.asc')
   ]);
   if(id!==this.loadId||this.busy)return false;
   this.cloud.vehicleRows=vehicles;this.cloud.vehicles=vehicles.map(v=>this.cloud.legacyVehicle(v));
   const snapshot=JSON.stringify([rows,maintenance,this.vehicles()]);const changed=this.snapshot!==snapshot||!this.ready;
   this.rows=rows;this.maintenance=maintenance;this.ready=true;this.snapshot=snapshot;
   if(changed)this.onChange();return true;
  }catch(e){if(id!==this.loadId)return false;this.ready=false;this.message=e.message;this.isError=true;this.onChange();return false;}
 }
 setMessage(message,bad=false){this.message=message;this.isError=bad;}
 async saveCell(vehicle,day,patch){
  if(this.busy||!this.ready)return false;
  const previous=dayRecord(this.rows,vehicle.id,day);
  const body={company_id:this.cloud.companyId,vehicle_id:vehicle.id,day,state:previous?.state||'available',required_morning:previous?.required_morning||false,required_afternoon:previous?.required_afternoon||false,note:previous?.note||'',...patch,version:(previous?.version||0)+1,updated_at:new Date().toISOString()};
  this.loadId++;this.busy=true;this.setMessage('Salvataggio calendario sul server…');this.render();
  try{
   const query=previous?'?company_id=eq.'+this.cloud.companyId+'&vehicle_id=eq.'+vehicle.id+'&day=eq.'+day+'&version=eq.'+previous.version:'';
   const rows=await this.cloud.api('/rest/v1/sw_vehicle_calendar'+query,{method:previous?'PATCH':'POST',body,headers:{Prefer:'return=representation'}});
   if(rows.length!==1)throw Error('Calendario modificato da un altro dispositivo. Ricarica e riprova.');
   this.rows=this.rows.filter(r=>r.vehicle_id!==vehicle.id||r.day!==day);this.rows.push(rows[0]);this.setMessage(vehicle.plate+' · '+fmt(day)+' salvato sul server.');return true;
  }catch(e){this.setMessage(e.status===409?'Un altro dispositivo ha modificato questa giornata. Ricarica il calendario.':e.message,true);return false;}
  finally{this.busy=false;this.onChange();}
 }
 async savePriority(vehicle,value){
  if(this.busy)return;this.loadId++;this.busy=true;this.setMessage('Salvataggio priorità…');this.render();
  try{const rows=await this.cloud.api('/rest/v1/sw_vehicles?company_id=eq.'+this.cloud.companyId+'&id=eq.'+vehicle.id+'&data_version=eq.'+vehicle.data_version,{method:'PATCH',body:{priority:Number(value),data_version:vehicle.data_version+1},headers:{Prefer:'return=representation'}});
   if(rows.length!==1)throw Error('Priorità modificata su un altro dispositivo. Ricarica il calendario.');
   const i=this.cloud.vehicleRows.findIndex(v=>v.id===vehicle.id);this.cloud.vehicleRows[i]=rows[0];this.cloud.vehicles=this.cloud.vehicleRows.map(v=>this.cloud.legacyVehicle(v));this.setMessage(vehicle.plate+': priorità '+value+' salvata sul server.');
  }catch(e){this.setMessage(e.message,true)}finally{this.busy=false;this.onChange();}
 }
 openStateDialog(vehicle,day){
  if(this.busy)return;this.dialog?.remove();const state=this.state(vehicle,day),dialog=element('dialog',undefined,'vehicle-dialog');this.dialog=dialog;
  const form=element('form'),title=element('h2',vehicle.plate+' · '+fmt(day));title.id='vehicle-dialog-title';dialog.setAttribute('aria-labelledby',title.id);
  const label=element('label','Stato del mezzo');label.htmlFor='vehicle-day-state';const select=element('select');select.id=label.htmlFor;
  for(const [value,text] of [['available','Marciante / disponibile'],['maintenance','Manutenzione programmata'],['broken','Fermo per guasto']]){const o=element('option',text);o.value=value;select.append(o);}
  select.value=['maintenance','broken'].includes(state.state)?state.state:'maintenance';
  const nl=element('label','Nota del fermo');nl.htmlFor='vehicle-day-note';const note=element('textarea');note.id=nl.htmlFor;note.maxLength=1000;note.rows=3;note.value=state.reason;
  const actions=element('div',undefined,'actions'),cancel=element('button','Annulla','secondary'),save=element('button','Salva stato');cancel.type='button';save.type='submit';cancel.onclick=()=>dialog.close();actions.append(cancel,save);
  form.append(title,label,select,nl,note);
  if(state.period||state.state==='inactive'){form.append(element('p',state.period?'Fermo registrato in manutenzione: questo periodo prevale sul calendario.':'Mezzo escluso dall’anagrafica: non può rientrare nelle assegnazioni dal calendario.','error'));select.disabled=true;save.disabled=true;}
  form.append(actions);dialog.append(form);document.body.append(dialog);dialog.showModal();
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;cancel.disabled=true;const patch={state:select.value,note:note.value};if(select.value!=='available'){patch.required_morning=false;patch.required_afternoon=false;}const ok=await this.saveCell(vehicle,day,patch);if(ok)dialog.close();else{save.disabled=false;cancel.disabled=false;form.querySelector('[role=alert]')?.remove();const error=element('p',this.message,'error');error.setAttribute('role','alert');form.append(error);}};
  dialog.addEventListener('close',()=>{dialog.remove();if(this.dialog===dialog)this.dialog=null;},{once:true});
 }
 render(){
  const root=this.container,scroll=root.querySelector('.vehicle-calendar-scroll'),position=scroll?{top:scroll.scrollTop,left:scroll.scrollLeft}:null;
  root.replaceChildren();const status=element('p',this.message||(!this.ready?'Caricamento calendario dal server…':'Calendario caricato dal server. Le modifiche si salvano automaticamente.'),this.isError?'status error':'status');status.id='vehicle-calendar-status';status.setAttribute('role','status');root.append(status);
  if(!this.ready){const retry=element('button','Ricarica calendario','secondary');retry.onclick=()=>this.load(this.week);root.append(retry);return;}
  const wrap=element('div',undefined,'tablewrap vehicle-calendar-scroll'),table=element('table',undefined,'vehicle-calendar'),head=element('thead'),tr=element('tr');tr.append(element('th','Targa · priorità'));this.days().forEach((d,i)=>tr.append(element('th',['Lun','Mar','Mer','Gio','Ven','Sab','Dom'][i]+' '+fmt(d))));head.append(tr);table.append(head);const body=element('tbody');
  for(const vehicle of [...this.vehicles()].sort((a,b)=>a.plate.localeCompare(b.plate))){
   const row=element('tr'),th=element('th');th.scope='row';th.append(element('strong',vehicle.plate));const label=element('label','Priorità');label.htmlFor='vehicle-priority-'+vehicle.id;const priority=element('select');priority.id=label.htmlFor;priority.setAttribute('aria-label','Priorità '+vehicle.plate);
   for(let i=1;i<=5;i++){const option=element('option',i+(i===1?' · prima scelta':i===5?' · ultima scelta':''));option.value=i;priority.append(option);}priority.value=vehicle.priority;priority.disabled=this.busy;priority.onchange=()=>this.savePriority(vehicle,priority.value);th.append(label,priority);if(!vehicle.active||vehicle.listed_in_service===false)th.append(element('small','Fuori servizio','error'));row.append(th);
   for(const day of this.days()){
    const state=this.state(vehicle,day),td=element('td'),slot=element('div',undefined,'vehicle-slot');slot.dataset.plate=vehicle.plate;slot.dataset.day=day;
    const available=element('button','Disp.','vehicle-available'),middle=element('div',undefined,'vehicle-required'),maintenance=element('button',state.state==='broken'?'Guasto':state.state==='inactive'?'Escl.':'🔧','vehicle-maintenance');
    available.title='Marciante, disponibile per entrambe le fasce';available.setAttribute('aria-label',vehicle.plate+' '+day+' disponibile');available.setAttribute('aria-pressed',state.available);available.disabled=this.busy||!!state.period||state.state==='inactive';available.onclick=()=>this.saveCell(vehicle,day,{state:'available',note:''});
    for(const phase of ['m','p']){const key=phase==='m'?'required_morning':'required_afternoon',button=element('button',phase==='m'?'AM':'PM','vehicle-required-'+phase);button.setAttribute('aria-label',vehicle.plate+' '+day+' obbligo '+(phase==='m'?'AM':'PM'));button.title='Uso obbligatorio '+(phase==='m'?'mattina':'pomeriggio');button.setAttribute('aria-pressed',state[key]);button.disabled=this.busy||(!state.available&&!state[key]);button.onclick=()=>this.saveCell(vehicle,day,{[key]:!state[key]});middle.append(button);}
    maintenance.setAttribute('aria-label',vehicle.plate+' '+day+' fermo o manutenzione');maintenance.setAttribute('aria-pressed',!state.available);maintenance.title=state.reason||'Fermo per guasto o manutenzione programmata';maintenance.disabled=this.busy;maintenance.onclick=()=>this.openStateDialog(vehicle,day);slot.append(available,middle,maintenance);td.append(slot);if(state.reason)td.append(element('small',state.reason,'vehicle-reason'));row.append(td);
   }body.append(row);
  }
  table.append(body);wrap.append(table);root.append(wrap);if(position){wrap.scrollTop=position.top;wrap.scrollLeft=position.left;}
  const actions=element('div',undefined,'actions'),reload=element('button','Ricarica dal server','secondary');reload.disabled=this.busy;reload.onclick=()=>this.load(this.week);actions.append(reload);root.append(actions);
 }
};
})(typeof window!=='undefined'?window:globalThis);
