-- Keep the RPC diagnostic aligned with the current identity provider.
DO $$
DECLARE
  definition text;
BEGIN
  definition := replace(
    pg_get_functiondef('public.get_or_create_profile(text,text,text,text)'::regprocedure),
    'missing Firebase subject claim',
    'missing Supabase Auth user'
  );
  EXECUTE definition;
END;
$$;
