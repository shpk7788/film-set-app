-- =====================================================================================
-- Film Set — database for Supabase.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again later
-- (it updates the rules without touching your data).
--
-- Security model: the website never reads or writes tables directly. Every table is
-- closed to the public API; the website can only call the functions at the bottom of
-- this file, and each function checks the caller's channels before doing anything.
-- =====================================================================================

-- ---------- types ----------
do $$ begin create type film_role as enum ('producer','executive_producer','production_manager','production_team','director','co_director','first_ad','second_ad','direction_intern','department_head','department_crew','actor'); exception when duplicate_object then null; end $$;
do $$ begin create type film_status as enum ('shooting','wrapped'); exception when duplicate_object then null; end $$;
do $$ begin create type code_purpose as enum ('join','reset'); exception when duplicate_object then null; end $$;
do $$ begin create type version_status as enum ('draft','sent'); exception when duplicate_object then null; end $$;
do $$ begin create type crew_list_status as enum ('draft','awaiting_pm','awaiting_ep','locked'); exception when duplicate_object then null; end $$;
do $$ begin create type crew_category as enum ('artist','crew','junior_artist'); exception when duplicate_object then null; end $$;
do $$ begin create type deal_type as enum ('per_day','package'); exception when duplicate_object then null; end $$;

-- ---------- tables ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null
);
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists setup_secret (secret text primary key);
create table if not exists films (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  status film_status not null default 'shooting',
  created_at timestamptz not null default now()
);
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  name text not null,
  unique (film_id, name)
);
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  person_id uuid references auth.users(id),
  display_name text not null,
  role film_role not null,
  department_id uuid references departments(id),
  character_name text,
  phone text,
  allow_screenshots boolean not null default false,
  access_ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (film_id, person_id)
);
create index if not exists memberships_film on memberships(film_id);
create index if not exists memberships_person on memberships(person_id);
create table if not exists signup_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  film_id uuid not null references films(id),
  membership_id uuid not null references memberships(id),
  purpose code_purpose not null default 'join',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
-- Channel catalogue and access. Every channel always exists; role_access/member_access only
-- record where the producer unlocked or locked something compared with the defaults.
create table if not exists caps (
  capability text primary key,
  label text not null,
  grp text not null,
  sort int not null
);
create table if not exists cap_defaults (
  role film_role not null,
  capability text not null references caps(capability),
  primary key (role, capability)
);
create table if not exists role_access (
  film_id uuid not null references films(id),
  role film_role not null,
  capability text not null references caps(capability),
  allowed boolean not null,
  primary key (film_id, role, capability)
);
create table if not exists member_access (
  membership_id uuid not null references memberships(id),
  capability text not null references caps(capability),
  allowed boolean not null,
  primary key (membership_id, capability)
);
create table if not exists shoot_days (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  day_number int not null,
  date date not null,
  unique (film_id, day_number)
);
create table if not exists live_status (
  shoot_day_id uuid primary key references shoot_days(id),
  item_key text,
  note text,
  updated_at timestamptz not null default now()
);
create table if not exists program_versions (
  id uuid primary key default gen_random_uuid(),
  shoot_day_id uuid not null references shoot_days(id),
  version int not null,
  status version_status not null default 'draft',
  data jsonb not null,
  change_summary jsonb,
  edited_by uuid references memberships(id),
  sent_by uuid references memberships(id),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (shoot_day_id, version)
);
create table if not exists confirmations (
  version_id uuid not null references program_versions(id),
  membership_id uuid not null references memberships(id),
  confirmed_at timestamptz not null default now(),
  primary key (version_id, membership_id)
);
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  author_id uuid not null references memberships(id),
  text text not null,
  important boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists notice_reads (
  notice_id uuid not null references notices(id),
  membership_id uuid not null references memberships(id),
  confirmed_at timestamptz not null default now(),
  primary key (notice_id, membership_id)
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  membership_id uuid not null references memberships(id),
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_member on notifications(membership_id, created_at desc);
create table if not exists crew_lists (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  shoot_day_id uuid not null unique references shoot_days(id),
  status crew_list_status not null default 'draft',
  sent_back_note text,
  locked_at timestamptz
);
-- Call sheets are stored in tenths: 15 = 1.5 call sheets.
create table if not exists crew_entries (
  id uuid primary key default gen_random_uuid(),
  crew_list_id uuid not null references crew_lists(id),
  membership_id uuid references memberships(id),
  label text not null,
  category crew_category not null,
  department_id uuid references departments(id),
  headcount int not null default 1,
  called_tenths int not null default 10,
  worked_tenths int not null default 10,
  released_at text,
  release_reason text,
  released_by uuid references memberships(id),
  present boolean not null default true,
  added_on_day boolean not null default false
);
create index if not exists crew_entries_list on crew_entries(crew_list_id);
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  crew_list_id uuid not null references crew_lists(id),
  step text not null,       -- pm | ep | reopen
  decision text not null,   -- approved | sent_back | reopened
  note text,
  membership_id uuid not null references memberships(id),
  created_at timestamptz not null default now()
);
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id),
  membership_id uuid not null unique references memberships(id),
  deal deal_type not null,
  rate_paise bigint,
  total_paise bigint,
  signed_on date,
  notes text
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id),
  amount_paise bigint not null,
  paid_on date not null,
  reference text,
  created_at timestamptz not null default now()
);
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  film_id uuid references films(id),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_film_time on audit_log(film_id, created_at desc);
-- Actor availability: one row per actor per date they said they can (or can't) come.
create table if not exists actor_availability (
  membership_id uuid not null references memberships(id),
  date date not null,
  available boolean not null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (membership_id, date)
);

-- ---------- channel catalogue (the defaults come from the build spec) ----------
insert into caps (capability, label, grp, sort) values
  ('notice.post',      'Post notices to everyone',                    'Communication', 10),
  ('schedule.today',   'Today''s full program sheet',                 'Schedule', 20),
  ('schedule.tomorrow','Tomorrow''s full program sheet',              'Schedule', 21),
  ('schedule.all',     'Every day''s full program sheet',             'Schedule', 22),
  ('program.edit',     'Edit program sheet drafts',                   'Schedule', 23),
  ('program.send',     'Approve & send program sheets',               'Schedule', 24),
  ('callsheets.all',   'Open any department''s or actor''s call sheet', 'Schedule', 25),
  ('tracker.view',     'See who has confirmed',                       'Schedule', 26),
  ('live.view',        'On set now (live view)',                      'On set', 30),
  ('live.edit',        'Update the live status',                      'On set', 31),
  ('artists.view',     'Artist list, dates & scenes',                 'Artists', 35),
  ('artists.edit',     'Edit artist dates',                           'Artists', 36),
  ('crew.view',        'Crew lists & history',                        'Crew lists', 40),
  ('crew.edit',        'Prepare crew lists',                          'Crew lists', 41),
  ('crew.release',     'Release people early',                        'Crew lists', 42),
  ('crew.approve.pm',  'Approve crew lists (step 1)',                 'Crew lists', 43),
  ('crew.approve.ep',  'Approve & lock crew lists (step 2)',          'Crew lists', 44),
  ('crew.reopen',      'Reopen locked days',                          'Crew lists', 45),
  ('contracts',        'Contracts & payments',                        'Money', 50),
  ('people.view',      'See people & sign-up codes',                  'People', 60),
  ('people.manage',    'Add people & issue codes',                    'People', 61),
  ('contacts.view',    'Phone numbers',                               'People', 62),
  ('audit.view',       'Change log',                                  'People', 63)
on conflict (capability) do update set label = excluded.label, grp = excluded.grp, sort = excluded.sort;

delete from cap_defaults where true;
insert into cap_defaults (role, capability)
select r::film_role, c from (values
  ('executive_producer', array['artists.view','notice.post','schedule.today','schedule.tomorrow','schedule.all','callsheets.all','tracker.view','live.view','crew.view','crew.release','crew.approve.ep','crew.reopen','people.view','contacts.view','audit.view']),
  ('production_manager', array['artists.view','artists.edit','notice.post','schedule.today','schedule.tomorrow','schedule.all','callsheets.all','tracker.view','live.view','crew.view','crew.edit','crew.release','crew.approve.pm','people.view','people.manage','contacts.view']),
  ('production_team',    array['artists.view','artists.edit','notice.post','schedule.today','schedule.tomorrow','schedule.all','callsheets.all','tracker.view','live.view','crew.view','crew.edit','crew.release','people.view','people.manage','contacts.view']),
  ('director',           array['artists.view','notice.post','schedule.today','schedule.tomorrow','schedule.all','program.edit','program.send','callsheets.all','tracker.view','live.view','live.edit','contacts.view']),
  ('co_director',        array['artists.view','artists.edit','notice.post','schedule.today','schedule.tomorrow','schedule.all','program.edit','program.send','callsheets.all','tracker.view','live.view','live.edit','contacts.view','people.view','people.manage']),
  ('first_ad',           array['artists.view','schedule.today','schedule.tomorrow','schedule.all','program.edit','tracker.view','live.view','live.edit','crew.release','contacts.view']),
  ('second_ad',          array['schedule.today','schedule.tomorrow','live.view']),
  ('direction_intern',   array['schedule.today','live.view'])
) as d(r, cs), unnest(cs) as c;

-- =====================================================================================
-- Helpers (not callable from the website)
-- =====================================================================================

create or replace function today_ist() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function role_label(r film_role) returns text language sql immutable as $$
  select case r
    when 'producer' then 'Producer' when 'executive_producer' then 'Executive Producer'
    when 'production_manager' then 'Production Manager' when 'production_team' then 'Production team'
    when 'director' then 'Director' when 'co_director' then 'Co-director' when 'first_ad' then '1st AD'
    when 'second_ad' then '2nd / 3rd AD' when 'direction_intern' then 'Direction intern'
    when 'department_head' then 'Department head' when 'department_crew' then 'Department crew'
    when 'actor' then 'Actor' end
$$;

-- The caller's live membership on a film (all fields null if none).
create or replace function my_member(p_film uuid) returns memberships
language sql stable security definer set search_path = public as $$
  select m.* from memberships m join films f on f.id = m.film_id
  where m.film_id = p_film and m.person_id = auth.uid() and m.active
    and (m.access_ends_on is null or m.access_ends_on >= today_ist())
    and (f.status = 'shooting' or m.role in ('producer','executive_producer','production_manager'))
  limit 1
$$;

-- Channel check: producer = everything → person override → role override → default.
create or replace function member_can(m memberships, p_cap text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if m.id is null or not m.active then return false; end if;
  if m.access_ends_on is not null and m.access_ends_on < today_ist() then return false; end if;
  if m.role = 'producer' then return true; end if;
  select allowed into v from member_access where membership_id = m.id and capability = p_cap;
  if found then return v; end if;
  select allowed into v from role_access where film_id = m.film_id and role = m.role and capability = p_cap;
  if found then return v; end if;
  return exists (select 1 from cap_defaults where role = m.role and capability = p_cap);
end $$;

create or replace function caps_of(m memberships) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(capability order by sort), '{}') from caps where member_can(m, capability)
$$;

create or replace function require_member(p_film uuid) returns memberships
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := my_member(p_film);
  if m.id is null then raise exception 'You don''t have access to this film.' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function require_cap(p_film uuid, p_cap text) returns memberships
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := require_member(p_film);
  if not member_can(m, p_cap) then raise exception 'You don''t have access to this.' using errcode = '42501'; end if;
  return m;
end $$;

-- Changes are refused once a film has wrapped.
create or replace function require_shooting(p_film uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from films where id = p_film and status = 'wrapped') then
    raise exception 'This film has wrapped and is read-only.';
  end if;
end $$;

create or replace function require_producer(p_film uuid) returns memberships
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := require_member(p_film);
  if m.role <> 'producer' then raise exception 'Only the producer can do this.' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function film_of_day(p_day uuid) returns uuid language sql stable security definer set search_path = public as $$
  select film_id from shoot_days where id = p_day
$$;

-- Whether a member may see the full program sheet for a date.
create or replace function scope_ok(m memberships, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select member_can(m, 'schedule.all')
      or (p_date = today_ist() and member_can(m, 'schedule.today'))
      or (p_date = today_ist() + 1 and member_can(m, 'schedule.tomorrow'))
$$;

create or replace function has_any_schedule(m memberships) returns boolean
language sql stable security definer set search_path = public as $$
  select member_can(m, 'schedule.all') or member_can(m, 'schedule.today') or member_can(m, 'schedule.tomorrow')
$$;

create or replace function log_audit(p_film uuid, p_action text, p_type text, p_id text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (film_id, actor_id, action, entity_type, entity_id, before, after)
  values (p_film, auth.uid(), p_action, p_type, p_id, p_before, p_after)
$$;

create or replace function notify(p_film uuid, p_ids uuid[], p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (film_id, membership_id, type, title, body, link)
  select distinct p_film, x, p_type, p_title, p_body, p_link from unnest(p_ids) x where x is not null
$$;

-- Members of a film who currently hold a channel.
create or replace function members_with(p_film uuid, p_cap text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.id), '{}') from memberships m
  where m.film_id = p_film and m.active and m.person_id is not null and member_can(m, p_cap)
$$;

-- One-time code like "LGT-7KQ4M9". The prefix is only a hint for humans.
create or replace function gen_code(p_hint text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  letters text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  prefix text := '';
  body text := '';
  b bytea := extensions.gen_random_bytes(6);
  ch text;
begin
  foreach ch in array regexp_split_to_array(upper(coalesce(p_hint, '')), '') loop
    if position(ch in letters) > 0 and length(prefix) < 3 then prefix := prefix || ch; end if;
  end loop;
  while length(prefix) < 3 loop
    prefix := prefix || substr(letters, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(letters)), 1);
  end loop;
  for i in 0..5 loop
    body := body || substr(chars, 1 + (get_byte(b, i) % length(chars)), 1);
  end loop;
  return prefix || '-' || body;
end $$;

create or replace function norm_code(p text) returns text language sql immutable as $$
  select case when length(x) = 9 then substr(x, 1, 3) || '-' || substr(x, 4) else upper(trim(p)) end
  from (select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g') as x) s
$$;

-- New one-time code for a membership; any older unused code for it stops working.
create or replace function new_code(p_member uuid, p_purpose code_purpose) returns text
language plpgsql volatile security definer set search_path = public as $$
declare m memberships; d text; c text;
begin
  select * into m from memberships where id = p_member;
  select name into d from departments where id = m.department_id;
  update signup_codes set expires_at = now() where membership_id = p_member and used_at is null and expires_at > now();
  loop
    c := gen_code(coalesce(d, role_label(m.role)));
    begin
      insert into signup_codes (code, film_id, membership_id, purpose, expires_at)
      values (c, m.film_id, p_member, p_purpose, now() + interval '7 days');
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

-- ---------- program sheet logic ----------
create or replace function is_cut(i jsonb) returns boolean language sql immutable as $$
  select coalesce((i->>'cut')::boolean, false)
$$;

-- A department's own slice: only scenes that need it, with only its own need.
create or replace function dept_slice(d jsonb, dept text) returns jsonb language sql immutable as $$
  with items as (select i, ord from jsonb_array_elements(coalesce(d->'items', '[]'::jsonb)) with ordinality t(i, ord))
  select jsonb_build_object(
    'called', coalesce(d->'deptCalls', '{}'::jsonb) ? dept or exists (select 1 from items where not is_cut(i) and coalesce(i->'needs', '{}'::jsonb) ? dept),
    'callTime', coalesce(d->'deptCalls'->>dept, d->>'generalCall'),
    'location', coalesce(d->>'location', ''),
    'notes', coalesce(d->>'notes', ''),
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', i->'key', 'scene', i->'scene', 'heading', i->'heading', 'pages', i->'pages', 'start', i->'start', 'end', i->'end', 'need', i->'needs'->>dept) order by ord)
                       from items where not is_cut(i) and coalesce(i->'needs', '{}'::jsonb) ? dept), '[]'::jsonb),
    'cutItems', coalesce((select jsonb_agg(jsonb_build_object('key', i->'key', 'scene', i->'scene', 'cutReason', i->'cutReason') order by ord)
                       from items where is_cut(i) and coalesce(i->'needs', '{}'::jsonb) ? dept), '[]'::jsonb))
$$;

-- An actor's own slice: their scenes and their times only.
create or replace function actor_slice(d jsonb, mid text) returns jsonb language sql immutable as $$
  with items as (select i, ord from jsonb_array_elements(coalesce(d->'items', '[]'::jsonb)) with ordinality t(i, ord))
  select jsonb_build_object(
    'called', coalesce(d->'actorTimes', '{}'::jsonb) ? mid or exists (select 1 from items where not is_cut(i) and coalesce(i->'castIds', '[]'::jsonb) ? mid),
    'times', coalesce(d->'actorTimes'->mid, '{}'::jsonb),
    'location', coalesce(d->>'location', ''),
    'notes', coalesce(d->>'notes', ''),
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', i->'key', 'scene', i->'scene', 'heading', i->'heading', 'pages', i->'pages') order by ord)
                       from items where not is_cut(i) and coalesce(i->'castIds', '[]'::jsonb) ? mid), '[]'::jsonb),
    'cutItems', coalesce((select jsonb_agg(jsonb_build_object('key', i->'key', 'scene', i->'scene', 'cutReason', i->'cutReason') order by ord)
                       from items where is_cut(i) and coalesce(i->'castIds', '[]'::jsonb) ? mid), '[]'::jsonb))
$$;

create or replace function called_depts(d jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select jsonb_object_keys(coalesce(d->'deptCalls', '{}'::jsonb)) k
    union all
    select jsonb_object_keys(coalesce(i->'needs', '{}'::jsonb)) from jsonb_array_elements(coalesce(d->'items', '[]'::jsonb)) i where not is_cut(i)
  ) s
$$;

create or replace function called_actors(d jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select jsonb_object_keys(coalesce(d->'actorTimes', '{}'::jsonb)) k
    union all
    select jsonb_array_elements_text(coalesce(i->'castIds', '[]'::jsonb)) from jsonb_array_elements(coalesce(d->'items', '[]'::jsonb)) i where not is_cut(i)
  ) s
$$;

-- Everyone who receives (and must confirm) a version.
create or replace function recipients(p_film uuid, d jsonb) returns setof memberships
language sql stable security definer set search_path = public as $$
  select * from memberships m
  where m.film_id = p_film and m.active and (
       (m.role in ('department_head','department_crew') and m.department_id::text = any (called_depts(d)))
    or (m.role = 'actor' and m.id::text = any (called_actors(d)))
    or (m.role in ('first_ad','second_ad','direction_intern')))
$$;

-- Departments / actors whose slice changed between versions (all called ones on a first version).
create or replace function changed_depts(p_film uuid, prev jsonb, nxt jsonb) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id::text), '{}') from departments dd
  where dd.film_id = p_film and (
    case when prev is null then (dept_slice(nxt, dd.id::text)->>'called')::boolean
         when not (dept_slice(prev, dd.id::text)->>'called')::boolean and not (dept_slice(nxt, dd.id::text)->>'called')::boolean then false
         else dept_slice(prev, dd.id::text) <> dept_slice(nxt, dd.id::text) end)
$$;

create or replace function changed_actors(prev jsonb, nxt jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(a), '{}') from (select distinct unnest(called_actors(nxt) || coalesce(called_actors(prev), '{}')) a) s
  where prev is null or actor_slice(prev, a) <> actor_slice(nxt, a)
$$;

create or replace function dept_name(p text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from departments where id::text = p), 'Department')
$$;
create or replace function member_name(p text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from memberships where id::text = p), 'Someone')
$$;

-- Plain-language list of what changed, shown at the top of every call sheet.
create or replace function describe_changes(prev jsonb, nxt jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out text[] := '{}'; k text; v text; b text; i jsonb; p jsonb;
begin
  if prev is null then return '["First version of this day''s schedule"]'::jsonb; end if;
  if coalesce(prev->>'generalCall','') <> coalesce(nxt->>'generalCall','') then
    out := out || format('General call %s → %s', prev->>'generalCall', nxt->>'generalCall'); end if;
  if coalesce(prev->>'location','') <> coalesce(nxt->>'location','') then
    out := out || format('Location changed to %s', coalesce(nullif(nxt->>'location',''), '—')); end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(nxt->'deptCalls','{}')) loop
    b := prev->'deptCalls'->>k;
    if b is null then out := out || format('%s now called at %s', dept_name(k), v);
    elsif b <> v then out := out || format('%s call %s → %s', dept_name(k), b, v); end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(prev->'deptCalls','{}')) loop
    if not coalesce(nxt->'deptCalls','{}') ? k then out := out || format('%s no longer called', dept_name(k)); end if;
  end loop;
  for i in select x from jsonb_array_elements(coalesce(nxt->'items','[]')) x loop
    select x into p from jsonb_array_elements(coalesce(prev->'items','[]')) x where x->>'key' = i->>'key' limit 1;
    if p is null then
      if not is_cut(i) then out := out || format('Scene %s added', i->>'scene'); end if;
    elsif not is_cut(p) and is_cut(i) then
      out := out || (format('Scene %s cut', i->>'scene') || coalesce(' (' || nullif(i->>'cutReason','') || ')', ''));
    elsif is_cut(p) and not is_cut(i) then
      out := out || format('Scene %s back on', i->>'scene');
    elsif not is_cut(i) and (coalesce(p->>'start','') <> coalesce(i->>'start','') or coalesce(p->>'end','') <> coalesce(i->>'end','')) then
      out := out || format('Scene %s now %s–%s', i->>'scene', i->>'start', i->>'end');
    end if;
  end loop;
  for p in select x from jsonb_array_elements(coalesce(prev->'items','[]')) x loop
    if not exists (select 1 from jsonb_array_elements(coalesce(nxt->'items','[]')) x where x->>'key' = p->>'key') and not is_cut(p) then
      out := out || format('Scene %s removed', p->>'scene'); end if;
  end loop;
  for k, i in select key, value from jsonb_each(coalesce(nxt->'actorTimes','{}')) loop
    b := prev->'actorTimes'->k->>'pickup';
    if b is not null and coalesce(i->>'pickup','') <> '' and b <> i->>'pickup' then
      out := out || format('%s pickup %s → %s', member_name(k), b, i->>'pickup'); end if;
  end loop;
  if cardinality(out) = 0 then out := array['Small edits — no time or scene changes']; end if;
  return to_jsonb(out);
end $$;

create or replace function empty_program(p_location text, p_call text) returns jsonb language sql immutable as $$
  select jsonb_build_object('location', coalesce(p_location, ''), 'generalCall', coalesce(nullif(p_call, ''), '07:00'),
    'deptCalls', '{}'::jsonb, 'actorTimes', '{}'::jsonb, 'notes', '', 'items', '[]'::jsonb)
$$;

-- The day's draft, locked for update; starts a new draft from the last sent version if needed.
create or replace function draft_for(p_day uuid, p_member uuid) returns program_versions
language plpgsql volatile security definer set search_path = public as $$
declare v program_versions;
begin
  select * into v from program_versions where shoot_day_id = p_day order by version desc limit 1 for update;
  if found and v.status = 'draft' then return v; end if;
  insert into program_versions (shoot_day_id, version, status, data, edited_by)
  values (p_day, coalesce(v.version, 0) + 1, 'draft', coalesce(v.data, empty_program('', '07:00')), p_member)
  returning * into v;
  return v;
end $$;

create or replace function latest_sent(p_day uuid) returns program_versions
language sql stable security definer set search_path = public as $$
  select * from program_versions where shoot_day_id = p_day and status = 'sent' order by version desc limit 1
$$;

create or replace function is_time(t text) returns boolean language sql immutable as $$
  select t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

-- Approved (locked) call sheets worked per membership.
create or replace function approved_tenths(p_member uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.worked_tenths), 0) from crew_entries e join crew_lists l on l.id = e.crew_list_id
  where e.membership_id = p_member and l.status = 'locked' and e.present
$$;

create or replace function assignable_roles(m memberships) returns film_role[]
language sql stable security definer set search_path = public as $$
  select case
    when not member_can(m, 'people.manage') then '{}'::film_role[]
    when m.role = 'producer' then array(select r from unnest(enum_range(null::film_role)) r where r <> 'producer')
    when m.role = 'co_director' and not exists (select 1 from member_access where membership_id = m.id and capability = 'people.manage')
         and not exists (select 1 from role_access where film_id = m.film_id and role = 'co_director' and capability = 'people.manage')
      then array['first_ad','second_ad','direction_intern']::film_role[]
    else array(select r from unnest(enum_range(null::film_role)) r where r not in ('producer','executive_producer')) end
$$;

-- What a membership will receive, in plain words (shown before someone joins).
create or replace function channel_labels(m memberships) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_array('Notices for everyone')
    || case when m.role in ('department_head','department_crew') then jsonb_build_array(coalesce((select name from departments where id = m.department_id), 'Your department') || ' call sheet')
            when m.role = 'actor' then jsonb_build_array('Your own call sheet') else '[]'::jsonb end
    || coalesce((select jsonb_agg(label order by sort) from caps where capability <> 'notice.post' and member_can(m, capability)), '[]'::jsonb)
$$;

-- =====================================================================================
-- Website API — the only functions the website can call
-- =====================================================================================

-- ---------- first-time setup & films ----------
create or replace function setup_company(p_secret text, p_company text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c companies;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if exists (select 1 from companies) then raise exception 'Setup has already been done.'; end if;
  if length(coalesce(p_secret, '')) < 12 or not exists (select 1 from setup_secret where secret = p_secret) then
    raise exception 'That setup code is wrong.'; end if;
  if coalesce(trim(p_company), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Enter the company name and your name.'; end if;
  insert into companies (name, owner_id) values (trim(p_company), auth.uid()) returning * into c;
  insert into profiles (id, name, username)
  select auth.uid(), trim(p_name), split_part(email, '@', 1) from auth.users where id = auth.uid()
  on conflict (id) do update set name = excluded.name;
  delete from setup_secret where true;
  perform log_audit(null, 'company_created', 'company', c.id::text, null, jsonb_build_object('name', c.name));
  return jsonb_build_object('ok', true);
end $$;

create or replace function setup_needed() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from companies)
$$;

create or replace function create_film(p_title text, p_owner_is_producer boolean, p_producer_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c companies; f films; m memberships; code text; nm text;
begin
  select * into c from companies where owner_id = auth.uid() limit 1;
  if not found then raise exception 'Only the company owner can create films.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the film a title.'; end if;
  if not coalesce(p_owner_is_producer, false) and coalesce(trim(p_producer_name), '') = '' then raise exception 'Enter the producer''s name.'; end if;
  insert into films (company_id, title) values (c.id, trim(p_title)) returning * into f;
  insert into departments (film_id, name)
  select f.id, x from unnest(array['Camera','Lights','Art','Costume','Makeup & Hair','Sound','Transport','Junior artists']) x;
  if coalesce(p_owner_is_producer, false) then
    select name into nm from profiles where id = auth.uid();
    insert into memberships (film_id, person_id, display_name, role) values (f.id, auth.uid(), coalesce(nm, 'Producer'), 'producer') returning * into m;
  else
    insert into memberships (film_id, display_name, role) values (f.id, trim(p_producer_name), 'producer') returning * into m;
    code := new_code(m.id, 'join');
  end if;
  perform log_audit(f.id, 'film_created', 'film', f.id::text, null, jsonb_build_object('title', f.title));
  return jsonb_build_object('filmId', f.id, 'code', code);
end $$;

create or replace function my_films() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'username', (select split_part(email, '@', 1) from auth.users where id = auth.uid()),
    'name', (select name from profiles where id = auth.uid()),
    'isOwner', exists (select 1 from companies where owner_id = auth.uid()),
    'company', (select name from companies where owner_id = auth.uid() limit 1),
    'ownedFilms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status) order by f.created_at)
                            from films f join companies c on c.id = f.company_id where c.owner_id = auth.uid()), '[]'::jsonb),
    'films', coalesce((select jsonb_agg(jsonb_build_object(
        'filmId', f.id, 'title', f.title, 'status', f.status, 'role', m.role, 'roleLabel', role_label(m.role),
        'department', d.name,
        'unread', (select count(*) from notifications n where n.membership_id = m.id and n.read_at is null)) order by f.created_at)
      from memberships m join films f on f.id = m.film_id left join departments d on d.id = m.department_id
      where m.person_id = auth.uid() and (my_member(m.film_id)).id is not null), '[]'::jsonb))
$$;

create or replace function me(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; f films;
begin
  m := require_member(p_film);
  select * into f from films where id = p_film;
  return jsonb_build_object(
    'film', jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status, 'readOnly', f.status = 'wrapped'),
    'member', jsonb_build_object('id', m.id, 'name', m.display_name, 'role', m.role, 'roleLabel', role_label(m.role),
       'departmentId', m.department_id, 'department', (select name from departments where id = m.department_id),
       'character', m.character_name, 'allowScreenshots', m.allow_screenshots),
    'caps', to_jsonb(caps_of(m)),
    'today', today_ist(),
    'unread', (select count(*) from notifications where membership_id = m.id and read_at is null));
end $$;

-- ---------- sign-up codes ----------
create or replace function code_info(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s signup_codes; m memberships; f films;
begin
  select * into s from signup_codes where code = norm_code(p_code);
  if not found then return jsonb_build_object('ok', false, 'reason', 'That code wasn''t found. Check it with the production office.'); end if;
  if s.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'That code has already been used. Ask the production office for a new one.'); end if;
  if s.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'That code has expired. Ask the production office for a new one.'); end if;
  select * into m from memberships where id = s.membership_id;
  select * into f from films where id = s.film_id;
  if not m.active then return jsonb_build_object('ok', false, 'reason', 'This code is no longer active. Call the production office.'); end if;
  if f.status <> 'shooting' then return jsonb_build_object('ok', false, 'reason', 'This film has wrapped.'); end if;
  if s.purpose = 'join' and m.person_id is not null then return jsonb_build_object('ok', false, 'reason', 'Someone has already joined with this place on the film.'); end if;
  return jsonb_build_object('ok', true, 'code', s.code, 'purpose', s.purpose, 'name', m.display_name,
    'roleLabel', role_label(m.role), 'department', (select name from departments where id = m.department_id),
    'character', m.character_name, 'film', f.title, 'channels', channel_labels(m),
    'username', case when s.purpose = 'reset' then (select split_part(email, '@', 1) from auth.users where id = m.person_id) end,
    'alreadyOnFilm', auth.uid() is not null and exists (select 1 from memberships where film_id = f.id and person_id = auth.uid()));
end $$;

-- Links the logged-in person to the place on the film the code points to (sign-up and "Add another movie").
create or replace function claim_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s signup_codes; m memberships; f films; uname text;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into s from signup_codes where code = norm_code(p_code) for update;
  if not found or s.used_at is not null or s.expires_at < now() or s.purpose <> 'join' then
    raise exception 'That code can''t be used. Ask the production office for a new one.'; end if;
  select * into m from memberships where id = s.membership_id for update;
  select * into f from films where id = s.film_id;
  if not m.active or m.person_id is not null or f.status <> 'shooting' then raise exception 'That code can''t be used. Ask the production office for a new one.'; end if;
  if exists (select 1 from memberships where film_id = f.id and person_id = auth.uid()) then raise exception 'You''re already on %.', f.title; end if;
  update memberships set person_id = auth.uid() where id = m.id;
  update signup_codes set used_at = now() where id = s.id;
  select split_part(email, '@', 1) into uname from auth.users where id = auth.uid();
  insert into profiles (id, name, username) values (auth.uid(), m.display_name, coalesce(uname, ''))
  on conflict (id) do nothing;
  perform log_audit(f.id, 'joined_with_code', 'membership', m.id::text, null, jsonb_build_object('role', m.role));
  return jsonb_build_object('filmId', f.id);
end $$;

-- Forgot password: a reset code from the production office sets a new password.
create or replace function reset_password(p_code text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s signup_codes; m memberships; uname text;
begin
  select * into s from signup_codes where code = norm_code(p_code) for update;
  if not found or s.used_at is not null or s.expires_at < now() or s.purpose <> 'reset' then
    raise exception 'That reset code can''t be used. Ask the production office for a new one.'; end if;
  select * into m from memberships where id = s.membership_id;
  if m.person_id is null or not m.active then raise exception 'That reset code can''t be used.'; end if;
  if length(coalesce(p_password, '')) < 8 or p_password !~ '[0-9]' then raise exception 'Password needs at least 8 characters including a number.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')) where id = m.person_id;
  begin delete from auth.sessions where user_id = m.person_id; exception when others then null; end;
  begin delete from auth.refresh_tokens where user_id = m.person_id::text; exception when others then null; end;
  update signup_codes set used_at = now() where id = s.id;
  select split_part(email, '@', 1) into uname from auth.users where id = m.person_id;
  perform log_audit(m.film_id, 'password_reset', 'membership', m.id::text, null, null);
  return jsonb_build_object('username', uname);
end $$;

-- ---------- home, notices, inbox ----------
create or replace function my_slice(m memberships, d jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when m.role in ('department_head','department_crew') and m.department_id is not null then
      dept_slice(d, m.department_id::text) || jsonb_build_object('kind', 'department', 'department', (select name from departments where id = m.department_id))
    when m.role = 'actor' then actor_slice(d, m.id::text) || jsonb_build_object('kind', 'actor', 'character', m.character_name)
  end
$$;

create or replace function notices_list(p_film uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; can_post boolean;
begin
  m := require_member(p_film);
  can_post := member_can(m, 'notice.post');
  return jsonb_build_object(
    'canPost', can_post,
    'memberCount', (select count(*) from memberships where film_id = p_film and active and person_id is not null),
    'notices', coalesce((select jsonb_agg(x order by (x->>'createdAt') desc) from (
      select jsonb_build_object('id', n.id, 'text', n.text, 'important', n.important, 'createdAt', n.created_at,
        'author', a.display_name,
        'mine', exists (select 1 from notice_reads r where r.notice_id = n.id and r.membership_id = m.id),
        'gotCount', case when can_post then (select count(*) from notice_reads r where r.notice_id = n.id) end) x
      from notices n join memberships a on a.id = n.author_id
      where n.film_id = p_film order by n.created_at desc limit p_limit) s), '[]'::jsonb));
end $$;

create or replace function post_notice(p_film uuid, p_text text, p_important boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; n notices;
begin
  m := require_cap(p_film, 'notice.post'); perform require_shooting(p_film);
  if coalesce(trim(p_text), '') = '' then raise exception 'Write the notice first.'; end if;
  if length(p_text) > 1000 then raise exception 'Keep notices under 1000 characters.'; end if;
  insert into notices (film_id, author_id, text, important) values (p_film, m.id, trim(p_text), coalesce(p_important, false)) returning * into n;
  perform notify(p_film, array(select id from memberships where film_id = p_film and active and id <> m.id),
    'notice', case when n.important then 'Important notice for everyone' else 'Notice for everyone' end, left(n.text, 140), '#/notices');
  perform log_audit(p_film, 'notice_posted', 'notice', n.id::text, null, jsonb_build_object('important', n.important));
  return jsonb_build_object('ok', true);
end $$;

create or replace function confirm_notice(p_notice uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; f uuid;
begin
  select film_id into f from notices where id = p_notice;
  m := require_member(f);
  insert into notice_reads (notice_id, membership_id) values (p_notice, m.id) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function inbox(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := require_member(p_film);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'link', link, 'read', read_at is not null, 'createdAt', created_at) order by created_at desc)
    from (select * from notifications where membership_id = m.id order by created_at desc limit 100) s), '[]'::jsonb);
end $$;

create or replace function mark_read(p_film uuid, p_link text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships;
begin
  m := require_member(p_film);
  update notifications set read_at = now() where membership_id = m.id and read_at is null and (p_link is null or link = p_link);
  return jsonb_build_object('ok', true);
end $$;

create or replace function home(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; nxt jsonb; up jsonb; r record; sl jsonb;
begin
  m := require_member(p_film);
  if m.role in ('department_head','department_crew','actor') then
    for r in select d.*, v.id as vid, v.version, v.data, v.change_summary, v.sent_at
             from shoot_days d cross join lateral (select * from program_versions where shoot_day_id = d.id and status = 'sent' order by version desc limit 1) v
             where d.film_id = p_film and d.date >= today_ist() order by d.date loop
      sl := my_slice(m, r.data);
      if (sl->>'called')::boolean then
        nxt := jsonb_build_object('dayId', r.id, 'dayNumber', r.day_number, 'date', r.date, 'versionId', r.vid, 'version', r.version,
          'summary', r.change_summary, 'sentAt', r.sent_at, 'slice', sl,
          'confirmed', exists (select 1 from confirmations where version_id = r.vid and membership_id = m.id));
        exit;
      end if;
    end loop;
  end if;
  if has_any_schedule(m) then
    select coalesce(jsonb_agg(jsonb_build_object('dayId', d.id, 'dayNumber', d.day_number, 'date', d.date, 'version', v.version) order by d.date), '[]'::jsonb) into up
    from shoot_days d cross join lateral (select version from program_versions where shoot_day_id = d.id and status = 'sent' order by version desc limit 1) v
    where d.film_id = p_film and d.date >= today_ist() and scope_ok(m, d.date);
  end if;
  return jsonb_build_object('next', nxt, 'upcoming', up, 'notices', notices_list(p_film, 3));
end $$;

-- ---------- schedule ----------
create or replace function days_list(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := require_member(p_film);
  if not has_any_schedule(m) then raise exception 'You don''t have access to this.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'canEdit', member_can(m, 'program.edit'),
    'nextDayNumber', coalesce((select max(day_number) from shoot_days where film_id = p_film), 0) + 1,
    'days', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date,
        'sent', (select max(version) from program_versions where shoot_day_id = d.id and status = 'sent'),
        'draft', case when member_can(m, 'program.edit') then (select max(version) from program_versions where shoot_day_id = d.id and status = 'draft') end)
      order by d.date) from shoot_days d where d.film_id = p_film and scope_ok(m, d.date)), '[]'::jsonb));
end $$;

create or replace function create_day(p_film uuid, p_day_number int, p_date date, p_location text, p_general_call text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; d shoot_days;
begin
  m := require_cap(p_film, 'program.edit'); perform require_shooting(p_film);
  if p_day_number is null or p_day_number < 1 then raise exception 'Enter the shoot day number.'; end if;
  if p_date is null then raise exception 'Pick the date.'; end if;
  if exists (select 1 from shoot_days where film_id = p_film and day_number = p_day_number) then raise exception 'Day % already exists.', p_day_number; end if;
  insert into shoot_days (film_id, day_number, date) values (p_film, p_day_number, p_date) returning * into d;
  insert into program_versions (shoot_day_id, version, status, data, edited_by)
  values (d.id, 1, 'draft', empty_program(p_location, case when is_time(p_general_call) then p_general_call else '07:00' end), m.id);
  perform log_audit(p_film, 'day_created', 'shoot_day', d.id::text, null, jsonb_build_object('dayNumber', p_day_number, 'date', p_date));
  return jsonb_build_object('dayId', d.id);
end $$;

create or replace function directory(p_film uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from departments where film_id = p_film), '[]'::jsonb),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'character', character_name) order by display_name)
                        from memberships where film_id = p_film and role = 'actor' and active), '[]'::jsonb))
$$;

create or replace function day_view(p_day uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; d shoot_days; s program_versions; dr int; junior boolean;
begin
  select * into d from shoot_days where id = p_day;
  m := require_member(d.film_id);
  if not scope_ok(m, d.date) then raise exception 'You don''t have access to this day.' using errcode = '42501'; end if;
  s := latest_sent(d.id);
  select max(version) into dr from program_versions where shoot_day_id = d.id and status = 'draft';
  junior := m.role in ('first_ad','second_ad','direction_intern');
  return jsonb_build_object(
    'day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date),
    'sent', case when s.id is null then null else jsonb_build_object('id', s.id, 'version', s.version, 'data', s.data, 'summary', s.change_summary, 'sentAt', s.sent_at) end,
    'draft', case when member_can(m, 'program.edit') then dr end,
    'dir', directory(d.film_id),
    'isJunior', junior,
    'confirmed', s.id is not null and exists (select 1 from confirmations where version_id = s.id and membership_id = m.id),
    'canEdit', member_can(m, 'program.edit'), 'canSend', member_can(m, 'program.send'),
    'canTracker', member_can(m, 'tracker.view'), 'canViewAs', member_can(m, 'callsheets.all'));
end $$;

create or replace function editor_view(p_day uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; d shoot_days; latest program_versions; prev program_versions; draft boolean;
begin
  select * into d from shoot_days where id = p_day;
  m := require_cap(d.film_id, 'program.edit');
  select * into latest from program_versions where shoot_day_id = d.id order by version desc limit 1;
  draft := latest.status = 'draft';
  prev := latest_sent(d.id);
  return jsonb_build_object(
    'day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date),
    'data', coalesce(latest.data, empty_program('', '07:00')),
    'draft', case when draft then latest.version end,
    'latestVersion', latest.version,
    'prevSent', prev.version,
    'preview', case when draft then jsonb_build_object(
        'summary', describe_changes(prev.data, latest.data),
        'departments', (select coalesce(jsonb_agg(dept_name(x)), '[]'::jsonb) from unnest(changed_depts(d.film_id, prev.data, latest.data)) x),
        'actors', (select coalesce(jsonb_agg(member_name(x)), '[]'::jsonb) from unnest(changed_actors(prev.data, latest.data)) x)) end,
    'dir', directory(d.film_id),
    -- Actors who said they're NOT available on this day (shown as a warning on their scenes).
    'unavailable', (select coalesce(jsonb_agg(membership_id), '[]'::jsonb) from actor_availability a
                    join memberships x on x.id = a.membership_id where x.film_id = d.film_id and a.date = d.date and not a.available),
    'canSend', member_can(m, 'program.send'));
end $$;

-- Applies a change to the day's draft (creating the draft if needed) and logs it.
create or replace function apply_draft(p_day uuid, p_new jsonb, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; d shoot_days; v program_versions;
begin
  select * into d from shoot_days where id = p_day;
  m := require_cap(d.film_id, 'program.edit'); perform require_shooting(d.film_id);
  v := draft_for(p_day, m.id);
  update program_versions set data = p_new, edited_by = m.id, updated_at = now() where id = v.id;
  perform log_audit(d.film_id, p_action, 'program_version', v.id::text, v.data, p_new);
  return jsonb_build_object('ok', true, 'version', v.version);
end $$;

create or replace function current_data(p_day uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select data from program_versions where shoot_day_id = p_day order by version desc limit 1), empty_program('', '07:00'))
$$;

create or replace function save_day_settings(p_day uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; cur jsonb; calls jsonb := '{}'; times jsonb := '{}'; k text; v jsonb; t text;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'program.edit');
  if not is_time(p->>'generalCall') then raise exception 'General call must be a time like 06:30.'; end if;
  for k, v in select key, value from jsonb_each(coalesce(p->'deptCalls', '{}')) loop
    if not exists (select 1 from departments where film_id = d.film_id and id::text = k) then continue; end if;
    t := v #>> '{}';
    calls := calls || jsonb_build_object(k, case when is_time(t) then t else p->>'generalCall' end);
  end loop;
  for k, v in select key, value from jsonb_each(coalesce(p->'actorTimes', '{}')) loop
    if not exists (select 1 from memberships where film_id = d.film_id and role = 'actor' and id::text = k) then continue; end if;
    if (coalesce(v->>'pickup','') <> '' and not is_time(v->>'pickup')) or (coalesce(v->>'makeup','') <> '' and not is_time(v->>'makeup'))
       or (coalesce(v->>'onSet','') <> '' and not is_time(v->>'onSet')) then raise exception 'Times must look like 06:30.'; end if;
    v := jsonb_strip_nulls(jsonb_build_object('pickup', nullif(v->>'pickup',''), 'makeup', nullif(v->>'makeup',''), 'onSet', nullif(v->>'onSet',''), 'costume', nullif(v->>'costume','')));
    if v <> '{}'::jsonb then times := times || jsonb_build_object(k, v); end if;
  end loop;
  cur := current_data(p_day) || jsonb_build_object('generalCall', p->>'generalCall', 'location', coalesce(p->>'location',''),
    'notes', coalesce(p->>'notes',''), 'deptCalls', calls, 'actorTimes', times);
  return apply_draft(p_day, cur, 'program_draft_edited');
end $$;

create or replace function save_item(p_day uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; cur jsonb; item jsonb; k text; needs jsonb := '{}'; cast_ids jsonb; old jsonb; items jsonb;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'program.edit');
  if coalesce(trim(p->>'scene'), '') = '' then raise exception 'Enter the scene number.'; end if;
  if coalesce(p->>'start','') <> '' and not is_time(p->>'start') then raise exception 'Start time must look like 06:30.'; end if;
  if coalesce(p->>'end','') <> '' and not is_time(p->>'end') then raise exception 'End time must look like 10:00.'; end if;
  k := coalesce(nullif(p->>'key', ''), substr(md5(random()::text), 1, 8));
  select coalesce(jsonb_object_agg(key, value), '{}') into needs from jsonb_each(coalesce(p->'needs', '{}'))
  where trim(value #>> '{}') <> '' and exists (select 1 from departments where film_id = d.film_id and id::text = key);
  select coalesce(jsonb_agg(x), '[]') into cast_ids from jsonb_array_elements_text(coalesce(p->'castIds', '[]')) x
  where exists (select 1 from memberships where film_id = d.film_id and role = 'actor' and id::text = x);
  cur := current_data(p_day);
  select x into old from jsonb_array_elements(cur->'items') x where x->>'key' = k;
  item := jsonb_build_object('key', k, 'scene', trim(p->>'scene'), 'heading', coalesce(p->>'heading',''), 'pages', coalesce(p->>'pages',''),
    'location', coalesce(p->>'location',''), 'start', coalesce(p->>'start',''), 'end', coalesce(p->>'end',''),
    'castIds', cast_ids, 'needs', needs, 'cut', coalesce((old->>'cut')::boolean, false), 'cutReason', old->'cutReason',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('forRole', 'second_ad', 'text', trim(x))) from unnest(string_to_array(coalesce(p->>'jobs',''), E'\n')) x where trim(x) <> ''), '[]'));
  select coalesce(jsonb_agg(x order by coalesce(nullif(x->>'start',''), '99'), ord), '[]') into items from (
    select x, ord from jsonb_array_elements(cur->'items') with ordinality t(x, ord) where x->>'key' <> k
    union all select item, 0) s;
  return apply_draft(p_day, jsonb_set(cur, '{items}', items), 'program_draft_edited');
end $$;

create or replace function cut_item(p_day uuid, p_key text, p_reason text, p_restore boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; items jsonb;
begin
  cur := current_data(p_day);
  if not exists (select 1 from jsonb_array_elements(cur->'items') x where x->>'key' = p_key) then raise exception 'Scene not found.'; end if;
  select jsonb_agg(case when x->>'key' = p_key then
      x || jsonb_build_object('cut', not coalesce(p_restore, false), 'cutReason', case when coalesce(p_restore, false) then null else nullif(trim(coalesce(p_reason,'')), '') end)
    else x end order by ord) into items
  from jsonb_array_elements(cur->'items') with ordinality t(x, ord);
  return apply_draft(p_day, jsonb_set(cur, '{items}', items), 'program_draft_edited');
end $$;

create or replace function remove_item(p_day uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; items jsonb;
begin
  cur := current_data(p_day);
  select coalesce(jsonb_agg(x order by ord), '[]') into items from jsonb_array_elements(cur->'items') with ordinality t(x, ord) where x->>'key' <> p_key;
  return apply_draft(p_day, jsonb_set(cur, '{items}', items), 'program_draft_edited');
end $$;

-- Director / co-director sends the draft: it becomes the version everyone works from.
create or replace function send_version(p_day uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; d shoot_days; v program_versions; prev program_versions; summary jsonb;
  dpts text[]; acts text[]; rec uuid[]; affected uuid[]; dropped uuid[]; unaffected uuid[]; label text;
begin
  select * into d from shoot_days where id = p_day;
  m := require_cap(d.film_id, 'program.send'); perform require_shooting(d.film_id);
  select * into v from program_versions where shoot_day_id = p_day order by version desc limit 1 for update;
  if not found or v.status <> 'draft' then raise exception 'There is no draft to send.'; end if;
  if not exists (select 1 from jsonb_array_elements(v.data->'items') x where not is_cut(x)) and coalesce(v.data->'deptCalls', '{}') = '{}'::jsonb then
    raise exception 'Add at least one scene or call a department before sending.'; end if;
  prev := latest_sent(p_day);
  summary := describe_changes(prev.data, v.data);
  dpts := changed_depts(d.film_id, prev.data, v.data);
  acts := changed_actors(prev.data, v.data);
  update program_versions set status = 'sent', sent_at = now(), sent_by = m.id, change_summary = summary where id = v.id;

  select coalesce(array_agg(r.id) filter (where prev.id is null
            or (r.role in ('department_head','department_crew') and r.department_id::text = any (dpts))
            or (r.role = 'actor' and r.id::text = any (acts))
            or r.role in ('first_ad','second_ad','direction_intern')), '{}'),
         coalesce(array_agg(r.id), '{}')
    into affected, rec from recipients(d.film_id, v.data) r;
  dropped := case when prev.id is null then '{}' else array(select p.id from recipients(d.film_id, prev.data) p where p.id <> all (rec)) end;
  unaffected := array(select x from unnest(rec) x where x <> all (affected));
  -- People whose slice didn't change keep their confirmation from the previous version.
  if prev.id is not null then
    insert into confirmations (version_id, membership_id)
    select v.id, c.membership_id from confirmations c where c.version_id = prev.id and c.membership_id = any (unaffected)
    on conflict do nothing;
  end if;
  label := format('Day %s, %s', d.day_number, to_char(d.date, 'Dy DD Mon'));
  perform notify(d.film_id, affected || dropped, 'callsheet',
    case when prev.id is null then 'New call sheet — ' else 'Call sheet changed — ' end || label,
    (select string_agg(x, ' · ') from (select jsonb_array_elements_text(summary) x limit 3) s), '#/callsheet/' || d.id);
  perform notify(d.film_id, array(select x from unnest(members_with(d.film_id, 'tracker.view')) x where x <> m.id), 'schedule_sent',
    format('Program sheet v%s sent — Day %s', v.version, d.day_number),
    (select string_agg(x, ' · ') from (select jsonb_array_elements_text(summary) x limit 3) s), '#/tracker/' || d.id);
  perform log_audit(d.film_id, 'program_sent', 'program_version', v.id::text, case when prev.id is null then null else jsonb_build_object('version', prev.version) end,
    jsonb_build_object('version', v.version, 'summary', summary));
  return jsonb_build_object('ok', true, 'version', v.version);
end $$;

-- The caller's own call sheet for a day (department or actor slice only).
create or replace function my_callsheet(p_day uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; d shoot_days; s program_versions; sl jsonb;
begin
  select * into d from shoot_days where id = p_day;
  m := require_member(d.film_id);
  s := latest_sent(d.id);
  if s.id is null then raise exception 'This day hasn''t been sent yet.'; end if;
  sl := my_slice(m, s.data);
  update notifications set read_at = now() where membership_id = m.id and read_at is null and link = '#/callsheet/' || d.id;
  return jsonb_build_object('day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date),
    'versionId', s.id, 'version', s.version, 'summary', s.change_summary, 'sentAt', s.sent_at,
    'slice', case when (sl->>'called')::boolean then sl end,
    'confirmed', exists (select 1 from confirmations where version_id = s.id and membership_id = m.id),
    'hasSchedule', scope_ok(m, d.date));
end $$;

-- Producer (or anyone with the channel) opens any department's or actor's call sheet.
create or replace function callsheet_as(p_day uuid, p_kind text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d shoot_days; s program_versions; a memberships;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'callsheets.all');
  s := latest_sent(d.id);
  if s.id is null then raise exception 'This day hasn''t been sent yet.'; end if;
  if p_kind = 'department' then
    if not exists (select 1 from departments where id = p_id and film_id = d.film_id) then raise exception 'Not found.'; end if;
    return jsonb_build_object('day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date), 'version', s.version, 'summary', s.change_summary, 'sentAt', s.sent_at,
      'slice', dept_slice(s.data, p_id::text) || jsonb_build_object('kind', 'department', 'department', dept_name(p_id::text)));
  else
    select * into a from memberships where id = p_id and film_id = d.film_id and role = 'actor';
    if not found then raise exception 'Not found.'; end if;
    return jsonb_build_object('day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date), 'version', s.version, 'summary', s.change_summary, 'sentAt', s.sent_at,
      'slice', actor_slice(s.data, p_id::text) || jsonb_build_object('kind', 'actor', 'character', a.character_name, 'name', a.display_name));
  end if;
end $$;

-- "Got it" — only people who receive this version can confirm it.
create or replace function confirm_version(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v program_versions; d shoot_days; m memberships;
begin
  select * into v from program_versions where id = p_version;
  select * into d from shoot_days where id = v.shoot_day_id;
  m := require_member(d.film_id);
  if v.status <> 'sent' then raise exception 'This version wasn''t sent.'; end if;
  if not exists (select 1 from recipients(d.film_id, v.data) r where r.id = m.id) then raise exception 'You''re not called on this day.'; end if;
  insert into confirmations (version_id, membership_id) values (v.id, m.id) on conflict do nothing;
  update notifications set read_at = now() where membership_id = m.id and read_at is null and link = '#/callsheet/' || d.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function tracker(p_day uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; d shoot_days; s program_versions; phones boolean;
begin
  select * into d from shoot_days where id = p_day;
  m := require_cap(d.film_id, 'tracker.view');
  s := latest_sent(d.id);
  if s.id is null then raise exception 'This day hasn''t been sent yet.'; end if;
  phones := member_can(m, 'contacts.view');
  return jsonb_build_object('day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date),
    'version', s.version, 'sentAt', s.sent_at,
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', r.display_name, 'roleLabel', role_label(r.role),
        'group', case when r.role = 'actor' then 'Actors' when r.department_id is not null then dept_name(r.department_id::text) else 'Direction team' end,
        'phone', case when phones then r.phone end,
        'confirmedAt', (select confirmed_at from confirmations c where c.version_id = s.id and c.membership_id = r.id)) order by r.display_name)
      from recipients(d.film_id, s.data) r), '[]'::jsonb));
end $$;

create or replace function remind_unconfirmed(p_day uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; s program_versions; ids uuid[];
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'tracker.view'); perform require_shooting(d.film_id);
  s := latest_sent(d.id);
  ids := array(select r.id from recipients(d.film_id, s.data) r
               where not exists (select 1 from confirmations c where c.version_id = s.id and c.membership_id = r.id));
  perform notify(d.film_id, ids, 'reminder', format('Please confirm your call sheet — Day %s, %s', d.day_number, to_char(d.date, 'Dy DD Mon')), null, '#/callsheet/' || d.id);
  return jsonb_build_object('count', cardinality(ids));
end $$;

create or replace function live_view(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; d shoot_days; s program_versions; ls live_status; items jsonb;
begin
  m := require_cap(p_film, 'live.view');
  select * into d from shoot_days where film_id = p_film and date = today_ist() limit 1;
  if d.id is not null then s := latest_sent(d.id); select * into ls from live_status where shoot_day_id = d.id; end if;
  select coalesce(jsonb_agg(x order by ord), '[]') into items from jsonb_array_elements(coalesce(s.data->'items', '[]')) with ordinality t(x, ord) where not is_cut(x);
  return jsonb_build_object(
    'day', case when d.id is null then null else jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date) end,
    'sent', s.id is not null,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('key', x->'key', 'scene', x->'scene', 'heading', x->'heading', 'start', x->'start',
                'needs', (select coalesce(jsonb_agg(value #>> '{}'), '[]') from jsonb_each(coalesce(x->'needs','{}'))), 'jobs', coalesce(x->'jobs', '[]'))), '[]') from jsonb_array_elements(items) x),
    'liveKey', ls.item_key, 'note', ls.note, 'updatedAt', ls.updated_at,
    'canEdit', member_can(m, 'live.edit'),
    'canRelease', member_can(m, 'crew.release') and not member_can(m, 'crew.view'));
end $$;

create or replace function set_live(p_day uuid, p_key text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'live.edit'); perform require_shooting(d.film_id);
  insert into live_status (shoot_day_id, item_key, note, updated_at) values (p_day, nullif(p_key, ''), nullif(trim(coalesce(p_note,'')), ''), now())
  on conflict (shoot_day_id) do update set item_key = excluded.item_key, note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------- crew lists ----------
create or replace function list_totals(p_list uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'people', coalesce(sum(headcount) filter (where present), 0),
    'workedTenths', coalesce(sum(worked_tenths * headcount) filter (where present), 0),
    'releasedEarly', count(*) filter (where present and worked_tenths < called_tenths),
    'absent', count(*) filter (where not present),
    'addedOnDay', count(*) filter (where added_on_day))
  from crew_entries where crew_list_id = p_list
$$;

create or replace function crew_hub(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_cap(p_film, 'crew.view');
  return coalesce((select jsonb_agg(jsonb_build_object('dayId', d.id, 'dayNumber', d.day_number, 'date', d.date,
      'status', l.status, 'totals', case when l.id is null then null else list_totals(l.id) end) order by d.date desc)
    from shoot_days d left join crew_lists l on l.shoot_day_id = d.id where d.film_id = p_film), '[]'::jsonb);
end $$;

create or replace function crew_access(p_day uuid) returns memberships
language plpgsql stable security definer set search_path = public as $$
declare d shoot_days; m memberships;
begin
  select * into d from shoot_days where id = p_day;
  m := require_member(d.film_id);
  if member_can(m, 'crew.view') or (member_can(m, 'crew.release') and d.date = today_ist()) then return m; end if;
  raise exception 'You don''t have access to this.' using errcode = '42501';
end $$;

create or replace function crew_day(p_day uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; d shoot_days; l crew_lists;
begin
  m := crew_access(p_day);
  select * into d from shoot_days where id = p_day;
  select * into l from crew_lists where shoot_day_id = p_day;
  return jsonb_build_object(
    'day', jsonb_build_object('id', d.id, 'dayNumber', d.day_number, 'date', d.date),
    'list', case when l.id is null then null else jsonb_build_object('status', l.status, 'sentBackNote', l.sent_back_note, 'lockedAt', l.locked_at) end,
    'totals', case when l.id is null then null else list_totals(l.id) end,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'label', e.label, 'category', e.category,
        'department', dept_name(e.department_id::text), 'hasDepartment', e.department_id is not null, 'headcount', e.headcount,
        'called', e.called_tenths, 'worked', e.worked_tenths, 'present', e.present, 'addedOnDay', e.added_on_day,
        'releasedAt', e.released_at, 'reason', e.release_reason, 'releasedBy', member_name(e.released_by::text))
        order by e.category, e.label) from crew_entries e where e.crew_list_id = l.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('step', a.step, 'decision', a.decision, 'note', a.note, 'who', member_name(a.membership_id::text), 'at', a.created_at) order by a.created_at)
        from approvals a where a.crew_list_id = l.id), '[]'::jsonb),
    'caps', jsonb_build_object('edit', member_can(m, 'crew.edit'), 'release', member_can(m, 'crew.release'),
        'approvePm', member_can(m, 'crew.approve.pm'), 'approveEp', member_can(m, 'crew.approve.ep'), 'reopen', member_can(m, 'crew.reopen')),
    'addable', case when member_can(m, 'crew.edit') then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.display_name, 'roleLabel', role_label(x.role)) order by x.display_name)
        from memberships x where x.film_id = d.film_id and x.active
          and not exists (select 1 from crew_entries e where e.crew_list_id = l.id and e.membership_id = x.id)), '[]'::jsonb) end,
    'departments', (directory(d.film_id))->'departments');
end $$;

create or replace function start_crew_list(p_day uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; s program_versions; l crew_lists; n int;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'crew.edit'); perform require_shooting(d.film_id);
  if exists (select 1 from crew_lists where shoot_day_id = p_day) then return jsonb_build_object('ok', true); end if;
  s := latest_sent(p_day);
  insert into crew_lists (film_id, shoot_day_id) values (d.film_id, p_day) returning * into l;
  insert into crew_entries (crew_list_id, membership_id, label, category, department_id)
  select l.id, m.id, m.display_name, case when m.role = 'actor' then 'artist'::crew_category else 'crew'::crew_category end,
         case when m.role in ('department_head','department_crew') then m.department_id end
  from memberships m
  where m.film_id = d.film_id and m.active and (
       (m.role = 'actor' and m.id::text = any (called_actors(coalesce(s.data, '{}'))))
    or (m.role in ('department_head','department_crew') and m.department_id::text = any (called_depts(coalesce(s.data, '{}'))))
    or m.role in ('director','co_director','first_ad','second_ad','direction_intern'));
  get diagnostics n = row_count;
  perform log_audit(d.film_id, 'crew_list_started', 'crew_list', l.id::text, null, jsonb_build_object('entries', n, 'fromVersion', s.version));
  return jsonb_build_object('ok', true, 'entries', n);
end $$;

create or replace function editable_entry(p_entry uuid) returns crew_entries
language plpgsql stable security definer set search_path = public as $$
declare e crew_entries; l crew_lists;
begin
  select * into e from crew_entries where id = p_entry;
  if not found then raise exception 'Entry not found.'; end if;
  select * into l from crew_lists where id = e.crew_list_id;
  if l.status <> 'draft' then raise exception 'This list is waiting for approval or locked. Ask for it to be sent back first.'; end if;
  return e;
end $$;

create or replace function add_crew_entry(p_day uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; l crew_lists; x memberships; lbl text; dept uuid; cat crew_category; called int; hc int; e crew_entries;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'crew.edit'); perform require_shooting(d.film_id);
  select * into l from crew_lists where shoot_day_id = p_day;
  if not found then raise exception 'Start the crew list first.'; end if;
  if l.status <> 'draft' then raise exception 'This list is waiting for approval or locked.'; end if;
  called := (p->>'called')::int;
  if called not in (5, 10, 15, 20) then raise exception 'Pick the call sheets: 0.5, 1, 1.5 or 2.'; end if;
  if coalesce(p->>'category','') not in ('artist','crew','junior_artist') then raise exception 'Pick what kind of entry this is.'; end if;
  cat := (p->>'category')::crew_category;
  hc := greatest(1, least(500, coalesce(nullif(p->>'headcount','')::int, 1)));
  lbl := trim(coalesce(p->>'label', ''));
  dept := (select id from departments where film_id = d.film_id and id::text = p->>'departmentId');
  if coalesce(p->>'membershipId','') <> '' then
    select * into x from memberships where id::text = p->>'membershipId' and film_id = d.film_id;
    if not found then raise exception 'Person not found.'; end if;
    lbl := x.display_name; dept := x.department_id;
  end if;
  if lbl = '' then raise exception 'Enter a name, or pick someone on the film.'; end if;
  insert into crew_entries (crew_list_id, membership_id, label, category, department_id, headcount, called_tenths, worked_tenths, added_on_day)
  values (l.id, x.id, lbl, cat, dept, hc, called, called, true) returning * into e;
  perform log_audit(d.film_id, 'crew_entry_added', 'crew_entry', e.id::text, null, to_jsonb(e));
  return jsonb_build_object('ok', true);
end $$;

create or replace function set_presence(p_entry uuid, p_present boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e crew_entries; f uuid; after crew_entries;
begin
  e := editable_entry(p_entry);
  select film_id into f from crew_lists where id = e.crew_list_id;
  perform require_cap(f, 'crew.edit'); perform require_shooting(f);
  update crew_entries set present = p_present, worked_tenths = case when p_present then called_tenths else 0 end where id = e.id returning * into after;
  perform log_audit(f, case when p_present then 'marked_present' else 'marked_absent' end, 'crew_entry', e.id::text, to_jsonb(e), to_jsonb(after));
  return jsonb_build_object('ok', true);
end $$;

create or replace function release_early(p_entry uuid, p_worked int, p_at text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e crew_entries; l crew_lists; d shoot_days; m memberships; after crew_entries;
begin
  e := editable_entry(p_entry);
  select * into l from crew_lists where id = e.crew_list_id;
  select * into d from shoot_days where id = l.shoot_day_id;
  m := crew_access(d.id);
  if not member_can(m, 'crew.release') then raise exception 'You don''t have access to this.' using errcode = '42501'; end if;
  perform require_shooting(d.film_id);
  if p_worked not in (5, 10, 15, 20) then raise exception 'Pick 0.5, 1, 1.5 or 2.'; end if;
  if p_worked > e.called_tenths then raise exception 'They can''t be counted for more than they were called for.'; end if;
  if not is_time(p_at) then raise exception 'Enter the time they were released, like 18:00.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Pick or write a reason.'; end if;
  update crew_entries set worked_tenths = p_worked, released_at = p_at, release_reason = trim(p_reason), released_by = m.id where id = e.id returning * into after;
  perform log_audit(d.film_id, 'released_early', 'crew_entry', e.id::text, to_jsonb(e), to_jsonb(after));
  if e.membership_id is not null then
    perform notify(d.film_id, array[e.membership_id], 'released', 'You''ve been released for the day', format('Released at %s — %s', p_at, trim(p_reason)), null);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function send_for_approval(p_day uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; l crew_lists;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'crew.edit'); perform require_shooting(d.film_id);
  select * into l from crew_lists where shoot_day_id = p_day for update;
  if not found then raise exception 'Crew list not found.'; end if;
  if l.status <> 'draft' then raise exception 'Already sent for approval.'; end if;
  update crew_lists set status = 'awaiting_pm', sent_back_note = null where id = l.id;
  perform notify(d.film_id, members_with(d.film_id, 'crew.approve.pm'), 'approval',
    format('Approve crew list — Day %s, %s', d.day_number, to_char(d.date, 'Dy DD Mon')), null, '#/crew/' || d.id);
  perform log_audit(d.film_id, 'crew_list_sent_for_approval', 'crew_list', l.id::text, null, null);
  return jsonb_build_object('ok', true);
end $$;

-- Step 1 = Production Manager, step 2 = Executive Producer. Step 2 locks the day.
create or replace function decide(p_day uuid, p_decision text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; l crew_lists; m memberships; step text; label text;
begin
  select * into d from shoot_days where id = p_day;
  m := require_member(d.film_id); perform require_shooting(d.film_id);
  select * into l from crew_lists where shoot_day_id = p_day for update;
  if not found then raise exception 'Crew list not found.'; end if;
  step := case l.status when 'awaiting_pm' then 'pm' when 'awaiting_ep' then 'ep' end;
  if step is null then raise exception 'This list isn''t waiting for approval.'; end if;
  if not member_can(m, case when step = 'pm' then 'crew.approve.pm' else 'crew.approve.ep' end) then
    raise exception '%', case when step = 'pm' then 'Waiting for the Production Manager.' else 'Waiting for the Executive Producer.' end; end if;
  if p_decision = 'send_back' and coalesce(trim(p_note), '') = '' then raise exception 'Say what needs fixing so the team knows.'; end if;
  label := format('Day %s, %s', d.day_number, to_char(d.date, 'Dy DD Mon'));
  if p_decision = 'approve' then
    update crew_lists set status = case when step = 'pm' then 'awaiting_ep'::crew_list_status else 'locked'::crew_list_status end,
      locked_at = case when step = 'ep' then now() end where id = l.id;
    insert into approvals (crew_list_id, step, decision, note, membership_id) values (l.id, step, 'approved', nullif(trim(coalesce(p_note,'')), ''), m.id);
    if step = 'pm' then
      perform notify(d.film_id, members_with(d.film_id, 'crew.approve.ep'), 'approval', 'Approve crew list — ' || label, 'Production Manager approved', '#/crew/' || d.id);
    else
      perform notify(d.film_id, members_with(d.film_id, 'crew.edit'), 'approval', 'Crew list locked — ' || label, 'Approved by the EP', '#/crew/' || d.id);
    end if;
  elsif p_decision = 'send_back' then
    update crew_lists set status = 'draft', sent_back_note = trim(p_note) where id = l.id;
    insert into approvals (crew_list_id, step, decision, note, membership_id) values (l.id, step, 'sent_back', trim(p_note), m.id);
    perform notify(d.film_id, members_with(d.film_id, 'crew.edit'), 'approval', 'Crew list sent back — ' || label, trim(p_note), '#/crew/' || d.id);
  else
    raise exception 'Unknown decision.';
  end if;
  perform log_audit(d.film_id, case when p_decision = 'approve' then 'crew_list_approved_' else 'crew_list_sent_back_' end || step, 'crew_list', l.id::text, null, jsonb_build_object('note', p_note));
  return jsonb_build_object('ok', true);
end $$;

create or replace function reopen(p_day uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; l crew_lists; m memberships;
begin
  select * into d from shoot_days where id = p_day;
  m := require_cap(d.film_id, 'crew.reopen'); perform require_shooting(d.film_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for reopening.'; end if;
  select * into l from crew_lists where shoot_day_id = p_day for update;
  if not found or l.status <> 'locked' then raise exception 'This day isn''t locked.'; end if;
  -- Keep a full copy of the locked version in the append-only change log.
  perform log_audit(d.film_id, 'crew_list_reopened', 'crew_list', l.id::text,
    jsonb_build_object('entries', (select jsonb_agg(to_jsonb(e)) from crew_entries e where e.crew_list_id = l.id)), jsonb_build_object('reason', trim(p_reason)));
  update crew_lists set status = 'draft', locked_at = null, sent_back_note = 'Reopened by EP: ' || trim(p_reason) where id = l.id;
  insert into approvals (crew_list_id, step, decision, note, membership_id) values (l.id, 'reopen', 'reopened', trim(p_reason), m.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function crew_search(p_film uuid, p_q text, p_approved_only boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_cap(p_film, 'crew.view');
  if length(trim(coalesce(p_q, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(g order by g->>'label') from (
    select jsonb_build_object('label', min(e.label),
      'tenths', coalesce(sum(e.worked_tenths) filter (where e.present), 0),
      'days', count(*) filter (where e.present),
      'rows', jsonb_agg(jsonb_build_object('dayId', d.id, 'dayNumber', d.day_number, 'date', d.date, 'present', e.present, 'worked', e.worked_tenths, 'locked', l.status = 'locked') order by d.date desc)) g
    from crew_entries e join crew_lists l on l.id = e.crew_list_id join shoot_days d on d.id = l.shoot_day_id
    where l.film_id = p_film and e.label ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      and (not coalesce(p_approved_only, true) or l.status = 'locked')
    group by coalesce(e.membership_id::text, 'label:' || e.label)) s), '[]'::jsonb);
end $$;

-- ---------- contracts & payments ----------
create or replace function contracts_view(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_cap(p_film, 'contracts');
  return coalesce((select jsonb_agg(jsonb_build_object('memberId', a.id, 'name', a.display_name, 'character', a.character_name,
      'contract', case when c.id is null then null else jsonb_build_object('id', c.id, 'deal', c.deal, 'ratePaise', c.rate_paise, 'totalPaise', c.total_paise, 'signedOn', c.signed_on, 'notes', c.notes) end,
      'paidPaise', coalesce((select sum(amount_paise) from payments where contract_id = c.id), 0),
      'tenths', approved_tenths(a.id)) order by a.display_name)
    from memberships a left join contracts c on c.membership_id = a.id
    where a.film_id = p_film and a.role = 'actor'), '[]'::jsonb);
end $$;

create or replace function save_contract(p_member uuid, p_deal text, p_amount_paise bigint, p_signed_on date, p_notes text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a memberships; before contracts; after contracts;
begin
  select * into a from memberships where id = p_member;
  perform require_cap(a.film_id, 'contracts'); perform require_shooting(a.film_id);
  if p_deal not in ('per_day','package') then raise exception 'Pick the deal type.'; end if;
  if p_amount_paise is null or p_amount_paise < 0 then raise exception 'Enter the amount in rupees.'; end if;
  select * into before from contracts where membership_id = p_member;
  insert into contracts (film_id, membership_id, deal, rate_paise, total_paise, signed_on, notes)
  values (a.film_id, p_member, p_deal::deal_type, case when p_deal = 'per_day' then p_amount_paise end, case when p_deal = 'package' then p_amount_paise end, p_signed_on, nullif(trim(coalesce(p_notes,'')), ''))
  on conflict (membership_id) do update set deal = excluded.deal, rate_paise = excluded.rate_paise, total_paise = excluded.total_paise, signed_on = excluded.signed_on, notes = excluded.notes
  returning * into after;
  perform log_audit(a.film_id, 'contract_saved', 'contract', after.id::text, to_jsonb(before), to_jsonb(after));
  return jsonb_build_object('ok', true);
end $$;

create or replace function record_payment(p_contract uuid, p_amount_paise bigint, p_paid_on date, p_reference text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c contracts; p payments;
begin
  select * into c from contracts where id = p_contract;
  perform require_cap(c.film_id, 'contracts'); perform require_shooting(c.film_id);
  if coalesce(p_amount_paise, 0) <= 0 then raise exception 'Enter the amount paid.'; end if;
  if p_paid_on is null then raise exception 'Pick the payment date.'; end if;
  insert into payments (contract_id, amount_paise, paid_on, reference) values (c.id, p_amount_paise, p_paid_on, nullif(trim(coalesce(p_reference,'')), '')) returning * into p;
  perform log_audit(c.film_id, 'payment_recorded', 'payment', p.id::text, null, to_jsonb(p));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- people, codes & channel access ----------
create or replace function people_view(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; assign film_role[]; phones boolean; producer boolean;
begin
  m := require_cap(p_film, 'people.view');
  assign := assignable_roles(m);
  phones := member_can(m, 'contacts.view');
  producer := m.role = 'producer';
  return jsonb_build_object(
    'canManage', cardinality(assign) > 0 and member_can(m, 'people.manage'),
    'isProducer', producer,
    'assignable', (select coalesce(jsonb_agg(jsonb_build_object('role', r, 'label', role_label(r))), '[]') from unnest(assign) r),
    'departments', (directory(p_film))->'departments',
    'caps', (select jsonb_agg(jsonb_build_object('cap', capability, 'label', label, 'group', grp) order by sort) from caps),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.display_name, 'role', x.role, 'roleLabel', role_label(x.role),
        'department', (select name from departments where id = x.department_id), 'character', x.character_name,
        'phone', case when phones then x.phone end, 'joined', x.person_id is not null, 'active', x.active,
        'accessEndsOn', x.access_ends_on, 'allowScreenshots', x.allow_screenshots, 'isMe', x.id = m.id,
        'manageable', x.active and x.role = any (assign) and member_can(m, 'people.manage'),
        'code', case when x.role = any (assign) then (select jsonb_build_object('code', s.code, 'purpose', s.purpose) from signup_codes s
                 where s.membership_id = x.id and s.used_at is null and s.expires_at > now() order by s.created_at desc limit 1) end,
        'overrides', case when producer then (select coalesce(jsonb_object_agg(capability, allowed), '{}') from member_access where membership_id = x.id) end,
        'effective', case when producer then to_jsonb(caps_of(x)) end)
      order by x.role, x.display_name) from memberships x where x.film_id = p_film), '[]'::jsonb));
end $$;

create or replace function add_person(p_film uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; r film_role; dept uuid; x memberships; ends date; code text;
begin
  m := require_cap(p_film, 'people.manage'); perform require_shooting(p_film);
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Enter the person''s name.'; end if;
  begin r := (p->>'role')::film_role; exception when others then raise exception 'Pick a role.'; end;
  if not r = any (assignable_roles(m)) then raise exception 'You can''t give out that role.'; end if;
  dept := (select id from departments where film_id = p_film and id::text = p->>'departmentId');
  if r in ('department_head','department_crew') and dept is null then raise exception 'Pick their department.'; end if;
  ends := nullif(p->>'accessEndsOn', '')::date;
  if r = 'direction_intern' and ends is null then raise exception 'Interns need an access end date.'; end if;
  insert into memberships (film_id, display_name, role, department_id, character_name, phone, access_ends_on)
  values (p_film, trim(p->>'name'), r, case when r in ('department_head','department_crew') then dept end,
          case when r = 'actor' then nullif(trim(coalesce(p->>'character','')), '') end, nullif(trim(coalesce(p->>'phone','')), ''), ends)
  returning * into x;
  code := new_code(x.id, 'join');
  perform log_audit(p_film, 'person_added', 'membership', x.id::text, null, jsonb_build_object('name', x.display_name, 'role', r));
  return jsonb_build_object('code', code, 'name', x.display_name);
end $$;

create or replace function manageable(p_member uuid) returns memberships
language plpgsql stable security definer set search_path = public as $$
declare x memberships; m memberships;
begin
  select * into x from memberships where id = p_member;
  if not found then raise exception 'Person not found.'; end if;
  m := require_cap(x.film_id, 'people.manage');
  if not x.role = any (assignable_roles(m)) then raise exception 'You can''t manage this person.'; end if;
  return x;
end $$;

create or replace function issue_code(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x memberships; c text; purpose code_purpose;
begin
  x := manageable(p_member); perform require_shooting(x.film_id);
  if not x.active then raise exception 'This person has been removed.'; end if;
  purpose := case when x.person_id is null then 'join' else 'reset' end;
  c := new_code(x.id, purpose);
  perform log_audit(x.film_id, case when purpose = 'join' then 'join_code_issued' else 'reset_code_issued' end, 'membership', x.id::text, null, null);
  return jsonb_build_object('code', c, 'purpose', purpose);
end $$;

create or replace function update_member(p_member uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x memberships; after memberships; ends date;
begin
  x := manageable(p_member); perform require_shooting(x.film_id);
  ends := nullif(p->>'accessEndsOn', '')::date;
  if x.role = 'direction_intern' and ends is null then raise exception 'Interns need an access end date.'; end if;
  update memberships set phone = nullif(trim(coalesce(p->>'phone','')), ''), access_ends_on = ends,
    allow_screenshots = coalesce((p->>'allowScreenshots')::boolean, false) where id = x.id returning * into after;
  perform log_audit(x.film_id, 'access_changed', 'membership', x.id::text,
    jsonb_build_object('phone', x.phone, 'accessEndsOn', x.access_ends_on, 'allowScreenshots', x.allow_screenshots),
    jsonb_build_object('phone', after.phone, 'accessEndsOn', after.access_ends_on, 'allowScreenshots', after.allow_screenshots));
  return jsonb_build_object('ok', true);
end $$;

create or replace function remove_person(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x memberships;
begin
  x := manageable(p_member); perform require_shooting(x.film_id);
  if x.person_id = auth.uid() then raise exception 'You can''t remove yourself.'; end if;
  update memberships set active = false where id = x.id;
  update signup_codes set expires_at = now() where membership_id = x.id and used_at is null;
  perform log_audit(x.film_id, 'person_removed', 'membership', x.id::text, null, null);
  return jsonb_build_object('ok', true);
end $$;

-- Producer only: unlock (true), lock (false) or reset to the role default (null) for one person.
create or replace function set_member_access(p_member uuid, p_cap text, p_allowed boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x memberships;
begin
  select * into x from memberships where id = p_member;
  if not found then raise exception 'Person not found.'; end if;
  perform require_producer(x.film_id);
  if x.role = 'producer' then raise exception 'The producer always has every channel.'; end if;
  if not exists (select 1 from caps where capability = p_cap) then raise exception 'Unknown channel.'; end if;
  if p_allowed is null then delete from member_access where membership_id = x.id and capability = p_cap;
  else insert into member_access values (x.id, p_cap, p_allowed) on conflict (membership_id, capability) do update set allowed = excluded.allowed; end if;
  perform log_audit(x.film_id, 'channel_changed_for_person', 'membership', x.id::text, null, jsonb_build_object('channel', p_cap, 'allowed', p_allowed));
  return jsonb_build_object('ok', true);
end $$;

create or replace function access_matrix(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_producer(p_film);
  return jsonb_build_object(
    'caps', (select jsonb_agg(jsonb_build_object('cap', capability, 'label', label, 'group', grp) order by sort) from caps),
    'roles', (select jsonb_agg(jsonb_build_object('role', r, 'label', role_label(r),
        'defaults', (select coalesce(jsonb_agg(capability), '[]') from cap_defaults where role = r),
        'overrides', (select coalesce(jsonb_object_agg(capability, allowed), '{}') from role_access where film_id = p_film and role = r)))
      from unnest(enum_range(null::film_role)) r where r <> 'producer'));
end $$;

-- Producer only: unlock / lock a channel for everyone with a role (null = back to default).
create or replace function set_role_access(p_film uuid, p_role text, p_cap text, p_allowed boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r film_role;
begin
  perform require_producer(p_film);
  begin r := p_role::film_role; exception when others then raise exception 'Unknown role.'; end;
  if r = 'producer' then raise exception 'The producer always has every channel.'; end if;
  if not exists (select 1 from caps where capability = p_cap) then raise exception 'Unknown channel.'; end if;
  if p_allowed is null then delete from role_access where film_id = p_film and role = r and capability = p_cap;
  else insert into role_access values (p_film, r, p_cap, p_allowed) on conflict (film_id, role, capability) do update set allowed = excluded.allowed; end if;
  perform log_audit(p_film, 'channel_changed_for_role', 'role', p_role, null, jsonb_build_object('channel', p_cap, 'allowed', p_allowed));
  return jsonb_build_object('ok', true);
end $$;

create or replace function audit_view(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships; money boolean;
begin
  m := require_cap(p_film, 'audit.view');
  money := member_can(m, 'contracts');
  return coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'who', coalesce(p.name, 'System'), 'at', a.created_at, 'after', case when a.action like 'channel_%' then a.after end) order by a.created_at desc)
    from (select * from audit_log where film_id = p_film and (money or action not in ('contract_saved','payment_recorded')) order by created_at desc limit 300) a
    left join profiles p on p.id = a.actor_id), '[]'::jsonb);
end $$;


-- ---------- importing schedules ----------
-- Cleans imported items and merges them into a program sheet (append, or replace all scenes).
create or replace function merge_items(p_film uuid, cur jsonb, p_items jsonb, p_replace boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare items jsonb := case when p_replace then '[]'::jsonb else coalesce(cur->'items', '[]'::jsonb) end; i jsonb; k text; n int := 0;
begin
  for i in select x from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x loop
    if coalesce(trim(i->>'scene'), '') = '' then continue; end if;
    n := n + 1;
    k := substr(md5(random()::text || n::text), 1, 8);
    items := items || jsonb_build_array(jsonb_build_object(
      'key', k, 'scene', left(trim(i->>'scene'), 20), 'heading', left(coalesce(i->>'heading', ''), 200), 'pages', left(coalesce(i->>'pages', ''), 20),
      'location', left(coalesce(i->>'location', ''), 200),
      'start', case when is_time(i->>'start') then i->>'start' else '' end,
      'end', case when is_time(i->>'end') then i->>'end' else '' end,
      'castIds', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(i->'castIds', '[]')) x
                           where exists (select 1 from memberships where film_id = p_film and role = 'actor' and id::text = x)), '[]'::jsonb),
      'needs', coalesce((select jsonb_object_agg(key, left(value #>> '{}', 300)) from jsonb_each(coalesce(i->'needs', '{}'))
                         where trim(value #>> '{}') <> '' and exists (select 1 from departments where film_id = p_film and id::text = key)), '{}'::jsonb),
      'cut', false,
      'jobs', coalesce((select jsonb_agg(jsonb_build_object('forRole', 'second_ad', 'text', left(trim(x), 300)))
                        from unnest(string_to_array(coalesce(i->>'notes', ''), E'\n')) x where trim(x) <> ''), '[]'::jsonb)));
  end loop;
  select coalesce(jsonb_agg(x order by coalesce(nullif(x->>'start', ''), '99'), ord), '[]') into items from jsonb_array_elements(items) with ordinality t(x, ord);
  return jsonb_set(coalesce(cur, empty_program('', '07:00')), '{items}', items);
end $$;

-- Import scenes into one day's draft (from an uploaded program sheet).
create or replace function import_items(p_day uuid, p_items jsonb, p_replace boolean, p_location text, p_general_call text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d shoot_days; cur jsonb;
begin
  select * into d from shoot_days where id = p_day;
  perform require_cap(d.film_id, 'program.edit'); perform require_shooting(d.film_id);
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'No scenes to import.'; end if;
  cur := merge_items(d.film_id, current_data(p_day), p_items, coalesce(p_replace, false));
  if coalesce(trim(p_location), '') <> '' then cur := jsonb_set(cur, '{location}', to_jsonb(trim(p_location))); end if;
  if is_time(p_general_call) then cur := jsonb_set(cur, '{generalCall}', to_jsonb(p_general_call)); end if;
  return apply_draft(p_day, cur, 'program_imported');
end $$;

-- Import a whole shooting schedule: creates the shoot days that don't exist yet and adds each day's scenes as a draft.
create or replace function import_schedule(p_film uuid, p_days jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m memberships; dd jsonb; d shoot_days; v program_versions; nd int := 0; ni int := 0; num int; dt date; cur jsonb;
begin
  m := require_cap(p_film, 'program.edit'); perform require_shooting(p_film);
  if jsonb_array_length(coalesce(p_days, '[]')) = 0 then raise exception 'Nothing to import.'; end if;
  if jsonb_array_length(p_days) > 200 then raise exception 'That''s more than 200 days — split the file.'; end if;
  for dd in select x from jsonb_array_elements(p_days) x loop
    begin dt := (dd->>'date')::date; exception when others then raise exception 'Every day needs a date (check "%").', dd->>'label'; end;
    if dt is null then raise exception 'Every day needs a date.'; end if;
    select * into d from shoot_days where film_id = p_film and date = dt order by day_number limit 1;
    if not found then
      num := nullif(dd->>'dayNumber', '')::int;
      if num is null or exists (select 1 from shoot_days where film_id = p_film and day_number = num) then
        num := coalesce((select max(day_number) from shoot_days where film_id = p_film), 0) + 1;
      end if;
      insert into shoot_days (film_id, day_number, date) values (p_film, num, dt) returning * into d;
      nd := nd + 1;
    end if;
    v := draft_for(d.id, m.id);
    cur := merge_items(p_film, v.data, dd->'items', false);
    if coalesce(trim(dd->>'location'), '') <> '' and coalesce(cur->>'location', '') = '' then cur := jsonb_set(cur, '{location}', to_jsonb(trim(dd->>'location'))); end if;
    if is_time(dd->>'generalCall') then cur := jsonb_set(cur, '{generalCall}', to_jsonb(dd->>'generalCall')); end if;
    update program_versions set data = cur, edited_by = m.id, updated_at = now() where id = v.id;
    ni := ni + jsonb_array_length(coalesce(dd->'items', '[]'));
  end loop;
  perform log_audit(p_film, 'schedule_imported', 'film', p_film::text, null, jsonb_build_object('days', jsonb_array_length(p_days), 'newDays', nd, 'scenes', ni));
  return jsonb_build_object('days', jsonb_array_length(p_days), 'newDays', nd, 'scenes', ni);
end $$;

-- ---------- artists ----------
-- The version of a day an artist list may show: drafts too for people who edit schedules.
create or replace function visible_version(m memberships, p_day uuid) returns program_versions
language sql stable security definer set search_path = public as $$
  select * from program_versions where shoot_day_id = p_day and (status = 'sent' or member_can(m, 'program.edit'))
  order by version desc limit 1
$$;

create or replace function artist_scenes(m memberships, p_actor uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('dayId', d.id, 'dayNumber', d.day_number, 'date', d.date, 'status', v.status, 'version', v.version,
      'scene', i->>'scene', 'heading', i->>'heading', 'start', i->>'start', 'location', i->>'location',
      'available', (select available from actor_availability a where a.membership_id = p_actor and a.date = d.date)) order by d.date, i->>'start'), '[]'::jsonb)
  from shoot_days d cross join lateral (select * from visible_version(m, d.id)) v
  cross join lateral jsonb_array_elements(coalesce(v.data->'items', '[]')) i
  where d.film_id = m.film_id and v.id is not null and not is_cut(i) and coalesce(i->'castIds', '[]') ? p_actor::text
$$;

create or replace function artists_list(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m memberships;
begin
  m := require_cap(p_film, 'artists.view');
  return jsonb_build_object(
    'canEdit', member_can(m, 'artists.edit') and not exists (select 1 from films where id = p_film and status = 'wrapped'),
    'canAdd', member_can(m, 'people.manage') and 'actor' = any (assignable_roles(m)),
    'artists', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.display_name, 'character', a.character_name, 'joined', a.person_id is not null,
        'scenes', jsonb_array_length(artist_scenes(m, a.id)),
        'availableDays', (select count(*) from actor_availability x where x.membership_id = a.id and x.available and x.date >= today_ist()),
        'nextAvailable', (select min(date) from actor_availability x where x.membership_id = a.id and x.available and x.date >= today_ist()),
        'conflicts', (select count(*) from jsonb_array_elements(artist_scenes(m, a.id)) s where s->>'available' = 'false')) order by a.display_name)
      from memberships a where a.film_id = p_film and a.role = 'actor' and a.active), '[]'::jsonb));
end $$;

create or replace function artist_view(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a memberships; m memberships;
begin
  select * into a from memberships where id = p_member and role = 'actor';
  if not found then raise exception 'Artist not found.'; end if;
  m := require_cap(a.film_id, 'artists.view');
  return jsonb_build_object(
    'artist', jsonb_build_object('id', a.id, 'name', a.display_name, 'character', a.character_name, 'joined', a.person_id is not null,
       'phone', case when member_can(m, 'contacts.view') then a.phone end),
    'canEdit', member_can(m, 'artists.edit') and not exists (select 1 from films where id = a.film_id and status = 'wrapped'),
    'today', today_ist(),
    'dates', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'available', available, 'note', note) order by date)
                       from actor_availability where membership_id = a.id), '[]'::jsonb),
    'scenes', artist_scenes(m, a.id));
end $$;

-- What the schedule importer needs to match names: departments, actors and today's date.
create or replace function import_context(p_film uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_cap(p_film, 'program.edit');
  return directory(p_film) || jsonb_build_object('today', today_ist(),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'dayNumber', day_number) order by date) from shoot_days where film_id = p_film), '[]'::jsonb));
end $$;

-- Mark dates as available (true), not available (false) or unknown (null) for an artist.
create or replace function set_availability(p_member uuid, p_dates date[], p_available boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a memberships;
begin
  select * into a from memberships where id = p_member and role = 'actor';
  if not found then raise exception 'Artist not found.'; end if;
  perform require_cap(a.film_id, 'artists.edit'); perform require_shooting(a.film_id);
  if cardinality(coalesce(p_dates, '{}')) = 0 then raise exception 'Pick at least one date.'; end if;
  if cardinality(p_dates) > 400 then raise exception 'Too many dates at once.'; end if;
  if p_available is null then
    delete from actor_availability where membership_id = a.id and date = any (p_dates);
  else
    insert into actor_availability (membership_id, date, available, note)
    select a.id, x, p_available, nullif(trim(coalesce(p_note, '')), '') from unnest(p_dates) x
    on conflict (membership_id, date) do update set available = excluded.available, note = excluded.note, updated_at = now();
  end if;
  perform log_audit(a.film_id, 'artist_dates_changed', 'membership', a.id::text, null,
    jsonb_build_object('dates', cardinality(p_dates), 'available', p_available));
  return jsonb_build_object('ok', true, 'count', cardinality(p_dates));
end $$;

-- =====================================================================================
-- Guarantees enforced by the database itself
-- =====================================================================================
create or replace function audit_log_block_changes() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log for each row execute function audit_log_block_changes();

create or replace function crew_entries_block_when_locked() returns trigger language plpgsql as $$
declare s crew_list_status;
begin
  select status into s from crew_lists where id = coalesce(new.crew_list_id, old.crew_list_id);
  if s = 'locked' then raise exception 'crew list is locked'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists crew_entries_locked on crew_entries;
create trigger crew_entries_locked before insert or update or delete on crew_entries for each row execute function crew_entries_block_when_locked();

-- =====================================================================================
-- Lock everything down: no direct table access; only the API functions are callable
-- =====================================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function code_info(text), reset_password(text, text), setup_needed() to anon, authenticated;
grant execute on function
  setup_company(text, text, text), create_film(text, boolean, text), my_films(), me(uuid), claim_code(text),
  notices_list(uuid, int), post_notice(uuid, text, boolean), confirm_notice(uuid), inbox(uuid), mark_read(uuid, text), home(uuid),
  days_list(uuid), create_day(uuid, int, date, text, text), day_view(uuid), editor_view(uuid),
  save_day_settings(uuid, jsonb), save_item(uuid, jsonb), cut_item(uuid, text, text, boolean), remove_item(uuid, text),
  send_version(uuid), my_callsheet(uuid), callsheet_as(uuid, text, uuid), confirm_version(uuid), tracker(uuid), remind_unconfirmed(uuid),
  live_view(uuid), set_live(uuid, text, text),
  crew_hub(uuid), crew_day(uuid), start_crew_list(uuid), add_crew_entry(uuid, jsonb), set_presence(uuid, boolean),
  release_early(uuid, int, text, text), send_for_approval(uuid), decide(uuid, text, text), reopen(uuid, text), crew_search(uuid, text, boolean),
  contracts_view(uuid), save_contract(uuid, text, bigint, date, text), record_payment(uuid, bigint, date, text),
  people_view(uuid), add_person(uuid, jsonb), issue_code(uuid), update_member(uuid, jsonb), remove_person(uuid),
  set_member_access(uuid, text, boolean), access_matrix(uuid), set_role_access(uuid, text, text, boolean), audit_view(uuid),
  import_items(uuid, jsonb, boolean, text, text), import_schedule(uuid, jsonb), import_context(uuid),
  artists_list(uuid), artist_view(uuid), set_availability(uuid, date[], boolean, text)
to authenticated;

notify pgrst, 'reload schema';
