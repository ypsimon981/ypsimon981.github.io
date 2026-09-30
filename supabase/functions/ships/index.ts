
const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const PORTS: Record<string, { label: string; kind: string; source?: string; base?: string; aliases?: string[]; provider_id?: string }> = {
  civitavecchia:{label:"Civitavecchia",kind:"civitavecchia",aliases:["Civitavecchia Roma", "Rome", "Civitavecchia (Rome)"],provider_id:"civitavecchia"},
  ancona:{label:"Ancona",kind:"ct",base:"anconaitaly",aliases:[],provider_id:"anconaitaly"},
  bari:{label:"Bari",kind:"ct",base:"bariitaly",aliases:[],provider_id:"bariitaly"},
  brindisi:{label:"Brindisi",kind:"ct",base:"brindisiitaly",aliases:[],provider_id:"brindisiitaly"},
  cagliari:{label:"Cagliari",kind:"gph",source:"https://cagliaricruiseport.com/schedule/",aliases:[],provider_id:"52"},
  catania:{label:"Catania",kind:"gph",source:"https://cataniacruiseport.com/schedule/",aliases:[],provider_id:"50"},
  genova:{label:"Genova",kind:"ct",base:"genoaitaly",aliases:["Genoa"],provider_id:"genoaitaly"},
  laspezia:{label:"La Spezia",kind:"ct",base:"laspeziaitaly",aliases:["La Spezia", "La-Spezia"],provider_id:"laspeziaitaly"},
  livorno:{label:"Livorno",kind:"ct",base:"livornoflorencepisaitaly",aliases:["Livorno Florence Pisa", "Leghorn"],provider_id:"livornoflorencepisaitaly"},
  messina:{label:"Messina",kind:"ct",base:"messinasicily",aliases:["Messina Sicily"],provider_id:"messinasicily"},
  napoli:{label:"Napoli",kind:"ct",base:"naplesitaly",aliases:["Naples"],provider_id:"naplesitaly"},
  olbia:{label:"Olbia",kind:"olbia",base:"olbiasardinia",aliases:["Olbia Sardinia"],provider_id:"olbiasardinia"},
  palermo:{label:"Palermo",kind:"ct",base:"palermosicily",aliases:[],provider_id:"palermosicily"},
  portoferraio:{label:"Portoferraio",kind:"ct",base:"portoferraioitaly",aliases:[],provider_id:"portoferraioitaly"},
  ravenna:{label:"Ravenna",kind:"ct",base:"ravennaitaly",aliases:[],provider_id:"ravennaitaly"},
  salerno:{label:"Salerno",kind:"ct",base:"salernoitaly",aliases:[],provider_id:"salernoitaly"},
  savona:{label:"Savona",kind:"ct",base:"savonaitaly",aliases:[],provider_id:"savonaitaly"},
  siracusa:{label:"Siracusa",kind:"ct",base:"siracusasicily",aliases:["Syracuse"],provider_id:"siracusasicily"},
  taranto:{label:"Taranto",kind:"gph",source:"https://tarantocruiseport.com/schedule/",aliases:[],provider_id:"51"},
  trapani:{label:"Trapani",kind:"ct",base:"trapaniitaly",aliases:[],provider_id:"trapaniitaly"},
  trieste:{label:"Trieste",kind:"ct",base:"triesteitaly",aliases:[],provider_id:"triesteitaly"},
  venezia:{label:"Venezia",kind:"ct",base:"veniceitaly",aliases:["Venice", "Marghera"],provider_id:"veniceitaly"}
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
    signal:AbortSignal.timeout(18000),
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
  const ym=stripTags(html).match(/Mooring Planning[\s\S]{0,100}?(20\d{2})/i);
  const year=ym?Number(ym[1]):new Date().getUTCFullYear();
  let currentDate:string|null=null;const items:any[]=[];
  for(const cells of extractRows(html)){
    const header=parseCivDateHeader(cells[0]||"",year);if(header){currentDate=header;continue;}
    if(!currentDate||cells.length<3||/^SHIP$/i.test(cells[0]))continue;
    const [name,dock,...rest]=cells,raw=rest.join(" ");if(!/\d{1,2}[:.]\d{2}|STOP/i.test(raw))continue;
    const times=parseCivTimes(raw);
    items.push({id:["civitavecchia",currentDate,name,dock,raw].join("_").replace(/\s+/g,"-"),type:"ship",port:"Civitavecchia",port_slug:"civitavecchia",date:currentDate,name,dock,arrival:times.arrival,departure:times.departure,source:"Port Mobility Civitavecchia",source_url:CIV_WEEKLY});
  }return unique(items);
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
  let weekly:any[]=[],success=0;
  try{weekly=parseCivWeekly(await fetchText(CIV_WEEKLY));success++;}catch(_){}
  const chunks=await Promise.all([0,1,2].map(async delta=>{
    const md=addMonths(p.y,p.m,delta);
    const url="https://civitavecchia.portmobility.it/en/cruises-port-civitavecchia-"+MONTH_NAMES[md.month];
    try{const html=await fetchText(url);success++;return parseCivMonthly(html,md.year,url);}catch(_){return [];}
  }));
  if(!success)throw new Error("civitavecchia_source_unavailable");
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
  // The official schedule is delivered as rows with nested mobile headings.
  const rows=html.split(/<div[^>]*class=["']schedule-item-row(?:[^"']*)["'][^>]*>/i).slice(1),items:any[]=[];
  for(const row of rows){
    const field=(name:string)=>{const m=row.match(new RegExp('<div[^>]*class=["\']'+name+'["\'][^>]*>([\\s\\S]*?)(?=<div[^>]*class=["\'](?:eta|etd|shipname|cruiseline|berth)["\']|$)','i'));return m?stripTags(m[1]).replace(/^(Arrival|Departure|Ship|Cruise Line|Berth)\s*/i,""):"";};
    const arrival=parseGphDateTime(field("eta")),departure=parseGphDateTime(field("etd")),name=field("shipname").replace(/LOAD MORE[\s\S]*/i,"").trim();
    if(!name||!arrival||/\d{1,2} [A-Za-z]{3} 20\d{2}/.test(name))continue;
    items.push({id:[portSlug,arrival.date,name,arrival.time,departure?.time].join("_").replace(/\s+/g,"-"),type:"ship",port:portLabel,port_slug:portSlug,date:arrival.date,departure_date:departure?.date||arrival.date,name,dock:field("berth")||"—",arrival:arrival.time,departure:departure?.time||null,source:portLabel+" Cruise Port",source_url:sourceUrl});
  }return unique(items);
}

async function loadGph(portSlug:string,portLabel:string,sourceUrl:string){
  const config=PORTS[portSlug],today=romeToday(),host=new URL(sourceUrl).origin;
  let items:any[]=[],success=false;
  // Follow the same pagination and site IDs as the official portal.
  for(let start=0;start<200;start+=10){
    const url=host+"/wp-content/themes/mbcglobalports/includes/api/schedule.php?"+new URLSearchParams({startIndex:String(start),site_id:config.provider_id!,lang:"en",param2:today,param4:addDays(today,90)});
    const html=await fetchText(url);success=true;const page=parseGph(html,portSlug,portLabel,sourceUrl);items.push(...page);
    if(!page.length && !/no scheduled calls|no connections/i.test(html))throw new Error("gph_parse_error");
    const total=Number(html.match(/data-total=["'](\d+)["']/)?.[1]||0);
    if(page.length<10||!total||start+10>=total)break;
  }
  if(!success)throw new Error("gph_source_unavailable");
  return {provider:portLabel+" Cruise Port",official:true,source_url:sourceUrl,items:unique(items)};
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
  let success=0;
  const chunks=await Promise.all(Array.from({length:7},(_,i)=>addDays(today,i)).map(async date=>{
    try{const html=await fetchText("https://www.portodiolbia.it/it/transiti/"+date);success++;return parseOlbiaDay(html,date);}catch(_){return [];}
  }));
  const official=unique(chunks.flat());
  if(official.length)return {provider:"Porto di Olbia",official:true,source_url:"https://www.portodiolbia.it/it/transiti/"+today,items:official};
  const fallback=await loadCt("olbia","Olbia","olbiasardinia",today);
  return {...fallback,fallback_reason:success?"Calendario ufficiale senza crociere pubblicate":"Fonte ufficiale temporaneamente non disponibile"};
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
  const p=dateParts(today);let success=0,parsedMonths=0;
  const chunks=await Promise.all([0,1,2,3].map(async delta=>{
    const md=addMonths(p.y,p.m,delta);
    const url="https://www.cruisetimetables.com/"+base+"schedule-"+MONTH_ABBR[md.month]+md.year+".html";
    try{
      const html=await fetchText(url);
      if(/Javascript is required|being redirected/i.test(stripTags(html))) throw new Error("blocked_source");
      if(!/Cruise Ship Schedule/i.test(html))throw new Error("invalid_calendar");
      const title=html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||"";
      if(!title.includes(String(md.year))||!title.toLowerCase().includes(MONTH_NAMES[md.month]))return [];
      const parsed=parseCtMonth(html,md.year,md.month,portSlug,portLabel,url);if(parsed.length)parsedMonths++;
      else if(/psovde-listing/.test(html))throw new Error("ct_parse_error");
      success++;return parsed;
    }catch(_){return [];}
  }));
  if(!success)throw new Error("calendar_source_unavailable");
  return {provider:"CruiseTimetables",official:false,source_url:"https://www.cruisetimetables.com/"+base+"schedule-"+MONTH_ABBR[p.m]+p.y+".html",items:unique(chunks.flat()),status:parsedMonths?"ok":"empty"};
}

// Shared public calendar snapshots keep national ports available when sources reject edge hosting.
const snapshotCache=new Map<string,{loaded:any,expires:number}>();
async function loadSnapshot(id:string){
  const cached=snapshotCache.get(id);if(cached&&cached.expires>Date.now())return cached.loaded;
  const res=await fetch("https://raw.githubusercontent.com/ypsimon981/ypsimon981.github.io/main/data/ports/"+id+".json",{signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new Error("calendar_snapshot_unavailable");
  const loaded=await res.json(),age=Date.now()-Date.parse(loaded.fetched_at||"");
  if(loaded.port!==id||!Array.isArray(loaded.items)||!Number.isFinite(age)||age>48*3600000)throw new Error("calendar_snapshot_expired");
  loaded.stale=age>3*3600000;loaded.centralized=true;snapshotCache.set(id,{loaded,expires:Date.now()+300000});return loaded;
}

Deno.serve(async (req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(origin)});
  if(req.method!=="GET") return json({error:"method_not_allowed"},405,origin);
  if(origin&& !ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const url=new URL(req.url);
  const token=(url.searchParams.get("port")||"civitavecchia").toLowerCase().replace(/[^a-z0-9]/g,"");
  const portSlug=Object.keys(PORTS).find(id=>id===token || [PORTS[id].label,...(PORTS[id].aliases||[])].some(name=>name.toLowerCase().replace(/[^a-z0-9]/g,"")===token))||token;
  const config=PORTS[portSlug];
  if(!config) return json({error:"invalid_port"},400,origin);
  const today=romeToday();
  if(url.searchParams.get("catalog")==="1")return json({ports:Object.entries(PORTS).map(([id,p])=>({id,name:p.label,aliases:p.aliases,provider:p.kind,provider_id:p.provider_id}))},200,origin);

  try{
    let loaded:any;
    if(config.kind==="ct"||config.kind==="olbia"){
      try{loaded=await loadSnapshot(portSlug);}catch(e){
        loaded=config.kind==="olbia"?await loadOlbia(today):await loadCt(portSlug,config.label,config.base!,today);
      }
    }else{
      try{
        if(config.kind==="civitavecchia")loaded=await loadCivitavecchia(today);
        else loaded=await loadGph(portSlug,config.label,config.source!);
      }catch(e){loaded=await loadSnapshot(portSlug);}
    }

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
      fetched_at:loaded.fetched_at||new Date().toISOString(),
      stale:!!loaded.stale,
      centralized:!!loaded.centralized,
      source_status:(loaded.items||[]).length?"ok":"empty",
      fallback_reason:loaded.fallback_reason||null,
      total:items.length,
      items
    },200,origin);
  }catch(error){
    return json({error:"ships_source_error",port:config.label,port_slug:portSlug,message:error instanceof Error?error.message:"unknown"},502,origin);
  }
});
