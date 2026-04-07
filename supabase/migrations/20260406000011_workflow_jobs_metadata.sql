-- Migration: add metadata column to workflow_jobs
--
-- This column was missing from 20260406000008_workflow_jobs_v2.sql but is
-- required by all currently-working code paths:
--
--   enqueue.ts           — inserts metadata on every new job
--   projectCompute.ts    — inserts metadata: { inputs, outputs } on every compute run
--   api/workflows/trigger — selects metadata to forward payload to n8n
--   api/workflows/pending — selects metadata in the polling response
--
-- Without this column, enqueueWorkflowJob() and computeProject() both fail
-- at the DB insert level. It was previously added as a manual local fix.
--
-- Nullable jsonb — existing rows get NULL, which is safe.
-- ADD COLUMN IF NOT EXISTS is idempotent for environments where it was patched manually.

ALTER TABLE workflow_jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb;
