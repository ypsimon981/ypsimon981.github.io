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
