/**
 * generateCoverSheet
 *
 * Produces a Traffic Control Plan overview sheet in LANDSCAPE orientation
 * (792 × 612 pt = 11 × 8.5 in).
 *
 * Layout matches real NJ county TCP submission format observed in
 * JB0002476863 (Ocean County, 2 Stadium Way):
 *
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │ [LEFT NOTES col]  │  Title + Work-Area info box  │ [RIGHT NOTES col]   │
 *   │ Traffic Control   │                              │ Field Operation      │
 *   │ Notes (8)         │  TRAFFIC CONTROL PLAN        │ Notes (17)           │
 *   │ ──────────────    │  [ROADWAY] ([ROUTE])         │                      │
 *   │ Daily Work Zone   │  FROM MP X.XX TO MP X.XX     │                      │
 *   │ Notes (3)         │  AERIAL CABLE OPERATION      │                      │
 *   │                   │  [MUNICIPALITY, COUNTY, NJ]  │                      │
 *   │                   │  ┌─────────────────────────┐ │                      │
 *   │                   │  │  WORK AREA              │ │                      │
 *   │                   │  │  (project info)          │ │                      │
 *   │                   │  └─────────────────────────┘ │                      │
 *   ├───────────────────────────────────────────────────────────────────────── ┤
 *   │     Table 6C-1 (Advance Warning)  │ 6C-3 (Taper) │ 6C-4 (Formula)      │
 *   ├─────────────────────────────────────────────────────────────────────────┤
 *   │  GRANTED Design Group  │ PROJECT / DATE / DESIGNER  │  SHEET: 1 OF N   │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *
 * Note text is taken verbatim from the real GRANTED submission.
 * Tables use actual MUTCD Chapter 6C content.
 */

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";

// ── Page geometry (landscape letter) ─────────────────────────────────────────
const PW = 792;   // width
const PH = 612;   // height
const M  = 22;    // uniform margin

const CW = PW - M * 2;  // 748 content width
const CH = PH - M * 2;  // 568 content height

// Column widths
const L_W = 162;   // left notes column
const R_W = 162;   // right notes column
const GAP = 6;
const C_W = CW - L_W - R_W - GAP * 2;   // 212 center column

// Column X origins
const L_X = M;
const C_X = M + L_W + GAP;
const R_X = M + L_W + GAP + C_W + GAP;

// Vertical layout (from bottom of page)
const TITLE_BLK_H = 58;  // engineering title block
const TABLE_H     = 72;  // tables band
const BODY_H      = CH - TITLE_BLK_H - TABLE_H - 6; // ~432

const BODY_TOP    = PH - M;           // y of top of body
const TABLE_TOP   = M + TITLE_BLK_H + 4;  // y of top of tables
const TITLE_BLK_Y = M;               // y of bottom of title block

// ── Palette ───────────────────────────────────────────────────────────────────
const BLACK   = rgb(0, 0, 0);
const NAVY    = rgb(0, 0.18, 0.38);
const DKGRAY  = rgb(0.25, 0.25, 0.25);
const GRAY    = rgb(0.5, 0.5, 0.5);
const LTGRAY  = rgb(0.9, 0.9, 0.9);
const ALTROW  = rgb(0.95, 0.95, 0.95);
const WHITE   = rgb(1, 1, 1);

// ── Input ─────────────────────────────────────────────────────────────────────
export interface CoverSheetInput {
  jobNumber:       string;
  roadway:         string | null;
  routeNumber:     string | null;  // e.g. "C.R. 623" or "Route 38"
  mileposts_from:  string | null;
  mileposts_to:    string | null;
  municipality:    string | null;
  county:          string | null;
  state:           string | null;
  designerName:    string;
  companyName:     string;
  clientLogoBytes: Uint8Array | null;
  clientLogoMime:  "image/png" | "image/jpeg" | null;
  date:            string;         // MM/DD/YYYY
  totalPages:      number;
}

// ── Standard NJ TCP note text (verbatim from real GRANTED submission) ────────

const TCP_NOTES = [
  "ADVANCE WARNING SIGN DISTANCES AND TAPER LENGTHS MAY BE EXTENDED AT THE DISCRETION OF THE DEPARTMENT TO ADJUST FOR REDUCED VISIBILITY DUE TO HORIZONTAL AND VERTICAL CURVATURE OF THE ROADWAY.",
  "THE APPROPRIATE LOCATIONS OF THE ILLUMINATED FLASHING ARROW BOARDS ARE SHOWN ON THE TRAFFIC CONTROL PLAN. THESE LOCATIONS MAY BE MODIFIED AS APPROVED TO ADJUST FOR VISIBILITY DUE TO HORIZONTAL OR VERTICAL CURVATURE OF THE ROADWAY OR TO POSITION AT A SAFER LOCATION. ILLUMINATED FLASHING ARROW BOARDS ARE TO BE USED FOR TEMPORARY LANE CLOSINGS AND AT LOCATIONS SHOWN ON PLANS.",
  "PRIOR TO ANY ROAD CONSTRUCTION, TRAFFIC CONTROL SIGNS AND DEVICES SHALL BE IN PLACE.",
  "RAMPS AND/OR SIDE STREETS ENTERING THE ROADWAY AFTER THE FIRST ADVANCE WARNING SIGN SHALL BE PROVIDED WITH AT LEAST ONE W20 SIGN (ROAD WORK AHEAD) AS A MINIMUM.",
  "MAINTENANCE AND PROTECTION OF TRAFFIC SHALL BE IN ACCORDANCE WITH NEW JERSEY STANDARDS FOR TRAFFIC CONTROL, STREET AND HIGHWAY CONSTRUCTION, MAINTENANCE, UTILITY AND INCIDENT MANAGEMENT OPERATIONS, UNLESS OTHERWISE NOTED IN THE PLANS AND SPECIFICATIONS.",
  "MOVING AREAS IN A LANE CLOSURE REQUIRE A TRAILER MOUNTED ILLUMINATED FLASHING ARROW TO REMAIN AT THE END OF THE TAPER, THE TRAFFIC CONTROL TRUCK WITH MOUNTED CRASH CUSHION THAT SHALL MOVE WITH THE WORK AREAS TO KEEP A MINIMUM OF 70 FEET AND A MAXIMUM OF 150 FEET BUFFER IN ADVANCE OF EACH WORK AREA.",
  "WHERE REQUIRED, THE CONTRACTOR SHALL MAKE PROVISIONS FOR MAINTAINING PEDESTRIAN CROSSING LOCATIONS AND TYPE AS DIRECTED.",
  "ARROW BOARDS USED FOR OPERATION IN THE SHOULDER SHALL BE IN CAUTION MODE.",
];

const WZ_NOTES = [
  "THE WORK ZONES SHALL BE NO LONGER THAN WHAT IS REQUIRED TO COMPLETE THE DAYS WORK.",
  "EMERGENCY VEHICLES, RESIDENTIAL TRAFFIC AND BUSINESS ACCESS SHALL BE MAINTAINED WHEN POSSIBLE.",
  "CRASH TRUCK (TMA) IS REQUIRED FOR ROADS WITH A POSTED SPEED LIMIT OF 40 MPH OR GREATER OR THE 85TH PERCENTILE SPEED PRIOR TO WORK STARTING.",
];

const FIELD_OP_NOTES = [
  "CABLE OPERATION IS TO PROCEED WITH THE FLOW OF TRAFFIC AT ALL TIMES.",
  "ALL SIGNALIZED INTERSECTIONS ARE TO BE CROSSED ON A GREEN SIGNAL ONLY AND WITH POLICE ASSISTANCE AT ALL TIMES.",
  "ALL VEHICLES ARE REQUIRED TO HAVE HIGH INTENSITY ROTATING, FLASHING, OSCILLATING OR STROBE LIGHTS ON DURING THE MOBILE OPERATION.",
  "THE MAXIMUM DISTANCE BETWEEN THE UTILITY WORK AHEAD OR ROAD WORK AHEAD SIGNS SHALL BE NO GREATER THAN HALF MILE.",
  "IF NEEDED, THE WORK VEHICLES AND SHADOW VEHICLE SHOULD PULL OVER PERIODICALLY TO ALLOW VEHICULAR TRAFFIC TO PASS.",
  "SIGNAGE AND SPACING WILL BE ACCORDING TO LATEST NJ DOT STANDARDS.",
  "WHEN ATTACHING CABLE AT A TRAFFIC SIGNAL, ANY AERIAL FIBER CABLE MUST BE INSTALLED AT A MINIMUM OF 2 FEET ABOVE TRAFFIC SIGNAL.",
  "CONE SPACING IS PER MUTCD SECTION 6F.63 CHANNELIZING DEVICES #8.",
  "DEVICE SPACING IN THE TAPER IS NOT TO EXCEED 1 TIMES THE SPEED LIMIT IN FEET.",
  "DEVICE SPACING IN THE TANGENT IS NOT TO EXCEED 2 TIMES THE SPEED LIMIT IN FEET.",
  "ALL LANE WIDTHS ARE A MINIMUM OF 10 FEET WIDE UNLESS OTHERWISE NOTED.",
  "ALL DEVICES ARE TO BE PER NJ DOT CD-159-1 SPECIFICATIONS.",
  "ALL PERSONNEL ARE REQUIRED TO WEAR ANSI TYPE 3 VESTS.",
  "CONTRACTOR IS RESPONSIBLE TO SUBMIT A TIR TO GOVERNING AUTHORITY TRAFFIC OPERATIONS CENTER WHEN APPLICABLE.",
  "NO WORK SHALL BEGIN WITHOUT AN APPROVED TIR.",
  "A UNIFORMED POLICE OFFICER SHALL BE USED TO DIRECT TRAFFIC WITHIN 300 FEET OF A SIGNALIZED INTERSECTION, IF APPLICABLE.",
  "ALLOWABLE LANE CLOSURE HOURS WILL BE PROVIDED BY THE NJ DOT PERMITS CASE MANAGER. THESE WILL BE BASED ON THE TYPE OF WORK, AND ALLOWABLE LANE CLOSURE HOURS AVAILABLE FOR THE SECTION OF ROADWAY BEING WORKED ON.",
];

// ── MUTCD Chapter 6C tables (from real submission) ────────────────────────────

const TBL_6C1 = {
  title: ["Table 6C-1. Recommended Advance Warning", "Sign Minimum Spacing"],
  cols:  ["Road Type", "A", "B", "C"],
  colWRatios: [0.46, 0.18, 0.18, 0.18],
  rows: [
    ["Urban (low speed)*",   "100 ft", "100 ft", "100 ft"],
    ["Urban (high speed)*",  "350 ft", "350 ft", "350 ft"],
    ["Rural",                "500 ft", "500 ft", "500 ft"],
    ["Expressway / Freeway", "1,000", "1,500", "2,640 ft"],
  ],
  fn: "* Speed category determined by highway agency",
};

const TBL_6C3 = {
  title: ["Table 6C-3. Taper Length Criteria for", "Temporary Traffic Control Zones"],
  cols:  ["Type of Taper", "Taper Length"],
  colWRatios: [0.58, 0.42],
  rows: [
    ["Merging Taper",              "at least L"],
    ["Shifting Taper",             "at least 0.5 L"],
    ["Shoulder Taper",             "at least 0.33 L"],
    ["One-Lane, Two-Way Traffic",  "50 ft min, 100 ft max"],
    ["Downstream Taper",           "50 ft min, 100 ft max"],
  ],
  fn: "Note: Use Table 6C-4 to calculate L",
};

const TBL_6C4 = {
  title: ["Table 6C-4. Formulas for", "Determining Taper Length"],
  cols:  ["Speed (S)", "Taper Length (L) in feet"],
  colWRatios: [0.38, 0.62],
  rows: [
    ["40 mph or less", "L = WS\u00B2 / 60"],
    ["45 mph or more", "L = WS"],
  ],
  fn: "W = width of offset (ft)  S = posted speed limit or 85th-percentile speed (mph)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawNoteBlock(
  page: PDFPage,
  notes: string[],
  header: string,
  x: number,
  startY: number,
  colW: number,
  bold: PDFFont,
  reg: PDFFont,
  fontSize: number = 5.2,
  lineH: number = 7
): number {
  page.drawText(header, { x, y: startY, size: fontSize, font: bold, color: DKGRAY });
  let y = startY - lineH - 1;
  for (let i = 0; i < notes.length; i++) {
    const prefix = `${i + 1}.`;
    page.drawText(prefix, { x, y, size: fontSize, font: bold, color: BLACK });
    const lines = wrapText(notes[i], reg, fontSize, colW - 11);
    for (let j = 0; j < lines.length; j++) {
      page.drawText(lines[j], { x: x + 10, y: y - j * lineH, size: fontSize, font: reg, color: BLACK });
    }
    y -= lines.length * lineH + 1.5;
  }
  return y;
}

function drawTable(
  page: PDFPage,
  tbl: typeof TBL_6C1,
  x: number,
  topY: number,
  tblW: number,
  bold: PDFFont,
  reg: PDFFont
): void {
  const TITLE_H = 18;
  const HEAD_H  = 11;
  const ROW_H   = 10;

  // Title band
  page.drawRectangle({ x, y: topY - TITLE_H, width: tblW, height: TITLE_H, color: NAVY });
  tbl.title.forEach((line, i) => {
    page.drawText(line, { x: x + 3, y: topY - 8 - i * 8, size: 5.5, font: bold, color: WHITE, maxWidth: tblW - 5 });
  });
  let ty = topY - TITLE_H;

  // Column widths
  const colWs = tbl.colWRatios.map(r => r * tblW);

  // Header row
  page.drawRectangle({ x, y: ty - HEAD_H, width: tblW, height: HEAD_H, color: LTGRAY });
  let hx = x;
  tbl.cols.forEach((h, c) => {
    page.drawText(h, { x: hx + 2, y: ty - HEAD_H + 3, size: 5, font: bold, color: BLACK, maxWidth: colWs[c] - 3 });
    if (c > 0) page.drawLine({ start: { x: hx, y: ty }, end: { x: hx, y: ty - HEAD_H }, thickness: 0.3, color: GRAY });
    hx += colWs[c];
  });
  ty -= HEAD_H;

  // Data rows
  tbl.rows.forEach((row, r) => {
    const rowY = ty - (r + 1) * ROW_H;
    if (r % 2 === 1) page.drawRectangle({ x, y: rowY, width: tblW, height: ROW_H, color: ALTROW });
    let cx = x;
    row.forEach((cell, c) => {
      page.drawText(cell, { x: cx + 2, y: rowY + 3, size: 5.5, font: reg, color: BLACK, maxWidth: colWs[c] - 3 });
      if (c > 0) page.drawLine({ start: { x: cx, y: ty }, end: { x: cx, y: rowY }, thickness: 0.3, color: GRAY });
      cx += colWs[c];
    });
  });

  // Outer border
  const totalH = TITLE_H + HEAD_H + tbl.rows.length * ROW_H;
  page.drawRectangle({ x, y: topY - totalH, width: tblW, height: totalH, borderColor: GRAY, borderWidth: 0.5 });

  // Footnote
  if (tbl.fn) {
    const fnY = topY - totalH - 5;
    page.drawText(tbl.fn, { x: x + 2, y: fnY, size: 4.5, font: reg, color: DKGRAY, maxWidth: tblW - 3 });
  }
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateCoverSheet(input: CoverSheetInput): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([PW, PH]);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  // ── Separator: body / tables ────────────────────────────────────────────────
  const tableSepY = TABLE_TOP + TABLE_H;
  page.drawLine({ start: { x: M, y: tableSepY }, end: { x: M + CW, y: tableSepY }, thickness: 0.5, color: GRAY });
  page.drawLine({ start: { x: M, y: TABLE_TOP }, end: { x: M + CW, y: TABLE_TOP }, thickness: 0.5, color: GRAY });

  // ── LEFT COLUMN — Traffic Control Notes + Daily Work Zone Notes ─────────────
  const bodyTopY = BODY_TOP;
  let leftY = bodyTopY;
  leftY = drawNoteBlock(page, TCP_NOTES, "TRAFFIC CONTROL NOTES:", L_X, leftY, L_W, bold, reg);
  leftY -= 5;
  drawNoteBlock(page, WZ_NOTES, "DAILY WORK ZONE INSTALLATION AND REMOVAL:", L_X, leftY, L_W, bold, reg);

  // ── RIGHT COLUMN — Field Operation Notes ────────────────────────────────────
  drawNoteBlock(page, FIELD_OP_NOTES, "FIELD OPERATION NOTES:", R_X, bodyTopY, R_W, bold, reg);

  // ── CENTER COLUMN — Title + Work area info box ──────────────────────────────
  let cy = bodyTopY;

  // Title lines
  const titleLines: Array<[string, number, PDFFont]> = [
    ["TRAFFIC CONTROL PLAN", 13, bold],
    [
      [input.roadway, input.routeNumber ? `(${input.routeNumber})` : null].filter(Boolean).join(" ") || "—",
      10, bold,
    ],
    [
      input.mileposts_from && input.mileposts_to
        ? `FROM MILEPOST ${input.mileposts_from} TO MILEPOST ${input.mileposts_to}`
        : "",
      8, reg,
    ],
    ["AERIAL CABLE OPERATION", 11, bold],
    [
      [input.municipality, input.county, input.state ?? "N.J."].filter(Boolean).join(", "),
      8, reg,
    ],
  ];

  for (const [text, size, font] of titleLines) {
    if (!text) { cy -= 4; continue; }
    const tw = font.widthOfTextAtSize(text, size);
    const tx = C_X + Math.max(0, (C_W - tw) / 2);
    page.drawText(text, { x: tx, y: cy, size, font, color: BLACK });
    cy -= size + 5;
  }

  cy -= 6;

  // Work area info box (dark inset — mirrors the project callout on the real sheet)
  const boxX = C_X + 10;
  const boxW = C_W - 20;
  const boxY = tableSepY + 4;
  const boxH = cy - boxY - 4;

  if (boxH > 20) {
    page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, color: NAVY });

    const infoLines: Array<[string, number, PDFFont]> = [
      ["AERIAL CABLE OPERATION", 7, bold],
      ["", 0, reg],
      [input.roadway ?? "—", 7, bold],
      [
        input.mileposts_from && input.mileposts_to
          ? `FROM MILEPOST ${input.mileposts_from} TO MILEPOST ${input.mileposts_to}`
          : "",
        6, reg,
      ],
      ["", 0, reg],
      ["PROJECT:", 6, bold],
      [input.jobNumber, 7, bold],
      [
        [input.municipality, input.county, "N.J."].filter(Boolean).join(", "),
        6, reg,
      ],
    ];

    let infoY = boxY + boxH - 10;
    for (const [text, size, font] of infoLines) {
      if (infoY < boxY + 4) break;
      if (text && size > 0) {
        page.drawText(text, { x: boxX + 6, y: infoY, size, font, color: WHITE, maxWidth: boxW - 10 });
      }
      infoY -= (size || 4) + 4;
    }
  }

  // ── TABLES (3 side by side, full content width) ─────────────────────────────
  const tblTopY = tableSepY - 2;
  const TABLES  = [TBL_6C1, TBL_6C3, TBL_6C4] as const;
  const tblW    = (CW - GAP * 2) / 3;

  TABLES.forEach((tbl, i) => {
    drawTable(page, tbl, M + i * (tblW + GAP), tblTopY, tblW, bold, reg);
  });

  // ── ENGINEERING TITLE BLOCK ─────────────────────────────────────────────────
  const TB_LEFT_W  = 190;
  const TB_RGT_W   = 105;
  const TB_CTR_W   = CW - TB_LEFT_W - TB_RGT_W;

  const tbY  = TITLE_BLK_Y;
  const tbH  = TITLE_BLK_H;

  page.drawRectangle({ x: M, y: tbY, width: CW, height: tbH, borderColor: GRAY, borderWidth: 0.5 });
  page.drawLine({ start: { x: M + TB_LEFT_W, y: tbY }, end: { x: M + TB_LEFT_W, y: tbY + tbH }, thickness: 0.5, color: GRAY });
  page.drawLine({ start: { x: M + TB_LEFT_W + TB_CTR_W, y: tbY }, end: { x: M + TB_LEFT_W + TB_CTR_W, y: tbY + tbH }, thickness: 0.5, color: GRAY });

  // Left: GRANTED branding
  const lbX = M + 4;
  page.drawText("GRANTED Design Group", { x: lbX, y: tbY + tbH - 12, size: 8, font: bold, color: NAVY });
  if (input.companyName) {
    page.drawText(input.companyName, { x: lbX, y: tbY + tbH - 22, size: 7, font: reg, color: BLACK });
  }
  page.drawText("610-840-7800  |  13 Wilkinson Drive, Landenberg PA 19350", { x: lbX, y: tbY + 6, size: 5, font: reg, color: DKGRAY });

  // Center: project info
  const cbX = M + TB_LEFT_W + 5;
  const projectStr = [input.jobNumber, input.roadway].filter(Boolean).join(" / ");
  const projFields: Array<[string, string]> = [
    ["PROJECT:", projectStr],
    ["DATE:",    input.date],
    ["PREPARED BY:", input.designerName || "—"],
    ["REVISIONS:", ""],
  ];
  let ctY = tbY + tbH - 10;
  for (const [lbl, val] of projFields) {
    page.drawText(lbl,   { x: cbX,      y: ctY, size: 5.5, font: bold, color: DKGRAY });
    page.drawText(val,   { x: cbX + 65, y: ctY, size: 5.5, font: reg,  color: BLACK, maxWidth: TB_CTR_W - 70 });
    ctY -= 10;
  }

  // Right: submission label + sheet number
  const rbX = M + TB_LEFT_W + TB_CTR_W + 5;
  page.drawText("DRAWING SUBMISSION FOR:",  { x: rbX, y: tbY + tbH - 10, size: 5.5, font: bold, color: DKGRAY });
  page.drawText("TRAFFIC CONTROL PLAN",     { x: rbX, y: tbY + tbH - 20, size: 7,   font: bold, color: BLACK });
  page.drawText("SHEET NUMBER",             { x: rbX, y: tbY + tbH - 34, size: 5.5, font: bold, color: DKGRAY });

  const sheetStr = `1 OF ${input.totalPages}`;
  page.drawText(sheetStr, { x: rbX + 4, y: tbY + 8, size: 14, font: bold, color: BLACK });

  return doc.save();
}
