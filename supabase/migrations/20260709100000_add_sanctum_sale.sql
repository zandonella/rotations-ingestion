CREATE TABLE "public"."SanctumSale" (
    "RiotItemID" integer NOT NULL,
    "ItemType" smallint NOT NULL,
    "SaleID" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
    "SaleStartAt" timestamptz NOT NULL,
    "SaleEndAt" timestamptz NOT NULL,
    "Rarity" text NOT NULL,
    "ChasePityThreshold" smallint NOT NULL,
    "BannerImageURL" text,
    "IsActive" boolean NOT NULL,
    PRIMARY KEY ("RiotItemID", "SaleStartAt", "SaleEndAt"),
    FOREIGN KEY ("ItemType", "RiotItemID")
        REFERENCES "public"."CatalogItem"("ItemType", "RiotItemID")
);

ALTER TABLE "public"."SanctumSale" OWNER TO "postgres";
ALTER TABLE "public"."SanctumSale" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
    ON "public"."SanctumSale"
    FOR SELECT
    USING (true);

GRANT ALL ON TABLE "public"."SanctumSale" TO "anon";
GRANT ALL ON TABLE "public"."SanctumSale" TO "authenticated";
GRANT ALL ON TABLE "public"."SanctumSale" TO "service_role";

ALTER TABLE "public"."WishlistEmailLog"
    ADD COLUMN "SanctumSaleID" uuid;

ALTER TABLE ONLY "public"."WishlistEmailLog"
    ADD CONSTRAINT "WishlistEmailLog_SanctumSaleID_fkey"
    FOREIGN KEY ("SanctumSaleID") REFERENCES "public"."SanctumSale"("SaleID");

DROP FUNCTION IF EXISTS public.get_active_wishlist_sale_matches();

CREATE FUNCTION public.get_active_wishlist_sale_matches()
RETURNS TABLE (
    "UserID" text,
    "ItemID" text,
    "SaleID" text,
    "SaleType" text,
    "MythicSaleID" text,
    "CatalogSaleID" text,
    "SanctumSaleID" text
)
LANGUAGE sql
STABLE
AS $$
    SELECT DISTINCT
        w."UserID"::text,
        w."ItemID"::text,
        cs."SaleID"::text,
        'Catalog'::text,
        null::text,
        cs."SaleID"::text,
        null::text
    FROM public."WishlistItem" w
    JOIN public."Profile" p
        ON p."id" = w."UserID"
    JOIN public."CatalogItem" ci
        ON ci."ItemID" = w."ItemID"
    JOIN public."CatalogSale" cs
        ON cs."RiotItemID" = ci."RiotItemID"
       AND cs."ItemType" = ci."ItemType"
    WHERE p."EmailStatus" = 'active'
      AND cs."IsActive" = true

    UNION ALL

    SELECT DISTINCT
        w."UserID"::text,
        w."ItemID"::text,
        ms."SaleID"::text,
        'Mythic'::text,
        ms."SaleID"::text,
        null::text,
        null::text
    FROM public."WishlistItem" w
    JOIN public."Profile" p
        ON p."id" = w."UserID"
    JOIN public."MythicSale" ms
        ON w."ItemID"::text = any(ms."IncludedItems")
    WHERE p."EmailStatus" = 'active'
      AND ms."IsActive" = true

    UNION ALL

    SELECT DISTINCT
        w."UserID"::text,
        w."ItemID"::text,
        ss."SaleID"::text,
        'Sanctum'::text,
        null::text,
        null::text,
        ss."SaleID"::text
    FROM public."WishlistItem" w
    JOIN public."Profile" p
        ON p."id" = w."UserID"
    JOIN public."CatalogItem" ci
        ON ci."ItemID" = w."ItemID"
    JOIN public."SanctumSale" ss
        ON ss."RiotItemID" = ci."RiotItemID"
       AND ss."ItemType" = ci."ItemType"
    WHERE p."EmailStatus" = 'active'
      AND ss."IsActive" = true;
$$;

ALTER FUNCTION public.get_active_wishlist_sale_matches() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_active_wishlist_sale_matches() FROM public;
GRANT ALL ON FUNCTION public.get_active_wishlist_sale_matches() TO anon;
GRANT ALL ON FUNCTION public.get_active_wishlist_sale_matches() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_wishlist_sale_matches() TO service_role;
