CREATE TABLE public."YourShopSale" (
    "ShopName" text PRIMARY KEY,
    "SaleStartAt" timestamp with time zone NOT NULL,
    "SaleEndAt" timestamp with time zone NOT NULL,
    "HubEnabled" boolean NOT NULL,
    "IsActive" boolean NOT NULL,
    CONSTRAINT "YourShopSale_valid_window" CHECK ("SaleEndAt" > "SaleStartAt")
);

ALTER TABLE public."YourShopSale" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
ON public."YourShopSale"
FOR SELECT
USING (true);

GRANT SELECT ON TABLE public."YourShopSale" TO anon, authenticated;
GRANT ALL ON TABLE public."YourShopSale" TO service_role;

INSERT INTO public."YourShopSale"
    ("ShopName", "SaleStartAt", "SaleEndAt", "HubEnabled", "IsActive")
VALUES
    ('legacy-2025-03-19', '2025-03-19 00:00:00+00', '2025-04-16 23:59:59+00', true, false),
    ('legacy-2025-06-03', '2025-06-03 00:00:00+00', '2025-06-24 23:59:59+00', true, false),
    ('legacy-2025-07-15', '2025-07-15 00:00:00+00', '2025-08-05 23:59:59+00', true, false),
    ('legacy-2025-09-09', '2025-09-09 00:00:00+00', '2025-10-07 23:59:59+00', true, false),
    ('legacy-2025-12-09', '2025-12-09 00:00:00+00', '2026-01-09 23:59:59+00', true, false),
    ('legacy-2026-02-10', '2026-02-10 00:00:00+00', '2026-03-10 23:59:59+00', true, false),
    ('legacy-2026-05-05', '2026-05-05 00:00:00+00', '2026-06-02 23:59:59+00', true, false),
    (
        'YS3.2026',
        '2026-07-21 17:00:00+00',
        '2026-08-18 17:00:00+00',
        true,
        now() >= '2026-07-21 17:00:00+00'
            AND now() < '2026-08-18 17:00:00+00'
    );
