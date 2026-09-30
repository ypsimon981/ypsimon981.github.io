import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://ypsimon981.github.io";

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin)
  });
}

function ts(value: unknown): number {
  if (!value || typeof value !== "string") return Number.NaN;
  return new Date(value).getTime();
}

function scoreFlight(f: any, now: number): number {
  const schedOut = ts(f.scheduled_out);
  const estOut = ts(f.estimated_out);
  const schedIn = ts(f.scheduled_in);
  const estIn = ts(f.estimated_in);
  const actualOut = ts(f.actual_out);
  const actualIn = ts(f.actual_on || f.actual_in);

  if (Number.isFinite(actualIn)) {
    return 5_000_000_000 - Math.abs(now - actualIn);
  }

  if (Number.isFinite(actualOut)) {
    const ref = Number.isFinite(estIn) ? estIn : schedIn;
    return 9_000_000_000 - (Number.isFinite(ref) ? Math.abs(ref - now) : 0);
  }

  const dep = Number.isFinite(estOut) ? estOut : schedOut;
  if (Number.isFinite(dep)) {
    const delta = dep - now;
    if (delta >= -6 * 3600000 && delta <= 36 * 3600000) {
      return 8_000_000_000 - Math.abs(delta);
    }
    return 3_000_000_000 - Math.abs(delta);
  }

  return 0;
}

function airport(a: any) {
  return {
    code: a?.code_iata || a?.code || "—",
    code_icao: a?.code_icao || "",
    name: a?.name || "",
    city: a?.city || ""
  };
}

function normalizeFlight(f: any, targetDate:string|null) {
  let status = f.status || "";
  if (!status) {
    if (f.cancelled) status = "Cancellato";
    else if (f.actual_on || f.actual_in) status = "Atterrato";
    else if (f.actual_off) status = "In volo";
    else status = "Programmato";
  }

  return {
    ident: f.ident_iata || f.ident || "",
    ident_icao: f.ident_icao || f.ident || "",
    fa_flight_id: f.fa_flight_id || "",
    airline: f.operator_name || f.operator || "",
    status,
    cancelled: !!f.cancelled,
    diverted: !!f.diverted,
    origin: airport(f.origin),
    destination: airport(f.destination),
    scheduled_out: f.scheduled_out || null,
    estimated_out: f.estimated_out || null,
    actual_out: f.actual_out || null,
    scheduled_in: f.scheduled_in || null,
    estimated_in: f.estimated_in || f.estimated_on || null,
    actual_in: f.actual_in || null,
    actual_on: f.actual_on || null,
    estimated_on: f.estimated_on || null,
    scheduled_on: f.scheduled_on || null,
    terminal_origin: f.terminal_origin || null,
    gate_origin: f.gate_origin || null,
    terminal_destination: f.terminal_destination || null,
    gate_destination: f.gate_destination || null,
    progress_percent: f.progress_percent ?? null,
    target_date: targetDate
  };
}

function romeDate(value:any):string|null{
  if(!value) return null;
  const d=new Date(value);
  if(isNaN(d.getTime())) return null;
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(d);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return get("year")+"-"+get("month")+"-"+get("day");
}

function validDate(v:string){
  return /^20\d{2}-\d{2}-\d{2}$/.test(v);
}


// Durable airport cache and atomic lease shared by every edge instance.
async function cachedAirport(db:any,id:string,key:string){
  const cacheKey="airport:"+id,now=Date.now();
  const read=async()=>{const {data,error}=await db.from("airport_arrivals_cache").select("payload,fetched_at,expires_at").eq("cache_key",cacheKey).maybeSingle();if(error)throw error;return data;};
  let old=await read();
  if(old?.payload && Date.parse(old.expires_at)>now)return {...old,stale:false};
  const {data:claimed,error}=await db.rpc("claim_airport_refresh",{p_key:cacheKey});
  if(error)throw error;
  if(!claimed){
    if(old?.payload && now-Date.parse(old.fetched_at)<10*60000)return {...old,stale:true};
    for(let n=0;n<10;n++){await new Promise(r=>setTimeout(r,300));old=await read();if(old?.payload)return {...old,stale:Date.parse(old.expires_at)<=Date.now()};}
    throw new Error("refresh_pending");
  }
  try{
    const res=await fetch("https://aeroapi.flightaware.com/aeroapi/airports/"+id+"/flights?max_pages=1",{headers:{"x-apikey":key,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error("airport_upstream_"+res.status);
    const payload=await res.json();if(!Array.isArray(payload.arrivals)||!Array.isArray(payload.scheduled_arrivals))throw new Error("airport_invalid_payload");
    const fetched_at=new Date().toISOString(),expires_at=new Date(Date.now()+60000).toISOString();
    const {error:writeError}=await db.from("airport_arrivals_cache").update({payload,fetched_at,expires_at,refresh_until:new Date(0).toISOString()}).eq("cache_key",cacheKey);if(writeError)throw writeError;
    return {payload,fetched_at,expires_at,stale:false};
  }catch(e){
    // Keep a short retry lease after failure; never fan out provider requests.
    await db.from("airport_arrivals_cache").update({refresh_until:new Date(Date.now()+15000).toISOString()}).eq("cache_key",cacheKey);
    if(old?.payload && now-Date.parse(old.fetched_at)<10*60000)return {...old,stale:true};throw e;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "origin_not_allowed" }, 403, origin);
  }

  const publishableKeys = JSON.parse(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
  );
  const expectedPublicKey = publishableKeys["default"];
  const suppliedKey = req.headers.get("apikey");

  if (!expectedPublicKey || suppliedKey !== expectedPublicKey) {
    return json({ error: "unauthorized" }, 401, origin);
  }

  const url = new URL(req.url);
  const ident = (url.searchParams.get("ident") || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const requestedDate=(url.searchParams.get("date")||"").trim();
  const targetDate=validDate(requestedDate)?requestedDate:null;
  const radarAirport=(url.searchParams.get("airport")||"").toUpperCase();
  if(radarAirport && radarAirport!=="FCO") return json({error:"airport_not_supported"},400,origin);

  if (!radarAirport && !/^[A-Z0-9]{2,10}$/.test(ident)) {
    return json({ error: "invalid_ident" }, 400, origin);
  }

  const secretKeys = JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
  );
  const adminKey =
    secretKeys["default"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!adminKey) {
    return json({ error: "supabase_admin_key_missing" }, 500, origin);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    adminKey,
    { auth: { persistSession: false } }
  );

  const { data: secretRow, error: secretError } = await supabase
    .from("app_secrets")
    .select("value")
    .eq("key", "flightaware_api_key")
    .maybeSingle();

  if (secretError || !secretRow?.value) {
    return json({ error: "flightaware_key_missing" }, 500, origin);
  }


  if(radarAirport){
    try {
      const raw=await cachedAirport(supabase,radarAirport,secretRow.value);
      const seen=new Map();
      for(const f of [...(raw.payload.arrivals||[]),...(raw.payload.scheduled_arrivals||[])]){
        if(f.cancelled||f.diverted)continue;
        const landing=ts(f.actual_on),expected=ts(f.estimated_on||f.estimated_in||f.scheduled_on||f.scheduled_in);
        if(Number.isFinite(landing)?Date.now()-landing>2*3600000:!Number.isFinite(expected)||expected<Date.now()-3600000||expected>Date.now()+6*3600000)continue;
        seen.set(f.fa_flight_id||[f.ident,f.scheduled_in].join("|"),normalizeFlight(f,romeDate(f.actual_on||f.estimated_on||f.scheduled_in)));
      }
      const items=Array.from(seen.values()).sort((a:any,b:any)=>{if(!!a.actual_on!==!!b.actual_on)return a.actual_on?1:-1;return a.actual_on?ts(b.actual_on)-ts(a.actual_on):ts(a.estimated_on||a.estimated_in||a.scheduled_in)-ts(b.estimated_on||b.estimated_in||b.scheduled_in);});
      return json({provider:"FlightAware",airport:radarAirport,items,fetched_at:raw.fetched_at,stale:raw.stale,limited:!!raw.payload.links?.next},200,origin);
    }catch(e){return json({error:"radar_unavailable"},503,origin);}
  }

  try {
    const endpoint =
      "https://aeroapi.flightaware.com/aeroapi/flights/" +
      encodeURIComponent(ident) +
      "?max_pages=1";

    const upstream = await fetch(endpoint, {
      headers: {
        "x-apikey": secretRow.value,
        "Accept": "application/json"
      }
    });

    const raw = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return json({
        error: "flightaware_error",
        status: upstream.status,
        detail: raw
      }, upstream.status, origin);
    }

    let flights = Array.isArray(raw?.flights) ? raw.flights : [];

    if(targetDate){
      flights=flights.filter((f:any)=>{
        const ref=f.estimated_in||f.scheduled_in||f.estimated_out||f.scheduled_out;
        return romeDate(ref)===targetDate;
      });
    }

    if (!flights.length) {
      return json({ error: targetDate?"flight_not_found_for_date":"flight_not_found", ident, target_date:targetDate }, 404, origin);
    }

    const now = Date.now();
    const best = flights
      .slice()
      .sort((a: any, b: any) => scoreFlight(b, now) - scoreFlight(a, now))[0];

    return json({
      provider: "FlightAware",
      target_date:targetDate,
      flight: normalizeFlight(best,targetDate)
    }, 200, origin);
  } catch (error) {
    return json({
      error: "proxy_error",
      message: error instanceof Error ? error.message : "unknown"
    }, 502, origin);
  }
});