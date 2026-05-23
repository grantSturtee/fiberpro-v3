-- The page-templates bucket was originally created for PDF-only uploads.
-- It now also hosts font files (TTF/OTF) and image assets (PNG/JPEG/etc).
-- This bucket is private and admin-only; application code enforces file-type
-- rules, so removing the storage-level MIME gate is safe and future-proof.
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'page-templates';
