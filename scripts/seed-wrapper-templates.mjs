/**
 * GRANTED — Seed placeholder wrapper templates for TCP, TCD, SLD
 *
 * Generates simple letter-size PDF shell documents and uploads them to the
 * page-templates bucket, then creates page_template rows with placement_box
 * and field_mappings configured for job_number + sheet numbering overlays.
 *
 * Run against production:
 *   SUPABASE_URL=https://ywhlmvkneyyiwnycrilh.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<prod-service-key> \
 *   node --env-file=.env.local scripts/seed-wrapper-templates.mjs
 *
 * Run against local:
 *   node --env-file=.env.local scripts/seed-wrapper-templates.mjs
 *
 * These are placeholder shells. Replace the PDFs via the admin UI at
 * /admin/settings/page-templates once your branded wrapper designs are ready.
 * The placement_box and field_mappings remain valid and do not need to change
 * when you replace the PDF — only the visual shell changes.
 */

import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, degrees } from "./node_modules/pdf-lib/cjs/index.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "page-templates";

// ── Page geometry (letter portrait: 612 x 792 pt, 72pt = 1 inch) ─────────────
//
// Layout:
//   ┌─────────────────────────────────┐  ← 792pt top
//   │  0.5" top margin (36pt)         │
//   ├─────────────────────────────────┤  ← 756pt
//   │                                 │
//   │   Drawing area  540 × 648 pt    │
//   │   (0.5" L/R margins, occupies   │
//   │    top 9" of the page body)     │
//   │                                 │
//   ├─────────────────────────────────┤  ← 108pt
//   │  Title block  1" = 72pt         │
//   ├─────────────────────────────────┤  ← 36pt
//   │  0.5" bottom margin (36pt)      │
//   └─────────────────────────────────┘  ← 0pt
//
// placement_box: { x: 36, y: 108, width: 540, height: 648 }

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;           // 0.5"
const TITLE_H = 72;          // 1"
const DRAW_X = MARGIN;       // 36
const DRAW_Y = MARGIN + TITLE_H; // 108
const DRAW_W = PAGE_W - MARGIN * 2; // 540
const DRAW_H = PAGE_H - MARGIN * 2 - TITLE_H; // 648

const PLACEMENT_BOX = { x: DRAW_X, y: DRAW_Y, width: DRAW_W, height: DRAW_H };

// Overlay: job_number + sheet_number_display in the title block
const FIELD_MAPPINGS = {
  fields: [
    { key: "job_number",           x: 390, y: 58, page: 0, pageMode: "all", fontSize: 8 },
    { key: "sheet_number_display", x: 390, y: 44, page: 0, pageMode: "all", fontSize: 7 },
  ],
};

// ── Template definitions ──────────────────────────────────────────────────────

const TEMPLATES = [
  { name: "TCP Wrapper",  type: "tcp_wrapper",  label: "TRAFFIC CONTROL PLAN" },
  { name: "TCD Wrapper",  type: "tcd_wrapper",  label: "TRAFFIC CONTROL DIAGRAM" },
  { name: "SLD Wrapper",  type: "sld_wrapper",  label: "SINGLE LINE DIAGRAM" },
];

// ── PDF generation ────────────────────────────────────────────────────────────

async function buildWrapperPdf(label) {
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const gray    = rgb(0.5,  0.5,  0.5);
  const ltgray  = rgb(0.85, 0.85, 0.85);
  const dkgray  = rgb(0.25, 0.25, 0.25);
  const blue    = rgb(0.0,  0.3,  0.7);

  // ── Outer border ────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN - 4, y: MARGIN - 4,
    width:  PAGE_W - (MARGIN - 4) * 2,
    height: PAGE_H - (MARGIN - 4) * 2,
    borderColor: dkgray, borderWidth: 1.5, color: undefined,
  });

  // ── Title block background ──────────────────────────────────────────────────
  page.drawRectangle({
    x: DRAW_X, y: MARGIN,
    width: DRAW_W, height: TITLE_H,
    color: ltgray, borderColor: gray, borderWidth: 0.5,
  });

  // Title block divider line
  page.drawLine({
    start: { x: DRAW_X,           y: MARGIN + TITLE_H },
    end:   { x: DRAW_X + DRAW_W,  y: MARGIN + TITLE_H },
    color: dkgray, thickness: 1,
  });

  // ── Title block content ─────────────────────────────────────────────────────
  // Left: document type label
  page.drawText(label, {
    x: DRAW_X + 8, y: MARGIN + 46,
    size: 9, font, color: dkgray,
  });
  page.drawText("GRANTED — Permit Package", {
    x: DRAW_X + 8, y: MARGIN + 33,
    size: 7, font: mono, color: gray,
  });
  page.drawText("Job No.", {
    x: 388, y: MARGIN + 68, size: 6, font, color: gray,
  });
  page.drawText("Sheet", {
    x: 388, y: MARGIN + 54, size: 6, font, color: gray,
  });
  // Placeholder fields (real values overlaid at generation time)
  page.drawText("__________", {
    x: 388, y: MARGIN + 58, size: 8, font: mono, color: ltgray,
  });
  page.drawText("__________", {
    x: 388, y: MARGIN + 44, size: 8, font: mono, color: ltgray,
  });

  // ── Drawing area dashed border ──────────────────────────────────────────────
  const dashLen = 8;
  const gap     = 4;
  // Top
  for (let x = DRAW_X; x < DRAW_X + DRAW_W; x += dashLen + gap) {
    page.drawLine({
      start: { x, y: DRAW_Y + DRAW_H },
      end:   { x: Math.min(x + dashLen, DRAW_X + DRAW_W), y: DRAW_Y + DRAW_H },
      color: blue, thickness: 0.5, opacity: 0.4,
    });
  }
  // Bottom
  for (let x = DRAW_X; x < DRAW_X + DRAW_W; x += dashLen + gap) {
    page.drawLine({
      start: { x, y: DRAW_Y },
      end:   { x: Math.min(x + dashLen, DRAW_X + DRAW_W), y: DRAW_Y },
      color: blue, thickness: 0.5, opacity: 0.4,
    });
  }
  // Left
  for (let y = DRAW_Y; y < DRAW_Y + DRAW_H; y += dashLen + gap) {
    page.drawLine({
      start: { x: DRAW_X, y },
      end:   { x: DRAW_X, y: Math.min(y + dashLen, DRAW_Y + DRAW_H) },
      color: blue, thickness: 0.5, opacity: 0.4,
    });
  }
  // Right
  for (let y = DRAW_Y; y < DRAW_Y + DRAW_H; y += dashLen + gap) {
    page.drawLine({
      start: { x: DRAW_X + DRAW_W, y },
      end:   { x: DRAW_X + DRAW_W, y: Math.min(y + dashLen, DRAW_Y + DRAW_H) },
      color: blue, thickness: 0.5, opacity: 0.4,
    });
  }

  // ── Drawing area center label ────────────────────────────────────────────────
  const centerX = DRAW_X + DRAW_W / 2;
  const centerY = DRAW_Y + DRAW_H / 2;

  page.drawText("[ DESIGN DRAWING PLACED HERE ]", {
    x: centerX - 120, y: centerY + 10,
    size: 11, font, color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Uploaded TCP/TCD/SLD PDF is embedded and scaled to fit this area.", {
    x: centerX - 155, y: centerY - 6,
    size: 7, font: mono, color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText(`Placement box: x=${DRAW_X}  y=${DRAW_Y}  w=${DRAW_W}  h=${DRAW_H}  (PDF points, 72pt = 1 inch)`, {
    x: centerX - 170, y: centerY - 20,
    size: 6.5, font: mono, color: rgb(0.75, 0.75, 0.75),
  });

  // ── Watermark ────────────────────────────────────────────────────────────────
  page.drawText("PLACEHOLDER — REPLACE WITH BRANDED TEMPLATE", {
    x: 90, y: DRAW_Y + DRAW_H / 2 + 80,
    size: 14, font, color: rgb(0.9, 0.85, 0.85),
    opacity: 0.6, rotate: degrees(35),
  });

  return doc.save();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nConnecting to: ${SUPABASE_URL}\n`);

  for (const tmpl of TEMPLATES) {
    console.log(`── ${tmpl.name} ──────────────────────────────`);

    // Check if a template with this name + type already exists
    const { data: existing } = await supabase
      .from("page_templates")
      .select("id, name, storage_path")
      .eq("name", tmpl.name)
      .eq("template_type", tmpl.type)
      .maybeSingle();

    if (existing) {
      console.log(`  ✓ Already exists (id=${existing.id}) — skipping.`);
      console.log(`    storage_path: ${existing.storage_path ?? "(none — upload a PDF via admin UI)"}`);
      continue;
    }

    // Generate PDF bytes
    console.log("  Generating placeholder PDF…");
    const pdfBytes = await buildWrapperPdf(tmpl.label);

    // Upload to bucket
    const timestamp = Date.now();
    const storagePath = `${tmpl.type}/${timestamp}_placeholder.pdf`;
    console.log(`  Uploading → ${storagePath}`);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error(`  ✗ Upload failed: ${uploadError.message}`);
      continue;
    }

    // Insert DB record
    const { data: row, error: insertError } = await supabase
      .from("page_templates")
      .insert({
        name:          tmpl.name,
        template_type: tmpl.type,
        storage_path:  storagePath,
        is_active:     true,
        placement_box: PLACEMENT_BOX,
        field_mappings: FIELD_MAPPINGS,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`  ✗ DB insert failed: ${insertError.message}`);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      continue;
    }

    console.log(`  ✓ Created id=${row.id}`);
    console.log(`    placement_box: x=${PLACEMENT_BOX.x} y=${PLACEMENT_BOX.y} w=${PLACEMENT_BOX.width} h=${PLACEMENT_BOX.height}`);
  }

  console.log("\nDone.\n");
  console.log("Next steps:");
  console.log("  1. Open /admin/settings/page-templates to review the placeholders.");
  console.log("  2. Upload your branded wrapper PDFs to replace each placeholder.");
  console.log("  3. Adjust the placement_box on each template to match your design.");
  console.log("  4. Create or edit a package blueprint at /admin/settings/package-templates");
  console.log("     and assign the TCP / TCD / SLD wrapper templates to the blueprint slots.");
  console.log("  5. Set the blueprint to Active to start using it for package generation.\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
