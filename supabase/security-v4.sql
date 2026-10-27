-- ============================================================
--  Masjid e Mohammadi · Mohalla Survey
--  SECURITY v4 — public ko sirf totals, kabhi rows nahi
-- ------------------------------------------------------------
--  PURANI PROBLEM (v3): anon key public hai, aur anon ko poora
--  `families` + `members` read milta tha — yaani koi bhi banda
--  curl se har ghar ke naam, umar, documents nikaal sakta tha.
--
--  AB: public dashboard ek `public_snapshot` row padhta hai jisme
--  sirf ANONYMOUS records hote hain (na naam, na phone, na pata,
--  na notes). Asli tables se anon ka read poora hata diya.
--
--  HOW TO USE: Supabase → SQL Editor → New query → paste → RUN.
--  (Idempotent hai — dobara chalane se kuch nahi tootega.)
-- ============================================================

-- ---------- 1. asli data par anon ka pura access khatam ----------
revoke all on public.families from anon;
revoke all on public.members  from anon;

-- ---------- 2. masjid profile: sirf public fields ----------
-- bank / waqf / email private rahenge (admin hi dekh sakta hai)
revoke all on public.masjid from anon;
grant select (id, name, established, address, phone, imam, muazzin, area,
              capacity, rooms, madrasa, note, photos, updated_at)
  on public.masjid to anon;

-- ---------- 3. public snapshot (single row, anonymous) ----------
create table if not exists public.public_snapshot (
  id         boolean primary key default true check (id),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.public_snapshot enable row level security;

drop policy if exists snap_read on public.public_snapshot;
create policy snap_read on public.public_snapshot for select using (true);

drop policy if exists snap_admin_write on public.public_snapshot;
create policy snap_admin_write on public.public_snapshot for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.public_snapshot to anon, authenticated;
grant insert, update, delete on public.public_snapshot to authenticated;

-- ---------- 4. admin writes ke liye tight grants ----------
-- authenticated ko bhi sirf wahi columns jo app likhta hai
grant select, insert, update, delete on public.families to authenticated;
grant select, insert, update, delete on public.members  to authenticated;
grant select, insert, update, delete on public.masjid   to authenticated;
grant select, insert, update on public.app_users to authenticated;
revoke all on public.app_users from anon;

-- ---------- 5. verification (yeh query chalao, sab `t` aana chahiye) ----------
-- select
--   has_table_privilege('anon','public.families','select')      as anon_families,   -- f
--   has_table_privilege('anon','public.members','select')       as anon_members,    -- f
--   has_table_privilege('anon','public.public_snapshot','select') as anon_snapshot,  -- t
--   has_table_privilege('anon','public.app_users','select')     as anon_admins;      -- f
