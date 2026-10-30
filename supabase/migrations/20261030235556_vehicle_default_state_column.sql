-- Null keeps existing weekly exclusions compatible; explicit states use the daily cycle.
alter table public.sw_vehicle_week_defaults add column state text
 check(state in ('available','broken','maintenance','out_of_service'));
