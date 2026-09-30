-- Additive schema; existing personal data and secrets are untouched.
create table if not exists public.airport_arrivals_cache (
 cache_key text primary key,
 payload jsonb,
 fetched_at timestamptz,
 expires_at timestamptz,
 refresh_until timestamptz not null default 'epoch'
);
alter table public.airport_arrivals_cache enable row level security;
revoke all on public.airport_arrivals_cache from public,anon,authenticated;
grant all on public.airport_arrivals_cache to service_role;
create or replace function public.claim_airport_refresh(p_key text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 insert into public.airport_arrivals_cache(cache_key) values(p_key) on conflict do nothing;
 update public.airport_arrivals_cache set refresh_until=now()+interval '30 seconds'
 where cache_key=p_key and refresh_until<=now() and (expires_at is null or expires_at<=now());
 return found;
end; $$;
revoke all on function public.claim_airport_refresh(text) from public,anon,authenticated;
grant execute on function public.claim_airport_refresh(text) to service_role;
