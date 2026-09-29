
const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const PORTS: Record<string, { label: string; kind: string; source?: string; base?: string }> = {
  civitavecchia:{label:"Civitavecchia",kind:"civitavecchia"},
  ancona:{label:"Ancona",kind:"ct",base:"anconaitaly"},
  bari:{label:"Bari",kind:"ct",base:"bariitaly"},
  brindisi:{label:"Brindisi",kind:"ct",base:"brindisiitaly"},
  cagliari:{label:"Cagliari",kind:"gph",source:"https://cagliaricruiseport.com/schedule/"},
  catania:{label:"Catania",kind:"gph",source:"https://cataniacruiseport.com/schedule/"},
  genova:{label:"Genova",kind:"ct",base:"genoaitaly"},
  laspezia:{label:"La Spezia",kind:"ct",base:"laspeziaitaly"},
  livorno:{label:"Livorno",kind:"ct",base:"livornoflorencepisaitaly"},
  messina:{label:"Messina",kind:"ct",base:"messinasicily"},
  napoli:{label:"Napoli",kind:"ct",base:"naplesitaly"},
  olbia:{label:"Olbia",kind:"olbia"},
  palermo:{label:"Palermo",kind:"ct",base:"palermosicily"},
  portoferraio:{label:"Portoferraio",kind:"ct",base:"portoferraioitaly"},
  ravenna:{label:"Ravenna",kind:"ct",base:"ravennaitaly"},
  salerno:{label:"Salerno",kind:"ct",base:"salernoitaly"},
  savona:{label:"Savona",kind:"ct",base:"savonaitaly"},
  siracusa:{label:"Siracusa",kind:"ct",base:"siracusasicily"},
  taranto:{label:"Taranto",kind:"gph",source:"https://tarantocruiseport.com/schedule/"},
  trapani:{label:"Trapani",kind:"ct",base:"trapaniitaly"},
  trieste:{label:"Trieste",kind:"ct",base:"triesteitaly"},
  venezia:{label:"Venezia",kind:"ct",base:"veniceitaly"}
};

const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_ABBR = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const MONTH_SHORT: Record<string, number> = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
const MONTH_LONG: Record<string, number> = {JANUARY:0,FEBRUARY:1,MARCH:2,APRIL:3,MAY:4,JUNE:5,JULY:6,AUGUST:7,SEPTEMBER:8,OCTOBER:9,NOVEMBER:10,DECEMBER:11};

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ypsimon981.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function decodeEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&agrave;/gi, "à")
    .replace(/&egrave;/gi, "è")
    .replace(/&eacute;/gi, "é")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, n) => String.fromCharCode(n.toLowerCase().startsWith("x") ? parseInt(n.slice(1),16) : Number(n)));
}

function stripTags(input: string) {
  return decodeEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function htmlToLines(html: string) {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(tr|p|div|h1|h2|h3|h4|h5|li|table|section|article|a)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned).split(/\n+/).map(line => line.replace(/\s+/g, " ").replace(/\s*\|\s*/g, " | ").trim()).filter(Boolean);
}

function extractRows(html: string) {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const tdRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1]))) cells.push(stripTags(td[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function romeToday() {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const y = parts.find(x => x.type === "year")?.value || "";
  const m = parts.find(x => x.type === "month")?.value || "";
  const d = parts.find(x => x.type === "day")?.value || "";
  return y+"-"+m+"-"+d;
}

function dateParts(iso: string) {
  const a = iso.split("-").map(Number);
  return { y:a[0], m:a[1]-1, d:a[2] };
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year,month+delta,1,12,0,0));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()};
}

function addDays(iso: string, delta: number) {
  const p=dateParts(iso);
  return new Date(Date.UTC(p.y,p.m,p.d+delta,12,0,0)).toISOString().slice(0,10);
}

function unique(items: any[]) {
  const map = new Map<string, any>();
  for (const x of items) {
    const key=[x.port_slug||x.port,x.date,x.name].join("|").toUpperCase();
    const old=map.get(key);
    if(!old) map.set(key,x);
    else map.set(key,{...old,arrival:old.arrival||x.arrival||null,departure:old.departure||x.departure||null,dock:old.dock&&old.dock!=="—"?old.dock:(x.dock||old.dock||"—")});
  }
  return Array.from(map.values()).sort((a,b)=>{
    const ta=new Date(a.date+"T"+(a.arrival||a.departure||"23:59")+":00").getTime();
    const tb=new Date(b.date+"T"+(b.arrival||b.departure||"23:59")+":00").getTime();
    return ta-tb;
  });
}

async function fetchText(url: string) {
  const sep=url.includes("?")?"&":"?";
  const bust=new Date().toISOString().slice(0,13);
  const res=await fetch(url+sep+"_codriver="+encodeURIComponent(bust),{
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; CoDriver/0.2; +https://ypsimon981.github.io/)",
      "Accept-Language":"en-GB,en;q=0.9,it;q=0.8",
      "Cache-Control":"no-cache"
    },
    redirect:"follow"
  });
  if(!res.ok) throw new Error("upstream_"+res.status);
  return await res.text();
}

/* Civitavecchia */
const CIV_WEEKLY="https://civitavecchia.portmobility.it/en/port-civitavecchia-arrivals-and-departures-real-time";

function parseCivDateHeader(line:string,year:number){
  const m=line.toUpperCase().match(/^(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})(?:ST|ND|RD|TH)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)/);
  if(!m) return null;
  return new Date(Date.UTC(year,MONTH_LONG[m[2]],Number(m[1]),12,0,0)).toISOString().slice(0,10);
}

function parseCivTimes(raw:string){
  const text=raw.trim().toUpperCase();
  let arrival:string|null=null,departure:string|null=null;
  const pair=text.match(/(\d{1,2}[:.]\d{2})\s*\/\s*(\d{1,2}[:.]\d{2})/);
  if(pair) return {arrival:pair[1].replace(".",":").padStart(5,"0"),departure:pair[2].replace(".",":").padStart(5,"0")};
  const a=text.match(/(?:^|\s)A\.?\s*(\d{1,2}[:.]\d{2})/);
  const d=text.match(/(?:^|\s)D\.?\s*(\d{1,2}[:.]\d{2})/);
  if(a) arrival=a[1].replace(".",":").padStart(5,"0");
  if(d) departure=d[1].replace(".",":").padStart(5,"0");
  return {arrival,departure};
}

function parseCivWeekly(html:string){
  const lines=htmlToLines(html);
  const planning=lines.find(x=>/Mooring Planning/i.test(x))||"";
  const ym=planning.match(/\b(20\d{2})\b/);
  const year=ym?Number(ym[1]):new Date().getUTCFullYear();
  let currentDate:string|null=null,active=false;
  const items:any[]=[];
  for(const line of lines){
    if(/Mooring Planning/i.test(line)){active=true;continue;}
    if(!active) continue;
    if(/Dates and departure times may change/i.test(line)) break;
    const date=parseCivDateHeader(line,year);
    if(date){currentDate=date;continue;}
    if(!currentDate||/^SHIP\s*\|\s*DOCK\s*\|/i.test(line)) continue;
    const parts=line.split("|").map(x=>x.trim()).filter(Boolean);
    if(parts.length<3) continue;
    const name=parts[0],dock=parts[1],rawTimes=parts.slice(2).join(" | ");
    if(!name||!/\d{1,2}[:.]\d{2}|STOP/i.test(rawTimes)) continue;
    const times=parseCivTimes(rawTimes);
    items.push({
      id:["civitavecchia",currentDate,name,dock,rawTimes].join("_").replace(/\s+/g,"-"),
      type:"ship",port:"Civitavecchia",port_slug:"civitavecchia",date:currentDate,name,dock,
      arrival:times.arrival,departure:times.departure,source:"Port Mobility Civitavecchia",source_url:CIV_WEEKLY
    });
  }
  return items;
}

function parseCivMonthly(html:string,year:number,sourceUrl:string){
  const items:any[]=[];
  for(const cells of extractRows(html)){
    if(cells.length<7) continue;
    const day=Number(cells[1]),month=Number(cells[2]);
    if(!Number.isInteger(day)||day<1||day>31||!Number.isInteger(month)||month<1||month>12) continue;
    const ar=(cells[3]||"").trim(),dep=(cells[4]||"").trim(),name=(cells[5]||"").trim(),dock=(cells[6]||"").trim();
    if(!name||!dock) continue;
    const date=new Date(Date.UTC(year,month-1,day,12,0,0)).toISOString().slice(0,10);
    items.push({
      id:["civitavecchia",date,name,dock,ar,dep].join("_").replace(/\s+/g,"-"),
      type:"ship",port:"Civitavecchia",port_slug:"civitavecchia",date,name,dock,
      arrival:/^\d{1,2}[:.]\d{2}$/.test(ar)?ar.replace(".",":").padStart(5,"0"):null,
      departure:/^\d{1,2}[:.]\d{2}$/.test(dep)?dep.replace(".",":").padStart(5,"0"):null,
      source:"Port Mobility Civitavecchia",source_url:sourceUrl
    });
  }
  return items;
}

async function loadCivitavecchia(today:string){
  const p=dateParts(today);
  let weekly:any[]=[];
  try{weekly=parseCivWeekly(await fetchText(CIV_WEEKLY));}catch(_){}
  const chunks=await Promise.all([0,1,2].map(async delta=>{
    const md=addMonths(p.y,p.m,delta);
    const url="https://civitavecchia.portmobility.it/en/cruises-port-civitavecchia-"+MONTH_NAMES[md.month];
    try{return parseCivMonthly(await fetchText(url),md.year,url);}catch(_){return [];}
  }));
  return {provider:"Port Mobility Civitavecchia",official:true,source_url:CIV_WEEKLY,items:unique(weekly.concat(chunks.flat()))};
}

/* Global Ports Holding */
function parseGphDateTime(line:string){
  const m=line.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(20\d{2})\s*(?:\||-|·)?\s*(\d{1,2}:\d{2})/);
  if(!m) return null;
  const month=MONTH_SHORT[m[2].toUpperCase()];
  if(month==null) return null;
  return {date:new Date(Date.UTC(Number(m[3]),month,Number(m[1]),12,0,0)).toISOString().slice(0,10),time:m[4].padStart(5,"0")};
}

function nextMeaningful(lines:string[],start:number){
  for(let j=start;j<Math.min(lines.length,start+6);j++){
    const x=lines[j].trim();
    if(x&&!/^(Loading\.\.\.|Cruise Line|Arrival|Departure|Ship)$/i.test(x)) return x;
  }
  return "";
}

function parseGph(html:string,portSlug:string,portLabel:string,sourceUrl:string){
  const lines=htmlToLines(html),items:any[]=[];
  let pending:any={};
  function flush(){
    if(!pending.name||!(pending.arrivalDate||pending.departureDate)){pending={};return;}
    const date=pending.arrivalDate||pending.departureDate;
    items.push({
      id:[portSlug,date,pending.name,pending.arrival,pending.departure].join("_").replace(/\s+/g,"-"),
      type:"ship",port:portLabel,port_slug:portSlug,date,name:pending.name,dock:"—",
      arrival:pending.arrival||null,departure:pending.departure||null,
      source:portLabel+" Cruise Port",source_url:sourceUrl
    });
    pending={};
  }
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/^Arrival$/i.test(line)){
      if(pending.name) flush();
      const dt=parseGphDateTime(nextMeaningful(lines,i+1));
      if(dt){pending.arrivalDate=dt.date;pending.arrival=dt.time;}
    }else if(/^Departure$/i.test(line)){
      const dt=parseGphDateTime(nextMeaningful(lines,i+1));
      if(dt){pending.departureDate=dt.date;pending.departure=dt.time;}
    }else if(/^Ship$/i.test(line)){
      const name=nextMeaningful(lines,i+1);
      if(name&&!/^Cruise Line$/i.test(name)) pending.name=name;
    }
  }
  flush();
  return unique(items);
}

async function loadGph(portSlug:string,portLabel:string,sourceUrl:string){
  const html=await fetchText(sourceUrl);
  return {provider:portLabel+" Cruise Port",official:true,source_url:sourceUrl,items:parseGph(html,portSlug,portLabel,sourceUrl)};
}

/* Olbia official daily movements */
function isCruiseCompany(company:string){
  return /(MSC|COSTA|AIDA|CELEBRITY|ROYAL CARIBBEAN|NORWEGIAN|VIKING|SILVERSEA|SEA CLOUD|PONANT|TUI|MARELLA|AZAMARA|REGENT|OCEANIA|PRINCESS|HOLLAND AMERICA|CUNARD|CARNIVAL|EXPLORA|WINDSTAR|ATLAS|VARIETY|SCENIC|SEABOURN)/i.test(company);
}

function parseOlbiaDay(html:string,date:string){
  const found=new Map<string,any>();
  for(const cells of extractRows(html)){
    if(cells.length<5) continue;
    const company=(cells[0]||"").trim();
    if(!isCruiseCompany(company)) continue;
    if(/^\d{1,2}:\d{2}$/.test((cells[2]||"").trim())&&(cells[1]||"").trim()){
      const name=(cells[1]||"").trim(),key=name.toUpperCase();
      const item=found.get(key)||{id:["olbia",date,name].join("_").replace(/\s+/g,"-"),type:"ship",port:"Olbia",port_slug:"olbia",date,name,dock:"—",arrival:null,departure:null,source:"Porto di Olbia",source_url:"https://www.portodiolbia.it/it/transiti/"+date};
      item.arrival=(cells[2]||"").trim();
      item.dock=(cells[5]||"").trim()||item.dock;
      found.set(key,item);
    }
    if(/^\d{1,2}:\d{2}$/.test((cells[3]||"").trim())&&(cells[2]||"").trim()){
      const name=(cells[2]||"").trim(),key=name.toUpperCase();
      const item=found.get(key)||{id:["olbia",date,name].join("_").replace(/\s+/g,"-"),type:"ship",port:"Olbia",port_slug:"olbia",date,name,dock:"—",arrival:null,departure:null,source:"Porto di Olbia",source_url:"https://www.portodiolbia.it/it/transiti/"+date};
      item.departure=(cells[3]||"").trim();
      item.dock=(cells[6]||"").trim()||item.dock;
      found.set(key,item);
    }
  }
  return Array.from(found.values());
}

async function loadOlbia(today:string){
  const chunks=await Promise.all(Array.from({length:15},(_,i)=>addDays(today,i)).map(async date=>{
    try{return parseOlbiaDay(await fetchText("https://www.portodiolbia.it/it/transiti/"+date),date);}catch(_){return [];}
  }));
  return {provider:"Porto di Olbia",official:true,source_url:"https://www.portodiolbia.it/it/node",items:unique(chunks.flat())};
}

/* CruiseTimetables fallback */
function cleanTimeToken(token:string|null){
  if(!token) return null;
  const m=token.match(/\b(\d{4})\b/);
  return m?m[1].slice(0,2)+":"+m[1].slice(2):null;
}

function parseCtMonth(html:string,year:number,month:number,portSlug:string,portLabel:string,sourceUrl:string){
  const lines=htmlToLines(html),items:any[]=[];
  let currentDate:string|null=null,lastCandidate="";
  for(const raw of lines){
    const line=raw.trim();
    const dm=line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})$/i);
    if(dm){
      currentDate=new Date(Date.UTC(year,month,Number(dm[2]),12,0,0)).toISOString().slice(0,10);
      lastCandidate="";
      continue;
    }
    if(!currentDate) continue;
    const tm=line.match(/^a\s+(.+?)\s+d\s+(.+)$/i);
    if(tm){
      const name=lastCandidate.trim();
      if(name&&!/^\d+$/.test(name)&&!/^(Day|Ship|Times|Passengers?|Pass'gers|Cruise Line)$/i.test(name)){
        items.push({
          id:[portSlug,currentDate,name,tm[1],tm[2]].join("_").replace(/\s+/g,"-"),
          type:"ship",port:portLabel,port_slug:portSlug,date:currentDate,name,dock:"—",
          arrival:cleanTimeToken(tm[1]),departure:cleanTimeToken(tm[2]),
          source:"CruiseTimetables",source_url:sourceUrl
        });
      }
      lastCandidate="";
      continue;
    }
    if(line&&!/^[🧍\s]+$/u.test(line)&&!/^\d+$/.test(line)&&!/^(Day|Ship|Times|Passengers?|Pass'gers|Cruise Line|Legend.*|Change|Month|<<prev next>>|©.*|Summary|All)$/i.test(line)&&!/Cruise Ship Schedule/i.test(line)&&!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(line)){
      lastCandidate=line;
    }
  }
  return items;
}

async function loadCt(portSlug:string,portLabel:string,base:string,today:string){
  const p=dateParts(today);
  const chunks=await Promise.all([0,1,2,3].map(async delta=>{
    const md=addMonths(p.y,p.m,delta);
    const url="https://www.cruisetimetables.com/"+base+"schedule-"+MONTH_ABBR[md.month]+md.year+".html";
    try{
      const html=await fetchText(url);
      if(/Javascript is required|being redirected/i.test(stripTags(html))) return [];
      return parseCtMonth(html,md.year,md.month,portSlug,portLabel,url);
    }catch(_){return [];}
  }));
  return {provider:"CruiseTimetables",official:false,source_url:"https://www.cruisetimetables.com/",items:unique(chunks.flat())};
}

Deno.serve(async (req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(origin)});
  if(req.method!=="GET") return json({error:"method_not_allowed"},405,origin);
  if(origin&& !ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const url=new URL(req.url);
  const portSlug=(url.searchParams.get("port")||"civitavecchia").toLowerCase().trim();
  const config=PORTS[portSlug];
  if(!config) return json({error:"invalid_port"},400,origin);
  const today=romeToday();

  try{
    let loaded:any;
    if(config.kind==="civitavecchia") loaded=await loadCivitavecchia(today);
    else if(config.kind==="gph") loaded=await loadGph(portSlug,config.label,config.source!);
    else if(config.kind==="olbia") loaded=await loadOlbia(today);
    else loaded=await loadCt(portSlug,config.label,config.base!,today);

    let items=(loaded.items||[]).filter((x:any)=>x.date>=today);
    const date=(url.searchParams.get("date")||"").trim();
    const q=(url.searchParams.get("q")||"").trim().toUpperCase();
    if(date) items=items.filter((x:any)=>x.date===date);
    if(q) items=items.filter((x:any)=>String(x.name||"").toUpperCase().includes(q));

    return json({
      provider:loaded.provider,
      official:!!loaded.official,
      connected:true,
      port:config.label,
      port_slug:portSlug,
      source_url:loaded.source_url||null,
      total:items.length,
      items
    },200,origin);
  }catch(error){
    return json({error:"ships_source_error",port:config.label,port_slug:portSlug,message:error instanceof Error?error.message:"unknown"},502,origin);
  }
});
