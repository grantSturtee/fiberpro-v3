select
  conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on c.conrelid = t.oid
where t.relname = 'project_updates';
