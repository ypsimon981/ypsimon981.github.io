
const SOURCE_URL = "https://civitavecchia.portmobility.it/en/port-civitavecchia-arrivals-and-departures-real-time";
const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const MONTHS: Record<string, number> = {
  JANUARY:0,FEBRUARY:1,MARCH:2,APRIL:3,MAY:4,JUNE:5,
  JULY:6,AUGUST:7,SEPTEMBER:8,OCTOBER:9,NOVEMBER:10,DECEMBER:11
};

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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToLines(html: string) {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(tr|p|div|h1|h2|h3|h4|h5|li|table|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(cleaned)
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, " ").replace(/\s*\|\s*/g, " | ").trim())
    .filter(Boolean);
}

function parseDateHeader(line: string, year: number) {
  const m = line.toUpperCase().match(/^(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})(?:ST|ND|RD|TH)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2]];
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

function parseTimes(raw: string) {
  const text = raw.trim().toUpperCase();
  let arrival: string | null = null;
  let departure: string | null = null;

  const pair = text.match(/(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})/);
  if (pair) {
    arrival = pair[1].padStart(5, "0");
    departure = pair[2].padStart(5, "0");
    return { arrival, departure };
  }

  const a = text.match(/(?:^|\s)A\.?\s*(\d{1,2}:\d{2})/);
  const d = text.match(/(?:^|\s)D\.?\s*(\d{1,2}:\d{2})/);
  if (a) arrival = a[1].padStart(5, "0");
  if (d) departure = d[1].padStart(5, "0");

  return { arrival, departure };
}

function parseSchedule(html: string) {
  const lines = htmlToLines(html);
  const planning = lines.find(x => /Mooring Planning/i.test(x)) || "";
  const yearMatch = planning.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();

  let currentDate: string | null = null;
  let active = false;
  const items: any[] = [];

  for (const line of lines) {
    if (/Mooring Planning/i.test(line)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (/Dates and departure times may change/i.test(line)) break;

    const date = parseDateHeader(line, year);
    if (date) {
      currentDate = date;
      continue;
    }

    if (!currentDate) continue;
    if (/^SHIP\s*\|\s*DOCK\s*\|/i.test(line)) continue;

    const parts = line.split("|").map(x => x.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    const name = parts[0];
    const dock = parts[1];
    const rawTimes = parts.slice(2).join(" | ");

    if (!name || name.length > 80 || /^(SHIP|DOCK)$/i.test(name)) continue;
    if (!/\d{1,2}:\d{2}|STOP/i.test(rawTimes)) continue;

    const times = parseTimes(rawTimes);
    items.push({
      id: [currentDate, name, dock, rawTimes].join("_").replace(/\s+/g, "-"),
      type: "ship",
      port: "Civitavecchia",
      date: currentDate,
      name,
      dock,
      arrival: times.arrival,
      departure: times.departure,
      raw_times: rawTimes,
      source: "Port Mobility Civitavecchia"
    });
  }

  return { planning, items };
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

  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "CoDriver/0.1 academic-prototype",
        "Accept-Language": "en-GB,en;q=0.9"
      }
    });

    if (!upstream.ok) {
      return json({ error: "source_unavailable", status: upstream.status }, 502, origin);
    }

    const html = await upstream.text();
    const parsed = parseSchedule(html);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toUpperCase();
    const date = (url.searchParams.get("date") || "").trim();

    let items = parsed.items;
    if (date) items = items.filter(x => x.date === date);
    if (q) items = items.filter(x => x.name.toUpperCase().includes(q));

    return json({
      provider: "Port Mobility Civitavecchia",
      port: "Civitavecchia",
      planning: parsed.planning,
      source_url: SOURCE_URL,
      total: items.length,
      items
    }, 200, origin);
  } catch (error) {
    return json({
      error: "ships_proxy_error",
      message: error instanceof Error ? error.message : "unknown"
    }, 502, origin);
  }
});
