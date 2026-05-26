"use client";

import { forwardRef, useActionState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import {
  uploadProjectCoverMap,
  removeProjectCoverMap,
  saveProjectCoverMapAnnotations,
  saveProjectCoverMapCrop,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";
import {
  ANNOTATION_DEFAULTS,
  ANNOTATION_MAX_PATHS,
  ANNOTATION_MAX_POINTS_PER_PATH,
  WORK_PATH_COLOR,
  getGRANTEDWorkPathStyle,
  svgDashArrayFor,
  type AnnotationPath,
  type AnnotationPoint,
  type CoverMapAnnotations,
  type WorkPathPreset,
  type WorkPathThickness,
} from "@/types/coverMapAnnotations";

const initialState: AdminActionState = { error: null };

// Phase J — uploads are PDF-only (Google Maps export). The renderer uses the
// auto-cropped PNG produced server-side via sharp/PDFium.
const ACCEPTED       = "application/pdf";
const ACCEPTED_LABEL = "PDF only · max 20 MB";

// Editor canvas size — matches the 1.83 crop ratio used server-side
// (COVER_MAP_TARGET_RATIO) so the preview and editor align with what the
// renderer actually embeds. Width is the visual cap; the container scales
// below this on narrow viewports via max-width / aspect-ratio.
const EDITOR_W = 560;
const EDITOR_H = 306;
// Hit radius (px) for double-click-vs-drag and last-point detection.
const POINT_RADIUS = 4;

// ── Button style constants ────────────────────────────────────────────────────
// Single source of truth for the four button kinds used across the chrome.

const BTN_PRIMARY     = "px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-[#1565C0] hover:bg-[#1251A3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_SECONDARY   = "px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-[#374151] hover:bg-[#F9FAFB] border border-[#E5E7EB] transition-colors disabled:opacity-40";
const BTN_DESTRUCTIVE = "px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-[#DC2626] hover:bg-[#FEF2F2] border border-[#E5E7EB] transition-colors disabled:opacity-40";
const BTN_GHOST       = "px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827] border border-[#E5E7EB] transition-colors";

function UploadButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  const active = !disabled && !pending;
  return (
    <button
      type="submit"
      disabled={!active}
      className={`${BTN_PRIMARY} flex-shrink-0`}
    >
      {pending ? "Uploading…" : label}
    </button>
  );
}

// Two-stage remove: first click switches the button into a red "Confirm
// remove?" state without submitting; the second click actually submits the
// form. The parent owns the armed flag so it can disarm on outside click.
const RemoveConfirmButton = forwardRef<
  HTMLButtonElement,
  { armed: boolean; onArm: () => void }
>(function RemoveConfirmButton({ armed, onArm }, ref) {
  const { pending } = useFormStatus();
  return (
    <button
      ref={ref}
      // While unarmed, intercept clicks so the form does not submit; only the
      // confirmation click is a real submit.
      type={armed ? "submit" : "button"}
      onClick={armed ? undefined : onArm}
      disabled={pending}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 border ${
        armed
          ? "bg-[#DC2626] text-white hover:bg-[#B91C1C] border-[#DC2626]"
          : "bg-white text-[#DC2626] hover:bg-[#FEF2F2] border-[#FECACA]"
      }`}
    >
      {pending ? "Removing…" : armed ? "Confirm remove?" : "Remove Cover Map"}
    </button>
  );
});

// Phase 2 — saved crop in raster pixel coordinates. The card only reads
// `cropBox`; the rest of the JSON is preserved server-side. We accept
// `unknown` from the page and parse defensively so a stale shape never
// crashes the component.
type CropBox = { left: number; top: number; width: number; height: number };
function parseCropTransform(raw: unknown): CropBox | null {
  if (!raw || typeof raw !== "object") return null;
  const cb = (raw as Record<string, unknown>).cropBox;
  if (!cb || typeof cb !== "object") return null;
  const r = cb as Record<string, unknown>;
  const nums = [r.left, r.top, r.width, r.height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return {
    left:   r.left   as number,
    top:    r.top    as number,
    width:  r.width  as number,
    height: r.height as number,
  };
}

type Props = {
  projectId: string;
  currentMapUrl: string | null;
  currentMapCroppedUrl: string | null;
  /** Phase 2 — full rasterized PDF page, signed URL. Required for the crop
   *  editor; legacy rows uploaded before Phase 1 will have null and the
   *  "Adjust Crop" button stays hidden in that case. */
  currentMapRasterUrl?: string | null;
  currentMapRasterWidth?: number | null;
  currentMapRasterHeight?: number | null;
  /** Phase 2 — raw `crop_transform` JSON straight off the row. */
  currentMapCropTransform?: unknown;
  currentMapFileName: string | null;
  /** Phase J — MIME type of the original (used to choose PDF vs image preview).
   *  Legacy rows uploaded before Phase J carry image/png|jpeg|webp; new rows
   *  are always application/pdf. */
  currentMapMimeType?: string | null;
  /** Phase G — saved work-path annotations, parsed server-side. */
  currentAnnotations: CoverMapAnnotations | null;
};

export function CoverMapCard({
  projectId,
  currentMapUrl,
  currentMapCroppedUrl,
  currentMapRasterUrl     = null,
  currentMapRasterWidth   = null,
  currentMapRasterHeight  = null,
  currentMapCropTransform = null,
  currentMapFileName,
  currentMapMimeType = null,
  currentAnnotations,
}: Props) {
  const initialCropBox = parseCropTransform(currentMapCropTransform);
  const canAdjustCrop  = !!(currentMapRasterUrl && currentMapRasterWidth && currentMapRasterHeight);
  const originalIsPdf = currentMapMimeType === "application/pdf"
    || (currentMapFileName?.toLowerCase().endsWith(".pdf") ?? false);
  const [uploadState, uploadAction] = useActionState(uploadProjectCoverMap, initialState);
  const [removeState, removeAction] = useActionState(removeProjectCoverMap, initialState);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Editor state — work-path drawing and crop adjustment are mutually
  // exclusive; the main card body switches modes in place.
  const [editing, setEditing]   = useState(false);
  const [cropMode, setCropMode] = useState(false);

  // Two-stage remove: armed=true means the next click on the remove button
  // will actually submit. Click outside the button to disarm.
  const [removeArmed, setRemoveArmed] = useState(false);
  const removeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!removeArmed) return;
    const onWindowDown = (e: MouseEvent) => {
      const btn = removeBtnRef.current;
      if (!btn) return;
      if (!btn.contains(e.target as Node)) setRemoveArmed(false);
    };
    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [removeArmed]);

  const error = uploadState.error ?? removeState.error;
  const hasPath = !!currentAnnotations && currentAnnotations.paths.length > 0;
  const pathCount  = currentAnnotations?.paths.length ?? 0;
  const pointCount = currentAnnotations?.paths.reduce((n, p) => n + p.points.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {currentMapUrl ? (
        <div className="space-y-3">
          {/* ── Main card — preview when idle, in-place editor when editing.
              Single 1.83-ratio canvas serves both modes so there's no
              duplicate cropped image on screen. */}
          <div className="rounded-lg p-3 space-y-2 bg-[#F8F9FB] border border-[#E5E7EB]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-medium text-[#6B7280]">
                {cropMode
                  ? "Adjust Crop"
                  : editing
                    ? "Work Path Editor"
                    : "Cover Map Preview"}
              </p>
              {currentMapCroppedUrl && !editing && !cropMode && (
                <div className="flex items-center gap-3 flex-wrap">
                  {hasPath && (
                    <span className="text-xs text-[#6B7280]">
                      {pathCount} path{pathCount === 1 ? "" : "s"} · {pointCount} point{pointCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {canAdjustCrop && (
                    <button
                      type="button"
                      onClick={() => setCropMode(true)}
                      className={BTN_SECONDARY}
                    >
                      Adjust Crop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={BTN_SECONDARY}
                  >
                    {hasPath ? "Edit Work Path" : "Add Work Path"}
                  </button>
                </div>
              )}
            </div>

            {!editing && !cropMode && currentMapCroppedUrl && (
              <div
                className="relative mx-auto"
                style={{
                  width: "100%",
                  maxWidth: EDITOR_W,
                  aspectRatio: `${EDITOR_W} / ${EDITOR_H}`,
                }}
              >
                <Image
                  src={currentMapCroppedUrl}
                  alt="Project cover map"
                  fill
                  unoptimized
                  sizes="560px"
                  style={{ objectFit: "contain" }}
                />
                {hasPath && (
                  <AnnotationOverlay
                    width={EDITOR_W}
                    height={EDITOR_H}
                    annotations={currentAnnotations}
                  />
                )}
              </div>
            )}

            {!editing && !cropMode && !currentMapCroppedUrl && (
              <div
                className="flex items-center justify-center text-xs text-[#6B7280] text-center px-3 mx-auto border border-dashed border-[#E5E7EB] rounded-md"
                style={{
                  width: "100%",
                  maxWidth: EDITOR_W,
                  aspectRatio: `${EDITOR_W} / ${EDITOR_H}`,
                }}
              >
                Cropped preview not available yet.
              </div>
            )}

            {editing && currentMapCroppedUrl && (
              <WorkPathEditor
                embedded
                projectId={projectId}
                croppedUrl={currentMapCroppedUrl}
                initialAnnotations={currentAnnotations}
                onClose={() => setEditing(false)}
              />
            )}

            {cropMode && canAdjustCrop && (
              <CropEditor
                projectId={projectId}
                rasterUrl={currentMapRasterUrl as string}
                rasterWidth={currentMapRasterWidth as number}
                rasterHeight={currentMapRasterHeight as number}
                initialCropBox={initialCropBox}
                hasAnnotations={hasPath}
                onClose={() => setCropMode(false)}
              />
            )}
          </div>

          {/* ── Compact source row — filename + open link. Stays small so the
              cropped preview keeps the focus. */}
          <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 border border-[#E5E7EB]">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex items-center justify-center w-7 h-5 rounded-md text-[9px] font-bold flex-shrink-0 ${
                  originalIsPdf ? "bg-[#DC2626] text-white" : "bg-[#EFF6FF] text-[#1565C0]"
                }`}
              >
                {originalIsPdf ? "PDF" : "IMG"}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-[#6B7280]">
                  Source {originalIsPdf ? "PDF" : "File"}
                </p>
                <p className="text-xs text-[#111827] truncate">
                  {currentMapFileName ?? (originalIsPdf ? "Cover map.pdf" : "Cover map")}
                </p>
              </div>
            </div>
            <a
              href={currentMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[#1565C0] hover:underline transition-colors flex-shrink-0"
            >
              {originalIsPdf ? "Open PDF" : "Open Original"}
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-lg p-6 text-center text-sm text-[#6B7280] bg-[#F8F9FB] border border-dashed border-[#E5E7EB]">
          No cover map uploaded.
        </div>
      )}

      {/* ── Upload card — single action row with Choose PDF + filename on the
          left and the paired Replace + Remove actions on the right (or just
          Upload Cover Map when nothing is uploaded yet). The two forms sit
          inside the same flex row via `display: contents` so each button
          stays bound to its own server action / `useActionState`. */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-[#6B7280]">
          {currentMapUrl ? "Replace cover map" : "Upload cover map"}
        </p>
        <div className="rounded-lg p-3 space-y-2 border border-[#E5E7EB] bg-[#F8F9FB]">
          <div className="flex items-center gap-3 flex-wrap">
            <form action={uploadAction} style={{ display: "contents" }}>
              <input type="hidden" name="project_id" value={projectId} />
              <input
                id="cover-map-file"
                ref={fileInputRef}
                type="file"
                name="file"
                accept={ACCEPTED}
                required
                onChange={(e) => setSelectedName(e.target.files?.[0]?.name ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${BTN_SECONDARY} flex-shrink-0`}
              >
                Choose PDF
              </button>
              <span
                className={`text-xs truncate flex-1 min-w-0 ${
                  selectedName ? "text-[#111827]" : "text-[#6B7280]"
                }`}
              >
                {selectedName ?? "No file selected"}
              </span>
              <UploadButton
                label={currentMapUrl ? "Replace Cover Map" : "Upload Cover Map"}
                disabled={!selectedName}
              />
            </form>

            {currentMapUrl && (
              <form action={removeAction} style={{ display: "contents" }}>
                <input type="hidden" name="project_id" value={projectId} />
                <RemoveConfirmButton
                  ref={removeBtnRef}
                  armed={removeArmed}
                  onArm={() => setRemoveArmed(true)}
                />
              </form>
            )}
          </div>
          <p className="text-xs text-[#6B7280]">{ACCEPTED_LABEL}</p>
        </div>
        {uploadState.success && !error && (
          <p className="text-xs font-medium text-[#16A34A]">Saved ✓</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}

// ── Read-only annotation overlay ─────────────────────────────────────────────
// Draws saved paths onto a static cropped preview. Uses the same coordinate
// space as the editor: x in [0, width], y in [0, height], 0..1 normalized.
function AnnotationOverlay({
  width,
  height,
  annotations,
}: {
  width: number;
  height: number;
  annotations: CoverMapAnnotations;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {annotations.paths.map((path) => (
        <PathSvgLayers key={path.id} path={path} width={width} height={height} />
      ))}
    </svg>
  );
}

// ── Inline editor ────────────────────────────────────────────────────────────
// Two interaction modes share the same SVG canvas:
//   • Drafting (drafting !== null) — clicks add points, double-click finishes.
//     Saved paths render passively as background; their handles are hidden.
//   • Select   (drafting === null) — clicks select paths/points; drag handles
//     to reposition; Delete key or buttons remove the selected point/path.
function WorkPathEditor({
  projectId,
  croppedUrl,
  initialAnnotations,
  onClose,
  embedded = false,
}: {
  projectId: string;
  croppedUrl: string;
  initialAnnotations: CoverMapAnnotations | null;
  onClose: () => void;
  /** When true, render without an outer border and skip the duplicate
   *  "Work Path Editor" header — the parent card handles framing. */
  embedded?: boolean;
}) {
  const [saveState, saveAction] = useActionState(saveProjectCoverMapAnnotations, initialState);

  // Working set of paths the user is editing (initial + new ones).
  const [paths, setPaths] = useState<AnnotationPath[]>(
    () => initialAnnotations?.paths.map((p) => ({ ...p, points: [...p.points] })) ?? []
  );
  // Auto-start a draft only when there were no initial paths — otherwise the
  // user lands in select mode and can edit existing paths.
  const [drafting, setDrafting] = useState<AnnotationPath | null>(() => {
    if (initialAnnotations && initialAnnotations.paths.length > 0) return null;
    return makeBlankPath();
  });

  // Selection — only meaningful when not drafting.
  const [selectedPathId,   setSelectedPathId]   = useState<string | null>(null);
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // ref-based drag tracking so pointermove doesn't churn React state for
  // identification (the actual point coords still go through setPaths).
  const dragRef = useRef<{ pathId: string; pointIdx: number; pointerId: number } | null>(null);

  // Close the editor on successful save (parent revalidates with fresh data).
  useEffect(() => {
    if (saveState.success && !saveState.error) onClose();
  }, [saveState, onClose]);

  const totalPoints = useMemo(
    () => paths.reduce((n, p) => n + p.points.length, 0) + (drafting?.points.length ?? 0),
    [paths, drafting]
  );
  const pathCount   = paths.length + (drafting && drafting.points.length >= 2 ? 1 : 0);
  const atPathLimit  = pathCount  >= ANNOTATION_MAX_PATHS;
  const atPointLimit = !!drafting && drafting.points.length >= ANNOTATION_MAX_POINTS_PER_PATH;

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  const clientToNormalized = useCallback((clientX: number, clientY: number): AnnotationPoint | null => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top)  / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPathId(null);
    setSelectedPointIdx(null);
  }, []);

  // ── Drafting handlers ──────────────────────────────────────────────────────
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.detail !== 1) return; // skip the second click of a dblclick
      if (drafting) {
        if (atPointLimit) return;
        const pt = clientToNormalized(e.clientX, e.clientY);
        if (!pt) return;
        setDrafting((d) => (d ? { ...d, points: [...d.points, pt] } : d));
        return;
      }
      // Select mode — empty-canvas click clears selection.
      clearSelection();
    },
    [drafting, atPointLimit, clientToNormalized, clearSelection]
  );

  const finishDraft = useCallback(() => {
    if (!drafting) return;
    if (drafting.points.length < 2) {
      setDrafting(null);
      return;
    }
    setPaths((prev) => [...prev, drafting]);
    setDrafting(null);
    clearSelection();
  }, [drafting, clearSelection]);

  const handleDoubleClick = useCallback(() => {
    if (!drafting) return;
    finishDraft();
  }, [drafting, finishDraft]);

  const handleUndoLastPoint = useCallback(() => {
    if (!drafting || drafting.points.length === 0) return;
    setDrafting((d) => (d ? { ...d, points: d.points.slice(0, -1) } : d));
  }, [drafting]);

  const handleCancelDraft = useCallback(() => setDrafting(null), []);

  const handleNewPath = useCallback(() => {
    if (atPathLimit) return;
    clearSelection();
    setDrafting(makeBlankPath());
  }, [atPathLimit, clearSelection]);

  const handleClearAll = useCallback(() => {
    setPaths([]);
    setDrafting(null);
    clearSelection();
  }, [clearSelection]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const selectPath = useCallback((pathId: string) => {
    setSelectedPathId(pathId);
    setSelectedPointIdx(null);
  }, []);

  const selectPoint = useCallback((pathId: string, pointIdx: number) => {
    setSelectedPathId(pathId);
    setSelectedPointIdx(pointIdx);
  }, []);

  // ── Deletion ───────────────────────────────────────────────────────────────
  const deletePath = useCallback((pathId: string) => {
    setPaths((prev) => prev.filter((p) => p.id !== pathId));
    clearSelection();
  }, [clearSelection]);

  const deletePoint = useCallback((pathId: string, pointIdx: number) => {
    setPaths((prev) => {
      const idx = prev.findIndex((p) => p.id === pathId);
      if (idx < 0) return prev;
      const path = prev[idx];
      if (pointIdx < 0 || pointIdx >= path.points.length) return prev;
      const newPoints = path.points.filter((_, i) => i !== pointIdx);
      // Path no longer valid (< 2 points) → drop it entirely.
      if (newPoints.length < 2) return prev.filter((_, i) => i !== idx);
      const next = prev.slice();
      next[idx] = { ...path, points: newPoints };
      return next;
    });
    setSelectedPointIdx(null);
  }, []);

  // Auto-clear selection if the targeted path/point no longer exists.
  useEffect(() => {
    if (selectedPathId === null) return;
    const path = paths.find((p) => p.id === selectedPathId);
    if (!path) {
      clearSelection();
      return;
    }
    if (selectedPointIdx !== null && selectedPointIdx >= path.points.length) {
      setSelectedPointIdx(null);
    }
  }, [paths, selectedPathId, selectedPointIdx, clearSelection]);

  // ── Keyboard delete ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (drafting) return;
      if (selectedPathId === null) return;
      e.preventDefault();
      if (selectedPointIdx !== null) deletePoint(selectedPathId, selectedPointIdx);
      else                            deletePath(selectedPathId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drafting, selectedPathId, selectedPointIdx, deletePoint, deletePath]);

  // ── Style editing (Phase I) ────────────────────────────────────────────────
  // Live updates to the selected path's style fields. The change goes straight
  // into `paths`, which feeds both the SVG preview and the JSON payload.
  const selectedPath = useMemo(
    () => (selectedPathId ? paths.find((p) => p.id === selectedPathId) ?? null : null),
    [paths, selectedPathId]
  );

  const patchPath = useCallback(
    (pathId: string, patch: Partial<AnnotationPath>) => {
      setPaths((prev) => prev.map((p) => (p.id === pathId ? { ...p, ...patch } : p)));
    },
    []
  );

  // ── Pointer drag for handle repositioning ──────────────────────────────────
  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, pathId: string, pointIdx: number) => {
      if (drafting) return;
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      dragRef.current = { pathId, pointIdx, pointerId: e.pointerId };
      selectPoint(pathId, pointIdx);
    },
    [drafting, selectPoint]
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, pathId: string, pointIdx: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.pointerId !== e.pointerId) return;
      if (drag.pathId !== pathId || drag.pointIdx !== pointIdx) return;
      const pt = clientToNormalized(e.clientX, e.clientY);
      if (!pt) return;
      setPaths((prev) => prev.map((p) => p.id === pathId
        ? { ...p, points: p.points.map((q, i) => i === pointIdx ? pt : q) }
        : p
      ));
    },
    [clientToNormalized]
  );

  const onHandlePointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  }, []);

  // ── Payload ────────────────────────────────────────────────────────────────
  const payload: CoverMapAnnotations = {
    paths: [
      ...paths,
      ...(drafting && drafting.points.length >= 2 ? [drafting] : []),
    ],
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form
      action={saveAction}
      className={embedded ? "space-y-3" : "rounded-lg p-3 space-y-3 border border-[#E5E7EB] bg-[#F8F9FB]"}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="hidden"
        name="annotations_json"
        value={payload.paths.length > 0 ? JSON.stringify(payload) : ""}
      />

      {/* Standalone mode shows its own title + status. Embedded mode lets
          the parent card own the title and shows the live count alone,
          right-aligned, so the user still sees draft/saved totals. */}
      {embedded ? (
        <p className="text-xs text-[#6B7280] text-right">
          {pathCount} path{pathCount === 1 ? "" : "s"} · {totalPoints} point
          {totalPoints === 1 ? "" : "s"}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#6B7280]">Work Path Editor</p>
          <p className="text-xs text-[#6B7280]">
            {pathCount} path{pathCount === 1 ? "" : "s"} · {totalPoints} point
            {totalPoints === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <div
        className="relative mx-auto"
        style={{
          width: "100%",
          maxWidth: EDITOR_W,
          aspectRatio: `${EDITOR_W} / ${EDITOR_H}`,
        }}
      >
        <Image
          src={croppedUrl}
          alt="Cropped cover map"
          fill
          unoptimized
          sizes="560px"
          style={{ objectFit: "contain", pointerEvents: "none" }}
        />

        <svg
          ref={svgRef}
          viewBox={`0 0 ${EDITOR_W} ${EDITOR_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          onClick={handleSvgClick}
          onDoubleClick={handleDoubleClick}
          style={{
            position: "absolute",
            inset: 0,
            cursor: drafting ? "crosshair" : "default",
            background: "transparent",
            // Suppress browser touch gestures (pinch/scroll) while dragging.
            touchAction: "none",
          }}
        >
          {/* Saved paths */}
          {paths.map((p) => {
            const isSelected = !drafting && p.id === selectedPathId;
            const dimmed     = !drafting && selectedPathId !== null && !isSelected;
            const pointsAttr = p.points
              .map((pt) => `${pt.x * EDITOR_W},${pt.y * EDITOR_H}`)
              .join(" ");
            const resolved      = getGRANTEDWorkPathStyle(p);
            const haloBaseWidth = resolved.strokeWidth;
            return (
              <g key={p.id}>
                {/* Selection halo behind every layer */}
                {isSelected && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeOpacity={0.25}
                    strokeWidth={haloBaseWidth + 6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {/* Wider transparent hit area for easier path-clicking */}
                {!drafting && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(haloBaseWidth + 8, 14)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectPath(p.id);
                    }}
                  />
                )}
                {/* Visible outline + centerline (Phase I) */}
                <PathSvgLayers
                  path={p}
                  width={EDITOR_W}
                  height={EDITOR_H}
                  centerlineOpacity={dimmed ? 0.4 : 1}
                />
                {/* Handles — only the selected path shows them in select mode */}
                {isSelected && p.points.map((pt, idx) => {
                  const isPointSelected = selectedPointIdx === idx;
                  return (
                    <circle
                      key={idx}
                      cx={pt.x * EDITOR_W}
                      cy={pt.y * EDITOR_H}
                      r={POINT_RADIUS + (isPointSelected ? 2 : 0)}
                      fill={isPointSelected ? "white" : resolved.stroke}
                      stroke={isPointSelected ? resolved.stroke : "white"}
                      strokeWidth={2}
                      style={{ cursor: "grab", touchAction: "none" }}
                      onPointerDown={(e) => onHandlePointerDown(e, p.id, idx)}
                      onPointerMove={(e) => onHandlePointerMove(e, p.id, idx)}
                      onPointerUp={onHandlePointerUp}
                      onPointerCancel={onHandlePointerUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectPoint(p.id, idx);
                      }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Draft path — passive (no drag/select) */}
          {drafting && drafting.points.length > 0 && (
            <>
              {drafting.points.length >= 2 && (
                <PathSvgLayers
                  path={drafting}
                  width={EDITOR_W}
                  height={EDITOR_H}
                />
              )}
              {drafting.points.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x * EDITOR_W}
                  cy={pt.y * EDITOR_H}
                  r={POINT_RADIUS}
                  fill={WORK_PATH_COLOR}
                  stroke="white"
                  strokeWidth={1}
                  style={{ pointerEvents: "none" }}
                />
              ))}
            </>
          )}
        </svg>
      </div>

      <p className="text-xs text-[#6B7280] text-center">
        {drafting
          ? "Click to add points. Double-click to finish a path."
          : selectedPointIdx !== null
            ? "Drag the handle to move. Press Delete to remove the point."
            : selectedPathId !== null
              ? "Path selected. Press Delete to remove it, or click a handle to edit a point."
              : "Click a path to select it. Select a path to adjust dash pattern or thickness."}
      </p>

      {/* Phase I — Style panel for the currently selected path */}
      {!drafting && selectedPath && (
        <StylePanel
          path={selectedPath}
          onChange={(patch) => patchPath(selectedPath.id, patch)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SaveBtn />

        {drafting && (
          <>
            <button
              type="button"
              onClick={finishDraft}
              disabled={drafting.points.length < 2}
              className={BTN_PRIMARY}
            >
              Finish Path
            </button>
            <button
              type="button"
              onClick={handleUndoLastPoint}
              disabled={drafting.points.length === 0}
              className={BTN_SECONDARY}
            >
              Undo Point
            </button>
            <button
              type="button"
              onClick={handleCancelDraft}
              className={BTN_GHOST}
            >
              Cancel Path
            </button>
          </>
        )}

        {!drafting && (
          <>
            <button
              type="button"
              onClick={handleNewPath}
              disabled={atPathLimit}
              className={BTN_SECONDARY}
            >
              New Path
            </button>
            {selectedPointIdx !== null && selectedPathId !== null && (
              <button
                type="button"
                onClick={() => deletePoint(selectedPathId, selectedPointIdx)}
                className={BTN_DESTRUCTIVE}
              >
                Delete Point
              </button>
            )}
            {selectedPathId !== null && (
              <button
                type="button"
                onClick={() => deletePath(selectedPathId)}
                className={BTN_DESTRUCTIVE}
              >
                Delete Path
              </button>
            )}
          </>
        )}

        {paths.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className={BTN_DESTRUCTIVE}
          >
            Clear All
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className={BTN_GHOST}
        >
          Cancel
        </button>

        {saveState.error && (
          <span className="text-xs text-[#DC2626] ml-2">{saveState.error}</span>
        )}
      </div>
    </form>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
    >
      {pending ? "Saving…" : "Save Path"}
    </button>
  );
}

// ── Phase K — GRANTED Work Path Style panel ─────────────────────────────────
// Two locked-down controls: dash pattern preset and thickness preset. Color,
// line style, render mode, and outline are all hard-coded by the GRANTED
// standard and not user-editable.
function StylePanel({
  path,
  onChange,
}: {
  path: AnnotationPath;
  onChange: (patch: Partial<AnnotationPath>) => void;
}) {
  return (
    <div className="rounded-lg p-3 space-y-3 bg-[#F8F9FB] border border-[#E5E7EB]">
      <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">GRANTED Work Path Style</p>

      <SegmentedRow
        label="Dash Pattern"
        value={path.workPathPreset ?? "standard"}
        options={[
          { value: "tight",    label: "Tight"    },
          { value: "standard", label: "Standard" },
          { value: "loose",    label: "Loose"    },
        ]}
        onChange={(v) => onChange({ workPathPreset: v as WorkPathPreset })}
      />

      <SegmentedRow
        label="Thickness"
        value={path.workPathThickness ?? "standard"}
        options={[
          { value: "thin",     label: "Thin"     },
          { value: "standard", label: "Standard" },
          { value: "heavy",    label: "Heavy"    },
        ]}
        onChange={(v) => onChange({ workPathThickness: v as WorkPathThickness })}
      />

      <p className="text-xs text-[#6B7280]">
        Work paths always render as black dashed lines for consistency.
      </p>
    </div>
  );
}

type SegmentedOption<T extends string> = { value: T; label: string };

function SegmentedRow<T extends string>({
  label, value, options, onChange,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider w-28 shrink-0">{label}</label>}
      <div className="inline-flex rounded-lg bg-[#F8F9FB] border border-[#E5E7EB] p-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-white text-[#111827] shadow-sm cursor-default"
                  : "text-[#6B7280] hover:text-[#111827] cursor-pointer"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function makeBlankPath(): AnnotationPath {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as Crypto).randomUUID()
      : `p-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    points: [],
    ...ANNOTATION_DEFAULTS,
  };
}

// ── Shared SVG renderer for a single path ────────────────────────────────────
// Phase K — always renders the GRANTED standard work path: a single dashed
// black stroke whose thickness and dash pattern come from the path's preset
// and thickness fields. Used by both AnnotationOverlay (read-only) and
// WorkPathEditor's saved-path render loop.
function PathSvgLayers({
  path,
  width,
  height,
  centerlineOpacity = 1,
  pointerEvents = "none",
}: {
  path: AnnotationPath;
  width:  number;
  height: number;
  centerlineOpacity?: number;
  pointerEvents?: "none" | "auto" | "stroke";
}) {
  const pointsAttr = path.points
    .map((pt) => `${pt.x * width},${pt.y * height}`)
    .join(" ");

  const style = getGRANTEDWorkPathStyle(path);

  return (
    <polyline
      points={pointsAttr}
      fill="none"
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      strokeOpacity={centerlineOpacity}
      strokeDasharray={svgDashArrayFor(style.lineStyle, style.dashLength, style.gapLength)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents }}
    />
  );
}

// ── Phase 2 — Crop Editor ────────────────────────────────────────────────────
// A fixed 1.83-ratio viewport with the full raster pannable + zoomable behind
// it. Math is done entirely in CSS pixels relative to the live viewport size
// (via ResizeObserver) and converted to raster pixel coords only at submit.
//
// Coordinate model: the raster <img> is positioned at the top-left of the
// viewport and transformed by `translate(tx, ty) scale(s)`. So:
//   raster pixel (rx, ry) → CSS (rx * s + tx, ry * s + ty) inside the viewport
// At submit the visible cropBox in raster pixels is:
//   { left: -tx/s, top: -ty/s, width: vw/s, height: vh/s }
// We clamp tx/ty so the viewport never shows blank space, and clamp s so the
// raster always fully covers the viewport.

// Server-side default Y bias — keep in sync with COVER_MAP_CROP_Y_BIAS in
// actions.ts so "Reset" lands on the same auto-crop as a fresh upload.
const CROP_EDITOR_Y_BIAS  = 0.40;
const CROP_EDITOR_RATIO   = 550 / 300;
const CROP_EDITOR_ZOOM_STEP = 1.25;
const CROP_EDITOR_MAX_ZOOM_X = 4;   // s_max = 4 × s_min

function computeAutoCropBox(rW: number, rH: number): CropBox {
  let cropW = rW;
  let cropH = rH;
  const r = rW / rH;
  if (r > CROP_EDITOR_RATIO) {
    cropH = rH;
    cropW = Math.round(rH * CROP_EDITOR_RATIO);
  } else if (r < CROP_EDITOR_RATIO) {
    cropW = rW;
    cropH = Math.round(rW / CROP_EDITOR_RATIO);
  }
  return {
    left:   Math.max(0, Math.round((rW - cropW) / 2)),
    top:    Math.max(0, Math.round((rH - cropH) * CROP_EDITOR_Y_BIAS)),
    width:  cropW,
    height: cropH,
  };
}

function clampCropOffset(s: number, vw: number, vh: number, rW: number, rH: number, tx: number, ty: number) {
  // At s ≥ s_min, rW*s ≥ vw and rH*s ≥ vh, so minTx/minTy are non-positive.
  const minTx = vw - rW * s;
  const minTy = vh - rH * s;
  return {
    tx: Math.max(minTx, Math.min(0, tx)),
    ty: Math.max(minTy, Math.min(0, ty)),
  };
}

function CropSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
    >
      {pending ? "Saving…" : "Save Crop"}
    </button>
  );
}

function CropEditor({
  projectId,
  rasterUrl,
  rasterWidth,
  rasterHeight,
  initialCropBox,
  hasAnnotations,
  onClose,
}: {
  projectId:      string;
  rasterUrl:      string;
  rasterWidth:    number;
  rasterHeight:   number;
  initialCropBox: CropBox | null;
  hasAnnotations: boolean;
  onClose:        () => void;
}) {
  const [saveState, saveAction] = useActionState(saveProjectCoverMapCrop, initialState);

  // Live viewport size in CSS px. Tracked via ResizeObserver so the math
  // stays correct as the parent column reflows.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setVw(rect.width);
      setVh(rect.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // s_min covers the viewport completely; below it, blank space appears.
  const sMin = useMemo(() => {
    if (!vw || !vh) return 1;
    return Math.max(vw / rasterWidth, vh / rasterHeight);
  }, [vw, vh, rasterWidth, rasterHeight]);
  const sMax = sMin * CROP_EDITOR_MAX_ZOOM_X;

  // Transform state — scale `s` plus pan offsets `tx`, `ty` in CSS px.
  const [s,  setS]  = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Track whether we've initialized from the persisted cropBox yet — we have
  // to wait for the viewport to be measured before the math is meaningful.
  const initRef = useRef(false);

  // Initial transform: derive from `initialCropBox` if present, otherwise the
  // server's auto-crop. Runs once after the first measure.
  useEffect(() => {
    if (initRef.current) return;
    if (!vw || !vh) return;
    const cb = initialCropBox ?? computeAutoCropBox(rasterWidth, rasterHeight);
    const initialS = Math.max(sMin, vw / cb.width);
    const initialTx = -cb.left * initialS;
    const initialTy = -cb.top  * initialS;
    const clamped = clampCropOffset(initialS, vw, vh, rasterWidth, rasterHeight, initialTx, initialTy);
    setS(initialS);
    setTx(clamped.tx);
    setTy(clamped.ty);
    initRef.current = true;
  }, [vw, vh, sMin, rasterWidth, rasterHeight, initialCropBox]);

  // Re-clamp pan whenever scale or viewport dims change — covers window
  // resizes after init, and any edge case where clamps tighten.
  useEffect(() => {
    if (!initRef.current || !vw || !vh) return;
    const clamped = clampCropOffset(s, vw, vh, rasterWidth, rasterHeight, tx, ty);
    if (clamped.tx !== tx) setTx(clamped.tx);
    if (clamped.ty !== ty) setTy(clamped.ty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, vw, vh, rasterWidth, rasterHeight]);

  // ── Pointer drag for pan ───────────────────────────────────────────────────
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = {
      pointerId: e.pointerId,
      startX:    e.clientX,
      startY:    e.clientY,
      startTx:   tx,
      startTy:   ty,
    };
  }, [tx, ty]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const nextTx = drag.startTx + (e.clientX - drag.startX);
    const nextTy = drag.startTy + (e.clientY - drag.startY);
    const c = clampCropOffset(s, vw, vh, rasterWidth, rasterHeight, nextTx, nextTy);
    setTx(c.tx);
    setTy(c.ty);
  }, [s, vw, vh, rasterWidth, rasterHeight]);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  }, []);

  // ── Zoom — anchor on viewport center so the focused content stays put ──────
  const zoomTo = useCallback((nextS: number) => {
    if (!vw || !vh) return;
    const clampedS = Math.min(sMax, Math.max(sMin, nextS));
    // Raster pixel currently under the viewport center.
    const centerRX = (vw / 2 - tx) / s;
    const centerRY = (vh / 2 - ty) / s;
    const newTx = vw / 2 - centerRX * clampedS;
    const newTy = vh / 2 - centerRY * clampedS;
    const c = clampCropOffset(clampedS, vw, vh, rasterWidth, rasterHeight, newTx, newTy);
    setS(clampedS);
    setTx(c.tx);
    setTy(c.ty);
  }, [s, tx, ty, vw, vh, sMin, sMax, rasterWidth, rasterHeight]);

  const onZoomOut = () => zoomTo(s / CROP_EDITOR_ZOOM_STEP);
  const onZoomIn  = () => zoomTo(s * CROP_EDITOR_ZOOM_STEP);

  const onReset = useCallback(() => {
    if (!vw || !vh) return;
    const cb       = computeAutoCropBox(rasterWidth, rasterHeight);
    const initialS = Math.max(sMin, vw / cb.width);
    const initialTx = -cb.left * initialS;
    const initialTy = -cb.top  * initialS;
    const c = clampCropOffset(initialS, vw, vh, rasterWidth, rasterHeight, initialTx, initialTy);
    setS(initialS);
    setTx(c.tx);
    setTy(c.ty);
  }, [vw, vh, sMin, rasterWidth, rasterHeight]);

  // ── Submit cropBox ─────────────────────────────────────────────────────────
  // Convert the live transform to raster pixel coordinates at submit time.
  // Round defensively and clamp into [0, raster - cropDim] to absorb any
  // floating-point drift — the server re-validates regardless.
  const cropBox: CropBox = useMemo(() => {
    if (!s || !vw || !vh) return { left: 0, top: 0, width: 0, height: 0 };
    const widthRaw  = vw / s;
    const heightRaw = vh / s;
    const width  = Math.max(1, Math.min(rasterWidth,  Math.round(widthRaw)));
    const height = Math.max(1, Math.min(rasterHeight, Math.round(heightRaw)));
    const left   = Math.max(0, Math.min(rasterWidth  - width,  Math.round(-tx / s)));
    const top    = Math.max(0, Math.min(rasterHeight - height, Math.round(-ty / s)));
    return { left, top, width, height };
  }, [s, tx, ty, vw, vh, rasterWidth, rasterHeight]);

  // Don't reveal the raster until the natural image has finished loading and
  // the transform has been initialized — otherwise the viewport flashes a
  // bare frame while the (potentially large) raster decodes.
  const [imageLoaded, setImageLoaded] = useState(false);
  const ready = initRef.current && imageLoaded && vw > 0 && vh > 0;

  // Close on successful save — the parent revalidates and shows the new crop.
  useEffect(() => {
    if (saveState.success && !saveState.error) onClose();
  }, [saveState, onClose]);

  return (
    <form action={saveAction} className="space-y-3">
      <input type="hidden" name="project_id"  value={projectId} />
      <input type="hidden" name="crop_left"   value={String(cropBox.left)}   />
      <input type="hidden" name="crop_top"    value={String(cropBox.top)}    />
      <input type="hidden" name="crop_width"  value={String(cropBox.width)}  />
      <input type="hidden" name="crop_height" value={String(cropBox.height)} />

      <div
        ref={viewportRef}
        className="relative mx-auto select-none overflow-hidden rounded-md bg-[#F8F9FB] border border-[#E5E7EB]"
        style={{
          width:        "100%",
          maxWidth:     EDITOR_W,
          aspectRatio:  `${EDITOR_W} / ${EDITOR_H}`,
          cursor:       dragRef.current ? "grabbing" : "grab",
          touchAction:  "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rasterUrl}
          alt="Cover map raster"
          width={rasterWidth}
          height={rasterHeight}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          style={{
            position:        "absolute",
            top:             0,
            left:            0,
            width:           rasterWidth,
            height:          rasterHeight,
            transform:       ready ? `translate(${tx}px, ${ty}px) scale(${s})` : "scale(0)",
            transformOrigin: "top left",
            pointerEvents:   "none",
            userSelect:      "none",
            opacity:         ready ? 1 : 0,
            transition:      "opacity 120ms linear",
            imageRendering:  "auto",
          }}
        />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-[12px] text-[#6B7280]">
            Loading map…
          </p>
        )}
      </div>

      <p className="text-[12px] text-[#6B7280] text-center">
        Drag to pan · use Zoom buttons to scale · the framed area is what will be saved.
      </p>

      {hasAnnotations && (
        <p className="text-xs rounded-lg p-2 text-center bg-[#EFF6FF] border border-[#1565C0]/30 text-[#1565C0]">
          Existing work paths will be reprojected into the new crop when saved.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={!ready || s <= sMin + 1e-6}
          className={BTN_SECONDARY}
        >
          Zoom Out
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={!ready || s >= sMax - 1e-6}
          className={BTN_SECONDARY}
        >
          Zoom In
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!ready}
          className={BTN_SECONDARY}
        >
          Reset
        </button>
        <CropSaveButton />
        <button
          type="button"
          onClick={onClose}
          className={BTN_GHOST}
        >
          Cancel
        </button>
      </div>

      {saveState.error && (
        <p className="text-xs text-[#DC2626] text-center">{saveState.error}</p>
      )}
    </form>
  );
}
