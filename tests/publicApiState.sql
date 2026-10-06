BEGIN;
DO $$
DECLARE
    original jsonb;
    updated jsonb;
    before_change timestamptz;
    row_count integer;
BEGIN
    ASSERT public.record_public_api_state(), 'First complete pull must publish all sections';
    SELECT fingerprints, changed_at INTO original, before_change FROM public.public_api_state WHERE id=1;
    ASSERT NOT public.record_public_api_state(), 'Identical pulls must not change revisions';
    ASSERT before_change = (SELECT changed_at FROM public.public_api_state WHERE id=1);
    ASSERT length((SELECT to_jsonb(s)::text FROM public.public_api_state s)) < 1000, 'Manifest must remain small';
    UPDATE public."CatalogItem" SET "Name"="Name", "CreatedAt"=clock_timestamp();
    ASSERT NOT public.record_public_api_state(), 'No-op writes and bookkeeping must be ignored';
    UPDATE public."MythicSale" SET "SaleID"=gen_random_uuid();
    ASSERT NOT public.record_public_api_state(), 'Internal Mythic identifiers must be ignored';

    UPDATE public."CatalogSale" SET "SalePrice"=675;
    ASSERT public.record_public_api_state(), 'Price changes must publish';
    SELECT fingerprints INTO updated FROM public.public_api_state WHERE id=1;
    ASSERT original->>'sales' <> updated->>'sales';
    ASSERT original->>'catalog' = updated->>'catalog';
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['sales'];
    UPDATE public."CatalogSale" SET "SaleEndAt"="SaleEndAt"+interval '1 hour';
    ASSERT public.record_public_api_state(), 'Date changes must publish';
    UPDATE public."CatalogSale" SET "IsActive"=false;
    ASSERT public.record_public_api_state(), 'Deactivations must publish';
    UPDATE public."CatalogSale" SET "SalePrice"=500;
    ASSERT NOT public.record_public_api_state(), 'Inactive history edits must not refresh live rotations';

    UPDATE public."CatalogItem" SET "Name"='Updated Test Skin';
    ASSERT public.record_public_api_state();
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['catalog'];
    UPDATE public."Champion" SET "ImageURL"='https://example.invalid/new.png';
    ASSERT public.record_public_api_state(), 'Lookup metadata must update the catalog revision';
    UPDATE public."Skinline" SET "Name"='New Skinline';
    ASSERT public.record_public_api_state();
    UPDATE public."Universe" SET "Name"='New Universe';
    ASSERT public.record_public_api_state();
    UPDATE public."ItemType" SET "Type"='Changed Type';
    ASSERT public.record_public_api_state();

    DELETE FROM public."MythicSale";
    ASSERT public.record_public_api_state(), 'Removed offers must publish';
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['mythic'];
    UPDATE public."SanctumSale" SET "ChasePityThreshold"=90;
    ASSERT public.record_public_api_state();
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['sanctum'];
    UPDATE public."YourShopSale" SET "HubEnabled"=false;
    ASSERT public.record_public_api_state();
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['yourShop'];

    ASSERT has_table_privilege('anon','public.public_api_state','SELECT');
    ASSERT NOT has_table_privilege('anon','public.public_api_state','UPDATE');
    ASSERT NOT has_function_privilege('anon','public.record_public_api_state()','EXECUTE');
    ASSERT has_function_privilege('service_role','public.record_public_api_state()','EXECUTE');
    SELECT fingerprints INTO original FROM public.public_api_state WHERE id=1;
    SET LOCAL ROLE anon;
    SELECT count(*) INTO row_count FROM public.public_api_state;
    ASSERT row_count=1;
    ASSERT original = public.get_public_api_fingerprint(), 'Anon and publisher must see the same public data';
    RESET ROLE;
END;
$$;
ROLLBACK;
-- Each statement has its own transaction so now() moves across the boundary.
UPDATE public."YourShopSale" SET "SaleEndAt"=clock_timestamp()+interval '250 milliseconds';
SELECT public.record_public_api_state();
SELECT pg_sleep(0.3);
DO $$ BEGIN
    ASSERT public.record_public_api_state(), 'A Your Shop time boundary must change its revision';
    ASSERT (SELECT changed_sections FROM public.public_api_state WHERE id=1) = ARRAY['yourShop'];
END $$;
