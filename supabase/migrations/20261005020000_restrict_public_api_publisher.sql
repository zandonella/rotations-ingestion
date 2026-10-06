-- Supabase default function privileges can grant EXECUTE directly to client
-- roles. Revoking PUBLIC alone does not remove those independent grants.
REVOKE ALL ON FUNCTION public.record_public_api_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_api_state() TO service_role;
NOTIFY pgrst, 'reload schema';
