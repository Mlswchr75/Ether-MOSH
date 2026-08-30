REVOKE SELECT (owner_token) ON public.pattern_forge_uploads FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_my_forge_uploads(p_token text)
RETURNS TABLE (
  id uuid,
  filename text,
  storage_path text,
  uploaded_at timestamptz,
  analysis jsonb,
  status text,
  error text,
  outputs_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, filename, storage_path, uploaded_at, analysis, status, error, outputs_count
  FROM public.pattern_forge_uploads
  WHERE p_token <> '' AND owner_token = p_token
  ORDER BY uploaded_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_forge_uploads(text) TO anon, authenticated;