begin;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  event_date date,
  doors_open_at time,
  doors_close_at time,
  show_time time,
  venue text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_tickets
  add column if not exists event_id uuid references public.events(id) on delete restrict;

-- Keep the existing event as the initial active record, then preserve any
-- other historical event names found in issued tickets.
insert into public.events (name, event_date, doors_open_at, doors_close_at, show_time, venue, is_active)
select 'Funk en la terraza', date '2025-10-18', time '19:30', time '23:30', time '20:00', 'Terraza 02', true
where not exists (select 1 from public.events);

insert into public.events (name)
select distinct tickets.event_name
from public.event_tickets as tickets
where not exists (
  select 1
  from public.events
  where public.events.name = tickets.event_name
);

update public.event_tickets as tickets
set event_id = (
  select events.id
  from public.events
  where events.name = tickets.event_name
  order by events.is_active desc, events.created_at asc
  limit 1
)
where tickets.event_id is null;

alter table public.event_tickets
  alter column event_id set not null;

create index if not exists event_tickets_event_id_created_at_idx
  on public.event_tickets (event_id, created_at desc);

create unique index if not exists events_one_active_event_idx
  on public.events (is_active)
  where is_active;

-- A previously cached PWA still sends only event_name. Assign it to the
-- currently active event until the new client cache is installed.
create or replace function public.assign_active_event_to_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_event public.events%rowtype;
begin
  -- Keep an in-flight issuance tied to an event that is still active.
  if new.event_id is null then
    select * into active_event
    from public.events
    where is_active
    limit 1
    for update;

    if not found then
      raise exception 'An active event is required to create a ticket';
    end if;

    new.event_id = active_event.id;
  else
    select * into active_event
    from public.events
    where id = new.event_id
      and is_active
    for update;

    if not found then
      raise exception 'The selected event is no longer active';
    end if;
  end if;

  if new.event_name is null or btrim(new.event_name) = '' then
    new.event_name = active_event.name;
  end if;
  return new;
end;
$$;

drop trigger if exists event_tickets_assign_active_event on public.event_tickets;
create trigger event_tickets_assign_active_event
before insert on public.event_tickets
for each row
execute function public.assign_active_event_to_ticket();

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

alter table public.event_tickets enable row level security;

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

create or replace function public.public_events()
returns table (
  id uuid,
  name text,
  event_date date,
  doors_open_at time,
  doors_close_at time,
  show_time time,
  venue text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    events.id,
    events.name,
    events.event_date,
    events.doors_open_at,
    events.doors_close_at,
    events.show_time,
    events.venue,
    events.is_active
  from public.events
  order by events.is_active desc, events.event_date desc nulls last, events.created_at desc;
$$;

revoke all on function public.public_events() from public;
grant execute on function public.public_events() to anon, authenticated;

alter table public.events enable row level security;

drop policy if exists "authenticated staff can manage events" on public.events;
create policy "authenticated staff can manage events"
on public.events
for all
to authenticated
using (true)
with check (true);

create or replace function public.set_event_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_event_updated_at();

create or replace function public.set_active_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required to activate an event';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  update public.events
  set is_active = false
  where is_active;

  update public.events
  set is_active = true
  where id = p_event_id;
end;
$$;

revoke all on function public.set_active_event(uuid) from public;
grant execute on function public.set_active_event(uuid) to authenticated;

drop function if exists public.public_ticket(uuid);

create function public.public_ticket(p_token uuid)
returns table (
  code text,
  holder_name text,
  ticket_type text,
  event_name text,
  event_date date,
  doors_open_at time,
  doors_close_at time,
  show_time time,
  venue text,
  status text,
  checked_in_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    tickets.code,
    tickets.holder_name,
    tickets.ticket_type,
    events.name,
    events.event_date,
    events.doors_open_at,
    events.doors_close_at,
    events.show_time,
    events.venue,
    tickets.status,
    tickets.checked_in_at
  from public.event_tickets as tickets
  join public.events on events.id = tickets.event_id
  where tickets.public_token = p_token
  limit 1;
$$;

revoke all on function public.public_ticket(uuid) from public;
grant execute on function public.public_ticket(uuid) to anon, authenticated;

create or replace function public.check_in_ticket_for_event(p_code text, p_event_id uuid)
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

  select tickets.* into ticket
  from public.event_tickets as tickets
  join public.events on events.id = tickets.event_id
  where tickets.code = p_code
    and tickets.event_id = p_event_id
    and events.is_active
  -- Keep an event switch from racing a valid check-in.
  for update of tickets, events;

  if not found then
    return;
  end if;

  if ticket.status = 'checked-in' then
    return query select ticket.code, ticket.holder_name, ticket.ticket_type, ticket.status, ticket.checked_in_at, true;
    return;
  end if;

  update public.event_tickets
  set status = 'checked-in', checked_in_at = now()
  where id = ticket.id
  returning * into ticket;

  return query select ticket.code, ticket.holder_name, ticket.ticket_type, ticket.status, ticket.checked_in_at, false;
end;
$$;

create or replace function public.check_in_ticket(p_code text, p_event_id uuid)
returns table (
  code text,
  holder_name text,
  ticket_type text,
  status text,
  checked_in_at timestamptz,
  already_checked_in boolean
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.check_in_ticket_for_event(p_code, p_event_id);
$$;

-- Retain the previous RPC while installed PWA clients update their cache.
create or replace function public.check_in_ticket(p_code text, p_event_name text)
returns table (
  code text,
  holder_name text,
  ticket_type text,
  status text,
  checked_in_at timestamptz,
  already_checked_in boolean
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.check_in_ticket_for_event(
    p_code,
    (
      -- Older clients send a fixed event name; the active event is authoritative.
      select tickets.event_id
      from public.event_tickets as tickets
      join public.events on events.id = tickets.event_id
      where tickets.code = p_code
        and events.is_active
      limit 1
    )
  );
$$;

revoke all on function public.check_in_ticket_for_event(text, uuid) from public;
revoke all on function public.check_in_ticket(text, uuid) from public;
revoke all on function public.check_in_ticket(text, text) from public;

-- Remove the pre-multi-event RPC, which has no event boundary or admin check.
drop function if exists public.check_in_ticket(text);

grant execute on function public.check_in_ticket(text, uuid) to authenticated;
grant execute on function public.check_in_ticket(text, text) to authenticated;

commit;
