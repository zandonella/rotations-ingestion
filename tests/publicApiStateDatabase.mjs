import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// A dedicated disposable database is required. Never run this against an app DB.
const connection = new URL(process.env.PUBLIC_API_TEST_DB_URL || '');
assert.ok(['postgres:', 'postgresql:'].includes(connection.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname));
assert.equal(connection.pathname, '/rotations_public_api_test');
const psql = process.env.PSQL_BINARY || 'psql';
const schema = readFileSync(new URL('../supabase/migrations/20260519021931_remote_schema.sql', import.meta.url), 'utf8');
const names = ['CatalogItem', 'CatalogSale', 'Champion', 'ItemType', 'MythicSale', 'Skinline', 'Universe'];
let bootstrap = `DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;\n`;
// Match Supabase's default explicit client-role grants, which are independent
// of the grant to PUBLIC and must also be revoked for the private publisher.
bootstrap += 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;\n';
for (const name of names) {
  const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?\\n\\);`);
  const definition = schema.match(pattern)?.[0];
  assert.ok(definition, name);
  bootstrap += definition + '\n';
}
bootstrap += `CREATE TABLE public."SanctumSale" (
 "RiotItemID" integer, "ItemType" smallint, "SaleID" uuid DEFAULT gen_random_uuid(),
 "SaleStartAt" timestamptz, "SaleEndAt" timestamptz, "Rarity" text,
 "ChasePityThreshold" smallint, "BannerImageURL" text, "IsActive" boolean);
CREATE TABLE public."YourShopSale" (
 "ShopName" text, "SaleStartAt" timestamptz, "SaleEndAt" timestamptz, "HubEnabled" boolean, "IsActive" boolean);
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
INSERT INTO public."ItemType" (id,"Type") VALUES (1,'Skin');
INSERT INTO public."Champion" VALUES (22,'Ashe','Ashe','https://example.invalid/ashe.png');
INSERT INTO public."Universe" VALUES (7,'Example Universe');
INSERT INTO public."Skinline" VALUES (42,'Example',7);
INSERT INTO public."CatalogItem" ("ItemID","ItemType","RiotItemID","Name","ImageURL","ChampionID","SkinlineID")
 VALUES ('00000000-0000-4000-8000-000000000001',1,1001,'Test Skin','//example.invalid/skin.png',22,42);
INSERT INTO public."CatalogSale" ("RiotItemID","ItemType","SaleStartAt","SaleEndAt","NormalPrice","SalePrice","PercentOff","Currency","IsActive")
 VALUES (1001,1,now()-interval '1 day',now()+interval '1 day',1350,810,40,'RP',true);
INSERT INTO public."MythicSale" ("OfferID","PrimaryItemID","SaleStartAt","SaleEndAt","Price","Currency","Section","IsBundle","IncludedItems","IsActive")
 VALUES ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000001',now()-interval '1 day',now()+interval '1 day',100,'ME','FEATURED',false,'{}',true);
INSERT INTO public."SanctumSale" ("RiotItemID","ItemType","SaleStartAt","SaleEndAt","Rarity","ChasePityThreshold","IsActive")
 VALUES (1001,1,now()-interval '1 day',now()+interval '1 day','EXALTED',80,true);
INSERT INTO public."YourShopSale" VALUES ('test-shop',now()-interval '1 day',now()+interval '1 day',true,true);
`;
const migration = readFileSync(new URL('../supabase/migrations/20261005000000_add_public_api_state.sql', import.meta.url), 'utf8');
const deltas = readFileSync(new URL('../supabase/migrations/20261005010000_add_public_api_catalog_deltas.sql', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../supabase/migrations/20261005020000_restrict_public_api_publisher.sql', import.meta.url), 'utf8');
const checks = readFileSync(new URL('./publicApiState.sql', import.meta.url), 'utf8');
const deltaChecks = readFileSync(new URL('./publicApiCatalogDeltas.sql', import.meta.url), 'utf8');
const permissionChecks = `DO $$ BEGIN
 ASSERT NOT has_function_privilege('anon','public.record_public_api_state()','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.record_public_api_state()','EXECUTE');
 ASSERT has_function_privilege('service_role','public.record_public_api_state()','EXECUTE');
END $$;`;
const result = execFileSync(psql, ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', connection.href],
  { input: bootstrap + migration + deltas + checks + deltaChecks +
      'GRANT EXECUTE ON FUNCTION public.record_public_api_state() TO anon, authenticated;\n' + permissions + permissionChecks,
    encoding: 'utf8', maxBuffer: 1024 * 1024 });
console.log(result.trim().split('\n').slice(-8).join('\n'));
console.log('PASS public cache state, catalog deltas, no-op writes, removals, time boundaries, and read permissions.');
