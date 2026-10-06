-- Only public API source columns participate. Identical ingestion upserts,
-- internal bookkeeping, and private account data cannot change this value.
-- Compute inside Postgres so polling returns one small hash instead of a catalog.
CREATE OR REPLACE FUNCTION public.get_public_api_fingerprint()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET timezone = 'UTC'
AS $$
    WITH fingerprints AS (
        SELECT 'CatalogItem' AS name,
            md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."ItemID")::text, '[]')) AS hash
        FROM (
            SELECT "ItemID", "ItemType", "RiotItemID", "Name", "ImageURL",
                "ChampionID", "SkinlineID", "ParentItemID"
            FROM public."CatalogItem"
        ) q
        UNION ALL
        SELECT 'ItemType', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text, '[]'))
        FROM (SELECT id, "Type" FROM public."ItemType") q
        UNION ALL
        SELECT 'Champion', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text, '[]'))
        FROM (SELECT id, "Slug", "Name", "ImageURL" FROM public."Champion") q
        UNION ALL
        SELECT 'Skinline', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text, '[]'))
        FROM (SELECT id, "Name", "UniverseID" FROM public."Skinline") q
        UNION ALL
        SELECT 'Universe', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text, '[]'))
        FROM (SELECT id, "Name" FROM public."Universe") q
        UNION ALL
        SELECT 'CatalogSale', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."SaleID")::text, '[]'))
        FROM (
            SELECT "SaleID", "RiotItemID", "ItemType", "SaleStartAt", "SaleEndAt",
                "NormalPrice", "SalePrice", "PercentOff", "Currency", "Limited", "IsActive"
            FROM public."CatalogSale" WHERE "IsActive" = true
        ) q
        UNION ALL
        SELECT 'MythicSale', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."OfferID")::text, '[]'))
        FROM (
            SELECT "OfferID", "PrimaryItemID", "SaleStartAt", "SaleEndAt", "Price",
                "Currency", "Section", "IsBundle", "IncludedItems", "BundleType", "IsActive"
            FROM public."MythicSale" WHERE "IsActive" = true
        ) q
        UNION ALL
        SELECT 'SanctumSale', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."SaleID")::text, '[]'))
        FROM (
            SELECT "SaleID", "RiotItemID", "ItemType", "SaleStartAt", "SaleEndAt",
                "Rarity", "ChasePityThreshold", "BannerImageURL", "IsActive"
            FROM public."SanctumSale" WHERE "IsActive" = true
        ) q
        UNION ALL
        SELECT 'YourShopSale', md5(coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."ShopName")::text, '[]'))
        FROM (
            SELECT "ShopName", "SaleStartAt", "SaleEndAt", "HubEnabled", "IsActive",
                ("IsActive" AND "HubEnabled" AND "SaleStartAt" <= now()
                    AND now() < "SaleEndAt") AS "CurrentWindow"
            FROM public."YourShopSale"
        ) q
    )
    SELECT jsonb_build_object(
        'catalog', md5(jsonb_object_agg(name, hash) FILTER (
            WHERE name IN ('CatalogItem', 'ItemType', 'Champion', 'Skinline', 'Universe'))::text),
        'sales', max(hash) FILTER (WHERE name = 'CatalogSale'),
        'mythic', max(hash) FILTER (WHERE name = 'MythicSale'),
        'sanctum', max(hash) FILTER (WHERE name = 'SanctumSale'),
        'yourShop', max(hash) FILTER (WHERE name = 'YourShopSale')
    ) FROM fingerprints;
$$;

REVOKE ALL ON FUNCTION public.get_public_api_fingerprint() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_api_fingerprint() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_api_fingerprint() IS
    'Returns a deterministic fingerprint of public API source data using the caller''s existing read permissions.';

-- This is a public cache manifest beside the private Linux monitoring tables.
-- Only successful complete ingestion publishes it. Operational status is private.
CREATE TABLE public.public_api_state (
    id integer PRIMARY KEY CHECK (id = 1),
    fingerprints jsonb,
    checked_at timestamptz,
    changed_at timestamptz,
    changed_sections text[] NOT NULL DEFAULT '{}'
);
INSERT INTO public.public_api_state(id) VALUES (1);
ALTER TABLE public.public_api_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_api_state FROM anon, authenticated;
GRANT SELECT ON public.public_api_state TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.public_api_state TO service_role;
CREATE POLICY public_api_state_read ON public.public_api_state FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.record_public_api_state()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    previous jsonb;
    current_data jsonb;
    sections text[];
BEGIN
    SELECT fingerprints INTO previous FROM public.public_api_state WHERE id = 1 FOR UPDATE;
    current_data := public.get_public_api_fingerprint();
    SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO sections
    FROM jsonb_each_text(current_data) WHERE previous ->> key IS DISTINCT FROM value;
    UPDATE public.public_api_state
    SET fingerprints = current_data,
        checked_at = clock_timestamp(),
        changed_at = CASE WHEN cardinality(sections) > 0 THEN clock_timestamp() ELSE changed_at END,
        changed_sections = CASE WHEN cardinality(sections) > 0 THEN sections ELSE changed_sections END
    WHERE id = 1;
    RETURN cardinality(sections) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.record_public_api_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_api_state() TO service_role;
NOTIFY pgrst, 'reload schema';
