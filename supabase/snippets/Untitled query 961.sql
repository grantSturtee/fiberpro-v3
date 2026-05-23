select
  up.id,
  up.display_name,
  up.email
from user_profiles up
order by up.created_at desc;