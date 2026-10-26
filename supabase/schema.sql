-- ============================================================
--  Masjid - E- Mohammadiy · Khidmath Committee — Mohalla Survey
--  Supabase schema v3  ·  SINGLE ADMIN + PUBLIC READ
-- ------------------------------------------------------------
--  HOW TO USE
--   1. Supabase dashboard → SQL Editor → New query → paste → RUN
--   2. Project Settings → API → copy "Project URL" + "anon public" key
--      into config.js (Supabase block)
--   3. Authentication → Providers → Email: enable. Signup email
--      confirmation ON (real e-mail codes).
--   4. First admin: app kholo → Admin login → naya admin banao.
--
--  SECURITY MODEL
--   * anon key is public — database gates everything.
--   * ANYONE (anon) can read survey data for the public website,
--     BUT never phone/address (column grants below).
--   * Only a real login listed in app_users as role='admin' can
--     insert / update / delete.
--   * First signup (empty app_users) may claim the admin row.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- families ----------
create table if not exists public.families (
  id          text primary key,
  house_name  text not null default '',
  house_no    text default '',
  street      text default '',
  house_type  text default 'moulding',
  address     text default '',
  phone       text default '',
  notes       text default '',
  docs        jsonb not null default '{}'::jsonb,
  custom      jsonb not null default '[]'::jsonb,
  created_by  text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- members ----------
create table if not exists public.members (
  id              uuid primary key default gen_random_uuid(),
  family_id       text not null references public.families(id) on delete cascade,
  relation        text default '',
  name            text not null default '',
  father_name     text default '',
  mother_name     text default '',
  gender          text default '',
  dob             date,
  education       text default '',
  education_level text default '',
  occupation      text default '',
  sector          text default '',
  religious       text default '',
  marital_status  text default '',
  children        text default '',
  disability      text default 'no',
  schemes         jsonb not null default '{}'::jsonb,
  scheme_name     text default '',
  docs            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists members_family_id_idx on public.members(family_id);

-- ---------- masjid profile (single row) ----------
create table if not exists public.masjid (
  id          boolean primary key default true check (id),
  name        text default '', established text default '', address text default '',
  phone       text default '', imam text default '', muazzin text default '',
  area        text default '', capacity text default '', rooms text default '',
  madrasa     text default '', waqf text default '', bank text default '',
  note        text default '', photos jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- admin allowlist ----------
create table if not exists public.app_users (
  id         text primary key,               -- email (lowercase)
  user_id    uuid unique,                    -- auth.uid()
  role       text not null default 'admin',
  name       text default '',
  phone      text default '',
  created_at timestamptz not null default now()
);

-- safe re-runs on existing installs
alter table public.families add column if not exists updated_at timestamptz default now();
alter table public.members  add column if not exists occupation  text default '';
alter table public.members  add column if not exists schemes     jsonb default '{}'::jsonb;
alter table public.members  add column if not exists scheme_name text default '';
alter table public.members  add column if not exists docs        jsonb default '{}'::jsonb;

-- ---------- helper ----------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and role = 'admin');
$$;

-- ---------- RLS ----------
alter table public.families enable row level security;
alter table public.members  enable row level security;
alter table public.masjid   enable row level security;
alter table public.app_users enable row level security;

drop policy if exists fam_read on public.families;
create policy fam_read on public.families for select using (true);
drop policy if exists fam_admin_write on public.families;
create policy fam_admin_write on public.families for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select using (true);
drop policy if exists mem_admin_write on public.members;
create policy mem_admin_write on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists mj_read on public.masjid;
create policy mj_read on public.masjid for select using (true);
drop policy if exists mj_admin_write on public.masjid;
create policy mj_admin_write on public.masjid for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists self_read on public.app_users;
create policy self_read on public.app_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists self_bootstrap on public.app_users;
create policy self_bootstrap on public.app_users for insert to authenticated
  with check (user_id = auth.uid()
              and not exists (select 1 from public.app_users));
drop policy if exists admin_add_admin on public.app_users;
create policy admin_add_admin on public.app_users for insert to authenticated
  with check (public.is_admin());
drop policy if exists admin_edit_admin on public.app_users;
create policy admin_edit_admin on public.app_users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- column grants: anon sees survey data, never phone/address ----------
revoke all on public.families from anon;
grant select (id, house_name, house_no, street, house_type, notes, docs, custom, created_at)
  on public.families to anon;
revoke all on public.members from anon;
grant select (id, family_id, relation, name, father_name, mother_name, gender, dob,
              education, education_level, occupation, sector, religious, marital_status,
              children, disability, schemes, scheme_name, docs, created_at)
  on public.members to anon;
revoke all on public.masjid from anon;
grant select on public.masjid to anon;

grant select, insert, update, delete on public.families to authenticated;
grant select, insert, update, delete on public.members  to authenticated;
grant select, insert, update, delete on public.masjid   to authenticated;
grant select, insert, update on public.app_users to authenticated;
revoke all on public.app_users from anon;
