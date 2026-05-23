update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"designer"'
)
where id = '34f9b09d-8ec4-4cf3-af0c-b704254423ff';

update user_profiles
set role = 'designer',
    display_name = 'Designer User'
where id = '34f9b09d-8ec4-4cf3-af0c-b704254423ff';