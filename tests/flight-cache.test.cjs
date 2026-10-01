// No provider calls: deterministic tests for the deployed cache logic.
const {readFileSync}=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const assert=require('node:assert/strict');
const source=readFileSync('supabase/functions/flight/index.ts','utf8')
  .replace(/^import .*\n/,'').split('Deno.serve(')[0];
const js=stripTypeScriptTypes(source);
let calls=0,fail=false;
const today=new Date().toISOString().slice(0,10);
let flights=[{ident:'AZ61',scheduled_in:today+'T12:00:00Z',estimated_on:today+'T12:00:00Z'}];
const provider=async()=>{calls++;await new Promise(r=>setTimeout(r,30));
  if(fail)throw Error('upstream unavailable');return {ok:true,json:async()=>({flights})};};
const {cachedFlight,cacheLifetime,validDate}=new Function('fetch',js+';return {cachedFlight,cacheLifetime,validDate};')(provider);
function database(){
  const rows=new Map();
  return {rows,rpc:async(name,{p_key,p_token})=>{
    let row=rows.get(p_key);if(!row){row={refresh_until:0};rows.set(p_key,row);}
    const claimed=!row.finalized&&Number(new Date(row.refresh_until))<=Date.now()&&
      (!row.expires_at||Date.parse(row.expires_at)<=Date.now());
    if(claimed){row.refresh_token=p_token;row.refresh_until=Date.now()+45000;}
    return {data:claimed,error:null};
  },from(){
    let patch=null,filters=[];
    const find=()=>[...rows.entries()].filter(([key,row])=>filters.every(([k,v])=>(k==='cache_key'?key:row[k])===v));
    const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},
      update(v){patch=v;return query;},maybeSingle:async()=>({data:find()[0]?.[1]?{...find()[0][1]}:null,error:null}),
      then(resolve,reject){try{const found=find();if(patch)for(const [,row]of found)Object.assign(row,patch);
        return Promise.resolve({data:found.map(([cache_key])=>({cache_key})),error:null}).then(resolve,reject);
      }catch(e){return Promise.reject(e).then(resolve,reject);}}};return query;
  }};
}
(async()=>{
  assert.equal(validDate('2026-13-01'),false);
  assert.equal(validDate('2026-02-30'),false);
  assert.equal(validDate('2026-10-01'),true);
  assert.equal(cacheLifetime({estimated_on:new Date(Date.now()+60000).toISOString()},Date.now()).ttl,600000);
  assert.equal(cacheLifetime({estimated_on:new Date(Date.now()+6*3600000).toISOString()},Date.now()).ttl,600000);
  const db=database();
  const results=await Promise.all(Array.from({length:20},()=>cachedFlight(db,'AZ61',today,'dummy')));
  assert.equal(calls,1);assert(results.every(r=>r.status===200));
  assert.equal(results.filter(r=>!r.body.cached).length,1);
  await cachedFlight(db,'AZ61',today,'dummy');assert.equal(calls,1);
  const row=db.rows.get('flight:AZ61:'+today);row.expires_at=new Date(0).toISOString();
  await cachedFlight(db,'AZ61',today,'dummy');assert.equal(calls,2);
  row.expires_at=new Date(0).toISOString();fail=true;
  const stale=await cachedFlight(db,'AZ61',today,'dummy');assert.equal(stale.body.stale,true);
  await cachedFlight(db,'AZ61',today,'dummy');assert.equal(calls,3);
  fail=false;row.refresh_until=0;
  flights=[{...flights[0],actual_on:new Date(Date.now()-60000).toISOString()}];
  const landed=await cachedFlight(db,'AZ61',today,'dummy');assert.equal(landed.body.finalized,true);
  row.expires_at=new Date(0).toISOString();const count=calls;
  await Promise.all(Array.from({length:20},()=>cachedFlight(db,'AZ61',today,'dummy')));
  assert.equal(calls,count);
  flights=[];const missingDb=database();
  assert.equal((await cachedFlight(missingDb,'ZZ99',today,'dummy')).status,404);
  const negativeCalls=calls;await cachedFlight(missingDb,'ZZ99',today,'dummy');assert.equal(calls,negativeCalls);
  const broken={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({error:Error('database offline')})};}};
  await assert.rejects(()=>cachedFlight(broken,'AZ61',today,'dummy'),/cache_unavailable/);assert.equal(calls,negativeCalls);
  assert.equal(cacheLifetime({actual_in:new Date().toISOString()},Date.now()).finalized,false);
  console.log('PASS: 20 concurrent callers = 1 provider call; expiry refresh, outage backoff, landed stop, negative cache, date validation, database fail-closed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
