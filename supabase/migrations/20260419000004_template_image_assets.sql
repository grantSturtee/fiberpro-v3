-- Page template image assets
-- Stores named image files associated with a specific page template.
-- Used by image_region bindings with sourceKey='custom_image'.
-- Assets are stored in the page-templates bucket at assets/{template_id}/{filename}.

create table if not exists public.page_template_assets (
  id               uuid        primary key default gen_random_uuid(),
  page_template_id uuid        not null references public.page_templates(id) on delete cascade,
  name             text        not null,
  storage_path     text        not null,
  mime_type        text        not null default 'image/png',
  created_at       timestamptz not null default now()
);

alter table public.page_template_assets enable row level security;

create policy "Admins can manage template assets"
  on public.page_template_assets
  for all
  to authenticated
  using  ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
