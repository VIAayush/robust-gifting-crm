-- Leftover from an earlier bulk catalogue upload, created ad hoc in the
-- dashboard: it let any role (including anon) INSERT into product-images.
-- Staff uploads are covered by product_images_internal_write.
drop policy if exists temp_bulk_catalogue_upload on storage.objects;
