const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const STATIONS: Record<string,{label:string,placeId:string,vtCode:string}> = {
  roma_termini:{label:"Roma Termini",placeId:"2416",vtCode:"S08409"},
  roma_tiburtina:{label:"Roma Tiburtina",placeId:"2385",vtCode:"S08217"},
  fiumicino_aeroporto:{label:"Fiumicino Aeroporto",placeId:"1327",vtCode:"S08411"},
  milano_centrale:{label:"Milano Centrale",placeId:"1728",vtCode:"S01700"},
  firenze_smn:{label:"Firenze S. M. Novella",placeId:"1325",vtCode:"S06421"},
  bologna_centrale:{label:"Bologna Centrale",placeId:"683",vtCode:"S05043"},
  napoli_centrale:{label:"Napoli Centrale",placeId:"1888",vtCode:"S09218"},
  torino_porta_nuova:{label:"Torino Porta Nuova",placeId:"2876",vtCode:"S00219"},
  venezia_s_lucia:{label:"Venezia S. Lucia",placeId:"3009",vtCode:"S02593"},
  salerno:{label:"Salerno",placeId:"2617",vtCode:"S09818"}
};

function corsHeaders(origin:string|null){
  const allowed=origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://ypsimon981.github.io";
  return {
    "Access-Control-Allow-Origin":allowed,
    "Access-Control-Allow-Headers":"apikey, authorization, content-type",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8"
  };
}

function json(body:unknown,status=200,origin:string|null=null){
  return new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
}

function decodeEntities(input:string){
  return input
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&agrave;/gi,"à")
    .replace(/&egrave;/gi,"è")
    .replace(/&eacute;/gi,"é")
    .replace(/&igrave;/gi,"ì")
    .replace(/&ograve;/gi,"ò")
    .replace(/&ugrave;/gi,"ù")
    .replace(/&#(x?[0-9a-f]+);/gi,(_,n)=>String.fromCharCode(n.toLowerCase().startsWith("x")?parseInt(n.slice(1),16):Number(n)));
}

function cellText(html:string){
  const alts:Array<string>=[];
  html.replace(/\balt\s*=\s*["']([^"']+)["']/gi,(_,v)=>{alts.push(v);return "";});
  const text=decodeEntities(html.replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
  return [text].concat(alts.filter(x=>x&&x.toLowerCase()!=="si")).filter(Boolean).join(" ").trim();
}

function extractRows(html:string){
  const rows:string[][]=[];
  const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr:RegExpExecArray|null;
  while((tr=trRe.exec(html))){
    const cells:string[]=[];
    const tdRe=/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let td:RegExpExecArray|null;
    while((td=tdRe.exec(tr[1]))) cells.push(cellText(td[1]));
    if(cells.length) rows.push(cells);
  }
  return rows;
}

function inferOperator(carrier:string,category:string,train:string){
  const s=(carrier+" "+category).toUpperCase();
  if(s.includes("ITALO")||s.includes("NTV")) return "Italo";
  if(s.includes("TRENITALIA")||s.includes("FRECCI")||s.includes("INTERCITY")||s.includes("REGIONALE")||s.includes("REG")) return "Trenitalia";
  if(/^(89|99)\d{2}$/.test(train)) return "Italo";
  return carrier||category||"—";
}

function addDelay(time:string,delay:number|null){
  if(!time||delay==null||!Number.isFinite(delay)) return time||null;
  const m=time.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return time;
  const total=Number(m[1])*60+Number(m[2])+delay;
  const normalized=(total+24*60)%(24*60);
  return String(Math.floor(normalized/60)).padStart(2,"0")+":"+String(normalized%60).padStart(2,"0");
}

function parseDelay(raw:string){
  const t=(raw||"").trim();
  if(!t) return {minutes:0,status:"In orario"};
  if(/cancell/i.test(t)) return {minutes:null,status:"Cancellato"};
  const m=t.match(/-?\d+/);
  if(m){
    const n=Number(m[0]);
    return {minutes:n,status:n>0?"Ritardo "+n+" min":n<0?"Anticipo "+Math.abs(n)+" min":"In orario"};
  }
  return {minutes:null,status:t};
}

function parseBoard(html:string,mode:"arrivals"|"departures"){
  const rows=extractRows(html);
  const items:any[]=[];

  for(const cells of rows){
    if(cells.length<7) continue;
    const train=(cells[2]||"").trim();
    const place=(cells[3]||"").trim();
    const scheduled=(cells[4]||"").trim();
    const delayRaw=(cells[5]||"").trim();
    const platform=(cells[6]||"").trim();

    if(!train||!/^[A-Z0-9]+$/i.test(train)) continue;
    if(!/^\d{1,2}:\d{2}$/.test(scheduled)) continue;

    const delay=parseDelay(delayRaw);
    const operator=inferOperator(cells[0]||"",cells[1]||"",train);

    items.push({
      id:[mode,train,scheduled,place].join("_").replace(/\s+/g,"-"),
      type:"train",
      train,
      operator,
      station_role:mode,
      destination:mode==="departures"?place:null,
      origin:mode==="arrivals"?place:null,
      scheduled,
      estimated:delay.status==="Cancellato"?null:addDelay(scheduled,delay.minutes),
      delay_minutes:delay.minutes,
      status:delay.status,
      platform:platform||"—",
      live:true
    });
  }
  return items;
}

async function fetchBoard(placeId:string,arrivals:boolean){
  const url="https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?Arrivals="+(arrivals?"True":"False")+"&PlaceId="+encodeURIComponent(placeId);
  const res=await fetch(url,{
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; SteerWill/0.1; +https://ypsimon981.github.io/)",
      "Accept-Language":"it-IT,it;q=0.9,en;q=0.7",
      "Cache-Control":"no-cache"
    },
    redirect:"follow"
  });
  if(!res.ok) throw new Error("rfi_"+res.status);
  return {url,html:await res.text()};
}

function romeParts(d:Date){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Europe/Rome",weekday:"short",year:"numeric",month:"short",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
  }).formatToParts(d);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return {weekday:get("weekday"),month:get("month"),day:get("day"),year:get("year"),hour:get("hour"),minute:get("minute"),second:get("second")};
}

function vtDateString(d:Date){
  const p=romeParts(d);
  return p.weekday+" "+p.month+" "+Number(p.day)+" "+p.year+" "+p.hour+":"+p.minute+":"+p.second;
}

function localIsoDate(ms:number){
  const p=romeParts(new Date(ms));
  const months:{[k:string]:string}={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
  return p.year+"-"+(months[p.month]||"01")+"-"+String(Number(p.day)).padStart(2,"0");
}

function vtOperator(x:any){
  const category=String(x?.categoriaDescrizione||x?.categoria||"");
  if(Number(x?.codiceCliente)===1||Number(x?.codiceCliente)===2||Number(x?.codiceCliente)===4||Number(x?.codiceCliente)===18) return "Trenitalia";
  if(/ITALO|NTV/i.test(category)) return "Italo";
  return category||"—";
}

function vtPlatform(x:any,mode:"arrivals"|"departures"){
  if(mode==="departures"){
    return x?.binarioEffettivoPartenzaDescrizione||x?.binarioProgrammatoPartenzaDescrizione||"—";
  }
  return x?.binarioEffettivoArrivoDescrizione||x?.binarioProgrammatoArrivoDescrizione||"—";
}

function normalizeVt(x:any,mode:"arrivals"|"departures"){
  const train=String(x?.numeroTreno||"").trim();
  const place=String(mode==="departures"?(x?.destinazione||""):(x?.origine||"")).trim();
  const scheduled=String(mode==="departures"?(x?.compOrarioPartenza||x?.compOrarioPartenzaZero||""):(x?.compOrarioArrivo||x?.compOrarioArrivoZero||"")).trim();
  if(!train||!/^\d{1,2}:\d{2}$/.test(scheduled)) return null;
  const delay=Number.isFinite(Number(x?.ritardo))?Number(x.ritardo):0;
  const status=x?.provvedimento===1?"Cancellato":x?.nonPartito?"Programmato":delay>0?"Ritardo "+delay+" min":delay<0?"Anticipo "+Math.abs(delay)+" min":"In orario";
  const stamp=Number(mode==="departures"?(x?.orarioPartenza||0):(x?.orarioArrivo||0))||0;
  return {
    id:[mode,train,scheduled,place].join("_").replace(/\s+/g,"-"),
    type:"train",
    train,
    operator:vtOperator(x),
    station_role:mode,
    destination:mode==="departures"?place:null,
    origin:mode==="arrivals"?place:null,
    scheduled,
    estimated:status==="Cancellato"?null:addDelay(scheduled,delay),
    delay_minutes:status==="Cancellato"?null:delay,
    status,
    platform:vtPlatform(x,mode),
    service_date:stamp?localIsoDate(stamp):null,
    service_ts:stamp||null,
    live:false
  };
}

async function fetchVtBoard(code:string,mode:"arrivals"|"departures",at:Date){
  const base="https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/";
  const endpoint=(mode==="arrivals"?"arrivi/":"partenze/")+encodeURIComponent(code)+"/"+encodeURIComponent(vtDateString(at));
  const res=await fetch(base+endpoint,{
    headers:{"Accept":"application/json","Cache-Control":"no-cache","User-Agent":"Mozilla/5.0 (compatible; SteerWill/0.1)"},
    redirect:"follow"
  });
  if(!res.ok) throw new Error("vt_"+res.status);
  const raw=await res.json().catch(()=>[]);
  return Array.isArray(raw)?raw.map(x=>normalizeVt(x,mode)).filter(Boolean):[];
}

async function fetchFuture(code:string,mode:"arrivals"|"departures"){
  const now=Date.now();
  const samples=[0,3,6,9,12].map(h=>new Date(now+h*3600000));
  const results=await Promise.all(samples.map(async d=>{
    try{return await fetchVtBoard(code,mode,d);}catch(_){return [];}
  }));
  const maxTs=now+12*3600000;
  return results.flat().filter((x:any)=>{
    if(!x.service_ts) return true;
    return x.service_ts>=now-30*60000 && x.service_ts<=maxTs+30*60000;
  });
}

function mergeItems(future:any[],live:any[]){
  const map=new Map<string,any>();
  for(const x of future){
    const key=[x.train,x.scheduled,String(x.destination||x.origin||"").toUpperCase()].join("|");
    map.set(key,x);
  }
  for(const x of live){
    const key=[x.train,x.scheduled,String(x.destination||x.origin||"").toUpperCase()].join("|");
    const prev=map.get(key)||{};
    map.set(key,{...prev,...x,service_date:prev.service_date||null,service_ts:prev.service_ts||null,live:true});
  }
  return Array.from(map.values()).sort((a:any,b:any)=>{
    const ta=Number(a.service_ts)||0,tb=Number(b.service_ts)||0;
    if(ta&&tb) return ta-tb;
    if(ta) return -1;
    if(tb) return 1;
    return String(a.scheduled||"").localeCompare(String(b.scheduled||""));
  });
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(origin)});
  if(req.method!=="GET") return json({error:"method_not_allowed"},405,origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const url=new URL(req.url);
  const stationSlug=(url.searchParams.get("station")||"roma_termini").toLowerCase().trim();
  const mode=(url.searchParams.get("mode")||"departures").toLowerCase()==="arrivals"?"arrivals":"departures";
  const station=STATIONS[stationSlug];
  if(!station) return json({error:"invalid_station"},400,origin);

  try{
    const [source,future]=await Promise.all([
      fetchBoard(station.placeId,mode==="arrivals"),
      fetchFuture(station.vtCode,mode)
    ]);
    const live=parseBoard(source.html,mode);
    let items=mergeItems(future,live);
    const q=(url.searchParams.get("q")||"").trim().toUpperCase();
    if(q) items=items.filter((x:any)=>String(x.train).toUpperCase().includes(q)||String(x.destination||x.origin||"").toUpperCase().includes(q));

    return json({
      provider:"RFI Live + ViaggiaTreno",
      station:station.label,
      station_slug:stationSlug,
      place_id:station.placeId,
      mode,
      source_url:source.url,
      horizon_hours:12,
      total:items.length,
      items
    },200,origin);
  }catch(error){
    return json({
      error:"rfi_source_error",
      station:station.label,
      message:error instanceof Error?error.message:"unknown"
    },502,origin);
  }
});