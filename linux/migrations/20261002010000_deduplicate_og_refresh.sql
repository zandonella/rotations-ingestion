-- Explicit production rollout only. Does not enable the lab OG trigger.
create table if not exists public.linux_og_dispatch_state (
    id integer primary key check (id = 1), content_hash text
);
alter table public.linux_og_dispatch_state enable row level security;
revoke all on public.linux_og_dispatch_state from anon, authenticated;
insert into public.linux_og_dispatch_state(id) values (1) on conflict do nothing;

create or replace function public.notify_og_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    token text;
    fingerprint text;
    previous text;
begin
    if new.status = 'error' then return null; end if;
    select md5(coalesce(jsonb_agg(row_data order by row_data::text)::text, '[]')) into fingerprint
    from (
        select jsonb_build_object('table', 'CatalogSale', 'row', to_jsonb(s) - 'SaleID') row_data from public."CatalogSale" s where "IsActive"
        union all
        select jsonb_build_object('table', 'MythicSale', 'row', to_jsonb(s) - 'SaleID') from public."MythicSale" s where "IsActive"
        union all
        select jsonb_build_object('table', 'SanctumSale', 'row', to_jsonb(s) - 'SaleID') from public."SanctumSale" s where "IsActive"
        union all
        select jsonb_build_object('table', 'YourShopSale', 'row', to_jsonb(s) - 'SaleID') from public."YourShopSale" s where "IsActive"
    ) sales;
    select content_hash into previous from public.linux_og_dispatch_state where id = 1 for update;
    if previous = fingerprint then return null; end if;
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
    update public.linux_og_dispatch_state set content_hash = fingerprint where id = 1;
    return null;
end;
$$;
