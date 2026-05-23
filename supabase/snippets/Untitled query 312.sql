update user_profiles
set role = 'admin',
    display_name = 'Admin User'
where id = (
  select id from auth.users where email = 'testadmin@fiberpro.dev'
);

update user_profiles
set role = 'designer',
    display_name = 'Designer User'
where id = (
  select id from auth.users where email = 'teamdesigner@fiberpro.dev'
);