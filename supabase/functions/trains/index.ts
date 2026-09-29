
const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const STATIONS: Record<string,{label:string,placeId:string}> = {
  roma_termini:{label:"Roma Termini",placeId:"2416"},
  roma_tiburtina:{label:"Roma Tiburtina",placeId:"2385"},
  fiumicino_aeroporto:{label:"Fiumicino Aeroporto",placeId:"1327"},
  milano_centrale:{label:"Milano Centrale",placeId:"1728"},
  firenze_smn:{label:"Firenze S. M. Novella",placeId:"1325"},
  bologna_centrale:{label:"Bologna Centrale",placeId:"683"},
  napoli_centrale:{label:"Napoli Centrale",placeId:"1888"},
  torino_porta_nuova:{label:"Torino Porta Nuova",placeId:"2876"},
  venezia_s_lucia:{label:"Venezia S. Lucia",placeId:"3009"},
  salerno:{label:"Salerno",placeId:"2617"}
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
  if(s.includes("TRENITALIA")||s.includes("FRECCI")||s.includes("INTERCITY")||s.includes("REGIONALE")) return "Trenitalia";
  // Solo euristiche molto conservative sui numeri Italo più tipici.
  if(/^(89|99)\d{2}$/.test(train)) return "Italo";
  return carrier||category||"—";
}

function addDelay(time:string,delay:number|null){
  if(!time||delay==null||!Number.isFinite(delay)) return time||null;
  const m=time.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return time;
  const total=(Number(m[1])*60+Number(m[2])+delay)%(24*60);
  const h=Math.floor((total+24*60)%(24*60)/60);
  const min=(total+24*60)%(24*60)%60;
  return String(h).padStart(2,"0")+":"+String(min).padStart(2,"0");
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
      platform:platform||"—"
    });
  }
  return items;
}

async function fetchBoard(placeId:string,arrivals:boolean){
  const url="https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?Arrivals="+(arrivals?"True":"False")+"&PlaceId="+encodeURIComponent(placeId);
  const res=await fetch(url,{
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; CoDriver/0.1; +https://ypsimon981.github.io/)",
      "Accept-Language":"it-IT,it;q=0.9,en;q=0.7",
      "Cache-Control":"no-cache"
    },
    redirect:"follow"
  });
  if(!res.ok) throw new Error("rfi_"+res.status);
  return {url,html:await res.text()};
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
    const source=await fetchBoard(station.placeId,mode==="arrivals");
    let items=parseBoard(source.html,mode);
    const q=(url.searchParams.get("q")||"").trim().toUpperCase();
    if(q) items=items.filter(x=>String(x.train).toUpperCase().includes(q)||String(x.destination||x.origin||"").toUpperCase().includes(q));

    return json({
      provider:"RFI Monitor Arrivi/Partenze live",
      station:station.label,
      station_slug:stationSlug,
      place_id:station.placeId,
      mode,
      source_url:source.url,
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
