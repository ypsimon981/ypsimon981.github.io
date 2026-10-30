-- Add a reversible daily exclusion for vehicles reserved for specific services.
alter table public.sw_vehicle_calendar drop constraint sw_vehicle_calendar_state_check;
alter table public.sw_vehicle_calendar add constraint sw_vehicle_calendar_state_check
 check (state in ('available','maintenance','broken','out_of_service'));
