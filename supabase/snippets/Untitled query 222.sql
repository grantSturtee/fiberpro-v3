BEGIN;

UPDATE projects
SET submitted_by = NULL
WHERE submitted_by IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE projects
SET assigned_designer_id = NULL,
    assigned_at = NULL
WHERE assigned_designer_id IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE project_files
SET uploaded_by = NULL
WHERE uploaded_by IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE project_activity
SET actor_id = NULL
WHERE actor_id IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE project_messages
SET sender_id = NULL
WHERE sender_id IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE workflow_jobs
SET triggered_by = NULL
WHERE triggered_by IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

UPDATE project_tcd_selections
SET added_by = NULL
WHERE added_by IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

DELETE FROM auth.users
WHERE id IN (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7947f287-d2e5-40cd-b40e-3f8049a0266b'
);

COMMIT;