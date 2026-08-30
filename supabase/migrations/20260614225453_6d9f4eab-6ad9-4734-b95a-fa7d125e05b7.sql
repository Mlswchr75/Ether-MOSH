-- 1. Remove the overly broad SELECT policy that exposed owner_token to anyone.
DROP POLICY IF EXISTS "anon read forge uploads" ON public.pattern_forge_uploads;

-- (No replacement SELECT policy: reads happen via SECURITY DEFINER RPC
--  public.list_my_forge_uploads which filters by owner_token, and edge
--  functions use the service role which bypasses RLS.)

-- 2. Explicit-deny storage policies for the forge-uploads bucket.
--    INSERT remains allowed via the existing 'forge bucket anon insert' policy.
--    Public reads of the bucket happen via the public-bucket CDN path (bypasses RLS).
DROP POLICY IF EXISTS "forge bucket deny anon select"  ON storage.objects;
DROP POLICY IF EXISTS "forge bucket deny anon update"  ON storage.objects;
DROP POLICY IF EXISTS "forge bucket deny anon delete"  ON storage.objects;

CREATE POLICY "forge bucket deny anon select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id <> 'forge-uploads');

CREATE POLICY "forge bucket deny anon update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id <> 'forge-uploads');

CREATE POLICY "forge bucket deny anon delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id <> 'forge-uploads');