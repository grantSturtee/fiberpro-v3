-- =============================================================================
-- GRANTED — Burlington County Authority Path Seed
-- =============================================================================
-- Authority: Burlington County Department of Public Works, Engineering Division
-- Form: Road Occupancy Application (Rev. Jan 2020, updated 2025)
-- Form status: FLAT PDF — uses Adobe Fill & Sign (ADBE_FillSign), no standard
--              AcroForm Widget annotations. Confirmed via binary inspection.
--              Fill mode: "overlay" (coordinate-based text placement).
-- Requires: requires_application = true, requires_certification = false
--
-- Before this seed is useful:
--   1. Upload the Burlington County form PDF to the 'authority-documents'
--      Supabase storage bucket at path:
--        burlington-county/road-occupancy-application-2025.pdf
--   2. Run `supabase db push` to apply this migration.
--   3. Set a project's authority_id to the Burlington County UUID below.
-- =============================================================================

-- ── 1. Insert Burlington County into authority_profiles ───────────────────────

INSERT INTO authority_profiles (
  id,
  name,
  type,
  requires_pe,
  requires_coi,
  requires_application,
  requires_certification,
  submission_method,
  output_format,
  notes
) VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',   -- stable UUID for Burlington County
  'Burlington County Department of Public Works',
  'county',
  false,                                      -- PE stamp not required by county
  true,                                       -- COI required (Section 9 of policy)
  true,                                       -- Road Occupancy Application required
  false,                                      -- no separate certification form
  'mail',                                     -- mail or hand deliver to 1900 Briggs Rd
  'plan_set',
  'Submit application + 6 copies of site-specific TCP. Fee payable to Burlington County Treasurer. Phone: (856) 642-3700. Hand deliver: 1900 Briggs Road, Mount Laurel NJ 08054'
) ON CONFLICT (id) DO NOTHING;


-- ── 2. authority_document_templates — Burlington County Road Occupancy App ────
--
-- field_mappings uses "overlay" mode because the form is a flat PDF.
--
-- COORDINATE CALIBRATION NOTES (letter portrait, 612 × 792 pt, origin bottom-left):
--
--   These x/y values were estimated from the rendered form image. Run a test
--   generation and compare the output against the blank form to fine-tune.
--   Each coordinate is the baseline of the typed text.
--
--   Field layout (page 1, index 0):
--     Applicant's Name:          y≈514   after label text at left edge
--     Street Address:            y≈497
--     City:                      y≈480   x≈88 (short label)
--     State:                     y≈480   x≈230
--     Zip:                       y≈480   x≈282
--     Email:                     y≈480   x≈355
--     Daytime Phone:             y≈463
--     County Route No.:          y≈385   x≈400 (after "County Route No.")
--     Road name (further id'd):  y≈368   x≈180
--     Municipality:              y≈351   x≈157
--     Anticipated Start Date:    y≈261   x≈152
--     Duration of Work:          y≈261   x≈370
--     Special conditions text:   (not auto-filled — requires manual entry)

INSERT INTO authority_document_templates (
  id,
  authority_id,
  type,
  file_url,
  field_mappings
) VALUES (
  'b1b2c3d4-0001-0001-0001-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'application',
  'burlington-county/road-occupancy-application-2025.pdf',
  '{
    "mode": "overlay",
    "fontSize": 9,
    "fields": [
      { "key": "applicant_name",    "x": 156, "y": 514, "page": 0 },
      { "key": "job_address",       "x": 143, "y": 497, "page": 0 },
      { "key": "municipality",      "x":  88, "y": 480, "page": 0 },
      { "key": "state",             "x": 230, "y": 480, "page": 0 },
      { "key": "roadway",           "x": 400, "y": 385, "page": 0 },
      { "key": "roadway",           "x": 180, "y": 368, "page": 0 },
      { "key": "municipality",      "x": 157, "y": 351, "page": 0 },
      { "key": "start_date",        "x": 152, "y": 261, "page": 0 },
      { "key": "work_description",  "x": 370, "y": 261, "page": 0 },
      { "key": "project_title",     "x": 148, "y": 222, "page": 0 }
    ]
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;
