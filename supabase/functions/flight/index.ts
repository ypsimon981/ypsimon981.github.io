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
  const actualIn = ts(f.actual_in);

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
    else if (f.actual_in) status = "Arrivato";
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

  if (!/^[A-Z0-9]{2,10}$/.test(ident)) {
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