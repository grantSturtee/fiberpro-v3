-- =============================================================================
-- project_files.sort_order — manual ordering foundation (Issue 4 Phase A)
-- =============================================================================
-- TCP sheets are currently ordered by created_at, which is unreliable when
-- multiple files are uploaded together (timestamps within the same second
-- collide and ordering becomes effectively undefined). Package generation
-- consumes the resulting list as-is, so the same project can produce
-- inconsistent page order on re-render.
--
-- Phase A adds the column and updates queries to honor it; no UI yet, no
-- backfill. Existing rows keep sort_order = NULL and continue to render in
-- created_at order via "ORDER BY sort_order ASC NULLS LAST, created_at ASC".
-- A future Phase B will add the drag-and-drop reorder UI + a write action;
-- this migration is intentionally additive and reversible.
--
-- Reversible: see DOWN block at the bottom of this file.
-- =============================================================================

ALTER TABLE public.project_files
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

COMMENT ON COLUMN public.project_files.sort_order IS
  'Manual user-assigned ordering (TCP sheets in Phase A). NULL = unordered; '
  'queries fall back to created_at ASC. Lower sort_order sorts earlier.';

-- =============================================================================
-- DOWN (manual rollback — paste into SQL editor or a revert migration)
-- =============================================================================
--
-- ALTER TABLE public.project_files DROP COLUMN IF EXISTS sort_order;
--
-- =============================================================================
