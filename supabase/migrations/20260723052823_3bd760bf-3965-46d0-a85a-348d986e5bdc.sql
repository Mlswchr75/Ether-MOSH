
REVOKE EXECUTE ON FUNCTION public.is_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_supporter(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_use_cloud_presets(uuid) FROM anon, authenticated, public;
