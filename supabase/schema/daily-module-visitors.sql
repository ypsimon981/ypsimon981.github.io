create table public.daily_module_visitors (
 visit_day date not null,
 visitor_id uuid not null,
 module text not null check (module in ('home','cartello','timestamp','monitor','navi','voli','treni','preventivo','preventivi-salvati','testo-cliente','traduttore','veicolo')),
 first_seen_at timestamptz not null default now(),
 primary key (visit_day, visitor_id, module)
);
alter table public.daily_module_visitors enable row level security;
revoke all on public.daily_module_visitors from anon, authenticated;
grant select, insert, delete on public.daily_module_visitors to service_role;
create policy no_public_statistics on public.daily_module_visitors for select to anon, authenticated using (false);
comment on table public.daily_module_visitors is 'Daily per-browser pseudonymous counts, Europe/Rome; no passenger data, IP addresses, user agents or cross-day visitor IDs.';