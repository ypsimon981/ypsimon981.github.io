-- Shared flight data only: no customer names or personal trip records.
create table if not exists public.flight_status_cache (
 cache_key text primary key,
 payload jsonb,
 response_status integer not null default 200,
 fetched_at timestamptz,
 expires_at timestamptz,
 finalized boolean not null default false,
 refresh_until timestamptz not null default 'epoch',
 refresh_token uuid
);
alter table public.flight_status_cache enable row level security;
revoke all on public.flight_status_cache from public,anon,authenticated;
grant select,insert,update on public.flight_status_cache to service_role;

create or replace function public.claim_flight_refresh(p_key text,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.flight_status_cache(cache_key) values(p_key) on conflict do nothing;
 update public.flight_status_cache
 set refresh_until=now()+interval '45 seconds',refresh_token=p_token
 where cache_key=p_key and refresh_until<=now() and not finalized
 and (expires_at is null or expires_at<=now());
 return found;
end; $$;
revoke all on function public.claim_flight_refresh(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_flight_refresh(text,uuid) to service_role;
