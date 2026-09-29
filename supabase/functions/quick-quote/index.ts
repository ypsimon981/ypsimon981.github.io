
const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

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

async function geocode(query:string){
  const url="https://photon.komoot.io/api/?limit=8&lang=default&q="+encodeURIComponent(query);
  const res=await fetch(url,{
    headers:{
      "User-Agent":"SteerWill/0.1 quick-quote prototype (+https://ypsimon981.github.io/)",
      "Accept-Language":"it-IT,it;q=0.9,en;q=0.7"
    }
  });
  if(!res.ok) throw new Error("geocode_"+res.status);
  const data=await res.json();
  const features=data&&Array.isArray(data.features)?data.features:[];
  if(!features.length) return null;

  const q=query.trim().toLowerCase();
  function score(f:any){
    const p=f&&f.properties||{};
    const type=String(p.type||"").toLowerCase();
    const key=String(p.osm_key||"").toLowerCase();
    const value=String(p.osm_value||"").toLowerCase();
    const name=String(p.name||"").toLowerCase();
    const city=String(p.city||"").toLowerCase();
    let s=0;

    if(["house","street","city","town","village","suburb","district"].includes(type)) s+=40;
    if(key==="place" && ["city","town","village","suburb"].includes(value)) s+=45;
    if(["railway","aeroway","amenity","tourism"].includes(key)) s+=30;

    if(type==="county" || type==="state" || key==="boundary" || value==="administrative") s-=55;

    if(name && q===name) s+=25;
    if(city && q===city) s+=20;
    if(name && q.includes(name)) s+=10;
    if(city && q.includes(city)) s+=8;

    return s;
  }

  features.sort((a:any,b:any)=>score(b)-score(a));
  const f=features[0];
  if(!f||!f.geometry||!Array.isArray(f.geometry.coordinates)) return null;
  const p=f.properties||{};
  const label=[p.name,p.street,p.city,p.state,p.country].filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;}).join(", ")||query;
  return {
    lat:Number(f.geometry.coordinates[1]),
    lon:Number(f.geometry.coordinates[0]),
    label,
    city:p.city||p.name||null,
    state:p.state||null,
    country:p.country||null
  };
}


function normalizeRegion(value:string|null){
  const s=String(value||"").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[.'’]/g,"")
    .replace(/\s+/g," ");
  const map:Record<string,string>={
    "abruzzo":"Abruzzo","basilicata":"Basilicata","calabria":"Calabria","campania":"Campania",
    "emilia romagna":"Emilia Romagna","emilia-romagna":"Emilia Romagna",
    "friuli venezia giulia":"Friuli Venezia Giulia","lazio":"Lazio","liguria":"Liguria",
    "lombardia":"Lombardia","marche":"Marche","molise":"Molise","piemonte":"Piemonte",
    "puglia":"Puglia","sardegna":"Sardegna","sicilia":"Sicilia","toscana":"Toscana",
    "umbria":"Umbria","valle daosta":"Valle d'Aosta","valle d aosta":"Valle d'Aosta",
    "veneto":"Veneto","trentino-alto adige":"Trento","trentino alto adige":"Trento",
    "autonome provinz bozen sudtirol":"Bolzano","provincia autonoma di bolzano":"Bolzano",
    "provincia autonoma di trento":"Trento"
  };
  if(map[s]) return map[s];
  for(const k of Object.keys(map)) if(s.includes(k)||k.includes(s)) return map[k];
  return null;
}

function parseNumber(v:string){
  const n=Number(String(v||"").trim().replace(",","."));
  return Number.isFinite(n)?n:null;
}

async function fuelPrices(regionRaw:string|null){
  const region=normalizeRegion(regionRaw);
  if(!region) return {region:null,updated:null,prices:null,source:null};

  const source="https://www.mimit.gov.it/images/stories/carburanti/MediaRegionaleStradale.csv";
  try{
    const res=await fetch(source,{
      headers:{
        "User-Agent":"SteerWill/0.1 fuel-cost prototype (+https://ypsimon981.github.io/)",
        "Accept":"text/csv,text/plain,*/*",
        "Cache-Control":"no-cache"
      }
    });
    if(!res.ok) throw new Error("fuel_"+res.status);
    const text=await res.text();
    const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const prices:Record<string,number>={};
    let updated:string|null=null;

    for(const line of lines){
      if(!updated){
        const d=line.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/);
        if(d) updated=d[3]+"-"+String(d[2]).padStart(2,"0")+"-"+String(d[1]).padStart(2,"0");
      }

      const sep=line.includes(";")?";":line.includes("|")?"|":",";
      const cells=line.split(sep).map(x=>x.replace(/^"|"$/g,"").trim());
      const joined=cells.join(" ").toLowerCase();
      if(!joined.includes(region.toLowerCase())) continue;

      let fuel:string|null=null;
      if(/\bgasolio\b/i.test(joined)) fuel="diesel";
      else if(/\bbenzina\b/i.test(joined)) fuel="petrol";
      else if(/\bgpl\b/i.test(joined)) fuel="lpg";
      else if(/\bmetano\b/i.test(joined)) fuel="methane";
      if(!fuel) continue;

      for(let i=cells.length-1;i>=0;i--){
        const n=parseNumber(cells[i]);
        if(n!==null && n>0.3 && n<5){
          prices[fuel]=n;
          break;
        }
      }
    }

    if(!Object.keys(prices).length) throw new Error("fuel_parse");
    return {region,updated,prices,source};
  }catch(_){
    return {region,updated:null,prices:null,source};
  }
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(origin)});
  if(req.method!=="GET") return json({error:"method_not_allowed"},405,origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const url=new URL(req.url);
  const from=(url.searchParams.get("from")||"").trim();
  const to=(url.searchParams.get("to")||"").trim();

  if(from.length<3||to.length<3){
    return json({error:"invalid_route"},400,origin);
  }

  try{
    const [a,b]=await Promise.all([geocode(from),geocode(to)]);
    if(!a||!b){
      return json({error:"address_not_found",from_found:!!a,to_found:!!b},404,origin);
    }

    const routeUrl="https://router.project-osrm.org/route/v1/driving/"
      +a.lon+","+a.lat+";"+b.lon+","+b.lat
      +"?overview=false&steps=false&alternatives=false";

    const routeRes=await fetch(routeUrl,{
      headers:{"User-Agent":"CoDriver/0.1 quick-quote prototype"}
    });
    if(!routeRes.ok) throw new Error("route_"+routeRes.status);
    const route=await routeRes.json();
    const best=route&&route.routes&&route.routes[0];
    if(!best) return json({error:"route_not_found"},404,origin);

    const fuel=await fuelPrices(a.state||null);

    return json({
      provider:"OpenStreetMap + OSRM",
      from:a,
      to:b,
      distance_km:Math.round((best.distance/1000)*10)/10,
      duration_min:Math.round(best.duration/60),
      fuel
    },200,origin);
  }catch(error){
    return json({
      error:"route_error",
      message:error instanceof Error?error.message:"unknown"
    },502,origin);
  }
});
