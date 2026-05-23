ALTER TABLE project_files
ADD COLUMN IF NOT EXISTS source text
CHECK (source IS NULL OR source IN ('system_generated', 'admin_upload'));