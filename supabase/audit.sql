-- Audit log (cross-device) — sirf logged-in admin likh/padh sakta hai
-- Supabase → SQL Editor → poora paste → Run

create table if not exists audit_log (
  id        text primary key,
  at        timestamptz not null default now(),
  action    text not null,
  who       text,
  user_id   text,
  email     text,
  target    text,
  detail    text
);

create index if not exists audit_log_at_idx on audit_log (at desc);

alter table audit_log enable row level security;

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
  for insert to authenticated with check (true);

drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log
  for select to authenticated using (true);

-- anon (public site) ko bilkul band
revoke all on audit_log from anon;

-- purani entries khud saaf ho jaayengi (1 saal se purani)
-- chaaho to Supabase → Database → Cron me daal do:
-- delete from audit_log where at < now() - interval '365 days';
