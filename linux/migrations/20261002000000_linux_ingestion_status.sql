-- Linux-only run reporting for the monitor on the VPS. Kept outside the legacy
-- migration directory; apply explicitly for Linux deployments.
create table if not exists public.linux_ingestion_status (
    runner_id text primary key,
    status text not null check (status in ('running', 'ok', 'error', 'interrupted')),
    attempt integer not null check (attempt between 1 and 3),
    updated_at timestamptz not null,
    last_result text check (last_result in ('ok', 'error', 'interrupted'))
);

alter table public.linux_ingestion_status enable row level security;
revoke all on public.linux_ingestion_status from anon, authenticated;
grant select, insert, update on public.linux_ingestion_status to service_role;
-- No heartbeat/OG dispatch triggers: run attempts are operational signals only.
notify pgrst, 'reload schema';
