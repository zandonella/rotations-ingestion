create or replace function public.get_active_wishlist_sale_matches()
returns table (
    "UserID" text,
    "ItemID" text,
    "SaleID" text,
    "SaleType" text,
    "MythicSaleID" text,
    "CatalogSaleID" text
)
language sql
stable
as $$
    select distinct
        w."UserID"::text,
        w."ItemID"::text,
        cs."SaleID"::text,
        'Catalog'::text,
        null::text,
        cs."SaleID"::text
    from public."WishlistItem" w
    join public."Profile" p
        on p."id" = w."UserID"
    join public."CatalogItem" ci
        on ci."ItemID" = w."ItemID"
    join public."CatalogSale" cs
        on cs."RiotItemID" = ci."RiotItemID"
       and cs."ItemType" = ci."ItemType"
    where p."EmailStatus" = 'active'
      and cs."IsActive" = true

    union all

    select distinct
        w."UserID"::text,
        w."ItemID"::text,
        ms."SaleID"::text,
        'Mythic'::text,
        ms."SaleID"::text,
        null::text
    from public."WishlistItem" w
    join public."Profile" p
        on p."id" = w."UserID"
    join public."MythicSale" ms
        on w."ItemID"::text = any(ms."IncludedItems")
    where p."EmailStatus" = 'active'
      and ms."IsActive" = true;
$$;

alter function public.get_active_wishlist_sale_matches() owner to postgres;

revoke all on function public.get_active_wishlist_sale_matches() from public;
grant all on function public.get_active_wishlist_sale_matches() to anon;
grant all on function public.get_active_wishlist_sale_matches() to authenticated;
grant all on function public.get_active_wishlist_sale_matches() to service_role;
