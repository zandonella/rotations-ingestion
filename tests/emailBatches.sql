\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000001','hourly-local@example.invalid'),('10000000-0000-4000-8000-000000000002','inactive-local@example.invalid');
INSERT INTO public."Profile"(id,email,"EmailStatus") VALUES
('10000000-0000-4000-8000-000000000001','hourly-local@example.invalid','active'),
('10000000-0000-4000-8000-000000000002','inactive-local@example.invalid','inactive')
ON CONFLICT(id) DO UPDATE SET "EmailStatus"=excluded."EmailStatus";
INSERT INTO public."CatalogItem"("ItemID","ItemType","RiotItemID","Name") VALUES ('10000000-0000-4000-8000-000000000010',1,99999001,'Hourly local fixture');
INSERT INTO public."WishlistItem"("UserID","ItemID") VALUES
('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010'),
('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000010');
INSERT INTO public."CatalogSale"("SaleID","RiotItemID","ItemType","SaleStartAt","SaleEndAt","NormalPrice","SalePrice","PercentOff","IsActive","Currency") VALUES
('10000000-0000-4000-8000-000000000020',99999001,1,now()-interval '1 day',now()+interval '1 day',100,50,50,true,'RP'),
('10000000-0000-4000-8000-000000000021',99999001,1,now()-interval '3 days',now()-interval '2 days',100,50,50,true,'RP'),
('10000000-0000-4000-8000-000000000022',99999001,1,now()+interval '2 days',now()+interval '3 days',100,50,50,true,'RP');
INSERT INTO public."MythicSale"("SaleID","OfferID","SaleStartAt","SaleEndAt","PrimaryItemID","Price","Currency","IsActive","Section","IsBundle","IncludedItems") VALUES
('10000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000031',now()-interval '1 day',now()+interval '1 day','10000000-0000-4000-8000-000000000010',100,'ME',true,'FEATURED',true,ARRAY['10000000-0000-4000-8000-000000000010']);
INSERT INTO public."SanctumSale"("SaleID","RiotItemID","ItemType","SaleStartAt","SaleEndAt","Rarity","ChasePityThreshold","IsActive") VALUES
('10000000-0000-4000-8000-000000000040',99999001,1,now()-interval '1 day',now()+interval '1 day','EXALTED',80,true);
SET LOCAL ROLE service_role;
DO $$
DECLARE n bigint;
BEGIN
    UPDATE public."CatalogItem" SET "Name"='Hourly local fixture' WHERE "RiotItemID"=99999001;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'Identical metadata was rewritten'; END IF;
    UPDATE public."CatalogItem" SET "Name"='Hourly local fixture changed' WHERE "RiotItemID"=99999001;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Changed metadata was skipped'; END IF;
    SELECT public.queue_wishlist_sale_emails() INTO n;
    IF n <> 3 THEN RAISE EXCEPTION 'Expected 3 eligible matches, got %',n; END IF;
    SELECT public.queue_wishlist_sale_emails() INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Duplicate queue inserted % records',n; END IF;
    SELECT public.record_wishlist_email_delivery('[{"UserID":"10000000-0000-4000-8000-000000000001","ItemID":"10000000-0000-4000-8000-000000000010","SaleID":"10000000-0000-4000-8000-000000000020"}]','SENT') INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'Delivery updated % records',n; END IF;
    IF (SELECT count(*) FROM public."WishlistEmailLog" WHERE "Status"='PENDING') <> 2 THEN RAISE EXCEPTION 'Unrelated pending rows changed'; END IF;
    PERFORM public.queue_wishlist_sale_emails();
    IF (SELECT "Status" FROM public."WishlistEmailLog" WHERE "SaleID"='10000000-0000-4000-8000-000000000020') <> 'SENT' THEN RAISE EXCEPTION 'Sent row reset'; END IF;
    INSERT INTO public."CatalogSale"("SaleID","RiotItemID","ItemType","SaleStartAt","SaleEndAt","NormalPrice","SalePrice","PercentOff","IsActive","Currency") VALUES
    ('10000000-0000-4000-8000-000000000023',99999001,1,now()-interval '1 hour',now()+interval '2 days',100,50,50,true,'RP');
    IF public.queue_wishlist_sale_emails() <> 1 THEN RAISE EXCEPTION 'New window did not qualify'; END IF;
    IF has_function_privilege('anon','public.queue_wishlist_sale_emails()','EXECUTE') OR has_function_privilege('authenticated','public.record_wishlist_email_delivery(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Private RPC exposed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: backend-only queuing, all shops, time windows, inactive users, deduplication, delivery isolation, and new windows'
