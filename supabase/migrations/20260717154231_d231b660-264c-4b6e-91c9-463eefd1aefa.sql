REVOKE EXECUTE ON FUNCTION public.has_supporter(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_supporter(uuid, text) TO service_role;