// First-party daily usage counts. No read endpoint and no passenger data.
const ORIGIN = "https://ypsimon981.github.io";
const PUBLIC_KEY = "sb_publishable_IYGuSSUStiK95becoD-OQQ_aj_2sGIN";
const MODULES = new Set(["home","cartello","timestamp","monitor","navi","voli","treni","preventivo","preventivi-salvati","testo-cliente","traduttore","veicolo"]);
const cors = {"Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"content-type, apikey","Vary":"Origin","Cache-Control":"no-store"};
function reply(status, body) { return new Response(body ? JSON.stringify(body) : null, {status,headers:{...cors,"Content-Type":"application/json"}}); }
function romeDay() {
 const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
Deno.serve(async req => {
 if(req.headers.get("Origin") !== ORIGIN) return reply(403,{error:"origin"});
 if(req.method === "OPTIONS") return reply(204);
 if(req.method !== "POST") return reply(405,{error:"method"});
 // Publishable API key check; this is public ingestion, not user authentication.
 if(req.headers.get("apikey") !== PUBLIC_KEY) return reply(401,{error:"api_key"});
 if(!req.headers.get("content-type")?.startsWith("application/json")) return reply(415,{error:"content_type"});
 if(Number(req.headers.get("content-length")||0)>512) return reply(413,{error:"size"});
 try {
  const raw = await req.text();
  if(raw.length>512) return reply(413,{error:"size"});
  const data=JSON.parse(raw), day=romeDay();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.visitor_id||"") || !MODULES.has(data.module) || data.day!==day) return reply(400,{error:"invalid_event"});
  const url=Deno.env.get("SUPABASE_URL"), secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!secret)return reply(503,{error:"unavailable"});
  const result=await fetch(url+"/rest/v1/daily_module_visitors?on_conflict=visit_day,visitor_id,module",{
   method:"POST",headers:{"apikey":secret,"Authorization":"Bearer "+secret,"Content-Type":"application/json","Prefer":"resolution=ignore-duplicates,return=minimal"},
   body:JSON.stringify({visit_day:day,visitor_id:data.visitor_id,module:data.module})
  });
  if(!result.ok)return reply(503,{error:"storage"});
  return reply(204);
 } catch {return reply(400,{error:"invalid_event"});}
});