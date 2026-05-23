-- =============================================================================
-- GRANTED — User Profile Avatar (Phase 1 Foundation)
-- =============================================================================
-- Adds avatar_url column to user_profiles, creates avatars storage bucket,
-- and sets up scoped storage + profile RLS policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_profiles: add avatar_url
-- ---------------------------------------------------------------------------

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ---------------------------------------------------------------------------
-- user_profiles RLS: users can UPDATE their own display_name and avatar_url
-- Column-level restriction enforced in application layer (server actions).
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE POLICY "user_profiles: own update"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Storage: avatars bucket
-- 5 MB limit; private; jpeg / png / webp only.
-- Path convention: avatars/{user_id}/avatar.{ext}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Storage policies: avatars bucket
-- Scoped to user's own folder only — no cross-user reads in this phase.
-- ---------------------------------------------------------------------------

-- Users can upload into their own folder
DO $$ BEGIN
  CREATE POLICY "avatars: own insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Users can replace (UPDATE) their own avatar
DO $$ BEGIN
  CREATE POLICY "avatars: own update"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Users can read only their own avatar
DO $$ BEGIN
  CREATE POLICY "avatars: own select"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admins have full access to the avatars bucket
DO $$ BEGIN
  CREATE POLICY "avatars: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'avatars'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
