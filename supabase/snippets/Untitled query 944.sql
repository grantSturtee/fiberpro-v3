SELECT column_name
FROM information_schema.columns
WHERE table_name = 'project_files'
ORDER BY ordinal_position;