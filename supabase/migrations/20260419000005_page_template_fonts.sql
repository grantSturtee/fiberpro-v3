-- Font library for page template text overlays.
-- Fonts are global (not per-template) and stored in the page-templates bucket
-- at fonts/{timestamp}_{filename}.
-- Admins upload; all authenticated users can read (needed for the editor UI).

create table if not exists public.page_template_fonts (
  id                uuid        primary key default gen_random_uuid(),
  display_name      text        not null,
  storage_path      text        not null,
  original_filename text        not null,
  mime_type         text        not null,
  file_ext          text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.page_template_fonts enable row level security;

create policy "page_template_fonts: admin manage"
  on public.page_template_fonts
  for all
  to authenticated
  using  ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "page_template_fonts: authenticated read"
  on public.page_template_fonts
  for select
  to authenticated
  using (true);
