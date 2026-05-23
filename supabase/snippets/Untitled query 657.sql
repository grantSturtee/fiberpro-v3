select
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_name = 'project_updates'
  and column_name in ('created_by_id', 'created_by', 'status', 'body');