// Supabase Edge Function: CoDriver FlightAware proxy
// Secret richiesto: FLIGHTAWARE_API_KEY
// Deploy target: /functions/v1/flight

const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ypsimon981.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const age = Math.abs(now - actualIn);
    return 5000000000 - age;
  }

  if (Number.isFinite(actualOut)) {
    const ref = Number.isFinite(estIn) ? estIn : schedIn;
    const distance = Number.isFinite(ref) ? Math.abs(ref - now) : 0;
    return 9000000000 - distance;
  }

  const dep = Number.isFinite(estOut) ? estOut : schedOut;
  if (Number.isFinite(dep)) {
    const delta = dep - now;
    if (delta >= -6 * 3600000 && delta <= 36 * 3600000) {
      return 8000000000 - Math.abs(delta);
    }
    return 3000000000 - Math.abs(delta);
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

function normalizeFlight(f: any) {
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
    progress_percent: f.progress_percent ?? null
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const url = new URL(req.url);
  const ident = (url.searchParams.get("ident") || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!/^[A-Z0-9]{2,10}$/.test(ident)) {
    return json({ error: "invalid_ident" }, 400, origin);
  }

  const apiKey = Deno.env.get("FLIGHTAWARE_API_KEY");
  if (!apiKey) {
    return json({ error: "flightaware_key_missing" }, 500, origin);
  }

  try {
    const endpoint =
      "https://aeroapi.flightaware.com/aeroapi/flights/" +
      encodeURIComponent(ident) +
      "?max_pages=1";

    const upstream = await fetch(endpoint, {
      headers: {
        "x-apikey": apiKey,
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

    const flights = Array.isArray(raw?.flights) ? raw.flights : [];
    if (!flights.length) {
      return json({ error: "flight_not_found", ident }, 404, origin);
    }

    const now = Date.now();
    const best = flights
      .slice()
      .sort((a: any, b: any) => scoreFlight(b, now) - scoreFlight(a, now))[0];

    return json({
      provider: "FlightAware",
      flight: normalizeFlight(best)
    }, 200, origin);
  } catch (error) {
    return json({
      error: "proxy_error",
      message: error instanceof Error ? error.message : "unknown"
    }, 502, origin);
  }
});
