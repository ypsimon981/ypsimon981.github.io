create table public.sw_simulation_workspaces (
 company_id uuid primary key references public.sw_companies(id) on delete cascade,
 payload jsonb not null default '{"availability":{},"office":{}}'::jsonb check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=5000000),
 version bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.sw_simulation_workspaces enable row level security;
create policy sw_simulation_office on public.sw_simulation_workspaces for all to authenticated
 using (public.sw_has_role(company_id,array['admin','coordinator']))
 with check (public.sw_has_role(company_id,array['admin','coordinator']));
grant select,insert,update on public.sw_simulation_workspaces to authenticated;
revoke all on public.sw_simulation_workspaces from anon;
create table public.sw_user_preferences (
 company_id uuid not null references public.sw_companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object' and octet_length(preferences::text)<=10000),
 primary key(company_id,user_id)
);
alter table public.sw_user_preferences enable row level security;
create policy sw_preferences_self on public.sw_user_preferences for all to authenticated
 using (user_id=(select auth.uid()) and public.sw_has_role(company_id,array['admin','coordinator','driver']))
 with check (user_id=(select auth.uid()) and public.sw_has_role(company_id,array['admin','coordinator','driver']));
grant select,insert,update on public.sw_user_preferences to authenticated;
revoke all on public.sw_user_preferences from anon;
alter table public.sw_vehicles add column technical_details jsonb not null default '{}'::jsonb check(jsonb_typeof(technical_details)='object' and octet_length(technical_details::text)<=20000);
alter table public.sw_vehicles add column data_version bigint not null default 0;

