
CREATE OR REPLACE FUNCTION public.can_use_cloud_presets(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_supporter(_user_id, 'live')
    OR public.has_supporter(_user_id, 'sandbox')
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = _user_id
        AND lower(email) IN ('myleswhitcher@gmail.com')
    );
$$;

DROP POLICY IF EXISTS "presets insert own" ON public.saved_presets;
DROP POLICY IF EXISTS "presets update own" ON public.saved_presets;
DROP POLICY IF EXISTS "presets select own" ON public.saved_presets;
DROP POLICY IF EXISTS "presets delete own" ON public.saved_presets;

CREATE POLICY "presets select own"
  ON public.saved_presets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "presets insert own supporter"
  ON public.saved_presets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_use_cloud_presets(auth.uid()));

CREATE POLICY "presets update own supporter"
  ON public.saved_presets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_use_cloud_presets(auth.uid()));

CREATE POLICY "presets delete own"
  ON public.saved_presets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
