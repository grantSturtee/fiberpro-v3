-- =============================================================================
-- Migrate existing 'njdot' rows to 'state'
-- =============================================================================
-- Runs after 20260515000003 (which ADDs 'state' to the enum). Splitting the
-- ADD VALUE from the UPDATE is required by Postgres: a freshly-added enum
-- value cannot be used in queries within the same transaction.
-- =============================================================================

UPDATE projects
   SET authority_type = 'state'::authority_type
 WHERE authority_type = 'njdot'::authority_type;

UPDATE pricing_rules
   SET authority_type = 'state'
 WHERE authority_type = 'njdot';
