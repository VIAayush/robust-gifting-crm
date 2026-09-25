-- Lets the CSV importer detect "this exact image content is already in
-- Storage" before uploading, instead of writing a fresh copy every time the
-- same photo is referenced by multiple rows/variants/imports.
alter table public.product_images
  add column if not exists content_hash text;

create index if not exists product_images_content_hash_idx
  on public.product_images (content_hash)
  where content_hash is not null;
