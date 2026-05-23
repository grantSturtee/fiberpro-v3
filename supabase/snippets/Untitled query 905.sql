update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"designer"'
)
where email = 'testdesigner@fiberpro.dev';
