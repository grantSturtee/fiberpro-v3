-- =============================================================================
-- GRANTED — Local Development Seed
-- =============================================================================
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING or WHERE NOT EXISTS.
-- Apply with:  npx supabase db reset   (resets + applies migrations + this seed)
-- Or one-shot: npx supabase db query --file supabase/seed.sql
--
-- IMPORTANT: Every auth.users insert MUST be paired with an auth.identities
-- insert. GoTrue looks up auth.identities (not auth.users) for signInWithPassword.
-- Skipping identities = user exists but login always fails silently.
-- =============================================================================

-- ── 1. Admin auth user ────────────────────────────────────────────────────────
-- Credentials: admin@fiberpro.dev / Test123!
-- app_metadata.role = 'admin' grants full admin route access.

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current
)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'admin@fiberpro.dev',
  crypt('Test123!', gen_salt('bf', 10)),
  now(),
  '{"role": "admin", "provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@fiberpro.dev'
);

-- auth.identities row is REQUIRED for signInWithPassword to work.
-- Without it, the user row exists but GoTrue cannot authenticate the email provider.
INSERT INTO auth.identities (
  id, user_id,
  provider, provider_id,
  identity_data,
  created_at, updated_at, last_sign_in_at
)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000012'::uuid,
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'email',
  'bbbbbbbb-0000-0000-0000-000000000002',
  jsonb_build_object(
    'sub',            'bbbbbbbb-0000-0000-0000-000000000002',
    'email',          'admin@fiberpro.dev',
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
);

-- ── 1b. Admin user profile ─────────────────────────────────────────────────────
INSERT INTO user_profiles (id, role, display_name, email)
SELECT
  id, 'admin', 'Admin (Local Dev)', 'admin@fiberpro.dev'
FROM auth.users
WHERE email = 'admin@fiberpro.dev'
ON CONFLICT (id) DO NOTHING;

-- ── 2. Designer auth user ──────────────────────────────────────────────────────
-- Credentials: designer@fiberpro.dev / Designer123!
-- app_metadata.role = 'designer' grants /designer route access.

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current
)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'designer@fiberpro.dev',
  crypt('Designer123!', gen_salt('bf', 10)),
  now(),
  '{"role": "designer", "provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'designer@fiberpro.dev'
);

INSERT INTO auth.identities (
  id, user_id,
  provider, provider_id,
  identity_data,
  created_at, updated_at, last_sign_in_at
)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000011'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'email',
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub',            'aaaaaaaa-0000-0000-0000-000000000001',
    'email',          'designer@fiberpro.dev',
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
);

-- ── 3. Designer user profile ───────────────────────────────────────────────────
INSERT INTO user_profiles (id, role, display_name, email)
SELECT
  id, 'designer', 'Test Designer', 'designer@fiberpro.dev'
FROM auth.users
WHERE email = 'designer@fiberpro.dev'
ON CONFLICT (id) DO NOTHING;

-- ── 4. Test jurisdiction (Bergen County — no extras required) ─────────────────
-- All requires_* = false so generate-package skips cover sheet / app form / PE stamp.
-- This keeps the test minimal: only SLD is required.

INSERT INTO jurisdictions (
  id, state, county, authority_name,
  submission_method,
  requires_coi, requires_pe_stamp,
  requires_traffic_control_plan, requires_cover_sheet,
  requires_application_form, is_active
)
VALUES (
  'cccccccc-0000-0000-0000-000000000001'::uuid,
  'NJ', 'Bergen', 'Bergen County ROW',
  'email',
  false, false, false, false, false,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── 5a. Seed company (required FK for project) ────────────────────────────────
INSERT INTO companies (id, name, slug, billing_email)
VALUES (
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  'Rhino Communications LLC',
  'rhino-communications',
  'billing@rhinocomms.test'
)
ON CONFLICT (id) DO NOTHING;

-- ── 5b. Seed test project ─────────────────────────────────────────────────────
-- job_number trigger fires only when job_number IS NULL or ''; supplying it
-- here keeps the value stable across resets.
INSERT INTO projects (
  id, job_number, company_id,
  status, billing_status,
  job_name, job_address, county,
  authority_type, type_of_plan, job_type
)
VALUES (
  '72cdaaa3-4072-404c-90ad-d1a1f49a7ee8'::uuid,
  'FP-2026-0001',
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  'intake_review', 'not_ready',
  'Test Aerial Job — Bergen County',
  '123 Main St, Hackensack NJ 07601',
  'Bergen',
  'county', 'aerial', 'full_package'
)
ON CONFLICT (id) DO NOTHING;

-- ── 5c. Set test project to approved + assign jurisdiction + designer ──────────
-- Project FP-2026-0001 (id 72cdaaa3-...) starts as intake_review.
-- Set status = 'approved' so enqueuePackageGeneration accepts it.

UPDATE projects
SET
  status              = 'approved',
  jurisdiction_id     = 'cccccccc-0000-0000-0000-000000000001',
  assigned_designer_id = (SELECT id FROM auth.users WHERE email = 'designer@fiberpro.dev'),
  assigned_at         = now()
WHERE id = '72cdaaa3-4072-404c-90ad-d1a1f49a7ee8';

-- ── 6. SLD source file (reuse existing intake PDF already in storage) ──────────
-- The intake PDF at this path is a real PDF already in the project-files bucket.
-- Pointing it as an sld_sheet gives generate-package a real source to assemble.
-- Generate-package fetches it via signed URL — the category rename is all it needs.

INSERT INTO project_files (
  project_id, file_category, file_type,
  file_name, storage_path, mime_type, uploader_label
)
SELECT
  '72cdaaa3-4072-404c-90ad-d1a1f49a7ee8',
  'sld_sheet', 'sld',
  'TestSLD.pdf',
  '72cdaaa3-4072-404c-90ad-d1a1f49a7ee8/intake/1775661935777_TestProjectIntakeAttachment.pdf',
  'application/pdf',
  'System (seed)'
WHERE NOT EXISTS (
  SELECT 1 FROM project_files
  WHERE project_id = '72cdaaa3-4072-404c-90ad-d1a1f49a7ee8'
    AND file_category = 'sld_sheet'
);
