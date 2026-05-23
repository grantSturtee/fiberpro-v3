alter table public.companies
add column if not exists allowed_states text[] default null;