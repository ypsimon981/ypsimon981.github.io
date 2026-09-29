
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
  const url="https://photon.komoot.io/api/?limit=1&lang=default&q="+encodeURIComponent(query);
  const res=await fetch(url,{
    headers:{
      "User-Agent":"CoDriver/0.1 quick-quote prototype (+https://ypsimon981.github.io/)",
      "Accept-Language":"it-IT,it;q=0.9,en;q=0.7"
    }
  });
  if(!res.ok) throw new Error("geocode_"+res.status);
  const data=await res.json();
  const f=data&&Array.isArray(data.features)?data.features[0]:null;
  if(!f||!f.geometry||!Array.isArray(f.geometry.coordinates)) return null;
  const p=f.properties||{};
  const label=[p.name,p.street,p.city,p.state,p.country].filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;}).join(", ")||query;
  return {
    lat:Number(f.geometry.coordinates[1]),
    lon:Number(f.geometry.coordinates[0]),
    label
  };
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

    return json({
      provider:"OpenStreetMap + OSRM",
      from:a,
      to:b,
      distance_km:Math.round((best.distance/1000)*10)/10,
      duration_min:Math.round(best.duration/60)
    },200,origin);
  }catch(error){
    return json({
      error:"route_error",
      message:error instanceof Error?error.message:"unknown"
    },502,origin);
  }
});
