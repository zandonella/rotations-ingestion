BEGIN;
DO $$
DECLARE
    base bigint;
    next bigint;
    item jsonb;
BEGIN
    SELECT catalog_revision INTO base FROM public.public_api_state WHERE id = 1;
    ASSERT base = 1;
    SELECT item_data INTO item FROM public.public_api_catalog_item;
    ASSERT item = jsonb_build_object(
        'itemId', '00000000-0000-4000-8000-000000000001', 'riotItemId', 1001,
        'type', jsonb_build_object('id', 1, 'name', 'Skin'),
        'name', 'Test Skin', 'imageUrl', '//example.invalid/skin.png', 'parentItemId', NULL,
        'champion', jsonb_build_object('id', 22, 'slug', 'Ashe', 'name', 'Ashe', 'imageUrl', 'https://example.invalid/ashe.png'),
        'skinline', jsonb_build_object('id', 42, 'name', 'Example', 'universe',
            jsonb_build_object('id', 7, 'name', 'Example Universe'))
    ), 'Published items must match the public API projection';
    ASSERT NOT public.record_public_api_state();
    ASSERT (SELECT catalog_revision FROM public.public_api_state WHERE id=1) = base;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base, base)) = 0;

    INSERT INTO public."ItemType" (id,"Type") VALUES (3,'Emote'),(4,'Icon');
    INSERT INTO public."CatalogItem" ("ItemID","ItemType","RiotItemID","Name") VALUES
        ('00000000-0000-4000-8000-000000000002',4,1002,'New Icon'),
        ('00000000-0000-4000-8000-000000000003',3,1003,'');
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT next = base+1;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next)) = 1,
        'New items transfer without unchanged catalog or blank legacy emotes';
    SELECT item_data INTO item FROM public.get_public_api_catalog_changes(base,next);
    ASSERT item->>'name' = 'New Icon';
    ASSERT item->'champion' = 'null'::jsonb AND item->'skinline' = 'null'::jsonb;
    base := next;

    UPDATE public."CatalogItem" SET "Name"='Updated Skin' WHERE "RiotItemID"=1001;
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next)) = 1;
    UPDATE public."Champion" SET "Name"='Updated Champion';
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next)) = 1,
        'Missed revisions return only the latest version of each changed item';
    SELECT item_data INTO item FROM public.get_public_api_catalog_changes(base,next);
    ASSERT item->>'name' = 'Updated Skin' AND item->'champion'->>'name' = 'Updated Champion';

    UPDATE public."Skinline" SET "UniverseID"=0;
    ASSERT public.record_public_api_state();
    SELECT item_data INTO item FROM public.public_api_catalog_item WHERE item_id='00000000-0000-4000-8000-000000000001';
    ASSERT item->'skinline'->'universe' = 'null'::jsonb;
    SELECT catalog_revision INTO base FROM public.public_api_state WHERE id=1;
    UPDATE public."Universe" SET "Name"='Unused Universe';
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next))=0,
        'An unused lookup change must not transfer catalog items';
    base := next;

    DELETE FROM public."CatalogItem" WHERE "RiotItemID"=1002;
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next))=1;
    ASSERT (SELECT item_data FROM public.get_public_api_catalog_changes(base,next)) IS NULL,
        'Removals must remain available as tombstones';
    INSERT INTO public."CatalogItem" ("ItemID","ItemType","RiotItemID","Name") VALUES
        ('00000000-0000-4000-8000-000000000002',4,1002,'Restored Icon');
    ASSERT public.record_public_api_state();
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT item_data->>'name' FROM public.get_public_api_catalog_changes(base,next))='Restored Icon';
    ASSERT (SELECT count(*) FROM public.public_api_catalog_item)=2, 'Publication must not append redundant history';

    -- A publication failure must not partially replace the confirmed cache.
    base := next;
    ALTER TABLE public.public_api_catalog_item ADD CONSTRAINT publication_test_failure
        CHECK (item_data IS NULL OR item_data->>'name' <> 'Reject Publication');
    UPDATE public."CatalogItem" SET "Name"='Reject Publication' WHERE "RiotItemID"=1001;
    BEGIN
        PERFORM public.record_public_api_state();
        ASSERT false, 'The test constraint must reject publication';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    ASSERT (SELECT catalog_revision FROM public.public_api_state WHERE id=1) = base;
    ASSERT (SELECT item_data->>'name' FROM public.public_api_catalog_item
        WHERE item_id='00000000-0000-4000-8000-000000000001') = 'Updated Skin';
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,base))=0;
    ALTER TABLE public.public_api_catalog_item DROP CONSTRAINT publication_test_failure;
    UPDATE public."CatalogItem" SET "Name"='Recovered Skin' WHERE "RiotItemID"=1001;
    ASSERT public.record_public_api_state(), 'The next successful publication must recover';
    SELECT catalog_revision INTO next FROM public.public_api_state WHERE id=1;
    ASSERT (SELECT item_data->>'name' FROM public.get_public_api_catalog_changes(base,next))='Recovered Skin';

    BEGIN
        PERFORM public.get_public_api_catalog_changes(base, next-1);
        ASSERT false, 'A superseded target revision must fail';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.get_public_api_catalog_changes(next+1,next);
        ASSERT false, 'A future cursor must fail';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    ASSERT NOT has_table_privilege('anon','public.public_api_catalog_item','UPDATE');
    ASSERT NOT has_table_privilege('anon','public.public_api_catalog_item','INSERT');
    ASSERT has_function_privilege('anon','public.get_public_api_catalog_changes(bigint,bigint)','EXECUTE');
    SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM public.get_public_api_catalog_changes(base,next))=1;
    RESET ROLE;
END;
$$;
ROLLBACK;
