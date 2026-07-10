-- Lower the default page size for the public "most wishlisted" leaderboard
-- from 25 to 20. Callers can still pass an explicit limit_count (clamped
-- to [1, 100] as before).
create or replace function public.get_top_wishlisted_items(
    limit_count integer default 20
)
returns table (
    "ItemID" uuid,
    "WishlistCount" bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        w."ItemID",
        count(*)::bigint as "WishlistCount"
    from public."WishlistItem" w
    group by w."ItemID"
    having count(*) >= 2
    order by count(*) desc, w."ItemID"
    limit least(greatest(coalesce(limit_count, 20), 1), 100);
$$;

alter function public.get_top_wishlisted_items(integer) owner to postgres;

revoke all on function public.get_top_wishlisted_items(integer) from public;
grant execute on function public.get_top_wishlisted_items(integer) to anon;
grant execute on function public.get_top_wishlisted_items(integer) to authenticated;
grant execute on function public.get_top_wishlisted_items(integer) to service_role;
