select id, email, raw_app_meta_data
from auth.users
where email in ('testadmin@fiberpro.dev', 'testdesigner@fiberpro.dev');