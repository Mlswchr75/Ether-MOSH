DROP POLICY IF EXISTS "forge bucket anon insert" ON storage.objects;
CREATE POLICY "forge bucket anon insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'forge-uploads'
  AND lower((storage.foldername(name))[1]) IS NOT NULL
  AND (
    lower(name) LIKE '%.png'
    OR lower(name) LIKE '%.jpg'
    OR lower(name) LIKE '%.jpeg'
    OR lower(name) LIKE '%.webp'
    OR lower(name) LIKE '%.gif'
  )
  AND (metadata->>'mimetype') IN ('image/png','image/jpeg','image/webp','image/gif')
);