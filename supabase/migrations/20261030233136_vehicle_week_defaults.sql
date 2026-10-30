create table public.sw_vehicle_week_defaults (
 company_id uuid not null references public.sw_companies(id) on delete cascade,
 vehicle_id uuid not null,
 effective_week date not null check(extract(isodow from effective_week)=1),
 excluded boolean not null default false,
 revision uuid not null default gen_random_uuid(),
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 primary key(company_id,vehicle_id,effective_week),
 foreign key(company_id,vehicle_id) references public.sw_vehicles(company_id,id) on delete cascade
);
alter table public.sw_vehicle_week_defaults enable row level security;
create policy sw_vehicle_week_defaults_read on public.sw_vehicle_week_defaults for select to authenticated
 using(public.sw_has_role(company_id,array['admin','coordinator','driver']));
create policy sw_vehicle_week_defaults_insert on public.sw_vehicle_week_defaults for insert to authenticated
 with check(public.sw_has_role(company_id,array['admin','coordinator']));
create policy sw_vehicle_week_defaults_update on public.sw_vehicle_week_defaults for update to authenticated
 using(public.sw_has_role(company_id,array['admin','coordinator']))
 with check(public.sw_has_role(company_id,array['admin','coordinator']));
grant select,insert,update on public.sw_vehicle_week_defaults to authenticated;
revoke all on public.sw_vehicle_week_defaults from anon;
-- An explicit daily exception belongs to the current default revision.
-- Changing a weekly default invalidates earlier available exceptions without erasing them.
alter table public.sw_vehicle_calendar add column week_default_revision uuid;
