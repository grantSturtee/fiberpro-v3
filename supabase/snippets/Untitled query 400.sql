select
  p.id,
  p.job_number,
  p.job_name,
  pu.body,
  pu.created_by,
  pu.created_at
from project_updates pu
join projects p on p.id = pu.project_id
order by pu.created_at desc
limit 5;