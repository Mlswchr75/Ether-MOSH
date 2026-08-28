GRANT EXECUTE ON FUNCTION public.can_use_cloud_presets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_supporter(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;