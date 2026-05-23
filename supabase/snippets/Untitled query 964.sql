SELECT 
  u.id AS auth_id,
  u.email,
  p.id AS profile_id,
  p.role
FROM auth.users u
LEFT JOIN user_profiles p
ON u.id = p.id
WHERE u.email IN ('testadmin@fiberpro.dev', 'testdesigner@fiberpro.dev');