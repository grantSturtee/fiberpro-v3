-- =============================================================================
-- Authority type rename: 'njdot' → 'state'
-- =============================================================================
-- 'njdot' was a misnomer — the value represents "state-level DOT authority".
-- Renaming to 'state' lets the same enum value cover NJDOT, TXDOT, CalTrans,
-- etc. without misleading downstream code.
--
-- Postgres can't drop enum values, so 'njdot' will remain as an orphan value
-- in the enum after this migration. No rows will reference it after the
-- UPDATE below.
--
-- This migration is split from 20260515000002 because Postgres requires
-- ALTER TYPE ... ADD VALUE to be committed before the new value can be used
-- in a query within the same transaction.
-- =============================================================================

ALTER TYPE authority_type ADD VALUE IF NOT EXISTS 'state';
