// Public-source calendar refresh for environments blocked by the source provider.
const fs=require('fs'),vm=require('vm'),{stripTypeScriptTypes}=require('module'),{spawn}=require('child_process');
const source=fs.readFileSync('supabase/functions/ships/index.ts','utf8').split('Deno.serve(')[0].replace(/^import.*$/mg,'');
const context={Date,Map,Set,URL,URLSearchParams,AbortSignal,fetch,console};vm.createContext(context);vm.runInContext(stripTypeScriptTypes(source),context);
let queue=Promise.resolve();
context.fetchText=function(url){const job=queue.then(()=>new Promise((resolve,reject)=>{const p=spawn('python3',['scripts/fetch-calendar.py']);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>code?reject(new Error(err.slice(-300))):resolve(out));p.stdin.end(JSON.stringify({url}));}));queue=job.catch(()=>{}).then(()=>new Promise(r=>setTimeout(r,1000)));return job;};
const ports=vm.runInContext('PORTS',context),today=context.romeToday();
(async()=>{let audit=[],failures=0;for(const [id,p] of Object.entries(ports)){
 try{let loaded=p.kind==='ct'?await context.loadCt(id,p.label,p.base,today):p.kind==='gph'?await context.loadGph(id,p.label,p.source):p.kind==='olbia'?await context.loadOlbia(today):await context.loadCivitavecchia(today);
 const result={...loaded,port:id,fetched_at:new Date().toISOString(),items:loaded.items.filter(x=>x.date>=today)};
 // Never erase a working calendar on a source failure. Empty validated calendars are allowed.
 fs.writeFileSync('data/ports/'+id+'.json',JSON.stringify(result));audit.push({id,name:p.label,provider_id:p.provider_id,status:result.items.length?'ok':'empty',count:result.items.length,fetched_at:result.fetched_at});console.log(id,result.items.length);
 }catch(e){failures++;audit.push({id,name:p.label,provider_id:p.provider_id,status:'source_error',error:e.message});console.log(id,'source_error');}}
 fs.writeFileSync('data/ports/audit.json',JSON.stringify({checked_at:new Date().toISOString(),ports:audit},null,2));
 if(failures)process.exitCode=1;
})();
