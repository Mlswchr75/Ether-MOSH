
-- 1) Owner allowlist helper, keyed on JWT email (case-insensitive)
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce((auth.jwt() ->> 'email'), '')) = ANY (ARRAY['myleswhitcher@gmail.com'])
$$;

-- 2) has_supporter now honors owner allowlist too
CREATE OR REPLACE FUNCTION public.has_supporter(_user_id uuid, _env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner()
    OR EXISTS (
      SELECT 1 FROM public.entitlements
      WHERE user_id = _user_id
        AND product_id = 'mosh_supporter'
        AND environment = _env
    );
$$;

-- 3) can_use_cloud_presets: reuse is_owner() instead of ad-hoc auth.users lookup
CREATE OR REPLACE FUNCTION public.can_use_cloud_presets(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner()
    OR public.has_supporter(_user_id, 'live')
    OR public.has_supporter(_user_id, 'sandbox');
$$;
