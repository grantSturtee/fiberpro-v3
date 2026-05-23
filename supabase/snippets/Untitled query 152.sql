SELECT
  p.id,
  p.jurisdiction_id,
  p.authority_id,
  j.authority_name,
  j.authority_profile_id
FROM projects p
LEFT JOIN jurisdictions j
  ON p.jurisdiction_id = j.id
ORDER BY p.created_at DESC NULLS LAST;