DO $$
DECLARE
  target_uid uuid;
BEGIN
  FOREACH target_uid IN ARRAY ARRAY[
    'e18fd5cf-5ff9-441f-9d51-0e56b6768f42'::uuid,
    'b4fc4310-8b9e-438d-b55f-57b39424331b'::uuid
  ]
  LOOP
    UPDATE projects
    SET assigned_designer_id = NULL,
        assigned_at = NULL
    WHERE assigned_designer_id = target_uid;

    UPDATE projects
    SET submitted_by = NULL
    WHERE submitted_by = target_uid;

    UPDATE project_activity
    SET actor_id = NULL
    WHERE actor_id = target_uid;

    UPDATE project_files
    SET uploaded_by = NULL
    WHERE uploaded_by = target_uid;

    UPDATE project_messages
    SET sender_id = NULL
    WHERE sender_id = target_uid;

    UPDATE project_tcd_selections
    SET added_by = NULL
    WHERE added_by = target_uid;

    UPDATE workflow_jobs
    SET triggered_by = NULL
    WHERE triggered_by = target_uid;

    DELETE FROM auth.users
    WHERE id = target_uid;

    RAISE NOTICE 'User % deleted successfully.', target_uid;
  END LOOP;
END $$;