alter table "public"."CatalogSale" alter column "NormalPrice" set data type integer using "NormalPrice"::integer;

alter table "public"."CatalogSale" alter column "SalePrice" set data type integer using "SalePrice"::integer;


