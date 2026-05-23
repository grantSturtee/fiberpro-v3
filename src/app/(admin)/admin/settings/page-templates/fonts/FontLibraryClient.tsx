"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTemplateFont, deleteTemplateFont, type TemplateFont, type TemplateFontActionState } from "@/lib/actions/templateFonts";

const initial: TemplateFontActionState = { error: null };

export function FontLibraryClient({ initialFonts }: { initialFonts: TemplateFont[] }) {
  const [fonts, setFonts] = useState<TemplateFont[]>(initialFonts);

  // ── Upload form ───────────────────────────────────────────────────────────
  const [uploadState, uploadAction, uploadPending] = useActionState(createTemplateFont, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const prevUploadRef = useRef(uploadState);

  useEffect(() => {
    if (uploadState === prevUploadRef.current) return;
    prevUploadRef.current = uploadState;
    if (uploadState.success && uploadState.font) {
      setFonts((prev) => [...prev, uploadState.font!]);
      formRef.current?.reset();
    }
  }, [uploadState]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTemplateFont, initial);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const prevDeleteRef = useRef(deleteState);

  useEffect(() => {
    if (deleteState === prevDeleteRef.current) return;
    prevDeleteRef.current = deleteState;
    if (deleteState.success && deletingId) {
      setFonts((prev) => prev.filter((f) => f.id !== deletingId));
      setDeletingId(null);
    }
  }, [deleteState, deletingId]);

  return (
    <div className="space-y-6">

      {/* Uploaded fonts list */}
      <div>
        <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-2">
          Uploaded fonts
        </p>
        {fonts.length === 0 ? (
          <p className="text-xs text-muted py-3">No fonts uploaded yet.</p>
        ) : (
          <div className="rounded-lg overflow-hidden border border-surface">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "#f8f9fb", borderBottom: "1px solid #e9ecef" }}>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-dim">Name</th>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-dim">File</th>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-dim">Ext</th>
                  <th className="px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wide text-dim"></th>
                </tr>
              </thead>
              <tbody>
                {fonts.map((font, i) => (
                  <tr
                    key={font.id}
                    style={{ borderBottom: i < fonts.length - 1 ? "1px solid #f0f2f5" : undefined }}
                  >
                    <td className="px-3 py-2 font-medium text-ink">{font.display_name}</td>
                    <td className="px-3 py-2 text-muted font-mono text-[10px] max-w-[200px] truncate">{font.original_filename}</td>
                    <td className="px-3 py-2">
                      <span className="text-[9px] font-bold uppercase rounded px-1 py-0.5 bg-surface text-dim">
                        {font.file_ext}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <form action={deleteAction} onSubmit={() => setDeletingId(font.id)}>
                        <input type="hidden" name="font_id" value={font.id} />
                        <button
                          type="submit"
                          disabled={deletePending && deletingId === font.id}
                          className="text-[10px] text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
                        >
                          {deletePending && deletingId === font.id ? "Removing…" : "Remove"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deleteState.error && (
          <p className="mt-1.5 text-xs text-red-600">{deleteState.error}</p>
        )}
      </div>

      {/* Upload new font */}
      <div>
        <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-2">
          Add new font
        </p>
        <form ref={formRef} action={uploadAction} className="space-y-3">
          <div>
            <label className="block text-[10px] text-muted mb-0.5">Font name</label>
            <input
              type="text"
              name="display_name"
              required
              placeholder="e.g. Roboto Regular"
              maxLength={80}
              className="w-full rounded border bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: "#d4dde4" }}
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-0.5">Font file (.ttf or .otf)</label>
            <input
              type="file"
              name="file"
              required
              accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype"
              className="w-full text-xs text-ink file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-surface file:text-dim hover:file:bg-surface/80"
            />
          </div>
          {!uploadPending && uploadState.error && (
            <p className="text-xs text-red-600">{uploadState.error}</p>
          )}
          {!uploadPending && uploadState.success && (
            <p className="text-xs text-emerald-600">Font uploaded ✓</p>
          )}
          <button
            type="submit"
            disabled={uploadPending}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            {uploadPending ? "Uploading…" : "Upload font"}
          </button>
        </form>
      </div>

    </div>
  );
}
