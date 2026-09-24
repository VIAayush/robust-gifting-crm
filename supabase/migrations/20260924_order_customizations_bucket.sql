-- Storage bucket for customer-uploaded customization artwork (logo uploads
-- at checkout). Unlike product-images, this is NOT a public bucket — it's
-- customer-uploaded content tied to an order, readable by internal staff
-- only. Uploads happen server-side via the service-role admin client (the
-- same pattern src/app/cart/actions.ts already uses for anonymous guest
-- checkout — there is no Supabase Auth session to authorize an INSERT
-- policy against), so no public write policy is needed; the INSERT policy
-- below is a defense-in-depth mirror of the read policy in case anything
-- ever uploads via a session client instead.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-customizations',
  'order-customizations',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS order_customizations_internal_read ON storage.objects;
CREATE POLICY order_customizations_internal_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'order-customizations' AND public.is_internal());

DROP POLICY IF EXISTS order_customizations_internal_write ON storage.objects;
CREATE POLICY order_customizations_internal_write
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'order-customizations' AND public.is_internal());
