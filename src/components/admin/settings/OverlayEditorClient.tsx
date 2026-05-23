"use client";

/**
 * OverlayEditorClient
 *
 * Visual PDF overlay editor.
 *
 * Layout:
 *   Toolbar  (page, font size, place/cancel, save)
 *   ┌── PDF canvas ──────────────────┬── Right panel ──────────────────┐
 *   │  pdf.js renders page to canvas │  Source PDF (upload / replace)  │
 *   │  Field chips overlay the page  │  ─────────────────────────────  │
 *   │                                │  Mapped Fields  (scrollable)    │
 *   │                                │  ─────────────────────────────  │
 *   │                                │  Available Fields (scrollable)  │
 *   └────────────────────────────────┴─────────────────────────────────┘
 *
 * Coordinate system:
 *   PDF space   — origin bottom-left, units = pt
 *   Screen space — origin top-left,   units = px
 *   screenX = pdfX * SCALE
 *   screenY = (pageHeightPt − pdfY) * SCALE
 */

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type {
  OverlayField,
  OverlayMappings,
  ReplaceResult,
  SaveResult,
} from "@/app/(admin)/admin/settings/authorities/[id]/templates/[templateId]/overlay/actions";

// ── Field catalog ──────────────────────────────────────────────────────────────

const FIELD_KEYS = [
  { key: "applicant_name",    label: "Applicant Name" },
  { key: "job_address",       label: "Job Address" },
  { key: "municipality",      label: "Municipality" },
  { key: "county",            label: "County" },
  { key: "state",             label: "State" },
  { key: "roadway",           label: "Roadway" },
  { key: "milepost_from",     label: "Milepost From" },
  { key: "milepost_to",       label: "Milepost To" },
  { key: "start_date",        label: "Start Date" },
  { key: "work_description",  label: "Work Description" },
  { key: "project_title",     label: "Project Title" },
  { key: "job_number",        label: "Job Number" },
  { key: "job_name",          label: "Job Name" },
  { key: "company_name",      label: "Company Name" },
  { key: "prepared_by",       label: "Prepared By" },
  { key: "authority_name",    label: "Authority Name" },
  { key: "date",              label: "Date" },
  { key: "client_job_number", label: "Client Job Number" },
] as const;

type FieldKey = typeof FIELD_KEYS[number]["key"];

function labelForKey(key: string): string {
  return FIELD_KEYS.find((f) => f.key === key)?.label ?? key;
}

// ── Sample values ─────────────────────────────────────────────────────────────

const SAMPLE_VALUES: Record<string, string> = {
  applicant_name:    "Rhino Communications LLC",
  job_address:       "117 Industrial Pkwy, Turnersville NJ",
  municipality:      "Gloucester Township",
  county:            "Burlington",
  state:             "NJ",
  roadway:           "Chews Landing Rd",
  milepost_from:     "2.3",
  milepost_to:       "2.7",
  start_date:        "04/12/2026",
  work_description:  "30 days",
  project_title:     "Test Aerial — Burlington County",
  job_number:        "FP-2026-0041",
  job_name:          "Test Aerial Job",
  company_name:      "Rhino Communications LLC",
  prepared_by:       "J. Smith, P.E.",
  authority_name:    "Burlington County DPW",
  date:              "04/12/2026",
  client_job_number: "RC-2026-041",
};

function sampleFor(key: string): string {
  return SAMPLE_VALUES[key] ?? key;
}

// ── Colors ────────────────────────────────────────────────────────────────────

const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#1d4ed8",
];

const KEY_COLOR_MAP: Record<string, string> = {};
function colorForKey(key: string): string {
  if (!KEY_COLOR_MAP[key]) {
    KEY_COLOR_MAP[key] = PALETTE[Object.keys(KEY_COLOR_MAP).length % PALETTE.length];
  }
  return KEY_COLOR_MAP[key];
}

/** Strip the leading timestamp from a storage path basename. */
function displayName(fileUrl: string): string {
  const base = fileUrl.split("/").pop() ?? fileUrl;
  return base.replace(/^\d+_/, "");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PageDimensions = { width: number; height: number };

type Props = {
  templateId: string;
  authorityId: string;
  /** Base URL for the PDF proxy: /api/authority-templates/{id}/pdf */
  pdfUrl: string;
  /** Current file_url stored in the template record (display + cache-bust). */
  fileUrl: string | null;
  pages: PageDimensions[];
  initialMappings: OverlayMappings;
  saveAction: (templateId: string, mappingsJson: string) => Promise<SaveResult>;
  replaceAction: (prev: ReplaceResult, formData: FormData) => Promise<ReplaceResult>;
};

// 1 PDF point = SCALE screen pixels. Letter portrait → 612 × 1.3 ≈ 796 px wide.
const SCALE = 1.3;

const REPLACE_INITIAL: ReplaceResult = { error: null };

// ── Component ─────────────────────────────────────────────────────────────────

export function OverlayEditorClient({
  templateId,
  authorityId,
  pdfUrl,
  fileUrl: initialFileUrl,
  pages,
  initialMappings,
  saveAction,
  replaceAction,
}: Props) {
  // ── PDF state ──────────────────────────────────────────────────────────────
  const [pdfLoading,    setPdfLoading]    = useState(true);
  const [pdfError,      setPdfError]      = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc,        setPdfDoc]        = useState<any>(null);
  /**
   * Version counter appended as ?v=N to pdfUrl.
   * Incrementing forces the browser to bypass the Cache-Control: private header
   * and re-fetch the PDF after a successful replace.
   */
  const [pdfVersion,    setPdfVersion]    = useState(0);
  /** Displayed filename — updated optimistically after a successful replace. */
  const [activeFileUrl, setActiveFileUrl] = useState<string | null>(initialFileUrl);

  // ── Mapping state ──────────────────────────────────────────────────────────
  const [fields,       setFields]       = useState<OverlayField[]>(initialMappings.fields ?? []);
  const [fontSize,     setFontSize]     = useState<number>(initialMappings.fontSize ?? 9);
  const [currentPage,  setCurrentPage]  = useState<number>(0);
  const [placing,      setPlacing]      = useState<boolean>(false);
  /** Key selected in the "Available Fields" list; used when placing. */
  const [pendingKey,   setPendingKey]   = useState<FieldKey>(FIELD_KEYS[0].key);
  /** Global index of the selected/expanded row in Mapped Fields. */
  const [selectedIdx,  setSelectedIdx]  = useState<number | null>(null);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<{
    saving: boolean;
    error: string | null;
    saved: boolean;
  }>({ saving: false, error: null, saved: false });

  // ── Replace PDF action ─────────────────────────────────────────────────────
  const [replaceState, replaceFormAction, replacePending] = useActionState(
    replaceAction,
    REPLACE_INITIAL
  );

  // When replace succeeds, bump pdfVersion (cache-bust) and update filename
  useEffect(() => {
    if (replaceState.newFileUrl) {
      setActiveFileUrl(replaceState.newFileUrl);
      setPdfVersion((v) => v + 1);
      // Reset the PDF doc so the loading effect re-runs
      setPdfDoc(null);
    }
  }, [replaceState.newFileUrl]);

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pageCount = pages.length;
  const pagePt    = pages[currentPage] ?? { width: 612, height: 792 };
  const canvasW   = Math.round(pagePt.width  * SCALE);
  const canvasH   = Math.round(pagePt.height * SCALE);

  const activePdfUrl = `${pdfUrl}?v=${pdfVersion}`;

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfDoc(null);

    import("pdfjs-dist").then(async (pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      try {
        const doc = await pdfjsLib.getDocument({ url: activePdfUrl }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPdfLoading(false);
      } catch (err) {
        if (cancelled) return;
        setPdfError(err instanceof Error ? err.message : String(err));
        setPdfLoading(false);
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePdfUrl]);

  // ── Render page to canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const page     = await pdfDoc.getPage(currentPage + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: SCALE });
        const canvas   = canvasRef.current!;
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) console.error("PDF page render error:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placing) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const pdfX = Math.round(screenX / SCALE);
      const pdfY = Math.round(pagePt.height - screenY / SCALE);
      setFields((prev) => [
        ...prev,
        { key: pendingKey, x: pdfX, y: pdfY, page: currentPage },
      ]);
      setPlacing(false);
    },
    [placing, pagePt.height, pendingKey, currentPage]
  );

  const deleteField = useCallback(
    (globalIdx: number) => {
      setFields((prev) => prev.filter((_, i) => i !== globalIdx));
      if (selectedIdx === globalIdx) setSelectedIdx(null);
      else if (selectedIdx !== null && selectedIdx > globalIdx) {
        setSelectedIdx(selectedIdx - 1);
      }
    },
    [selectedIdx]
  );

  const handleSave = useCallback(async () => {
    setSaveState({ saving: true, error: null, saved: false });
    const mappings: OverlayMappings = { mode: "overlay", fontSize, fields };
    const result = await saveAction(templateId, JSON.stringify(mappings));
    if (result.error) {
      setSaveState({ saving: false, error: result.error, saved: false });
    } else {
      setSaveState({ saving: false, error: null, saved: true });
      setTimeout(() => setSaveState((s) => ({ ...s, saved: false })), 3000);
    }
  }, [templateId, fields, fontSize, saveAction]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const pageFields = fields
    .map((f, i) => ({ ...f, globalIndex: i }))
    .filter((f) => f.page === currentPage);

  // Keys that have at least one placement
  const mappedKeySet = new Set(fields.map((f) => f.key));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ════════ Toolbar ════════ */}
      <div
        className="bg-card rounded-xl px-5 py-3.5 flex flex-wrap items-end gap-4"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        {pageCount > 1 && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Page
            </p>
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              className="bg-surface rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none"
              style={{ border: "1px solid #d4dde4" }}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i} value={i}>
                  Page {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
            Font Size
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={6}
              max={24}
              value={fontSize}
              onChange={(e) =>
                setFontSize(Math.max(6, Math.min(24, Number(e.target.value))))
              }
              className="bg-surface rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none w-16"
              style={{ border: "1px solid #d4dde4" }}
            />
            <span className="text-xs text-muted">pt</span>
          </div>
        </div>

        {placing ? (
          <div className="flex items-end gap-2.5">
            <button
              onClick={() => setPlacing(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-ink bg-surface border border-rule hover:bg-canvas transition-colors"
            >
              Cancel
            </button>
            <span className="text-sm text-primary font-semibold self-center animate-pulse">
              Click the PDF to place &ldquo;{labelForKey(pendingKey)}&rdquo;
            </span>
          </div>
        ) : null}

        <div className="ml-auto flex items-end gap-3">
          {saveState.error && (
            <p className="text-xs text-red-600 self-center max-w-xs">
              {saveState.error}
            </p>
          )}
          {saveState.saved && (
            <p className="text-xs text-green-700 font-semibold self-center">
              Saved ✓
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saveState.saving}
            className="px-5 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            {saveState.saving ? "Saving…" : "Save Mappings"}
          </button>
        </div>
      </div>

      {/* ════════ Main workspace ════════ */}
      <div className="flex gap-5 items-start">
        {/* ── PDF canvas column ── */}
        <div
          className="flex-shrink-0 rounded-xl overflow-hidden"
          style={{
            maxHeight: "82vh",
            overflowY: "auto",
            boxShadow: "0 2px 20px rgba(43,52,55,0.14)",
            border: "1px solid #d4dde4",
            background: "#f0f0f0",
          }}
        >
          {pdfLoading && (
            <div
              className="flex flex-col items-center justify-center gap-3 bg-surface"
              style={{ width: canvasW, height: canvasH }}
            >
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted">Loading PDF…</p>
            </div>
          )}

          {/* Error + inline upload CTA */}
          {pdfError && (
            <div
              className="flex flex-col items-center justify-center gap-4 bg-surface p-10 text-center"
              style={{ width: canvasW, height: Math.min(canvasH, 440) }}
            >
              <div
                className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0"
                style={{ border: "1.5px solid #fcd34d" }}
              >
                <span className="text-amber-500 text-lg leading-none font-bold">!</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">
                  PDF preview unavailable
                </p>
                {activeFileUrl && (
                  <p className="text-xs text-muted font-mono bg-surface rounded px-2 py-1 inline-block">
                    {displayName(activeFileUrl)}
                  </p>
                )}
                <p className="text-xs text-muted leading-relaxed max-w-xs">
                  {activeFileUrl
                    ? "The file has not been uploaded yet, or the path no longer matches."
                    : "No source PDF is associated with this template."}
                </p>
              </div>
              {/* Inline upload form */}
              <PdfUploadForm
                templateId={templateId}
                authorityId={authorityId}
                formAction={replaceFormAction}
                pending={replacePending}
                error={replaceState.error}
                label="Upload PDF"
                compact
                fileInputRef={fileInputRef}
              />
              <p className="text-[11px] text-dim leading-relaxed max-w-[260px]">
                Field coordinate mappings are saved in PDF point space — you
                can continue placing fields without the preview and upload the
                PDF later.
              </p>
            </div>
          )}

          {/* Canvas + chips */}
          <div
            ref={overlayRef}
            className="relative select-none"
            style={{
              width: canvasW,
              height: canvasH,
              display: pdfLoading || pdfError ? "none" : "block",
              cursor: placing ? "crosshair" : "default",
            }}
          >
            <canvas ref={canvasRef} style={{ display: "block" }} />

            {/* Click-capture transparent layer — only active while placing */}
            <div
              onClick={handleCanvasClick}
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: placing ? "all" : "none",
                zIndex: 5,
              }}
            />

            {/* Field chips */}
            {pageFields.map((f) => {
              const screenX    = f.x * SCALE;
              const screenY    = (pagePt.height - f.y) * SCALE;
              const color      = colorForKey(f.key);
              const isSelected = f.globalIndex === selectedIdx;

              return (
                <div
                  key={f.globalIndex}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIdx((prev) =>
                      prev === f.globalIndex ? null : f.globalIndex
                    );
                    setPlacing(false);
                  }}
                  style={{
                    position: "absolute",
                    left: screenX,
                    top: screenY,
                    transform: "translate(0, -100%)",
                    pointerEvents: "all",
                    cursor: "pointer",
                    zIndex: 10,
                    userSelect: "none",
                  }}
                >
                  <div
                    style={{
                      background: isSelected ? color : "rgba(255,255,255,0.96)",
                      borderLeft: `3px solid ${color}`,
                      border: isSelected
                        ? `1.5px solid ${color}`
                        : "1px solid rgba(0,0,0,0.10)",
                      borderRadius: "0 4px 4px 0",
                      padding: "2px 7px 3px 5px",
                      boxShadow: isSelected
                        ? `0 2px 10px ${color}60`
                        : "0 1px 5px rgba(0,0,0,0.20)",
                      maxWidth: 190,
                      lineHeight: 1.35,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 9,
                        fontWeight: 700,
                        color: isSelected ? "rgba(255,255,255,0.95)" : color,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.key}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: isSelected ? "rgba(255,255,255,0.82)" : "#374151",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: 1,
                      }}
                    >
                      {sampleFor(f.key)}
                    </div>
                  </div>
                  {/* Anchor dot at exact coordinate */}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      border: "1.5px solid white",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                      margin: "1px 0 0 4px",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {!pdfLoading && !pdfError && (
            <p
              className="text-[10px] text-dim text-center py-1.5"
              style={{ background: "#f0f0f0" }}
            >
              {Math.round(pagePt.width)} × {Math.round(pagePt.height)} pt ·{" "}
              {SCALE}× · click chip to select · click PDF to place
            </p>
          )}
        </div>

        {/* ── Right panel ── */}
        <div
          className="flex-1 min-w-0 flex flex-col gap-4"
          style={{ minWidth: 280, maxWidth: 340 }}
        >
          {/* Source PDF card */}
          <SourcePdfCard
            activeFileUrl={activeFileUrl}
            templateId={templateId}
            authorityId={authorityId}
            formAction={replaceFormAction}
            pending={replacePending}
            replaceState={replaceState}
            fileInputRef={fileInputRef}
          />

          {/* Mapped Fields */}
          <MappedFieldsList
            fields={fields}
            selectedIdx={selectedIdx}
            currentPage={currentPage}
            onSelect={(i) => {
              const f = fields[i];
              if (f) setCurrentPage(f.page);
              setSelectedIdx((prev) => (prev === i ? null : i));
              setPlacing(false);
            }}
            onDelete={deleteField}
          />

          {/* Available Fields */}
          <AvailableFieldsList
            mappedKeySet={mappedKeySet}
            pendingKey={pendingKey}
            placing={placing}
            onStartPlacing={(key) => {
              setPendingKey(key);
              setPlacing(true);
              setSelectedIdx(null);
            }}
          />

          {/* JSON preview */}
          <details>
            <summary className="text-xs text-muted cursor-pointer select-none hover:text-dim transition-colors">
              Preview JSON
            </summary>
            <pre
              className="mt-2 text-[10px] bg-surface rounded-lg p-3 overflow-auto"
              style={{ maxHeight: 220, border: "1px solid #d4dde4" }}
            >
              {JSON.stringify({ mode: "overlay", fontSize, fields }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Upload / replace the source PDF. */
function PdfUploadForm({
  templateId,
  authorityId,
  formAction,
  pending,
  error,
  label,
  compact = false,
  fileInputRef,
}: {
  templateId: string;
  authorityId: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  label: string;
  compact?: boolean;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form action={formAction} className={compact ? "" : "space-y-2"}>
      <input type="hidden" name="template_id"  value={templateId} />
      <input type="hidden" name="authority_id" value={authorityId} />
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}
      <label
        className="flex items-center gap-2 cursor-pointer"
        title={pending ? "Uploading…" : label}
      >
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          disabled={pending}
          onChange={(e) => {
            if (e.currentTarget.files?.length) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="sr-only"
        />
        <span
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{
            background: pending ? "#f6f8fa" : "linear-gradient(135deg, #005bc1 0%, #004faa 100%)",
            color: pending ? "#6b7280" : "white",
            borderColor: pending ? "#d4dde4" : "transparent",
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          <UploadIcon />
          {pending ? "Uploading…" : label}
        </span>
      </label>
    </form>
  );
}

/** Shows current PDF filename and replace button. */
function SourcePdfCard({
  activeFileUrl,
  templateId,
  authorityId,
  formAction,
  pending,
  replaceState,
  fileInputRef,
}: {
  activeFileUrl: string | null;
  templateId: string;
  authorityId: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  replaceState: ReplaceResult;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      <div className="px-4 py-3 border-b border-surface">
        <p className="text-xs font-semibold text-ink">Source PDF</p>
      </div>
      <div className="px-4 py-3">
        {activeFileUrl ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted flex-shrink-0"><DocIcon /></span>
              <span className="text-xs font-medium text-ink truncate">
                {displayName(activeFileUrl)}
              </span>
              {replaceState.newFileUrl && (
                <span className="text-[10px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 flex-shrink-0">
                  Updated
                </span>
              )}
            </div>
            <PdfUploadForm
              templateId={templateId}
              authorityId={authorityId}
              formAction={formAction}
              pending={pending}
              error={null}
              label="Replace"
              compact
              fileInputRef={fileInputRef}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-700">No PDF uploaded yet.</p>
            <PdfUploadForm
              templateId={templateId}
              authorityId={authorityId}
              formAction={formAction}
              pending={pending}
              error={replaceState.error}
              label="Upload PDF"
              fileInputRef={fileInputRef}
            />
          </div>
        )}
        {replaceState.error && activeFileUrl && (
          <p className="text-xs text-red-600 mt-2">{replaceState.error}</p>
        )}
      </div>
    </div>
  );
}

/** Scrollable list of already-placed fields. Expandable row for selected. */
function MappedFieldsList({
  fields,
  selectedIdx,
  currentPage,
  onSelect,
  onDelete,
}: {
  fields: OverlayField[];
  selectedIdx: number | null;
  currentPage: number;
  onSelect: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      <div className="px-4 py-3 border-b border-surface">
        <p className="text-xs font-semibold text-ink">
          Mapped
          <span className="ml-1.5 font-normal text-muted">({fields.length})</span>
        </p>
      </div>

      {fields.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-muted">No fields placed yet.</p>
          <p className="text-[11px] text-dim mt-1 leading-relaxed">
            Click a field in &ldquo;Available Fields&rdquo; to start placing.
          </p>
        </div>
      ) : (
        <div
          className="divide-y divide-surface overflow-y-auto"
          style={{ maxHeight: 260 }}
        >
          {fields.map((f, i) => {
            const isSelected = i === selectedIdx;
            const isOtherPage = f.page !== currentPage;
            const color = colorForKey(f.key);

            return (
              <div key={i}>
                {/* Row */}
                <div
                  onClick={() => onSelect(i)}
                  className="flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? color + "12" : undefined,
                  }}
                >
                  <span
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono font-medium text-ink truncate block">
                      {f.key}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono text-muted">
                    {isOtherPage && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded px-1">
                        p{f.page + 1}
                      </span>
                    )}
                    <span>{f.x},{f.y}</span>
                  </div>
                  <ChevronIcon
                    className="flex-shrink-0 text-muted transition-transform"
                    style={{ transform: isSelected ? "rotate(180deg)" : undefined }}
                  />
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div
                    className="px-4 pb-3 pt-0 space-y-2"
                    style={{ background: color + "08" }}
                  >
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="font-semibold text-muted uppercase tracking-wider">Pg</span>
                        <p className="font-mono text-ink mt-0.5">{f.page + 1}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-muted uppercase tracking-wider">X</span>
                        <p className="font-mono text-ink mt-0.5">{f.x}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-muted uppercase tracking-wider">Y</span>
                        <p className="font-mono text-ink mt-0.5">{f.y}</p>
                      </div>
                    </div>
                    <div
                      className="text-[10px] font-mono text-ink rounded px-2 py-1.5 truncate"
                      style={{ background: "#f6f8fa", border: "1px solid #d4dde4" }}
                    >
                      {sampleFor(f.key)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(i);
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 transition-colors"
                    >
                      <TrashIcon />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Scrollable list of all field keys. Clicking one starts placing mode. */
function AvailableFieldsList({
  mappedKeySet,
  pendingKey,
  placing,
  onStartPlacing,
}: {
  mappedKeySet: Set<string>;
  pendingKey: FieldKey;
  placing: boolean;
  onStartPlacing: (key: FieldKey) => void;
}) {
  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      <div className="px-4 py-3 border-b border-surface">
        <p className="text-xs font-semibold text-ink">Available Fields</p>
        <p className="text-[10px] text-muted mt-0.5">
          Click a field to start placing it on the PDF
        </p>
      </div>
      <div className="overflow-y-auto divide-y divide-surface" style={{ maxHeight: 280 }}>
        {FIELD_KEYS.map((f) => {
          const alreadyMapped = mappedKeySet.has(f.key);
          const isActive      = placing && pendingKey === f.key;
          const color         = colorForKey(f.key);

          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onStartPlacing(f.key)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                background: isActive ? color + "14" : undefined,
                cursor: "pointer",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0 w-2 h-2 rounded-full"
                  style={{
                    background: alreadyMapped ? color : "#d1d5db",
                    opacity: alreadyMapped ? 1 : 0.6,
                  }}
                />
                <span
                  className="text-xs truncate"
                  style={{
                    color: isActive ? color : "#1f2937",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {f.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {alreadyMapped && (
                  <span
                    className="text-[9px] font-semibold rounded px-1 py-0.5"
                    style={{ background: color + "18", color }}
                  >
                    placed
                  </span>
                )}
                {isActive ? (
                  <span className="text-[10px] font-semibold text-primary animate-pulse">
                    placing…
                  </span>
                ) : (
                  <PlusIcon className="text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3.5h10" />
      <path d="M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1" />
      <path d="M10.5 3.5l-.5 8h-6l-.5-8" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10V3M4 6l3-3 3 3" />
      <path d="M2 12h10" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="1.5" width="9" height="11" rx="1" />
      <path d="M5 5h4M5 7.5h4M5 10h2.5" />
    </svg>
  );
}

function ChevronIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M5 2v6M2 5h6" />
    </svg>
  );
}
