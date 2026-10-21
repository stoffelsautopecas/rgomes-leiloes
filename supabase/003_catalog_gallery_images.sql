alter table public.app_catalog_items
add column if not exists gallery_images jsonb not null default '[]'::jsonb;
