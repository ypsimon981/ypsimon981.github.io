create schema sw_private;
revoke all on schema sw_private from public,anon,authenticated;
create table sw_private.pending_memberships (
 company_id uuid not null references public.sw_companies(id) on delete cascade,
 email text not null check(email=lower(email)),
 role text not null check(role in ('admin','coordinator','driver')),
 expires_at timestamptz not null default now()+interval '7 days',
 consumed_at timestamptz,
 consumed_by uuid references auth.users(id),
 primary key(company_id,email)
);
alter table sw_private.pending_memberships enable row level security;
revoke all on sw_private.pending_memberships from public,anon,authenticated;
create function sw_private.apply_reserved_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare reservation record;
begin
 if new.email is null or new.email_confirmed_at is null or coalesce((to_jsonb(new)->>'is_anonymous')::boolean,false) then return new; end if;
 for reservation in select company_id,role from sw_private.pending_memberships
  where email=lower(new.email) and consumed_at is null and expires_at>now() for update
 loop
  insert into public.sw_memberships(company_id,user_id,role)
   values(reservation.company_id,new.id,reservation.role)
   on conflict(company_id,user_id) do update set role=excluded.role;
  update sw_private.pending_memberships set consumed_at=now(),consumed_by=new.id
   where company_id=reservation.company_id and email=lower(new.email);
 end loop;
 return new;
end;
$$;
revoke all on function sw_private.apply_reserved_membership() from public,anon,authenticated;
create trigger sw_apply_reserved_membership after insert or update of email_confirmed_at on auth.users
for each row execute function sw_private.apply_reserved_membership();

