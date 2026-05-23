/**
 * generateInvoice
 *
 * Produces a simple professional invoice PDF in PORTRAIT orientation
 * (612 × 792 pt = 8.5 × 11 in).
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │  GRANTED Design Group            INVOICE          │
 *   │  610-840-7800 | 13 Wilkinson Dr…                   │
 *   ├────────────────────────────────────────────────────┤
 *   │  Invoice #: XXXX          Date: MMM D, YYYY        │
 *   ├────────────────────────────────────────────────────┤
 *   │  Bill To                   Project                 │
 *   │  Company name              Job #                   │
 *   │                            Job name                │
 *   │                            Authority               │
 *   │                            Date submitted (if any) │
 *   ├────────────────────────────────────────────────────┤
 *   │  Description               Qty  Unit Price  Total  │
 *   │  Permit Package Services    1   $X,XXX.XX  $X,XXX  │
 *   │  Discount (if any)               -$X.XX            │
 *   ├────────────────────────────────────────────────────┤
 *   │                      Invoice Total: $X,XXX.XX      │
 *   ├────────────────────────────────────────────────────┤
 *   │  Notes (if any)                                    │
 *   └────────────────────────────────────────────────────┘
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

// ── Page geometry (portrait letter) ──────────────────────────────────────────
const PW = 612;   // width
const PH = 792;   // height
const ML = 48;    // left margin
const MR = 48;    // right margin
const MT = 48;    // top margin
const MB = 48;    // bottom margin

const CW = PW - ML - MR;  // 516 content width

// ── Palette ───────────────────────────────────────────────────────────────────
const BLACK  = rgb(0, 0, 0);
const NAVY   = rgb(0, 0.18, 0.38);
const DKGRAY = rgb(0.25, 0.25, 0.25);
const GRAY   = rgb(0.5, 0.5, 0.5);
const LTGRAY = rgb(0.92, 0.92, 0.92);
const WHITE  = rgb(1, 1, 1);

// ── Input ─────────────────────────────────────────────────────────────────────
export interface InvoiceInput {
  invoiceNumber:   string | null;
  invoiceDate:     string;          // ISO string → formatted
  jobNumber:       string;
  jobName:         string;
  companyName:     string;
  authorityName:   string | null;
  submittedAt:     string | null;   // ISO or date-only string, optional
  basePrice:       number;
  discountAmount:  number;
  invoiceNotes:    string | null;
  billingStatus:   string;          // used to pick label: paid/partially_paid → "Invoice Total:"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * Parse an ISO or date-only string without timezone shift.
 * "2025-06-15" → anchored at noon UTC → correct in all US timezones.
 * Full ISO strings ("2025-06-15T...") are left as-is.
 */
function parseDateSafe(iso: string): Date {
  // Date-only strings (YYYY-MM-DD) have no time component; new Date() parses
  // them as UTC midnight, which shifts to the previous day in US timezones.
  // Anchoring at T12:00:00 keeps it in the correct calendar day worldwide.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T12:00:00`);
  }
  return new Date(iso);
}

function fmtDate(iso: string): string {
  try {
    return parseDateSafe(iso).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

/**
 * Word-wrap text to fit within maxW points.
 * Returns the lines; caller advances y by lineH * lines.length.
 */
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

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateInvoice(input: InvoiceInput): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([PW, PH]);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  // Current Y cursor (pdf-lib: y=0 is bottom)
  let y = PH - MT;

  // ── Header band ──────────────────────────────────────────────────────────────
  const HEADER_H = 56;
  page.drawRectangle({ x: ML, y: y - HEADER_H, width: CW, height: HEADER_H, color: NAVY });

  // Left: GRANTED branding
  page.drawText("GRANTED Design Group", {
    x: ML + 12, y: y - 18, size: 13, font: bold, color: WHITE,
  });
  page.drawText("610-840-7800  |  13 Wilkinson Drive, Landenberg PA 19350", {
    x: ML + 12, y: y - 31, size: 7, font: reg, color: rgb(0.8, 0.88, 1),
  });
  page.drawText("granted.com", {
    x: ML + 12, y: y - 42, size: 7, font: reg, color: rgb(0.8, 0.88, 1),
  });

  // Right: "INVOICE" label
  const invoiceLabel = "INVOICE";
  const invLabelW = bold.widthOfTextAtSize(invoiceLabel, 20);
  page.drawText(invoiceLabel, {
    x: ML + CW - invLabelW - 12, y: y - 24, size: 20, font: bold, color: WHITE,
  });

  y -= HEADER_H + 18;

  // ── Invoice meta row ──────────────────────────────────────────────────────────
  const invNumStr = input.invoiceNumber ? `Invoice #: ${input.invoiceNumber}` : "Invoice #: —";
  page.drawText(invNumStr, { x: ML, y, size: 10, font: bold, color: NAVY });

  const dateStr = `Date: ${fmtDate(input.invoiceDate)}`;
  const dateStrW = reg.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, { x: ML + CW - dateStrW, y, size: 10, font: reg, color: DKGRAY });

  y -= 8;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 18;

  // ── Bill To / Project details ─────────────────────────────────────────────────
  const HALF_W  = CW * 0.5;    // 258pt per column
  const COL2_X  = ML + HALF_W;
  const LINE_H  = 13;

  page.drawText("BILL TO",  { x: ML,      y, size: 8, font: bold, color: GRAY });
  page.drawText("PROJECT",  { x: COL2_X,  y, size: 8, font: bold, color: GRAY });
  y -= LINE_H;

  // Company name — maxWidth guards the left column so it can't bleed into PROJECT
  const companyLines = wrapText(input.companyName, bold, 10, HALF_W - 8);
  companyLines.forEach((line, i) => {
    page.drawText(line, { x: ML, y: y - i * LINE_H, size: 10, font: bold, color: BLACK });
  });

  // Job number always fits (short code); draw at same baseline as first company line
  page.drawText(input.jobNumber, { x: COL2_X, y, size: 10, font: bold, color: BLACK });
  y -= Math.max(companyLines.length, 1) * LINE_H;

  // Job name — wrap and advance y accordingly
  const jobNameLines = wrapText(input.jobName, reg, 9, HALF_W - 4);
  jobNameLines.forEach((line, i) => {
    page.drawText(line, { x: COL2_X, y: y - i * LINE_H, size: 9, font: reg, color: DKGRAY });
  });
  y -= jobNameLines.length * LINE_H;

  if (input.authorityName) {
    page.drawText("Authority:", { x: COL2_X, y, size: 8, font: bold, color: GRAY });
    page.drawText(input.authorityName, {
      x: COL2_X + 48, y, size: 8, font: reg, color: DKGRAY,
      maxWidth: HALF_W - 52,
    });
    y -= LINE_H;
  }

  if (input.submittedAt) {
    page.drawText("Submitted:", { x: COL2_X, y, size: 8, font: bold, color: GRAY });
    page.drawText(fmtDate(input.submittedAt), { x: COL2_X + 52, y, size: 8, font: reg, color: DKGRAY });
    y -= LINE_H;
  }

  y -= 10;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 16;

  // ── Line item table ───────────────────────────────────────────────────────────
  const COL_DESC_W  = CW * 0.52;
  const COL_QTY_X   = ML + COL_DESC_W;
  const COL_PRICE_X = ML + COL_DESC_W + 48;
  const COL_TOTAL_X = ML + CW;

  const TABLE_HEAD_H = 22;
  page.drawRectangle({ x: ML, y: y - TABLE_HEAD_H, width: CW, height: TABLE_HEAD_H, color: LTGRAY });

  const headY = y - TABLE_HEAD_H + 7;
  page.drawText("Description",   { x: ML + 8,      y: headY, size: 8, font: bold, color: DKGRAY });
  page.drawText("Qty",           { x: COL_QTY_X,   y: headY, size: 8, font: bold, color: DKGRAY });
  page.drawText("Unit Price",    { x: COL_PRICE_X, y: headY, size: 8, font: bold, color: DKGRAY });
  const totalColLabelW = bold.widthOfTextAtSize("Total", 8);
  page.drawText("Total", { x: COL_TOTAL_X - totalColLabelW - 8, y: headY, size: 8, font: bold, color: DKGRAY });

  y -= TABLE_HEAD_H;

  // Data row: permit package services
  const ROW_H = 24;
  y -= ROW_H;
  const lineY = y + ROW_H / 2 - 3;

  const basePriceStr = fmtMoney(input.basePrice);
  const basePriceW   = reg.widthOfTextAtSize(basePriceStr, 9);
  page.drawText("Permit Package Services", { x: ML + 8,          y: lineY, size: 9, font: reg, color: BLACK });
  page.drawText("1",                        { x: COL_QTY_X + 4,  y: lineY, size: 9, font: reg, color: BLACK });
  page.drawText(basePriceStr,               { x: COL_PRICE_X,    y: lineY, size: 9, font: reg, color: BLACK });
  page.drawText(basePriceStr,               { x: COL_TOTAL_X - basePriceW - 8, y: lineY, size: 9, font: reg, color: BLACK });

  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.3, color: LTGRAY });

  // Discount row (if any)
  if (input.discountAmount > 0) {
    y -= ROW_H;
    const discY    = y + ROW_H / 2 - 3;
    const discAmtStr = `−${fmtMoney(input.discountAmount)}`;
    const discAmtW   = reg.widthOfTextAtSize(discAmtStr, 9);
    page.drawText("Discount",  { x: ML + 8, y: discY, size: 9, font: reg, color: rgb(0.7, 0, 0) });
    page.drawText(discAmtStr,  { x: COL_TOTAL_X - discAmtW - 8, y: discY, size: 9, font: reg, color: rgb(0.7, 0, 0) });
    page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.3, color: LTGRAY });
  }

  y -= 20;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 20;

  // ── Total row ─────────────────────────────────────────────────────────────────
  const totalDue = input.basePrice - input.discountAmount;

  // "Total Due:" for outstanding states; "Invoice Total:" for settled states.
  // A paid invoice showing "Total Due" wrongly implies money is still owed.
  const isPaidOrPartial = input.billingStatus === "paid" || input.billingStatus === "partially_paid";
  const totalLabel = isPaidOrPartial ? "Invoice Total:" : "Total Due:";

  const totalValue  = fmtMoney(totalDue);
  const totalValueW = bold.widthOfTextAtSize(totalValue, 14);
  const totalLabelW = reg.widthOfTextAtSize(totalLabel, 10);

  page.drawText(totalLabel, {
    x: COL_TOTAL_X - totalValueW - totalLabelW - 12, y, size: 10, font: reg, color: DKGRAY,
  });
  page.drawText(totalValue, {
    x: COL_TOTAL_X - totalValueW - 8, y: y - 2, size: 14, font: bold, color: NAVY,
  });

  y -= 24;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (input.invoiceNotes) {
    y -= 16;
    page.drawText("Notes", { x: ML, y, size: 8, font: bold, color: GRAY });
    y -= 12;

    // Use wrapText so notes don't bleed into the footer area.
    const noteLines = wrapText(input.invoiceNotes, reg, 9, CW);
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: ML, y: y - i * 13, size: 9, font: reg, color: DKGRAY });
    });
    y -= noteLines.length * 13;
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerY = MB + 8;
  page.drawLine({
    start: { x: ML, y: footerY + 12 }, end: { x: ML + CW, y: footerY + 12 },
    thickness: 0.3, color: LTGRAY,
  });
  page.drawText(
    "GRANTED Design Group  ·  610-840-7800  ·  13 Wilkinson Drive, Landenberg PA 19350",
    { x: ML, y: footerY, size: 7, font: reg, color: GRAY, maxWidth: CW },
  );

  return doc.save();
}

// =============================================================================
// generateInvoiceFromLineItems  (Phase C — frozen invoice PDF workflow)
// =============================================================================
// Renders an invoice from explicit line items rather than a single base price.
// Used by sendInvoice and by the draft preview / persisted download routes.
//
// Visual layout matches generateInvoice as closely as practical:
//   1. Navy header band: GRANTED branding (left) + INVOICE label (right)
//   2. Meta row: Invoice # + Invoice Date (and Due Date if provided)
//   3. Bill To / Project columns
//   4. Line-item table with header row; one data row per item
//   5. Subtotal / Discount (if > 0) / Total block, right-aligned
//   6. Notes block (admin-only invoice_notes, only if provided)
//   7. Footer (every page)
//
// Multi-page handling: when the y cursor drops below a safe threshold during
// line-item rendering, a continuation page is started with a slim header
// ("Invoice INV-… — continued") and the table resumes. The Subtotal/Total
// block is always drawn on the final page (single row, takes ~80pt).
//
// generateInvoice (the legacy single-line variant) is preserved unchanged.
// =============================================================================

export interface InvoiceLineItemInputForPdf {
  description: string;
  quantity:    number;
  unit_price:  number;
  line_total:  number;
}

export interface InvoiceInputV2 {
  invoiceNumber:  string;
  invoiceDate:    string;                    // ISO date — formatted with fmtDate
  dueDate?:       string | null;
  jobNumber:      string;
  jobName:        string;
  companyName:    string;
  authorityName?: string | null;
  submittedAt?:   string | null;
  lineItems:      InvoiceLineItemInputForPdf[];
  subtotal:       number;
  discountAmount: number;
  total:          number;
  invoiceNotes?:  string | null;             // admin-only; route gates whether to pass this
  billingStatus:  string;                    // selects "Invoice Total" vs "Total Due" label
}

// ── Table geometry shared by header + rows ────────────────────────────────────
const TABLE_COL_DESC_W = CW * 0.52;
const TABLE_COL_QTY_X   = ML + TABLE_COL_DESC_W;
const TABLE_COL_PRICE_X = ML + TABLE_COL_DESC_W + 48;
const TABLE_COL_TOTAL_X = ML + CW;
const TABLE_HEAD_H      = 22;
const TABLE_ROW_H       = 22;
const PAGE_BOTTOM_GUARD = MB + 120;          // when y drops below this during rows, paginate

function drawHeaderBand(page: ReturnType<PDFDocument["addPage"]>, bold: PDFFont, reg: PDFFont): number {
  const HEADER_H = 56;
  const y = PH - MT;
  page.drawRectangle({ x: ML, y: y - HEADER_H, width: CW, height: HEADER_H, color: NAVY });
  page.drawText("GRANTED Design Group", {
    x: ML + 12, y: y - 18, size: 13, font: bold, color: WHITE,
  });
  page.drawText("610-840-7800  |  13 Wilkinson Drive, Landenberg PA 19350", {
    x: ML + 12, y: y - 31, size: 7, font: reg, color: rgb(0.8, 0.88, 1),
  });
  page.drawText("granted.com", {
    x: ML + 12, y: y - 42, size: 7, font: reg, color: rgb(0.8, 0.88, 1),
  });
  const label = "INVOICE";
  const labelW = bold.widthOfTextAtSize(label, 20);
  page.drawText(label, {
    x: ML + CW - labelW - 12, y: y - 24, size: 20, font: bold, color: WHITE,
  });
  return y - HEADER_H - 18; // returns next y cursor
}

function drawTableHeader(page: ReturnType<PDFDocument["addPage"]>, y: number, bold: PDFFont): number {
  page.drawRectangle({ x: ML, y: y - TABLE_HEAD_H, width: CW, height: TABLE_HEAD_H, color: LTGRAY });
  const headY = y - TABLE_HEAD_H + 7;
  page.drawText("Description", { x: ML + 8,         y: headY, size: 8, font: bold, color: DKGRAY });
  page.drawText("Qty",         { x: TABLE_COL_QTY_X,   y: headY, size: 8, font: bold, color: DKGRAY });
  page.drawText("Unit Price",  { x: TABLE_COL_PRICE_X, y: headY, size: 8, font: bold, color: DKGRAY });
  const totalW = bold.widthOfTextAtSize("Total", 8);
  page.drawText("Total", { x: TABLE_COL_TOTAL_X - totalW - 8, y: headY, size: 8, font: bold, color: DKGRAY });
  return y - TABLE_HEAD_H;
}

function drawFooter(page: ReturnType<PDFDocument["addPage"]>, reg: PDFFont): void {
  const footerY = MB + 8;
  page.drawLine({
    start: { x: ML, y: footerY + 12 }, end: { x: ML + CW, y: footerY + 12 },
    thickness: 0.3, color: LTGRAY,
  });
  page.drawText(
    "GRANTED Design Group  ·  610-840-7800  ·  13 Wilkinson Drive, Landenberg PA 19350",
    { x: ML, y: footerY, size: 7, font: reg, color: GRAY, maxWidth: CW },
  );
}

export async function generateInvoiceFromLineItems(input: InvoiceInputV2): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([PW, PH]);
  let y    = drawHeaderBand(page, bold, reg);

  // ── Meta row: Invoice # + Date (+ Due Date if provided) ────────────────────
  page.drawText(`Invoice #: ${input.invoiceNumber}`, {
    x: ML, y, size: 10, font: bold, color: NAVY,
  });

  // Right-aligned cluster: Date (top), Due Date (below) if provided.
  const dateStr  = `Date: ${fmtDate(input.invoiceDate)}`;
  const dateStrW = reg.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, { x: ML + CW - dateStrW, y, size: 10, font: reg, color: DKGRAY });

  if (input.dueDate) {
    const dueStr  = `Due: ${fmtDate(input.dueDate)}`;
    const dueStrW = reg.widthOfTextAtSize(dueStr, 9);
    page.drawText(dueStr, {
      x: ML + CW - dueStrW, y: y - 12, size: 9, font: reg, color: GRAY,
    });
    y -= 12; // make room
  }

  y -= 8;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 18;

  // ── Bill To / Project block (mirrors generateInvoice) ───────────────────────
  const HALF_W = CW * 0.5;
  const COL2_X = ML + HALF_W;
  const LINE_H = 13;

  page.drawText("BILL TO",  { x: ML,     y, size: 8, font: bold, color: GRAY });
  page.drawText("PROJECT",  { x: COL2_X, y, size: 8, font: bold, color: GRAY });
  y -= LINE_H;

  const companyLines = wrapText(input.companyName, bold, 10, HALF_W - 8);
  companyLines.forEach((line, i) => {
    page.drawText(line, { x: ML, y: y - i * LINE_H, size: 10, font: bold, color: BLACK });
  });

  page.drawText(input.jobNumber, { x: COL2_X, y, size: 10, font: bold, color: BLACK });
  y -= Math.max(companyLines.length, 1) * LINE_H;

  const jobNameLines = wrapText(input.jobName, reg, 9, HALF_W - 4);
  jobNameLines.forEach((line, i) => {
    page.drawText(line, { x: COL2_X, y: y - i * LINE_H, size: 9, font: reg, color: DKGRAY });
  });
  y -= jobNameLines.length * LINE_H;

  if (input.authorityName) {
    page.drawText("Authority:", { x: COL2_X, y, size: 8, font: bold, color: GRAY });
    page.drawText(input.authorityName, {
      x: COL2_X + 48, y, size: 8, font: reg, color: DKGRAY, maxWidth: HALF_W - 52,
    });
    y -= LINE_H;
  }

  if (input.submittedAt) {
    page.drawText("Submitted:", { x: COL2_X, y, size: 8, font: bold, color: GRAY });
    page.drawText(fmtDate(input.submittedAt), { x: COL2_X + 52, y, size: 8, font: reg, color: DKGRAY });
    y -= LINE_H;
  }

  y -= 10;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 16;

  // ── Line item table ────────────────────────────────────────────────────────
  y = drawTableHeader(page, y, bold);

  const items = input.lineItems.length > 0
    ? input.lineItems
    : [{ description: "(no line items)", quantity: 0, unit_price: 0, line_total: 0 }];

  for (const item of items) {
    // If the next row + the totals/footer block won't fit, start a new page.
    if (y - TABLE_ROW_H < PAGE_BOTTOM_GUARD) {
      drawFooter(page, reg);
      page = doc.addPage([PW, PH]);
      // Slim continuation header
      let yTop = PH - MT;
      page.drawText(`Invoice ${input.invoiceNumber} — continued`, {
        x: ML, y: yTop - 12, size: 10, font: bold, color: NAVY,
      });
      yTop -= 28;
      y = drawTableHeader(page, yTop, bold);
    }

    y -= TABLE_ROW_H;
    const rowMid = y + TABLE_ROW_H / 2 - 3;

    // Description (wrap so long descriptions don't bleed into the qty column)
    const descLines = wrapText(item.description, reg, 9, TABLE_COL_QTY_X - ML - 16);
    descLines.forEach((line, i) => {
      page.drawText(line, {
        x: ML + 8, y: rowMid - i * (LINE_H - 1), size: 9, font: reg, color: BLACK,
      });
    });

    // Right-aligned numeric columns
    const qtyStr   = Number.isInteger(item.quantity) ? `${item.quantity}` : item.quantity.toFixed(2);
    const unitStr  = fmtMoney(item.unit_price);
    const totalStr = fmtMoney(item.line_total);
    const unitW    = reg.widthOfTextAtSize(unitStr, 9);
    const totalW   = reg.widthOfTextAtSize(totalStr, 9);

    page.drawText(qtyStr,   { x: TABLE_COL_QTY_X + 4,            y: rowMid, size: 9, font: reg, color: BLACK });
    page.drawText(unitStr,  { x: TABLE_COL_PRICE_X + 60 - unitW, y: rowMid, size: 9, font: reg, color: BLACK });
    page.drawText(totalStr, { x: TABLE_COL_TOTAL_X - totalW - 8, y: rowMid, size: 9, font: reg, color: BLACK });

    page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.3, color: LTGRAY });
  }

  // ── Subtotal / Discount / Total block ──────────────────────────────────────
  // Make sure these fit on the current page; if not, push to a new page.
  const totalsBlockH = (input.discountAmount > 0 ? 3 : 2) * 16 + 30;
  if (y - totalsBlockH < MB + 60) {
    drawFooter(page, reg);
    page = doc.addPage([PW, PH]);
    const yTop = PH - MT;
    page.drawText(`Invoice ${input.invoiceNumber} — continued`, {
      x: ML, y: yTop - 12, size: 10, font: bold, color: NAVY,
    });
    y = yTop - 36;
  }

  y -= 14;

  // Subtotal
  {
    const label = "Subtotal:";
    const value = fmtMoney(input.subtotal);
    const valueW = reg.widthOfTextAtSize(value, 10);
    const labelW = reg.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: TABLE_COL_TOTAL_X - valueW - labelW - 12, y, size: 9, font: reg, color: DKGRAY,
    });
    page.drawText(value, { x: TABLE_COL_TOTAL_X - valueW - 8, y, size: 10, font: reg, color: BLACK });
    y -= 16;
  }

  if (input.discountAmount > 0) {
    const label = "Discount:";
    const value = `−${fmtMoney(input.discountAmount)}`;
    const valueW = reg.widthOfTextAtSize(value, 10);
    const labelW = reg.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: TABLE_COL_TOTAL_X - valueW - labelW - 12, y, size: 9, font: reg, color: rgb(0.6, 0, 0),
    });
    page.drawText(value, { x: TABLE_COL_TOTAL_X - valueW - 8, y, size: 10, font: reg, color: rgb(0.6, 0, 0) });
    y -= 16;
  }

  // Separator above the grand total
  y -= 4;
  page.drawLine({ start: { x: ML + CW * 0.55, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });
  y -= 16;

  // Grand total
  {
    const isPaidOrPartial =
      input.billingStatus === "paid" || input.billingStatus === "partially_paid";
    const label = isPaidOrPartial ? "Invoice Total:" : "Total Due:";
    const value = fmtMoney(input.total);
    const valueW = bold.widthOfTextAtSize(value, 14);
    const labelW = reg.widthOfTextAtSize(label, 10);
    page.drawText(label, {
      x: TABLE_COL_TOTAL_X - valueW - labelW - 12, y, size: 10, font: reg, color: DKGRAY,
    });
    page.drawText(value, {
      x: TABLE_COL_TOTAL_X - valueW - 8, y: y - 2, size: 14, font: bold, color: NAVY,
    });
    y -= 24;
  }

  page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: LTGRAY });

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (input.invoiceNotes) {
    y -= 16;
    page.drawText("Notes", { x: ML, y, size: 8, font: bold, color: GRAY });
    y -= 12;

    const noteLines = wrapText(input.invoiceNotes, reg, 9, CW);
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: ML, y: y - i * 13, size: 9, font: reg, color: DKGRAY });
    });
    y -= noteLines.length * 13;
  }

  drawFooter(page, reg);

  return doc.save();
}
