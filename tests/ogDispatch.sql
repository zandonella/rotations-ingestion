-- Local Supabase only. Everything, including the HTTP stub, rolls back.
\set ON_ERROR_STOP on
begin;
\ir ../linux/migrations/20261002010000_deduplicate_og_refresh.sql
create temp table dispatch_calls(id integer);
grant all on pg_temp.dispatch_calls to postgres;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
 params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type":"application/json"}'::jsonb,
 timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$
begin insert into pg_temp.dispatch_calls values (1); return 1; end; $$;
do $$ begin
 if not exists(select 1 from vault.secrets where name='github_og_dispatch_token') then
   perform vault.create_secret('local-test-only', 'github_og_dispatch_token');
 end if;
end $$;
create trigger test_og_refresh after update on public.ingestion_heartbeat
for each row execute function public.notify_og_refresh();
update public.linux_og_dispatch_state set content_hash=null where id=1;
update public.ingestion_heartbeat set status='ok';
update public.ingestion_heartbeat set last_run_at=now();
do $$ begin
 if (select count(*) from pg_temp.dispatch_calls) <> 1 then raise exception 'Unchanged data dispatched twice or first dispatch missing'; end if;
end $$;
update public."CatalogSale" set "SalePrice"="SalePrice"+1 where "SaleID"=(select "SaleID" from public."CatalogSale" where "IsActive" limit 1);
update public.ingestion_heartbeat set status='error';
do $$ begin
 if (select count(*) from pg_temp.dispatch_calls) <> 1 then raise exception 'Failed run dispatched'; end if;
end $$;
update public.ingestion_heartbeat set status='ok';
do $$ begin
 if (select count(*) from pg_temp.dispatch_calls) <> 2 then raise exception 'Changed price did not dispatch'; end if;
end $$;
rollback;
