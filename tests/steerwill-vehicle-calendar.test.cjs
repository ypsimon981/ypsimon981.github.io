const test=require('node:test');
const assert=require('node:assert/strict');
const {vehicleState,fleetCapacity,requiredGaps,assignmentErrors}=require('../assets/steerwill-vehicle-calendar.js');
const vehicles=[{id:'a',plate:'AA',priority:1,active:true,listed_in_service:true},{id:'b',plate:'BB',priority:5,active:true,listed_in_service:true},{id:'c',plate:'CC',priority:3,active:false,listed_in_service:true}];
const day='2026-11-02';
test('capacity includes last-choice vehicles, but excludes inactive and non-roadworthy ones',()=>{
 assert.equal(fleetCapacity(vehicles,day),2);
 assert.equal(fleetCapacity([{...vehicles[0],listed_in_service:false},vehicles[1]],day),1);
 assert.equal(fleetCapacity(vehicles,day,[{vehicle_id:'a',day,state:'broken'}]),1);
 assert.equal(fleetCapacity(vehicles,'2026-11-03',[{vehicle_id:'a',day,state:'broken'}]),2);
});
test('scheduled maintenance wins over available calendar cells, with inclusive dates',()=>{
 const period=[{vehicle_id:'a',starts_on:day,ends_on:'2026-11-04',note:'Officina'}];
 assert.equal(vehicleState(vehicles[0],day,[{vehicle_id:'a',day,state:'available'}],period).available,false);
 assert.equal(fleetCapacity(vehicles,'2026-11-04',[],period),1);
 assert.equal(fleetCapacity(vehicles,'2026-11-05',[],period),2);
 assert.equal(assignmentErrors(vehicles,day,'night','AA',[],period).length,1);
});
test('mandatory use is independent of capacity, and long shifts cover AM and PM',()=>{
 const records=[{vehicle_id:'b',day,state:'available',required_morning:true,required_afternoon:true}];
 assert.equal(fleetCapacity(vehicles,day,records),2);
 assert.equal(requiredGaps(vehicles,[day],{},records).length,2);
 const morning={'driver|2026-11-02':{vehicle:'BB',shift:'morning'}};
 assert.deepEqual(requiredGaps(vehicles,[day],morning,records).map(g=>g.phase),['p']);
 assert.equal(requiredGaps(vehicles,[day],{'driver|2026-11-02':{vehicle:'BB',shift:'long'}},records).length,0);
 assert.equal(requiredGaps(vehicles,[day],{'driver|2026-11-02':{vehicle:'BB',shift:'night'}},records).length,2);
});
test('unknown, inactive and broken vehicles cannot receive working shifts; rest needs no vehicle',()=>{
 assert.equal(assignmentErrors(vehicles,day,'long','CC').length,1);
 assert.equal(assignmentErrors(vehicles,day,'morning','unknown').length,1);
 assert.equal(assignmentErrors(vehicles,day,'afternoon','AA',[{vehicle_id:'a',day,state:'broken'}]).length,1);
 assert.deepEqual(assignmentErrors(vehicles,day,'off',''),[]);
});

test('out-of-service is reversible per day and excluded from ordinary capacity and shifts',()=>{
 const records=[{vehicle_id:'b',day,state:'out_of_service'}];
 assert.equal(vehicleState(vehicles[1],day,records).state,'out_of_service');
 assert.equal(fleetCapacity(vehicles,day,records),1);
 assert.match(assignmentErrors(vehicles,day,'long','BB',records)[0],/fuori servizio/);
 assert.equal(fleetCapacity(vehicles,'2026-11-03',records),2);
 assert.equal(fleetCapacity(vehicles,day,[{...records[0],state:'available'}]),2);
});

const defaults=[{vehicle_id:'a',effective_week:'2026-11-02',excluded:true,revision:'rule-1',version:1}];
test('weekly exclusion carries forward, leaves earlier weeks intact and changes capacity and assignments',()=>{
 assert.equal(fleetCapacity(vehicles,'2026-11-01',[],[],defaults),2);
 for(const date of ['2026-11-02','2026-11-08','2026-11-09','2027-01-04']){
  assert.equal(fleetCapacity(vehicles,date,[],[],defaults),1);
  assert.equal(assignmentErrors(vehicles,date,'long','AA',[],[],defaults).length,1);
 }
});
test('daily availability overrides only its own day and only the current weekly default revision',()=>{
 const records=[{vehicle_id:'a',day,state:'available',week_default_revision:'rule-1',required_morning:true}];
 assert.equal(fleetCapacity(vehicles,day,records,[],defaults),2);
 assert.equal(vehicleState(vehicles[0],day,records,[],defaults).exception,true);
 assert.equal(fleetCapacity(vehicles,'2026-11-03',records,[],defaults),1);
 assert.equal(fleetCapacity(vehicles,'2026-11-09',records,[],defaults),1);
 assert.equal(assignmentErrors(vehicles,day,'morning','AA',records,[],defaults).length,0);
 assert.equal(requiredGaps(vehicles,[day],{},records,[],defaults).length,1);
 assert.equal(requiredGaps(vehicles,[day],{'driver|2026-11-02':{vehicle:'AA',shift:'long'}},records,[],defaults).length,0);
 for(const revision of [null,'old-rule']){
  assert.equal(fleetCapacity(vehicles,day,[{...records[0],week_default_revision:revision}],[],defaults),1);
 }
 const nextDefault=[{...defaults[0],revision:'rule-2',version:2}];
 assert.equal(fleetCapacity(vehicles,day,records,[],nextDefault),1);
});
test('removing weekly exclusion resumes availability forward, without changing history or explicit day blocks',()=>{
 const timeline=[{vehicle_id:'a',effective_week:'2026-11-16',excluded:false,revision:'rule-2'},...defaults];
 assert.equal(fleetCapacity(vehicles,'2026-11-09',[],[],timeline),1);
 assert.equal(fleetCapacity(vehicles,'2026-11-16',[],[],timeline),2);
 assert.equal(fleetCapacity(vehicles,'2027-01-04',[],[],timeline),2);
 assert.equal(fleetCapacity(vehicles,'2026-11-16',[{vehicle_id:'a',day:'2026-11-16',state:'broken'}],[],timeline),1);
});
test('daily exceptions never override maintenance or an inactive vehicle',()=>{
 const records=[{vehicle_id:'a',day,state:'available',week_default_revision:'rule-1'}];
 const maintenance=[{vehicle_id:'a',starts_on:day,ends_on:day}];
 assert.equal(vehicleState(vehicles[0],day,records,maintenance,defaults).state,'maintenance');
 assert.equal(vehicleState(vehicles[0],day,records,maintenance,defaults).exception,false);
 assert.equal(vehicleState({...vehicles[0],active:false},day,records,[],defaults).state,'inactive');
});
