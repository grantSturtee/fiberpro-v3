alter table public.projects
add column if not exists milepost_start text,
add column if not exists milepost_end text;