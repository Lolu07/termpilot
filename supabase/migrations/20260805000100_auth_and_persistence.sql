begin;

-- TermPilot's persistent, per-user data model. The Express runtime depends on
-- this schema; the former shared JSON store is no longer used.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 80
  ),
  avatar_url text check (
    avatar_url is null
    or char_length(avatar_url) <= 2048
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (
    char_length(btrim(name)) between 1 and 100
  ),
  -- A small, sanitized snapshot of the latest parser result. Raw syllabus text
  -- and PDF bytes must never be written here.
  parse_info jsonb not null default '{}'::jsonb check (
    jsonb_typeof(parse_info) = 'object'
    and octet_length(parse_info::text) <= 16384
    and not (parse_info ?| array[
      'raw_text',
      'syllabus_text',
      'pdf_base64',
      'document'
    ])
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Supports an ownership-preserving composite foreign key from items/imports.
  unique (id, user_id)
);

create unique index courses_user_name_unique
  on public.courses (user_id, lower(btrim(name)));

create index courses_user_id_index
  on public.courses (user_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null default 'Task' check (
    item_type in (
      'Homework',
      'Quiz',
      'Exam',
      'Midterm',
      'Final',
      'Project',
      'Lab',
      'Paper',
      'Presentation',
      'Task'
    )
  ),
  title text not null check (
    char_length(btrim(title)) between 1 and 120
  ),
  due_date date not null check (
    due_date between date '2000-01-01' and date '2099-12-31'
  ),
  estimated_effort_hours numeric(5, 2) not null check (
    estimated_effort_hours between 0.5 and 80
  ),
  weight numeric(5, 2) not null default 0 check (
    weight between 0 and 100
  ),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_course_owner_fkey
    foreign key (course_id, user_id)
    references public.courses (id, user_id)
    on delete cascade
);

create index items_user_due_date_index
  on public.items (user_id, due_date);

create index items_course_id_index
  on public.items (course_id);

create unique index items_course_title_due_date_unique
  on public.items (course_id, lower(btrim(title)), due_date);

-- Immutable, user-scoped provenance for each confirmed syllabus import. This
-- intentionally stores only metadata and never the uploaded file or its text.
create table public.course_imports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  parser_engine text not null check (
    parser_engine in ('groq', 'fallback')
  ),
  input_type text not null check (
    input_type in ('text', 'pdf')
  ),
  source_filename text check (
    source_filename is null
    or char_length(source_filename) <= 255
  ),
  imported_item_count integer not null check (
    imported_item_count between 1 and 250
  ),
  request_id text check (
    request_id is null
    or char_length(request_id) <= 64
  ),
  warning text check (
    warning is null
    or char_length(warning) <= 500
  ),
  parse_info jsonb not null default '{}'::jsonb check (
    jsonb_typeof(parse_info) = 'object'
    and octet_length(parse_info::text) <= 16384
    and not (parse_info ?| array[
      'raw_text',
      'syllabus_text',
      'pdf_base64',
      'document'
    ])
  ),
  reviewed_at timestamptz not null default now(),
  constraint course_imports_course_owner_fkey
    foreign key (course_id, user_id)
    references public.courses (id, user_id)
    on delete cascade
);

create index course_imports_user_reviewed_index
  on public.course_imports (user_id, reviewed_at desc);

create index course_imports_course_reviewed_index
  on public.course_imports (course_id, reviewed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

-- Trigger helpers are internal implementation details. Supabase grants
-- function execution to PUBLIC by default, so explicitly close that surface.
revoke all on function public.set_updated_at()
  from public, anon, authenticated;

-- Keep the public profile row in lockstep with Auth. User metadata is copied
-- only for presentation; it is never used for authorization decisions.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(
      left(
        btrim(coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )),
        80
      ),
      ''
    ),
    nullif(
      left(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), 2048),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists termpilot_create_profile on auth.users;
create trigger termpilot_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

revoke all on function public.create_profile_for_new_user()
  from public, anon, authenticated;

-- Backfill profiles if this migration is applied after test users exist.
insert into public.profiles (id, display_name, avatar_url)
select
  users.id,
  nullif(
    left(
      btrim(coalesce(
        users.raw_user_meta_data ->> 'full_name',
        users.raw_user_meta_data ->> 'name',
        ''
      )),
      80
    ),
    ''
  ),
  nullif(
    left(btrim(coalesce(users.raw_user_meta_data ->> 'avatar_url', '')), 2048),
    ''
  )
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.items enable row level security;
alter table public.course_imports enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy courses_select_own
on public.courses for select
to authenticated
using ((select auth.uid()) = user_id);

create policy courses_insert_own
on public.courses for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy courses_update_own
on public.courses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy courses_delete_own
on public.courses for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy items_select_own
on public.items for select
to authenticated
using ((select auth.uid()) = user_id);

create policy items_insert_own
on public.items for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy items_update_own
on public.items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy items_delete_own
on public.items for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy course_imports_select_own
on public.course_imports for select
to authenticated
using ((select auth.uid()) = user_id);

create policy course_imports_insert_own
on public.course_imports for insert
to authenticated
with check ((select auth.uid()) = user_id);

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.courses from public, anon, authenticated;
revoke all on table public.items from public, anon, authenticated;
revoke all on table public.course_imports from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.items to authenticated;
grant select, insert on table public.course_imports to authenticated;

-- Confirming a reviewed import must be all-or-nothing. PostgreSQL functions run
-- inside the calling statement's transaction, so any validation, constraint, or
-- insert failure rolls back the course update, item replacement, and audit row.
create or replace function public.import_reviewed_course(
  p_course_name text,
  p_items jsonb,
  p_parse_info jsonb default '{}'::jsonb,
  p_replace_existing boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_name text := btrim(coalesce(p_course_name, ''));
  v_parse_info jsonb := coalesce(p_parse_info, '{}'::jsonb);
  v_course_id uuid;
  v_import_id uuid;
  v_parser_engine text;
  v_input_type text;
  v_existing boolean := false;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if char_length(v_course_name) not between 1 and 100 then
    raise exception 'Course name must be between 1 and 100 characters.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a JSON array containing between 1 and 250 tasks.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) not between 1 and 250 then
    raise exception 'Items must be a JSON array containing between 1 and 250 tasks.'
      using errcode = '22023';
  end if;

  -- Validate the original JSON representation before PostgreSQL casts it.
  -- This rejects locale-specific dates and special values such as infinity.
  if exists (
    select 1
    from jsonb_array_elements(p_items) as reviewed(item)
    where jsonb_typeof(reviewed.item) is distinct from 'object'
      or coalesce(reviewed.item ->> 'due_date', '') !~
        '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  ) then
    raise exception 'Every item due_date must use the YYYY-MM-DD format.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_parse_info) is distinct from 'object' then
    raise exception 'Parse metadata must be a JSON object.'
      using errcode = '22023';
  end if;

  if v_parse_info ?| array[
    'raw_text',
    'syllabus_text',
    'pdf_base64',
    'document'
  ] then
    raise exception 'Raw syllabus or PDF content cannot be persisted as parse metadata.'
      using errcode = '22023';
  end if;

  v_parser_engine := case
    when v_parse_info ->> 'engine' in ('groq', 'fallback')
      then v_parse_info ->> 'engine'
    else 'fallback'
  end;

  v_input_type := case
    when v_parse_info ->> 'input_type' in ('text', 'pdf')
      then v_parse_info ->> 'input_type'
    else 'text'
  end;

  -- Database-generated review metadata overrides any client-supplied values.
  v_parse_info := v_parse_info || jsonb_build_object(
    'engine', v_parser_engine,
    'input_type', v_input_type,
    'item_count', jsonb_array_length(p_items),
    'reviewed', true
  );

  if octet_length(v_parse_info::text) > 16384 then
    raise exception 'Parse metadata must be 16 KB or smaller.'
      using errcode = '22023';
  end if;

  select courses.id
    into v_course_id
  from public.courses as courses
  where courses.user_id = v_user_id
    and lower(btrim(courses.name)) = lower(v_course_name)
  for update;

  v_existing := v_course_id is not null;

  if v_existing and not coalesce(p_replace_existing, false) then
    raise exception 'A course with this name already exists.'
      using errcode = '23505',
            detail = 'Set p_replace_existing to true only after explicit user confirmation.';
  end if;

  if v_existing then
    update public.courses
    set name = v_course_name,
        parse_info = v_parse_info
    where id = v_course_id
      and user_id = v_user_id;

    delete from public.items
    where course_id = v_course_id
      and user_id = v_user_id;
  else
    insert into public.courses (user_id, name, parse_info)
    values (v_user_id, v_course_name, v_parse_info)
    returning id into v_course_id;
  end if;

  insert into public.items (
    course_id,
    user_id,
    item_type,
    title,
    due_date,
    estimated_effort_hours,
    weight,
    completed
  )
  select
    v_course_id,
    v_user_id,
    btrim(reviewed.item_type),
    btrim(reviewed.title),
    reviewed.due_date,
    reviewed.estimated_effort_hours,
    coalesce(reviewed.weight, 0),
    false
  from jsonb_to_recordset(p_items) as reviewed (
    title text,
    due_date date,
    item_type text,
    weight numeric,
    estimated_effort_hours numeric
  );

  get diagnostics v_inserted = row_count;

  if v_inserted <> jsonb_array_length(p_items) then
    raise exception 'Not every reviewed item could be imported.'
      using errcode = '22023';
  end if;

  insert into public.course_imports (
    course_id,
    user_id,
    parser_engine,
    input_type,
    source_filename,
    imported_item_count,
    request_id,
    warning,
    parse_info
  )
  values (
    v_course_id,
    v_user_id,
    v_parser_engine,
    v_input_type,
    nullif(left(btrim(v_parse_info ->> 'filename'), 255), ''),
    v_inserted,
    nullif(left(btrim(v_parse_info ->> 'request_id'), 64), ''),
    nullif(left(btrim(v_parse_info ->> 'warning'), 500), ''),
    v_parse_info
  )
  returning id into v_import_id;

  return jsonb_build_object(
    'course_id', v_course_id,
    'import_id', v_import_id,
    'created', not v_existing,
    'replaced', v_existing,
    'item_count', v_inserted
  );
end;
$$;

revoke all on function public.import_reviewed_course(text, jsonb, jsonb, boolean)
  from public, anon;
grant execute on function public.import_reviewed_course(text, jsonb, jsonb, boolean)
  to authenticated;

comment on function public.import_reviewed_course(text, jsonb, jsonb, boolean) is
  'Atomically creates or explicitly replaces one authenticated user course from reviewed parser output.';

commit;
