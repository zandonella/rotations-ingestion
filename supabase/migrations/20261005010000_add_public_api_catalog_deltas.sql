-- Keep one latest confirmed public representation per item, including tombstones.
-- This bounds storage by unique item IDs rather than the number of ingestion runs.
ALTER TABLE public.public_api_state
    ADD COLUMN catalog_revision bigint NOT NULL DEFAULT 0 CHECK (catalog_revision >= 0);

CREATE TABLE public.public_api_catalog_item (
    item_id uuid PRIMARY KEY,
    item_data jsonb,
    changed_revision bigint NOT NULL CHECK (changed_revision > 0)
);
CREATE INDEX public_api_catalog_item_revision ON public.public_api_catalog_item(changed_revision);
ALTER TABLE public.public_api_catalog_item ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_api_catalog_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_api_catalog_item TO anon, authenticated, service_role;
CREATE POLICY public_api_catalog_item_read ON public.public_api_catalog_item FOR SELECT USING (true);

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
    next_revision bigint;
BEGIN
    SELECT fingerprints, catalog_revision INTO previous, next_revision
    FROM public.public_api_state WHERE id = 1 FOR UPDATE;
    -- All catalog representations and their hash must describe the same source.
    -- Ingestion writes finish before calling this publisher.
    LOCK TABLE public."CatalogItem", public."ItemType", public."Champion",
        public."Skinline", public."Universe" IN SHARE MODE;
    current_data := public.get_public_api_fingerprint();
    SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO sections
    FROM jsonb_each_text(current_data) WHERE previous ->> key IS DISTINCT FROM value;

    IF next_revision = 0 OR 'catalog' = ANY(sections) THEN
        next_revision := next_revision + 1;
        WITH items AS MATERIALIZED (
            SELECT i."ItemID" AS item_id, jsonb_build_object(
                'itemId', i."ItemID", 'riotItemId', i."RiotItemID",
                'type', jsonb_build_object('id', t.id, 'name', t."Type"),
                'name', i."Name", 'imageUrl', i."ImageURL", 'parentItemId', i."ParentItemID",
                'champion', CASE WHEN i."ChampionID" IS NULL THEN NULL ELSE
                    jsonb_build_object('id', c.id, 'slug', c."Slug", 'name', c."Name", 'imageUrl', c."ImageURL") END,
                'skinline', CASE WHEN i."SkinlineID" IS NULL THEN NULL ELSE
                    jsonb_build_object('id', s.id, 'name', s."Name", 'universe',
                        CASE WHEN s."UniverseID" IS NULL OR s."UniverseID" = 0 THEN NULL ELSE
                            jsonb_build_object('id', u.id, 'name', u."Name") END) END
            ) AS item_data
            FROM public."CatalogItem" i
            LEFT JOIN public."ItemType" t ON t.id = i."ItemType"
            LEFT JOIN public."Champion" c ON c.id = i."ChampionID"
            LEFT JOIN public."Skinline" s ON s.id = i."SkinlineID"
            LEFT JOIN public."Universe" u ON u.id = s."UniverseID"
            WHERE NOT (i."ItemType" = 3 AND i."Name" IS NOT NULL AND i."Name" ~ '^[[:space:]]*$')
        ), changed AS (
            INSERT INTO public.public_api_catalog_item AS existing (item_id, item_data, changed_revision)
            SELECT item_id, item_data, next_revision FROM items
            ON CONFLICT (item_id) DO UPDATE
            SET item_data = EXCLUDED.item_data, changed_revision = EXCLUDED.changed_revision
            WHERE existing.item_data IS DISTINCT FROM EXCLUDED.item_data
            RETURNING item_id
        )
        UPDATE public.public_api_catalog_item AS existing
        SET item_data = NULL, changed_revision = next_revision
        WHERE existing.item_data IS NOT NULL
            AND NOT EXISTS (SELECT FROM items WHERE items.item_id = existing.item_id);
    END IF;

    UPDATE public.public_api_state
    SET fingerprints = current_data, catalog_revision = next_revision,
        checked_at = clock_timestamp(),
        changed_at = CASE WHEN cardinality(sections) > 0 THEN clock_timestamp() ELSE changed_at END,
        changed_sections = CASE WHEN cardinality(sections) > 0 THEN sections ELSE changed_sections END
    WHERE id = 1;
    RETURN cardinality(sections) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.record_public_api_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_public_api_state() TO service_role;

-- The expected revision prevents applying a partial feed across publications.
-- PostgREST ranges paginate this function without exposing internal columns.
CREATE FUNCTION public.get_public_api_catalog_changes(after_revision bigint, expected_revision bigint)
RETURNS SETOF public.public_api_catalog_item
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF after_revision IS NULL OR expected_revision IS NULL OR after_revision < 0
        OR after_revision > expected_revision OR expected_revision < 1
        OR expected_revision IS DISTINCT FROM (
            SELECT catalog_revision FROM public.public_api_state WHERE id = 1
        ) THEN
        RAISE EXCEPTION 'Confirmed catalog revision is unavailable' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT item_id, item_data, changed_revision
        FROM public.public_api_catalog_item
        WHERE changed_revision > after_revision
        ORDER BY item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_api_catalog_changes(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_api_catalog_changes(bigint, bigint) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
