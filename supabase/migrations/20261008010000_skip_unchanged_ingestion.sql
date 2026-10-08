-- Full ingestion uploads remain idempotent without rewriting identical rows.
CREATE OR REPLACE FUNCTION public.skip_unchanged_ingestion_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.skip_unchanged_ingestion_update() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['Champion','Universe','Skinline','CatalogItem','CatalogSale','MythicSale','SanctumSale','YourShopSale'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS skip_unchanged_ingestion_update ON public.%I', table_name);
        EXECUTE format('CREATE TRIGGER skip_unchanged_ingestion_update BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.skip_unchanged_ingestion_update()', table_name);
    END LOOP;
END $$;
