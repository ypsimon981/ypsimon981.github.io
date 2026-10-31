/* Manual weekly allocations. Availability requests and fleet calendar stay independent. */
(function(root){
'use strict';
function planningOrder(v){const n=Number(v.technical_details?.planning_order);return Number.isInteger(n)&&n>0?n:Number.MAX_SAFE_INTEGER;}
function orderedVehicles(vehicles){return [...vehicles].sort((a,b)=>planningOrder(a)-planningOrder(b)||a.plate.localeCompare(b.plate));}
function garageLabel(v){const value=v.technical_details?.garage;return typeof value==='string'&&value.trim()?value.trim():'Garage n.d.';}
const phases=s=>s==='long'?['m','p']:s==='morning'?['m']:s==='afternoon'?['p']:[];
const phaseName=phase=>phase==='m'?'AM':'PM';
const cellKey=(day,phase,plate)=>day+'|'+phase+'|'+plate;
function allocations(plan={}){
 if(plan.assignments!==undefined)return structuredClone(plan.assignments||{});
 const cells={};for(const [key,s] of Object.entries(plan.draft||{})){const [driver,day]=key.split('|');if(plan.forcedRest?.[key]||!s.vehicle)continue;for(const phase of phases(s.shift)){const k=cellKey(day,phase,s.vehicle);if(cells[k]){cells[k]={kind:'conflict',drivers:[...(cells[k].drivers||[cells[k].driver]),driver]};}else cells[k]={kind:'driver',driver};}}
 return cells;
}
function eligible(ctx,plan,driver,day,phase){return ctx.drivers.some(d=>d.id===driver&&d.active)&&!plan.forcedRest?.[driver+'|'+day]&&phases(ctx.availability(driver,day).shift).includes(phase);}
function cellErrors(ctx,plan,key,value,cells=allocations(plan)){
 const [day,phase,plate]=key.split('|'),v=ctx.vehicles.find(v=>v.plate===plate),errors=[];
 if(!ctx.days.includes(day)||!['m','p'].includes(phase))return ['Cella fuori dalla settimana.'];
 if(!v)return [plate+': veicolo non presente in flotta.'];
 const state=ctx.state(v,day);
 if(!state.available)errors.push(plate+': '+(state.reason||{broken:'guasto',maintenance:'manutenzione',out_of_service:'fuori servizio',inactive:'non attivo'}[state.state]||'non disponibile'));
 if(value.kind==='parked'){if(state[phase==='m'?'required_morning':'required_afternoon'])errors.push(plate+': obbligo di utilizzo '+phaseName(phase)+'.');return errors;}
 if(value.kind!=='driver')return [...errors,plate+': assegnazione in conflitto da correggere.'];
 if(!eligible(ctx,plan,value.driver,day,phase))errors.push(ctx.name(value.driver)+': disponibilità incompatibile o riposo imposto.');
 if(Object.entries(cells).some(([k,e])=>k!==key&&k.startsWith(day+'|'+phase+'|')&&e.kind==='driver'&&e.driver===value.driver))errors.push(ctx.name(value.driver)+': già assegnato nella stessa fascia.');
 return errors;
}
function validate(ctx,plan,cells=allocations(plan),checkRequired=true){
 const errors=[];for(const [key,value] of Object.entries(cells))errors.push(...cellErrors(ctx,plan,key,value,cells).map(e=>key.split('|')[0]+' '+key.split('|')[1].toUpperCase()+' · '+e));
 if(checkRequired)for(const day of ctx.days)for(const v of ctx.vehicles){const state=ctx.state(v,day);for(const phase of ['m','p'])if(state[phase==='m'?'required_morning':'required_afternoon']){const k=cellKey(day,phase,v.plate),entry=cells[k];if(!entry||entry.kind!=='driver'||cellErrors(ctx,plan,k,entry,cells).length)errors.push(day+' '+phaseName(phase)+' · '+v.plate+': obbligo di utilizzo non coperto.');}}
 return [...new Set(errors)];
}
function setAllocation(ctx,plan,{day,phase,plate,kind,driver,both=false}){
 const next=structuredClone(plan||{}),cells=allocations(next);if(!ctx.days.includes(day)||!['m','p'].includes(phase)||(kind!=='empty'&&!ctx.vehicles.some(v=>v.plate===plate)))throw Error('Cella non valida.');
 const targets=both?['m','p']:[phase];if(both&&kind==='driver'&&ctx.availability(driver,day).shift!=='long')throw Error('AM e PM insieme richiedono disponibilità Lunga.');
 for(const part of targets){const key=cellKey(day,part,plate),existing=cells[key];
  if(part!==phase&&existing&&!(existing.kind===kind&&(kind!=='driver'||existing.driver===driver)))throw Error('L’altra fascia è già occupata: modificala separatamente.');
  if(kind==='empty'){delete cells[key];continue;}
  if(!['driver','parked'].includes(kind))throw Error('Operazione non valida.');
  const entry=kind==='driver'?{kind,driver}:{kind};cells[key]=entry;
  const errors=cellErrors(ctx,next,key,entry,cells);if(errors.length)throw Error(errors.join(' · '));
 }
 next.assignments=cells;return next;
}
function summary(ctx,plan,day,phase,cells=allocations(plan)){
 const available=ctx.vehicles.filter(v=>ctx.state(v,day).available),parked=[],assigned=[],open=[];
 for(const v of available){const key=cellKey(day,phase,v.plate),entry=cells[key];if(entry?.kind==='parked'&&!cellErrors(ctx,plan,key,entry,cells).length)parked.push(v.plate);else if(entry?.kind==='driver'&&!cellErrors(ctx,plan,key,entry,cells).length)assigned.push(entry.driver);else open.push(v.plate);}
 const drivers=ctx.drivers.filter(d=>eligible(ctx,plan,d.id,day,phase)),remaining=drivers.filter(d=>!assigned.includes(d.id));
 return {available:available.length,parked,assigned,open,remaining,excess:Math.max(0,remaining.length-open.length),shortage:Math.max(0,open.length-remaining.length),delta:drivers.length-(available.length-parked.length)};
}
function publish(ctx,plan,now){const next=structuredClone(plan||{}),cells=allocations(next),errors=validate(ctx,next,cells);if(errors.length)throw Error(errors.join('\n'));next.assignments=cells;next.publishedAssignments=structuredClone(cells);next.assignmentsPublishedAt=now;return next;}
function forDriver(plan,driver,day,published=true){const cells=published?plan.publishedAssignments:allocations(plan);return Object.entries(cells||{}).filter(([key,e])=>key.split('|')[0]===day&&e.kind==='driver'&&e.driver===driver).map(([key])=>({phase:key.split('|')[1],plate:key.split('|')[2]}));}
const api={orderedVehicles,garageLabel,phases,cellKey,allocations,eligible,cellErrors,validate,setAllocation,summary,publish,forDriver};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}root.SWAssignmentRules=api;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const fmt=day=>new Date(day+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
root.SWAssignmentBoard=class{
 constructor({container,getContext,getPlan,mutate,publish,getReady}){Object.assign(this,{container,getContext,getPlan,mutate,publishPlan:publish,getReady});this.message='';this.bad=false;this.selectedDay='';this.dialog=null;}
 status(message,bad=false){this.message=message;this.bad=bad;this.render();}
 render(){
 const ctx=this.getContext(),plan=this.getPlan(),cells=allocations(plan),vehicles=orderedVehicles(ctx.vehicles.filter(v=>v.active||Object.keys(cells).some(key=>key.split('|')[2]===v.plate))),ready=this.getReady();
 const previousScroll=this.container.querySelector('.allocation-table-box')?.scrollLeft||0;this.container.replaceChildren();const controls=el('div',undefined,'allocation-controls'),label=el('label','Giorno '),filter=el('select');filter.setAttribute('aria-label','Giorno del planning assegnazioni');const all=el('option','Tutta la settimana');all.value='';filter.append(all);for(const day of ctx.days){const o=el('option',fmt(day));o.value=day;filter.append(o);}if(!ctx.days.includes(this.selectedDay))this.selectedDay='';filter.value=this.selectedDay;filter.onchange=()=>{this.selectedDay=filter.value;this.render()};label.append(filter);
 const publishButton=el('button','Pubblica planning'),state=el('span',undefined,'muted');publishButton.disabled=!ready;publishButton.onclick=()=>this.publishPlan();const errors=ready?validate(ctx,plan,cells):['Calendario mezzi non caricato.'];
 const same=plan.publishedAssignments!==undefined&&JSON.stringify(Object.entries(cells).sort())===JSON.stringify(Object.entries(plan.publishedAssignments).sort());
 state.textContent=plan.assignmentsPublishedAt?(same?(errors.length?'Pubblicato · da verificare':'Pubblicato'):'Bozza modificata')+' · '+new Date(plan.assignmentsPublishedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Bozza · non ancora pubblicata';controls.append(label,publishButton,state);this.container.append(controls);
 if(this.message)this.container.append(el('p',this.message,'status'+(this.bad?' error':'')));
 if(errors.length){const details=el('details',undefined,'allocation-errors'),title=el('summary',errors.length+' problemi da correggere prima della pubblicazione');details.append(title);const list=el('ul');errors.forEach(e=>list.append(el('li',e)));details.append(list);for(const [key] of Object.entries(cells)){const [day,phase,plate]=key.split('|');if(ctx.vehicles.some(v=>v.plate===plate))continue;const clear=el('button','Rimuovi assegnazione non in flotta: '+plate+' · '+day+' '+phaseName(phase),'secondary');clear.onclick=()=>this.mutate({day,phase,plate,kind:'empty'}).catch(e=>this.status(e.message,true));details.append(clear);}this.container.append(details);}
 this.container.append(el('p','Scorri orizzontalmente per visualizzare gli altri mezzi.','allocation-mobile-hint'));const box=el('div',undefined,'allocation-table-box'),table=el('table',undefined,'allocation-table'),head=el('thead'),hr=el('tr');hr.append(el('th','Giorno'),el('th','Fascia'));
 vehicles.forEach((v,index)=>{const th=el('th');th.scope='col';th.dataset.allocationPlate=v.plate;th.dataset.garage=garageLabel(v).toLowerCase();th.title=v.plate+' · '+(v.description||v.model||v.category||'')+' · '+garageLabel(v);th.append(el('span',String(index+1),'allocation-vehicle-number'),el('strong',v.plate),el('small',garageLabel(v)==='Garage n.d.'?'—':garageLabel(v),'allocation-vehicle-garage'));hr.append(th);});const last=el('th','Da sistemare');last.scope='col';hr.append(last);head.append(hr);table.append(head);const body=el('tbody');
 ctx.days.filter(d=>!this.selectedDay||d===this.selectedDay).forEach((day,index)=>{for(const phase of ['m','p']){
  const tr=el('tr');tr.dataset.allocationDay=day;tr.dataset.allocationPhase=phase;tr.dataset.band=String(index%2);if(phase==='m'){const th=el('th',fmt(day));th.scope='rowgroup';th.rowSpan=2;tr.append(th);}const phaseCell=el('th',phase==='m'?'AM':'PM');phaseCell.scope='row';phaseCell.className='allocation-phase';tr.append(phaseCell);
  for(const v of vehicles){const key=cellKey(day,phase,v.plate),entry=cells[key],vehicleState=ctx.state(v,day),td=el('td'),button=el('button');button.type='button';button.className='allocation-cell';button.dataset.plate=v.plate;button.dataset.day=day;button.dataset.phase=phase;button.dataset.kind=entry?.kind||'empty';button.dataset.state=vehicleState.state;
   const invalid=entry?cellErrors(ctx,plan,key,entry,cells):[];button.dataset.invalid=String(!!invalid.length);
   if(!vehicleState.available){button.textContent={broken:'🔧 Guasto',maintenance:'Manut.',out_of_service:'✕ Fuori serv.',inactive:'Non attivo'}[vehicleState.state]||'Non disponibile';if(entry)button.textContent+=' · da liberare';}
   else if(entry?.kind==='driver'){button.textContent=ctx.name(entry.driver);button.dataset.shift=ctx.availability(entry.driver,day).shift;}
   else if(entry?.kind==='parked')button.textContent='× Fermo';else if(entry?.kind==='conflict')button.textContent='⚠ Conflitto';else button.textContent=vehicleState[phase==='m'?'required_morning':'required_afternoon']?'＋ Obbligo':'＋';
   button.disabled=!ready||(!vehicleState.available&&!entry);button.title=fmt(day)+' · '+phaseName(phase)+' · '+v.plate+(vehicleState.reason?' · '+vehicleState.reason:'')+(invalid.length?' · '+invalid.join(' · '):'');button.setAttribute('aria-label',button.title+' · '+button.textContent);button.onclick=()=>this.edit(day,phase,v.plate);td.append(button);tr.append(td);
  }
  const info=summary(ctx,plan,day,phase,cells),right=el('td',undefined,'allocation-balance');right.append(el('strong',info.assigned.length+' assegnat'+(info.assigned.length===1?'o':'i')+' · '+info.parked.length+' ferm'+(info.parked.length===1?'o':'i')));const count=el('div');count.append(el('span',info.open.length+' post'+(info.open.length===1?'o scoperto':'i scoperti'),info.open.length?'allocation-warning':'ok'));if(info.excess)count.append(el('span',' · '+info.excess+' autist'+(info.excess===1?'a':'i')+' di troppo','allocation-warning'));else if(info.shortage)count.append(el('span',' · −'+info.shortage+' autist'+(info.shortage===1?'a':'i'),'ok'));else count.append(el('span',' · Autisti/mezzi OK','ok'));right.append(count);
  if(info.remaining.length){const preview=el('div',info.remaining.slice(0,2).map(d=>ctx.name(d.id)).join(' · ')+(info.remaining.length>2?' · +'+(info.remaining.length-2):''),'allocation-names');preview.title=info.remaining.map(d=>ctx.name(d.id)).join(' · ');right.append(preview);const details=el('details'),title=el('summary',info.remaining.length+' autist'+(info.remaining.length===1?'a':'i')+' da assegnare');details.append(title,el('p',info.remaining.map(d=>ctx.name(d.id)).join(' · ')));right.append(details);}else right.append(el('small','Tutti gli autisti disponibili sono collocati.'));tr.append(right);body.append(tr);
 }});table.append(body);box.append(table);box.tabIndex=0;box.setAttribute('aria-label','Scorrimento mezzi del planning');box.onkeydown=e=>{if(e.target!==box)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();box.scrollLeft=e.key==='Home'?0:e.key==='End'?box.scrollWidth:box.scrollLeft+(e.key==='ArrowLeft'?-100:100);}};this.container.append(box);box.scrollLeft=previousScroll;
 }
 edit(day,phase,plate){
 const ctx=this.getContext(),plan=this.getPlan(),cells=allocations(plan),current=cells[cellKey(day,phase,plate)];this.dialog?.remove();const dialog=el('dialog',undefined,'allocation-dialog');this.dialog=dialog;const title=el('h3',plate+' · '+fmt(day)+' · '+phaseName(phase)),label=el('label','Autista o mezzo fermo'),select=el('select');select.setAttribute('aria-label','Assegnazione '+plate+' '+day+' '+phaseName(phase));
 for(const [value,text] of [['','Posto scoperto'],['parked','Mezzo fermo per questa fascia']]){const o=el('option',text);o.value=value;select.append(o);}
 for(const d of ctx.drivers.filter(d=>eligible(ctx,plan,d.id,day,phase))){const elsewhere=Object.entries(cells).find(([key,e])=>key!==cellKey(day,phase,plate)&&key.startsWith(day+'|'+phase+'|')&&e.kind==='driver'&&e.driver===d.id);const o=el('option',ctx.name(d.id)+' · '+({long:'Lunga',morning:'AM',afternoon:'PM'}[ctx.availability(d.id,day).shift])+(elsewhere?' · già su '+elsewhere[0].split('|')[2]:''));o.value='driver:'+d.id;o.disabled=!!elsewhere;select.append(o);}
 select.value=current?.kind==='parked'?'parked':current?.kind==='driver'&&[...select.options].some(o=>o.value==='driver:'+current.driver)?'driver:'+current.driver:'';label.append(select);
 const bothLabel=el('label',undefined,'allocation-both'),both=el('input');both.type='checkbox';bothLabel.append(both,document.createTextNode('Assegna anche all’altra fascia sullo stesso mezzo (Lunga)'));const updateBoth=()=>{const driver=select.value.startsWith('driver:')?select.value.slice(7):'';bothLabel.hidden=!driver||ctx.availability(driver,day).shift!=='long';if(bothLabel.hidden)both.checked=false;};select.onchange=updateBoth;updateBoth();
 const hint=el('p','Vengono proposti solo autisti disponibili in questa fascia. Le richieste ancora in attesa non cambiano le disponibilità.','muted'),error=el('p','','status error');error.setAttribute('role','alert');
 const actions=el('div',undefined,'actions'),save=el('button','Salva assegnazione'),cancel=el('button','Chiudi','secondary');save.type=cancel.type='button';save.onclick=async()=>{save.disabled=true;cancel.disabled=true;try{const value=select.value;await this.mutate({day,phase,plate,kind:value.startsWith('driver:')?'driver':value==='parked'?'parked':'empty',driver:value.startsWith('driver:')?value.slice(7):undefined,both:both.checked});dialog.close();dialog.remove();this.dialog=null;}catch(e){error.textContent=e.message;}finally{save.disabled=false;cancel.disabled=false;}};cancel.onclick=()=>{dialog.close();dialog.remove();this.dialog=null;};actions.append(save,cancel);dialog.append(title,label,bothLabel,hint,error,actions);document.body.append(dialog);dialog.addEventListener('cancel',e=>{if(save.disabled)e.preventDefault();});dialog.showModal();select.focus();
 }
};
})(typeof window!=='undefined'?window:globalThis);
