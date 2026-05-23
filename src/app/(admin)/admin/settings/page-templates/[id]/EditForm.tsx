"use client";

import { useState, useEffect, useRef } from "react";
import { useActionState } from "react";
import { updatePageTemplate, deletePageTemplate, type PageTemplateActionState } from "../actions";

const initial: PageTemplateActionState = { error: null };

const WRAPPER_TYPES = new Set(["tcp_wrapper", "tcd_wrapper", "sld_wrapper"]);

type PlacementBox = { x: number; y: number; width: number; height: number } | null;

type Props = {
  id: string;
  name: string;
  templateType: string;
  storagePath: string | null;
  isActive: boolean;
  placementBox: PlacementBox;
};

export function EditForm({
  id, name, templateType, storagePath, isActive,
  placementBox,
}: Props) {
  const [updateState, updateAction, updatePending] = useActionState(updatePageTemplate, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deletePageTemplate, initial);

  // File state: savedFileName tracks what's actually stored; fileName is a pending selection.
  const [fileName,      setFileName]      = useState<string | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(
    storagePath?.split("/").pop() ?? null
  );

  const [nameVal,           setNameVal]           = useState(name);
  const [activeVal,         setActiveVal]         = useState(isActive);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isWrapper = WRAPPER_TYPES.has(templateType);

  // Placement box (wrapper only)
  const [boxX, setBoxX] = useState(placementBox?.x?.toString()      ?? "");
  const [boxY, setBoxY] = useState(placementBox?.y?.toString()      ?? "");
  const [boxW, setBoxW] = useState(placementBox?.width?.toString()  ?? "");
  const [boxH, setBoxH] = useState(placementBox?.height?.toString() ?? "");
  const hasAnyBox = boxX !== "" || boxY !== "" || boxW !== "" || boxH !== "";

  // Dirty detection: compare current controlled state against server-provided initial values.
  // After revalidatePath the RSC sends fresh props, so initialX props stay in sync post-save.
  const isFormDirty =
    nameVal !== name ||
    fileName !== null ||
    activeVal !== isActive ||
    boxX !== (placementBox?.x?.toString()      ?? "") ||
    boxY !== (placementBox?.y?.toString()      ?? "") ||
    boxW !== (placementBox?.width?.toString()  ?? "") ||
    boxH !== (placementBox?.height?.toString() ?? "");

  // After a successful save: promote fileName → savedFileName, auto-dismiss success banner.
  const [showSaved, setShowSaved] = useState(false);
  const prevUpdateState = useRef(updateState);
  useEffect(() => {
    if (updateState === prevUpdateState.current) return;
    prevUpdateState.current = updateState;
    if (updateState.success) {
      if (fileName) {
        setSavedFileName(fileName);
        setFileName(null);
      }
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 3500);
      return () => clearTimeout(t);
    }
  }, [updateState, fileName]);

  // Strip the leading timestamp from a storage filename for clean display.
  function displayFileName(raw: string): string {
    return raw.replace(/^\d+_/, "");
  }

  return (
    <div className="space-y-5">
      <form action={updateAction} className="space-y-5">
        <input type="hidden" name="id"        value={id} />
        <input type="hidden" name="is_active" value={String(activeVal)} />

        {/* ── Banners ─────────────────────────────────────────────────── */}
        {updateState.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
            {updateState.error}
          </p>
        )}
        {showSaved && (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2.5">Saved.</p>
        )}

        {/* Narrow form fields — constrained to keep inputs from stretching too wide */}
        <div className="max-w-lg space-y-5">

          {/* ── Name ──────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* ── PDF File ───────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">PDF File</label>
            {savedFileName ? (
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <span className="text-xs text-muted flex-shrink-0">Current:</span>
                <span
                  className="text-xs font-mono text-ink truncate"
                  title={savedFileName}
                  style={{ maxWidth: 260 }}
                >
                  {displayFileName(savedFileName)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2 inline-block">
                No file uploaded yet
              </p>
            )}
            <label className="flex items-center gap-3 rounded-lg border border-dashed border-rule bg-canvas px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors">
              <input
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <span className="text-xs text-muted flex-1 min-w-0 truncate">
                {fileName
                  ? `${displayFileName(fileName)} — click Save to upload`
                  : savedFileName
                    ? "Click to replace PDF (max 20 MB)"
                    : "Click to upload PDF (max 20 MB)"}
              </span>
              <span className="flex-shrink-0 text-xs font-medium text-primary">Browse</span>
            </label>
          </div>

          {/* ── Placement Box (wrapper types only) ────────────────────── */}
          {isWrapper && (
            <div className="border-t border-surface pt-5">
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-xs font-medium text-ink">Placement Box</label>
                {hasAnyBox && (
                  <button
                    type="button"
                    onClick={() => { setBoxX(""); setBoxY(""); setBoxW(""); setBoxH(""); }}
                    className="text-[10px] text-muted hover:text-dim transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-xs text-muted mb-3">
                Area inside the wrapper where the source drawing is placed.
                72 pt = 1 inch; origin is bottom-left of page.
                Leave all four fields empty to remove the placement box.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { label: "X",      sub: "left edge",   name: "placement_box_x",      val: boxX, set: setBoxX, placeholder: "e.g. 72"  },
                    { label: "Y",      sub: "bottom edge", name: "placement_box_y",      val: boxY, set: setBoxY, placeholder: "e.g. 108" },
                    { label: "Width",  sub: "",            name: "placement_box_width",  val: boxW, set: setBoxW, placeholder: "e.g. 468" },
                    { label: "Height", sub: "",            name: "placement_box_height", val: boxH, set: setBoxH, placeholder: "e.g. 612" },
                  ] as const
                ).map(({ label, sub, name: fieldName, val, set, placeholder }) => (
                  <div key={fieldName}>
                    <label className="block text-[10px] font-medium text-dim mb-1">
                      {label}
                      {sub && <span className="font-normal text-faint"> ({sub})</span>}
                    </label>
                    <input
                      type="number"
                      name={fieldName}
                      min={fieldName === "placement_box_x" || fieldName === "placement_box_y" ? "0" : "1"}
                      step="any"
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink font-mono placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Status ────────────────────────────────────────────────── */}
          <div className="border-t border-surface pt-5">
            <label className="block text-xs font-medium text-ink mb-2">Status</label>
            <div className="flex rounded-lg border border-rule overflow-hidden text-xs font-semibold w-fit">
              <button
                type="button"
                onClick={() => setActiveVal(true)}
                className={`px-3 py-1.5 transition-colors ${
                  activeVal
                    ? "bg-emerald-500 text-white cursor-default"
                    : "bg-canvas text-dim hover:bg-surface"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setActiveVal(false)}
                className={`px-3 py-1.5 border-l border-rule transition-colors ${
                  !activeVal
                    ? "bg-amber-500 text-white cursor-default"
                    : "bg-canvas text-dim hover:bg-surface"
                }`}
              >
                Archived
              </button>
            </div>
          </div>

        </div>{/* end narrow wrapper */}

        {/* ── Save / delete row ──────────────────────────────────────── */}
        <div className="max-w-lg flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-600 hover:text-red-700 transition-colors"
          >
            Delete template…
          </button>
          <button
            type="submit"
            disabled={updatePending || !isFormDirty}
            aria-disabled={!isFormDirty}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isFormDirty
                ? "text-white"
                : "text-dim bg-surface border border-rule cursor-default"
            } disabled:opacity-60`}
            style={isFormDirty
              ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }
              : undefined}
          >
            {updatePending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* ── Delete confirm modal ───────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div
            className="bg-canvas rounded-xl p-6 shadow-lg w-full max-w-sm mx-4"
            style={{ boxShadow: "0 4px 32px rgba(43,52,55,0.18)" }}
          >
            <p className="text-sm font-medium text-ink mb-1">
              Delete this template permanently?
            </p>
            <p className="text-xs text-muted mb-5">
              This will also remove the stored PDF file. Blueprints that reference this
              template will have their slot cleared.
            </p>
            {deleteState.error && (
              <p className="text-xs text-red-600 mb-3">{deleteState.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-ink bg-surface border border-rule hover:bg-rule transition-colors"
              >
                Cancel
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {deletePending ? "Deleting…" : "Delete"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
