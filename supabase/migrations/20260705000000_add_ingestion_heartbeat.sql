create table if not exists public.ingestion_heartbeat (
    script_name text primary key,
    last_run_at timestamptz not null,
    next_expected_at timestamptz not null,
    status text not null check (status in ('ok', 'warn', 'error')),
    message text
);

-- Service-role access only: RLS enabled with no policies.
alter table public.ingestion_heartbeat enable row level security;
