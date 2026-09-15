-- Product images live in a public storage bucket so the same URL can be
-- shown in the internal CRM and the client catalogue. Write access stays
-- internal-only; clients never upload.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
CREATE POLICY product_images_public_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS product_images_internal_write ON storage.objects;
CREATE POLICY product_images_internal_write
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND public.is_internal());

DROP POLICY IF EXISTS product_images_internal_update ON storage.objects;
CREATE POLICY product_images_internal_update
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'product-images' AND public.is_internal());

DROP POLICY IF EXISTS product_images_internal_delete ON storage.objects;
CREATE POLICY product_images_internal_delete
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'product-images' AND public.is_internal());
