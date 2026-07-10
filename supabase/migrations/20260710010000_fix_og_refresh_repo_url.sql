-- The skinsale repo was renamed to rotations-lol on GitHub. The API answers
-- requests to the old name with a 301 redirect, which pg_net does not
-- follow, so the dispatch must target the current repo name directly.

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
        url := 'https://api.github.com/repos/zandonella/rotations-lol/dispatches',
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
