-- Self-scoped permission helpers: callers can only ask about themselves.
CREATE OR REPLACE FUNCTION public.has_supporter(_user_id uuid, _env text DEFAULT 'live'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
      ELSE
        public.is_owner()
        OR EXISTS (
          SELECT 1 FROM public.entitlements
          WHERE user_id = _user_id
            AND product_id = 'mosh_supporter'
            AND environment = _env
        )
    END;
$function$;

CREATE OR REPLACE FUNCTION public.can_use_cloud_presets(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
      ELSE
        public.is_owner()
        OR public.has_supporter(_user_id, 'live')
        OR public.has_supporter(_user_id, 'sandbox')
    END;
$function$;

-- Forge history: require a non-guessable token length; drop blanket PUBLIC execute.
CREATE OR REPLACE FUNCTION public.list_my_forge_uploads(p_token text)
 RETURNS TABLE(id uuid, filename text, storage_path text, uploaded_at timestamp with time zone, analysis jsonb, status text, error text, outputs_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, filename, storage_path, uploaded_at, analysis, status, error, outputs_count
  FROM public.pattern_forge_uploads
  WHERE length(coalesce(p_token, '')) >= 16 AND owner_token = p_token
  ORDER BY uploaded_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_my_forge_uploads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_forge_uploads(text) TO anon, authenticated, service_role;

-- Trigger-only functions must never be callable through the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Helpers used inside RLS policies: signed-in only (needed for policy evaluation).
REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_supporter(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_use_cloud_presets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_supporter(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_cloud_presets(uuid) TO authenticated, service_role;