-- New project baseline. Run events-migration.sql immediately afterward for multi-event support.
create extension if not exists pgcrypto;

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  code text not null unique,
  event_name text not null,
  holder_name text not null,
  phone text,
  ticket_type text not null check (ticket_type in ('Preventa', 'En puerta')),
  note text,
  status text not null default 'ready' check (status in ('ready', 'sent', 'checked-in')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  checked_in_at timestamptz
);

alter table public.event_tickets enable row level security;

create or replace function public.is_event_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is not null
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'losmotherfunkys@gmail.com';
$$;

revoke all on function public.is_event_admin() from public;
grant execute on function public.is_event_admin() to authenticated;

drop policy if exists "authenticated staff can manage tickets" on public.event_tickets;
drop policy if exists "authenticated staff can read tickets" on public.event_tickets;
drop policy if exists "authenticated staff can create tickets" on public.event_tickets;
drop policy if exists "authenticated staff can update unvalidated tickets" on public.event_tickets;
drop policy if exists "authenticated staff can delete tickets" on public.event_tickets;
drop policy if exists "administrators can delete tickets" on public.event_tickets;
drop policy if exists "administrators can manage tickets" on public.event_tickets;

create policy "administrators can manage tickets"
on public.event_tickets
for all
to authenticated
using (
  public.is_event_admin()
)
with check (
  public.is_event_admin()
);

create or replace function public.public_ticket(p_token uuid)
returns table (
  code text,
  holder_name text,
  ticket_type text,
  event_name text,
  status text,
  checked_in_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    event_tickets.code,
    event_tickets.holder_name,
    event_tickets.ticket_type,
    event_tickets.event_name,
    event_tickets.status,
    event_tickets.checked_in_at
  from public.event_tickets
  where event_tickets.public_token = p_token
  limit 1;
$$;

revoke execute on function public.public_ticket(uuid) from public;
grant execute on function public.public_ticket(uuid) to anon, authenticated;

drop function if exists public.check_in_ticket(text);

create or replace function public.check_in_ticket(p_code text, p_event_name text)
returns table (
  code text,
  holder_name text,
  ticket_type text,
  status text,
  checked_in_at timestamptz,
  already_checked_in boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.event_tickets%rowtype;
begin
  if not public.is_event_admin() then
    raise exception 'Administrator access required for check-in';
  end if;

  select * into ticket
  from public.event_tickets
  where event_tickets.code = p_code
    and event_tickets.event_name = p_event_name
  for update;

  if not found then
    return;
  end if;

  if ticket.status = 'checked-in' then
    return query select ticket.code, ticket.holder_name, ticket.ticket_type, ticket.status, ticket.checked_in_at, true;
    return;
  end if;

  update public.event_tickets
  set status = 'checked-in', checked_in_at = now()
  where event_tickets.id = ticket.id
  returning * into ticket;

  return query select ticket.code, ticket.holder_name, ticket.ticket_type, ticket.status, ticket.checked_in_at, false;
end;
$$;

revoke execute on function public.check_in_ticket(text, text) from public;
grant execute on function public.check_in_ticket(text, text) to authenticated;
