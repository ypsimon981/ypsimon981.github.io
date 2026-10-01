const {readFileSync}=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=readFileSync('supabase/functions/flight/aerodatabox.ts','utf8').replace(/^export /gm,'');
let calls=0,fail=false,records=[];
const provider=async(url,init)=>{
  calls++; assert(url.includes('/flights/number/AZ61/2026-10-01?dateLocalRole=Both'));
  assert(url.includes('withFlightPlan=false'));assert.equal(init.headers['X-RapidAPI-Key'],'test-key');
  await new Promise(r=>setTimeout(r,20));
  if(fail) throw Error('outage');
  return {ok:true,status:200,json:async()=>records};
};
const {utc,normalizeADB,cachedADB,matchADB,comparisonFor}=new Function('fetch',stripTypeScriptTypes(source)+';return {utc,normalizeADB,cachedADB,matchADB,comparisonFor};')(provider);
function database(){
  const rows=new Map();
  return {rows,rpc:async(name,{p_key,p_token})=>{
    assert.equal(name,'claim_flight_refresh');
    let row=rows.get(p_key);if(!row){row={refresh_until:0};rows.set(p_key,row);}
    const claimed=!row.finalized&&Number(new Date(row.refresh_until))<=Date.now()&&(!row.expires_at||Date.parse(row.expires_at)<=Date.now());
    if(claimed){row.refresh_token=p_token;row.refresh_until=Date.now()+45000;}
    return {data:claimed,error:null};
  },from(table){
    assert.equal(table,'flight_status_cache');
    let patch=null,filters=[];
    const find=()=>[...rows.entries()].filter(([key,row])=>filters.every(([k,v])=>(k==='cache_key'?key:row[k])===v));
    const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},
      update(v){patch=v;return query;},maybeSingle:async()=>({data:find()[0]?.[1]?{...find()[0][1]}:null,error:null}),
      then(resolve,reject){try{const found=find();if(patch)for(const [,row]of found)Object.assign(row,patch);
        return Promise.resolve({data:found.map(([cache_key])=>({cache_key})),error:null}).then(resolve,reject);
      }catch(e){return Promise.reject(e).then(resolve,reject);}}};return query;
  }};
}
const movement=(code,time)=>({airport:{iata:code},scheduledTime:{utc:time},revisedTime:{utc:time}});
records=[{number:'AZ 61',status:'EnRoute',departure:movement('MAD','2026-10-01 09:35Z'),arrival:{...movement('FCO','2026-10-01 12:00Z'),runwayTime:{utc:'2026-10-01 11:45Z'}}}];
const fa={flight:{ident:'AZ61',origin:{code:'MAD'},destination:{code:'FCO'},scheduled_in:'2026-10-01T12:00:00Z',estimated_in:'2026-10-01T11:50:00Z'},fetched_at:'2026-10-01T10:00:00Z'};
(async()=>{
  assert.equal(utc({utc:'2026-10-01 12:00Z'}),'2026-10-01T12:00:00.000Z');
  assert.equal(utc({utc:'bad'}),null);
  const a=normalizeADB(records[0]);
  assert.equal(matchADB(fa.flight,[a]),a);
  assert.equal(matchADB({...fa.flight,destination:{code:'MXP'}},[a]),null);
  assert.equal(matchADB(fa.flight,[a,{...a}]),null);
  assert.equal(matchADB({...fa.flight,scheduled_in:'2026-10-02T12:00:00Z'},[a]),null);
  const c=comparisonFor(fa,{records:[a],updated_at:'2026-10-01T10:01:00Z'});
  assert.equal(c.difference_minutes,10);
  assert.equal(c.flightaware.basis,'gate');assert.equal(c.aerodatabox.basis,'gate');
  const ambiguous=comparisonFor(fa,{records:[{...a,runway_in:null}]});
  assert.equal(ambiguous.difference_minutes,null);
  assert.equal(ambiguous.aerodatabox.basis,'unspecified');
  assert.equal(ambiguous.difference_reason,'different_events');
  const tkFlight={origin:{code:'IST'},destination:{code:'FCO'},scheduled_in:'2026-10-01T21:35:00Z',estimated_in:'2026-10-01T21:35:00Z',estimated_on:'2026-10-01T21:25:00Z',scheduled_on:'2026-10-01T21:25:00Z'};
  const tkADB={origin:{code:'IST'},destination:{code:'FCO'},scheduled_in:'2026-10-01T21:35:00Z',revised_in:'2026-10-01T21:35:00Z',runway_in:null,status:'Expected'};
  const tkComparison=comparisonFor({flight:tkFlight},{records:[tkADB]});
  assert.equal(tkComparison.flightaware.arrival_at,'2026-10-01T21:35:00Z');
  assert.equal(tkComparison.flightaware.basis,'gate');
  assert.equal(tkComparison.aerodatabox.basis,'unspecified');
  assert.equal(tkComparison.difference_minutes,null);
  const gateAfterLanding=comparisonFor({flight:{...fa.flight,actual_on:'2026-10-01T11:45:00Z'}},{records:[{...a,runway_in:null}]});
  assert.equal(gateAfterLanding.flightaware.kind,'estimated'); // Landing is not a gate arrival.
  assert.equal(comparisonFor({...fa,flight:{...fa.flight,estimated_in:'2026-10-01T12:10:00Z'}},{records:[a]}).difference_minutes,-10);
  assert.equal(comparisonFor({...fa,flight:{...fa.flight,estimated_in:null}},{records:[a]}).difference_minutes,null);
  assert.equal(comparisonFor(fa,{error:'temporarily_unavailable'}).flightaware.arrival_at,fa.flight.estimated_in);
  assert.equal(comparisonFor(fa,{records:[a],stale:true}).aerodatabox.stale,true);
  assert.equal(comparisonFor({...fa,flight:{...fa.flight,actual_on:'2026-10-01T12:00:00Z'}},{records:[a]}).difference_minutes,null);
  const runway=comparisonFor({...fa,flight:{...fa.flight,estimated_on:'2026-10-01T11:40:00Z'}},{records:[{...a,runway_in:'2026-10-01T11:45:00Z'}]});
  assert.equal(runway.basis,'runway');assert.equal(runway.difference_minutes,5);
  const db=database(),results=await Promise.all(Array.from({length:20},()=>cachedADB(db,'AZ61','2026-10-01','test-key')));
  assert.equal(calls,1);assert(results.every(r=>r.records.length===1));
  const timestamp=results[0].updated_at;
  assert.equal((await cachedADB(db,'AZ61','2026-10-01','test-key')).updated_at,timestamp);assert.equal(calls,1);
  const row=db.rows.get('aerodatabox:AZ61:2026-10-01');
  row.expires_at=new Date(0).toISOString();await cachedADB(db,'AZ61','2026-10-01','test-key');assert.equal(calls,2);
  row.expires_at=new Date(0).toISOString();fail=true;
  assert.equal((await cachedADB(db,'AZ61','2026-10-01','test-key')).stale,true);
  await cachedADB(db,'AZ61','2026-10-01','test-key');assert.equal(calls,3);
  const empty=database();fail=false;records=[];await cachedADB(empty,'AZ61','2026-10-01','test-key');
  const count=calls;await cachedADB(empty,'AZ61','2026-10-01','test-key');assert.equal(calls,count);
  const negative=database();fail=true;const error=await cachedADB(negative,'AZ61','2026-10-01','test-key');
  assert.equal(error.error,'temporarily_unavailable');assert.equal(error.updated_at,null);
  const afterError=calls;await cachedADB(negative,'AZ61','2026-10-01','test-key');assert.equal(calls,afterError);
  const finalized=database();fail=false;records=[{number:'AZ61',status:'Arrived',arrival:movement('FCO','2026-10-01 12:00Z')}];
  await cachedADB(finalized,'AZ61','2026-10-01','test-key');
  finalized.rows.get('aerodatabox:AZ61:2026-10-01').expires_at=new Date(0).toISOString();
  const landedCalls=calls;await cachedADB(finalized,'AZ61','2026-10-01','test-key');assert.equal(calls,landedCalls);
  const broken={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({error:true})}}};
  await assert.rejects(()=>cachedADB(broken,'AZ61','2026-10-01','test-key'),/cache_unavailable/);assert.equal(calls,landedCalls);
  const context={window:{},setInterval(){}};
  vm.runInNewContext(readFileSync('assets/flight-status.js','utf8'),context);
  const tkTiming=context.window.SWFlight.timing(tkFlight);
  assert.equal(tkTiming.landing.time,'2026-10-01T21:25:00Z');
  assert.equal(tkTiming.landingBasis,'runway');
  assert.equal(tkTiming.gate.time,'2026-10-01T21:35:00Z');
  const legacy=context.window.SWFlight.timing({...tkFlight,estimated_in:tkFlight.estimated_on});
  assert.equal(legacy.gate.time,tkFlight.scheduled_in);assert.equal(legacy.gate.kind,'scheduled');
  const unknownLanding=context.window.SWFlight.info({scheduled_in:new Date(Date.now()+60000).toISOString()},true);
  assert(unknownLanding.text.startsWith('Arrivo previsto tra'));
  const html=context.window.SWFlight.comparisonHtml(c);
  assert(html.includes('FlightAware'));assert(html.includes('AeroDataBox'));assert(html.includes('+10 min'));
  const ambiguousHtml=context.window.SWFlight.comparisonHtml(tkComparison);
  assert(ambiguousHtml.includes('Arrivo al gate'));assert(ambiguousHtml.includes('punto non indicato'));
  assert(!ambiguousHtml.includes(': 0 min'));
  assert(!context.window.SWFlight.comparisonHtml({...c,version:1}).includes('+10 min'));
  assert(!context.window.SWFlight.comparisonHtml({...c,aerodatabox:{...c.aerodatabox,error:'<script>'}}).includes('<script>'));
  for(const path of ['voli.html','monitor.html']){
    const html=readFileSync(path,'utf8');for(const s of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);
    assert(html.includes('comparison:data.comparison||null'));
  }
  console.log('PASS: dual estimates, same-occurrence matching, signed delta, runway basis, unavailable/stale sources, shared 10-minute cache, 20 concurrent calls = 1 request, negative cache, terminal stop, fail-closed database and frontend syntax/escaping.');
})().catch(e=>{console.error(e);process.exitCode=1});
