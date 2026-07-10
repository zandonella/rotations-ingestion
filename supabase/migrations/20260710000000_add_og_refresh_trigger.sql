-- Fires the "Refresh OG images" GitHub Actions workflow in zandonella/skinsale
-- whenever the data pipeline finishes a run, so the per-page OG screenshots
-- stay in sync with what the site shows.
--
-- The trigger lives on ingestion_heartbeat, which processClientData.ts
-- upserts exactly once at the very end of every run, after all
-- CatalogSale/MythicSale/SanctumSale upserts have completed. That gives
-- exactly one dispatch per pipeline run, and only for runs that finished.
--
-- Requires (one-time, done outside this migration):
--   1. pg_net extension enabled (Dashboard -> Database -> Extensions).
--   2. A fine-grained GitHub PAT scoped to zandonella/skinsale with
--      Contents read/write permission, stored in Vault:
--        select vault.create_secret('<PAT>', 'github_og_dispatch_token');
--
-- net.http_post is async fire-and-forget: a failed dispatch never blocks or
-- fails the heartbeat write.

create extension if not exists pg_net;

create or replace function public.notify_og_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    token text;
begin
    select decrypted_secret into token
    from vault.decrypted_secrets
    where name = 'github_og_dispatch_token';

    if token is null then
        raise warning 'notify_og_refresh: vault secret github_og_dispatch_token not found; skipping dispatch';
        return null;
    end if;

    perform net.http_post(
        url := 'https://api.github.com/repos/zandonella/skinsale/dispatches',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || token,
            'Accept', 'application/vnd.github+json',
            'Content-Type', 'application/json',
            'User-Agent', 'supabase-og-trigger'  -- GitHub API rejects requests without a UA
        ),
        body := '{"event_type":"og-refresh"}'::jsonb
    );
    return null;
end;
$$;

-- Clean up the earlier per-sale-table variant of this trigger if it was
-- applied; the heartbeat trigger below replaces it.
drop trigger if exists og_refresh_after_upsert on public."CatalogSale";
drop trigger if exists og_refresh_after_upsert on public."MythicSale";
drop trigger if exists og_refresh_after_upsert on public."SanctumSale";

-- UPDATE only, not INSERT OR UPDATE: the heartbeat is always written via
-- upsert, and an ON CONFLICT DO UPDATE statement fires the statement-level
-- UPDATE trigger exactly once (it would fire an INSERT trigger as well, so
-- listening to both events would dispatch twice per run).
drop trigger if exists og_refresh_after_heartbeat on public.ingestion_heartbeat;
create trigger og_refresh_after_heartbeat
after update on public.ingestion_heartbeat
for each statement
execute function public.notify_og_refresh();
