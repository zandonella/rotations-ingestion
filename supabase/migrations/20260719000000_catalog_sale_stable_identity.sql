-- Riot can revise a catalog sale's inactive date without changing its item or
-- start time. Preserve SaleID as the database identity and make SaleEndAt a
-- mutable field by using the item, item type, and start time as the natural key.

UPDATE public."CatalogSale"
SET "SaleID" = gen_random_uuid()
WHERE "SaleID" IS NULL;

CREATE TEMP TABLE catalog_sale_identity_map ON COMMIT DROP AS
WITH ranked_sales AS (
    SELECT
        "SaleID" AS old_sale_id,
        first_value("SaleID") OVER (
            PARTITION BY "ItemType", "RiotItemID", "SaleStartAt"
            ORDER BY "SaleEndAt" DESC, "IsActive" DESC, "SaleID"
        ) AS canonical_sale_id,
        count(*) OVER (
            PARTITION BY "ItemType", "RiotItemID", "SaleStartAt"
        ) AS identity_count
    FROM public."CatalogSale"
)
SELECT old_sale_id, canonical_sale_id
FROM ranked_sales
WHERE identity_count > 1;

-- Duplicate sale identities may have produced duplicate notification logs.
-- Merge those logs before removing redundant CatalogSale rows. SENT wins so a
-- user who was already notified cannot be staged again for the retained sale.
CREATE TEMP TABLE catalog_sale_merged_email_logs ON COMMIT DROP AS
SELECT
    email_log."UserID",
    email_log."ItemID",
    CASE
        WHEN bool_or(email_log."Status" = 'SENT') THEN 'SENT'
        WHEN bool_or(email_log."Status" = 'PENDING') THEN 'PENDING'
        ELSE 'FAILED'
    END::text AS "Status",
    max(email_log."SentAt") AS "SentAt",
    identity_map.canonical_sale_id AS "SaleID",
    'Catalog'::text AS "SaleType",
    min(email_log.created_at) AS created_at,
    NULL::uuid AS "MythicSaleID",
    identity_map.canonical_sale_id AS "CatalogSaleID",
    NULL::uuid AS "SanctumSaleID"
FROM public."WishlistEmailLog" AS email_log
JOIN catalog_sale_identity_map AS identity_map
    ON email_log."CatalogSaleID" = identity_map.old_sale_id
    OR (
        email_log."SaleType" = 'Catalog'
        AND email_log."SaleID" = identity_map.old_sale_id
    )
GROUP BY
    email_log."UserID",
    email_log."ItemID",
    identity_map.canonical_sale_id;

DELETE FROM public."WishlistEmailLog" AS email_log
USING catalog_sale_identity_map AS identity_map
WHERE email_log."CatalogSaleID" = identity_map.old_sale_id
   OR (
       email_log."SaleType" = 'Catalog'
       AND email_log."SaleID" = identity_map.old_sale_id
   );

DELETE FROM public."CatalogSale" AS catalog_sale
USING catalog_sale_identity_map AS identity_map
WHERE catalog_sale."SaleID" = identity_map.old_sale_id
  AND identity_map.old_sale_id <> identity_map.canonical_sale_id;

ALTER TABLE public."WishlistEmailLog"
    DROP CONSTRAINT "WishlistEmailLog_CatalogSaleID_fkey";

ALTER TABLE public."CatalogSale"
    DROP CONSTRAINT "CatalogSale_pkey";

ALTER TABLE public."CatalogSale"
    DROP CONSTRAINT "CatalogSale_SaleID_key";

ALTER TABLE public."CatalogSale"
    ALTER COLUMN "SaleID" SET NOT NULL;

ALTER TABLE public."CatalogSale"
    ADD CONSTRAINT "CatalogSale_pkey" PRIMARY KEY ("SaleID");

ALTER TABLE public."CatalogSale"
    ADD CONSTRAINT "CatalogSale_natural_key"
    UNIQUE ("ItemType", "RiotItemID", "SaleStartAt");

ALTER TABLE public."WishlistEmailLog"
    ADD CONSTRAINT "WishlistEmailLog_CatalogSaleID_fkey"
    FOREIGN KEY ("CatalogSaleID")
    REFERENCES public."CatalogSale"("SaleID");

INSERT INTO public."WishlistEmailLog" (
    "UserID",
    "ItemID",
    "Status",
    "SentAt",
    "SaleID",
    "SaleType",
    created_at,
    "MythicSaleID",
    "CatalogSaleID",
    "SanctumSaleID"
)
SELECT
    "UserID",
    "ItemID",
    "Status",
    "SentAt",
    "SaleID",
    "SaleType",
    created_at,
    "MythicSaleID",
    "CatalogSaleID",
    "SanctumSaleID"
FROM catalog_sale_merged_email_logs;
