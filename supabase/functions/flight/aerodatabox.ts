// RapidAPI credentials stay on the server. Both providers use independent,
// shared database leases; refreshing one never bypasses the other's cache.
export function utc(value: any): string | null {
  const raw = typeof value === 'string' ? value : value?.utc;
  if (!raw) return null;
  const n = Date.parse(raw.replace(' ', 'T'));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

export function normalizeADB(f: any) {
  return {
    number: String(f.number || '').replace(/\s+/g, '').toUpperCase(),
    status: f.status || '',
    origin: { code: f.departure?.airport?.iata || '', code_icao: f.departure?.airport?.icao || '' },
    destination: { code: f.arrival?.airport?.iata || '', code_icao: f.arrival?.airport?.icao || '' },
    scheduled_out: utc(f.departure?.scheduledTime),
    scheduled_in: utc(f.arrival?.scheduledTime),
    revised_in: utc(f.arrival?.revisedTime),
    runway_in: utc(f.arrival?.runwayTime)
  };
}

export async function cachedADB(db: any, ident: string, date: string, key: string) {
  const cacheKey = 'aerodatabox:' + ident + ':' + date;
  const read = async () => {
    const { data, error } = await db.from('flight_status_cache')
      .select('payload,response_status,fetched_at,expires_at,finalized').eq('cache_key', cacheKey).maybeSingle();
    if (error) throw new Error('adb_cache_unavailable');
    return data;
  };
  const fresh = (row: any) => row?.payload && (row.finalized || Date.parse(row.expires_at) > Date.now());
  const response = (row: any, cached: boolean, stale = false) => ({
    ...row.payload, updated_at: row.payload.error ? null : row.fetched_at, cached,
    stale: stale || !!row.payload.stale,
    next_refresh_at: row.finalized ? null : row.expires_at
  });
  let old = await read();
  if (fresh(old)) return response(old, true);
  const token = crypto.randomUUID();
  const { data: claimed, error } = await db.rpc('claim_flight_refresh', { p_key: cacheKey, p_token: token });
  if (error) throw new Error('adb_cache_unavailable');
  if (!claimed) {
    if (old?.response_status === 200 && Date.now() - Date.parse(old.fetched_at) < 30 * 60000)
      return response(old, true, true);
    for (let n = 0; n < 50; n++) {
      await new Promise(r => setTimeout(r, 320));
      old = await read();
      if (fresh(old)) return response(old, true);
    }
    return { error: 'refresh_pending', updated_at: null };
  }
  old = await read();
  if (fresh(old)) return response(old, true);
  let payload: any, status = 200;
  let fetchedAt = new Date().toISOString();
  try {
    const url = 'https://aerodatabox.p.rapidapi.com/flights/number/' + encodeURIComponent(ident) + '/' + date +
      '?dateLocalRole=Both&withAircraftImage=false&withLocation=false&withFlightPlan=false';
    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error('upstream_' + res.status);
    const raw = res.status === 204 ? [] : await res.json();
    if (!Array.isArray(raw)) throw new Error('invalid_payload');
    payload = { records: raw.map(normalizeADB) };
    fetchedAt = new Date().toISOString();
  } catch {
    // Negative responses also have a 10-minute cache: repeated taps do not
    // hammer RapidAPI. A recent successful snapshot remains explicitly stale.
    const fallback = old?.response_status === 200 && Date.now() - Date.parse(old.fetched_at) < 30 * 60000;
    payload = fallback ? { ...old.payload, stale: true } : { error: 'temporarily_unavailable' };
    fetchedAt = fallback ? old.fetched_at : fetchedAt;
    status = fallback ? 200 : 503;
  }
  const records = payload.records || [];
  const row = {
    payload, response_status: status, fetched_at: fetchedAt,
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
    // Terminal snapshots require all returned occurrences to be terminal.
    finalized: !payload.stale && records.length > 0 && records.every((f: any) => f.status === 'Arrived'),
    refresh_until: new Date(0).toISOString(), refresh_token: null
  };
  const { data: saved, error: writeError } = await db.from('flight_status_cache').update(row)
    .eq('cache_key', cacheKey).eq('refresh_token', token).select('cache_key');
  if (writeError || !saved?.length) throw new Error('adb_cache_write_failed');
  return response(row, false);
}

function sameAirport(a: any, b: any) {
  const known = [a?.code, a?.code_icao].filter((v: any) => v && v !== '—');
  return known.some((v: string) => v === b?.code || v === b?.code_icao);
}

export function matchADB(f: any, records: any[]) {
  if (!f) return null;
  // A flight number can represent several legs or dates. Require matching
  // route and schedule, and refuse ambiguous occurrences instead of guessing.
  const candidates = records.filter(a => sameAirport(f.origin, a.origin) && sameAirport(f.destination, a.destination))
    .map(a => {
      const deltas = ['scheduled_in', 'scheduled_out'].map(k => Math.abs(Date.parse(f[k]) - Date.parse(a[k]))).filter(Number.isFinite);
      return { a, delta: deltas.length ? Math.min(...deltas) : Infinity };
    }).filter(x => x.delta <= 3 * 3600000).sort((a, b) => a.delta - b.delta);
  if (!candidates.length || (candidates.length > 1 && candidates[1].delta - candidates[0].delta < 30 * 60000)) return null;
  return candidates[0].a;
}

export function comparisonFor(fa: any, adb: any) {
  const f = fa.flight;
  const a = matchADB(f, adb.records || []);
  const valid = (t: any) => typeof t === 'string' && Number.isFinite(Date.parse(t));
  const select = (actual: any, estimated: any, scheduled: any, basis: string) =>
    valid(actual) ? { arrival_at: actual, kind: 'actual', basis } :
    valid(estimated) ? { arrival_at: estimated, kind: 'estimated', basis } :
    { arrival_at: valid(scheduled) ? scheduled : null, kind: 'scheduled', basis };
  // Legacy estimated_in could contain estimated_on as a fallback. Do not
  // silently identify that runway fallback as a gate estimate.
  const estimatedGate = f && Object.hasOwn(f, 'estimated_gate_in') ? f.estimated_gate_in :
    f?.estimated_in !== f?.estimated_on ? f?.estimated_in : null;
  const gate = select(f?.actual_in, estimatedGate, f?.scheduled_in, 'gate');
  const runway = select(f?.actual_on, f?.estimated_on, f?.scheduled_on, 'runway');
  const adbKind = a?.status === 'Arrived' ? 'actual' : 'estimated';
  const hasRunway = valid(a?.runway_in);
  // AeroDataBox only explicitly identifies revisedTime as gate when there
  // is a different runwayTime. Without this, its event is unspecified.
  const hasGate = hasRunway && valid(a?.revised_in) && Date.parse(a.revised_in) !== Date.parse(a.runway_in);
  let faValue: any = gate.arrival_at ? gate : runway;
  let adbValue: any = { arrival_at: null, kind: 'scheduled', basis: 'unspecified' };
  if (hasRunway && runway.arrival_at) {
    faValue = runway;
    adbValue = { arrival_at: a.runway_in, kind: adbKind, basis: 'runway' };
  } else if (hasGate && gate.arrival_at) {
    faValue = gate;
    adbValue = { arrival_at: a.revised_in, kind: adbKind, basis: 'gate' };
  } else if (a) {
    adbValue = { arrival_at: a.revised_in || a.runway_in || a.scheduled_in,
      kind: a.revised_in || a.runway_in ? adbKind : 'scheduled',
      basis: hasGate ? 'gate' : hasRunway && !a.revised_in ? 'runway' : 'unspecified' };
  }
  const sameBasis = faValue.basis === adbValue.basis && faValue.basis !== 'unspecified';
  const comparable = sameBasis && faValue.kind === adbValue.kind && faValue.kind !== 'scheduled' &&
    valid(faValue.arrival_at) && valid(adbValue.arrival_at) && !f?.cancelled && !f?.diverted;
  return {
    version: 2,
    flightaware: { ...faValue, updated_at: fa.fetched_at || null, stale: !!fa.stale, cached: !!fa.cached },
    aerodatabox: { ...adbValue, updated_at: adb.updated_at || null, stale: !!adb.stale, cached: !!adb.cached,
      error: adb.error || (!a ? (adb.records?.length ? 'no_matching_flight' : 'flight_not_found') : null) },
    difference_minutes: comparable ? Math.round((Date.parse(adbValue.arrival_at) - Date.parse(faValue.arrival_at)) / 60000) : null,
    difference_reason: comparable ? null : !sameBasis ? 'different_events' : 'missing_or_different_kinds',
    basis: sameBasis ? faValue.basis : 'different_events'
  };
}
