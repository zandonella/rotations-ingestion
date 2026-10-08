-- Match wishlists and deduplicate within Postgres; only a count leaves the database.
CREATE OR REPLACE FUNCTION public.queue_wishlist_sale_emails()
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE inserted_count bigint;
BEGIN
    INSERT INTO public."WishlistEmailLog" (
        "UserID", "ItemID", "SaleID", "SaleType", "Status", "SentAt",
        "MythicSaleID", "CatalogSaleID", "SanctumSaleID"
    )
    SELECT m."UserID"::uuid, m."ItemID"::uuid, m."SaleID"::uuid, m."SaleType", 'PENDING', NULL,
        m."MythicSaleID"::uuid, m."CatalogSaleID"::uuid, m."SanctumSaleID"::uuid
    FROM public.get_active_wishlist_sale_matches() m
    LEFT JOIN public."CatalogSale" c ON c."SaleID" = m."CatalogSaleID"::uuid
    LEFT JOIN public."MythicSale" y ON y."SaleID" = m."MythicSaleID"::uuid
    LEFT JOIN public."SanctumSale" s ON s."SaleID" = m."SanctumSaleID"::uuid
    WHERE coalesce(c."SaleStartAt", y."SaleStartAt", s."SaleStartAt") <= now()
      AND coalesce(c."SaleEndAt", y."SaleEndAt", s."SaleEndAt") > now()
    ON CONFLICT ("UserID", "ItemID", "SaleID") DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

-- Update only the exact records included in a delivered/failed recipient batch.
CREATE OR REPLACE FUNCTION public.record_wishlist_email_delivery(records jsonb, delivery_status text)
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE updated_count bigint;
BEGIN
    IF delivery_status NOT IN ('SENT', 'FAILED') OR delivery_status IS NULL
       OR records IS NULL OR jsonb_typeof(records) <> 'array' THEN
        RAISE EXCEPTION 'Invalid delivery batch';
    END IF;
    IF jsonb_array_length(records) > 500 THEN RAISE EXCEPTION 'Delivery batch exceeds 500 records'; END IF;
    UPDATE public."WishlistEmailLog" e
    SET "Status" = delivery_status,
        "SentAt" = CASE WHEN delivery_status = 'SENT' THEN now() ELSE NULL END
    FROM jsonb_to_recordset(records) AS r("UserID" uuid, "ItemID" uuid, "SaleID" uuid)
    WHERE e."UserID" = r."UserID" AND e."ItemID" = r."ItemID" AND e."SaleID" = r."SaleID"
      AND e."Status" = 'PENDING';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_wishlist_sale_emails() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_wishlist_email_delivery(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_wishlist_sale_emails() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_wishlist_email_delivery(jsonb, text) TO service_role;
NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS public.linux_email_status (
    runner_id text PRIMARY KEY CHECK (runner_id = 'direct'),
    run_id uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'ok', 'error')),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.linux_email_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linux_email_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.linux_email_status TO service_role;
