create table public.sw_vehicle_calendar (
 company_id uuid not null references public.sw_companies(id) on delete cascade,
 vehicle_id uuid not null,
 day date not null,
 state text not null default 'available' check(state in ('available','maintenance','broken')),
 required_morning boolean not null default false,
 required_afternoon boolean not null default false,
 note text not null default '' check(char_length(note)<=1000),
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 primary key(company_id,vehicle_id,day),
 foreign key(company_id,vehicle_id) references public.sw_vehicles(company_id,id) on delete cascade,
 check(state='available' or (not required_morning and not required_afternoon))
);
create index sw_vehicle_calendar_company_day_idx on public.sw_vehicle_calendar(company_id,day);
alter table public.sw_vehicle_calendar enable row level security;
create policy sw_vehicle_calendar_read on public.sw_vehicle_calendar for select to authenticated
 using(public.sw_has_role(company_id,array['admin','coordinator','driver']));
create policy sw_vehicle_calendar_insert on public.sw_vehicle_calendar for insert to authenticated
 with check(public.sw_has_role(company_id,array['admin','coordinator']));
create policy sw_vehicle_calendar_update on public.sw_vehicle_calendar for update to authenticated
 using(public.sw_has_role(company_id,array['admin','coordinator']))
 with check(public.sw_has_role(company_id,array['admin','coordinator']));
grant select,insert,update on public.sw_vehicle_calendar to authenticated;
revoke all on public.sw_vehicle_calendar from anon;

