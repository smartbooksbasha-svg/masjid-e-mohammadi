-- ============================================================
--  Masjid - E- Mohammadiy · Khidmath Committee — Mohalla Survey
--  Supabase schema (Postgres)  ·  SECURE allowlist design
-- ------------------------------------------------------------
--  HOW TO USE
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this WHOLE file → RUN
--   3. Project Settings → API → copy "Project URL" + "anon public" key
--      into the app (config.js).
--
--  SECURITY MODEL (why family data stays private)
--   * The anon key is PUBLIC (it ships in the web app) — so the
--     database itself must gate access, not the key.
--   * Access requires a real login (Supabase Auth, email+password).
--   * Even then, a user sees data ONLY if they have a row in
--     app_users (the allowlist). A random sign-up gets NOTHING.
--   * Roles mirror the app: super/admin see all families; a family
--     login sees only its own family record.
-- ============================================================

-- ---------- tables ----------
create table if not exists public.families (
  id          text primary key,              -- MEMC-2026-000001
  house_name  text not null default '',
  house_no    text default '',
  street      text default '',
  house_type  text default 'moulding',   -- moulding | cement | other
  address     text default '',
  phone       text default '',
  notes       text default '',
  docs        jsonb not null default '{}'::jsonb,
  custom      jsonb not null default '[]'::jsonb,
  created_by  text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.members (
  id             uuid primary key default gen_random_uuid(),
  family_id      text not null references public.families(id) on delete cascade,
  relation       text default '',
  name           text not null default '',
  father_name    text default '',
  mother_name    text default '',
  gender         text default '',
  dob            date,
  education      text default '',          -- legacy free text
  education_level text default '',         -- primary | higher_secondary | college | madarsa | none
  sector          text default '',         -- private | government | business | none
  religious       text default '',         -- aalim | hafiz | both
  marital_status text default '',
  children       text default '',
  disability     text default 'no',
  govt_scheme    text default 'no',
  created_at     timestamptz not null default now()
);
create index if not exists members_family_id_idx on public.members(family_id);

-- survey fields for existing installs (safe to re-run)
alter table public.families add column if not exists street     text default '';
alter table public.families add column if not exists house_type text default 'moulding';
alter table public.members  add column if not exists education_level text default '';
alter table public.members  add column if not exists sector          text default '';
alter table public.members  add column if not exists religious       text default '';

-- allowlist of app logins.  user_id stays NULL until the person
-- sets their password (signs up) and CLAIMS the row.
create table if not exists public.app_users (
  id         text primary key,               -- login id (lowercased)
  user_id    uuid unique,                    -- auth.uid() once claimed
  role       text not null default 'admin',  -- super | admin | family
  name       text default '',
  phone      text default '',
  family_id  text references public.families(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- helpers (security definer so they can read app_users
--            without triggering the table's own RLS / recursion) ----------
create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_users where user_id = auth.uid());
$$;
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_users where user_id = auth.uid() and role in ('super','admin'));
$$;
create or replace function public.is_super() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_users where user_id = auth.uid() and role = 'super');
$$;
create or replace function public.my_family_id() returns text
  language sql stable security definer set search_path = public as $$
  select family_id from public.app_users where user_id = auth.uid();
$$;
create or replace function public.has_super() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_users where role = 'super');
$$;

-- ---------- family id sequence + updated_at ----------
create sequence if not exists public.family_seq start 1;
create or replace function public.next_family_id() returns text
  language plpgsql as $$
  declare n bigint;
  begin
    n := nextval('public.family_seq');
    return 'MEMC-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
  end $$;

create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists families_touch on public.families;
create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();

-- ---------- ROW LEVEL SECURITY ----------
alter table public.families  enable row level security;
alter table public.members   enable row level security;
alter table public.app_users enable row level security;

-- clean slate (idempotent re-run)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in ('families','members','app_users') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- app_users: read own row (or all if super)
create policy au_read on public.app_users for select to authenticated
  using ( user_id = auth.uid() or public.is_super() );

-- app_users: bootstrap — the FIRST user becomes super admin
create policy au_bootstrap on public.app_users for insert to authenticated
  with check ( not public.has_super() and user_id = auth.uid() );

-- app_users: super admin provisions invites (user_id NULL = pending)
create policy au_super_insert on public.app_users for insert to authenticated
  with check ( public.is_super() );
create policy au_super_update on public.app_users for update to authenticated
  using ( public.is_super() ) with check ( public.is_super() );
create policy au_super_delete on public.app_users for delete to authenticated
  using ( public.is_super() );

-- app_users: a pending invite CLAIMS itself when that person signs up
-- (their login id = the part of their auth email before '@')
create policy au_claim on public.app_users for update to authenticated
  using ( user_id is null and id = lower(split_part(auth.email(), '@', 1)) )
  with check ( user_id = auth.uid() );

-- families: staff see/write all; a family login reads only its own record
create policy fam_read on public.families for select to authenticated
  using ( public.is_staff() or id = public.my_family_id() );
create policy fam_write on public.families for all to authenticated
  using ( public.is_staff() ) with check ( public.is_staff() );

-- members: same rule, resolved through the owning family
create policy mem_read on public.members for select to authenticated
  using ( public.is_staff() or family_id = public.my_family_id() );
create policy mem_write on public.members for all to authenticated
  using ( public.is_staff() ) with check ( public.is_staff() );

-- ============================================================
--  NOTE: turn OFF "Confirm email" in Auth settings (the app uses
--  synthetic addresses like admin@masjid.local, so there is no
--  inbox to confirm). Auth → Providers → Email → disable confirm.
-- ============================================================
