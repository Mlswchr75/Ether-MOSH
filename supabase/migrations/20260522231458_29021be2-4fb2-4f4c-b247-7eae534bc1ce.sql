
-- 1. Owner token on uploads
ALTER TABLE public.pattern_forge_uploads
  ADD COLUMN IF NOT EXISTS owner_token text NOT NULL DEFAULT '';

-- 2. Drop overly permissive table policies
DROP POLICY IF EXISTS "anon update forge uploads" ON public.pattern_forge_uploads;
DROP POLICY IF EXISTS "anon delete forge uploads" ON public.pattern_forge_uploads;
DROP POLICY IF EXISTS "anon insert forge uploads" ON public.pattern_forge_uploads;

-- Re-create INSERT requiring an owner token
CREATE POLICY "anon insert forge uploads"
ON public.pattern_forge_uploads
FOR INSERT
TO public
WITH CHECK (owner_token <> '');

-- SELECT remains public (analysis JSON is non-sensitive); client filters by owner_token.
-- UPDATE/DELETE intentionally removed for anon. The forge-analyze and forge-delete
-- edge functions perform these using the service role after verifying owner_token.

-- 3. Storage: drop broad SELECT/UPDATE/DELETE; bucket is public so files are
-- still served via the public CDN without needing a SELECT policy on storage.objects.
DROP POLICY IF EXISTS "forge bucket public read" ON storage.objects;
DROP POLICY IF EXISTS "forge bucket anon update" ON storage.objects;
DROP POLICY IF EXISTS "forge bucket anon delete" ON storage.objects;
-- INSERT policy "forge bucket anon insert" intentionally retained for uploads.
