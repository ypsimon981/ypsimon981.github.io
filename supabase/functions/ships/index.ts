
const WEEKLY_URL = "https://civitavecchia.portmobility.it/en/port-civitavecchia-arrivals-and-departures-real-time";
const MONTH_SLUGS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december"
];
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

function stripTags(input: string) {
  return decodeEntities(input.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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
  return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString().slice(0, 10);
}

function parseTimes(raw: string) {
  const text = raw.trim().toUpperCase();
  let arrival: string | null = null;
  let departure: string | null = null;

  const pair = text.match(/(\d{1,2}[:.]\d{2})\s*\/\s*(\d{1,2}[:.]\d{2})/);
  if (pair) {
    arrival = pair[1].replace(".", ":").padStart(5, "0");
    departure = pair[2].replace(".", ":").padStart(5, "0");
    return { arrival, departure };
  }

  const a = text.match(/(?:^|\s)A\.?\s*(\d{1,2}[:.]\d{2})/);
  const d = text.match(/(?:^|\s)D\.?\s*(\d{1,2}[:.]\d{2})/);
  if (a) arrival = a[1].replace(".", ":").padStart(5, "0");
  if (d) departure = d[1].replace(".", ":").padStart(5, "0");

  return { arrival, departure };
}

function parseWeekly(html: string) {
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
    if (!/\d{1,2}[:.]\d{2}|STOP/i.test(rawTimes)) continue;

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
      source: "Port Mobility Civitavecchia · settimanale"
    });
  }

  return { planning, items };
}

function extractRows(html: string) {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const tdRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1]))) {
      cells.push(stripTags(td[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseMonthly(html: string, requestedYear: number) {
  const text = stripTags(html);
  const years = Array.from(text.matchAll(/\b(20\d{2})\b/g)).map(m => Number(m[1]));
  const detectedYear = years.find(y => y >= requestedYear - 1 && y <= requestedYear + 1) || requestedYear;
  if (detectedYear !== requestedYear) {
    return { year: detectedYear, items: [] as any[] };
  }

  const items: any[] = [];
  for (const cells of extractRows(html)) {
    if (cells.length < 7) continue;

    const day = Number(cells[1]);
    const month = Number(cells[2]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;

    const arrivalRaw = (cells[3] || "").trim();
    const departureRaw = (cells[4] || "").trim();
    const name = (cells[5] || "").trim();
    const dock = (cells[6] || "").trim();
    if (!name || !dock) continue;

    const date = new Date(Date.UTC(requestedYear, month - 1, day, 12, 0, 0))
      .toISOString().slice(0, 10);

    const arrival = /^\d{1,2}[:.]\d{2}$/.test(arrivalRaw)
      ? arrivalRaw.replace(".", ":").padStart(5, "0")
      : null;
    const departure = /^\d{1,2}[:.]\d{2}$/.test(departureRaw)
      ? departureRaw.replace(".", ":").padStart(5, "0")
      : null;

    items.push({
      id: [date, name, dock, arrivalRaw, departureRaw].join("_").replace(/\s+/g, "-"),
      type: "ship",
      port: "Civitavecchia",
      date,
      name,
      dock,
      arrival,
      departure,
      raw_times: arrivalRaw + "/" + departureRaw,
      source: "Port Mobility Civitavecchia · mensile"
    });
  }

  return { year: detectedYear, items };
}

function unique(items: any[]) {
  const map = new Map<string, any>();
  for (const x of items) {
    const key = (x.date + "|" + x.name).toUpperCase();
    if (!map.has(key)) map.set(key, x);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.date + "T" + (a.arrival || a.departure || "23:59") + ":00").getTime();
    const tb = new Date(b.date + "T" + (b.arrival || b.departure || "23:59") + ":00").getTime();
    return ta - tb;
  });
}

async function fetchText(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  const bust = new Date().toISOString().slice(0, 13);
  const res = await fetch(url + sep + "_codriver=" + encodeURIComponent(bust), {
    headers: {
      "User-Agent": "CoDriver/0.1 academic-prototype",
      "Accept-Language": "en-GB,en;q=0.9",
      "Cache-Control": "no-cache"
    }
  });
  if (!res.ok) throw new Error("upstream_" + res.status);
  return await res.text();
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
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const monthUrl =
      "https://civitavecchia.portmobility.it/en/cruises-port-civitavecchia-" +
      MONTH_SLUGS[currentMonth];

    const weeklyHtml = await fetchText(WEEKLY_URL).catch(() => "");
    const weekly = weeklyHtml ? parseWeekly(weeklyHtml) : { planning: "", items: [] as any[] };

    let monthlyItems: any[] = [];
    try {
      const monthlyHtml = await fetchText(monthUrl);
      monthlyItems = parseMonthly(monthlyHtml, currentYear).items;
    } catch (_) {}

    const today = now.toISOString().slice(0, 10);
    const weekLooksCurrent = weekly.items.some(x => {
      const delta = Math.abs(new Date(x.date + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime());
      return delta <= 8 * 86400000;
    });

    let combined = weekLooksCurrent
      ? unique(weekly.items.concat(monthlyItems))
      : unique(monthlyItems.length ? monthlyItems : weekly.items);

    // CoDriver mostra solo le navi da oggi in avanti.
    combined = combined.filter(x => x.date >= today);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toUpperCase();
    const date = (url.searchParams.get("date") || "").trim();

    if (date) combined = combined.filter(x => x.date === date);
    if (q) combined = combined.filter(x => x.name.toUpperCase().includes(q));

    return json({
      provider: "Port Mobility Civitavecchia",
      port: "Civitavecchia",
      planning: weekly.planning,
      weekly_current: weekLooksCurrent,
      monthly_source: monthUrl,
      total: combined.length,
      items: combined
    }, 200, origin);
  } catch (error) {
    return json({
      error: "ships_proxy_error",
      message: error instanceof Error ? error.message : "unknown"
    }, 502, origin);
  }
});
