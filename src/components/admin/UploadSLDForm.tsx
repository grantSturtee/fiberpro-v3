"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadSLD,
  deleteSLDFile,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";

// ── Delete SLD Button ─────────────────────────────────────────────────────────

export function DeleteSLDButton({
  fileId,
  projectId,
  fileName,
}: {
  fileId: string;
  projectId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file_id", fileId);
      fd.append("project_id", projectId);
      const result = await deleteSLDFile({ error: null }, fd);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title={`Delete ${fileName}`}
        aria-label={`Delete ${fileName}`}
        className="p-1.5 rounded text-muted hover:text-red-600 disabled:opacity-50 transition-colors"
      >
        {/* Trash icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3 4l.8 9.5a.5.5 0 0 0 .5.5h7.4a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-red-600 whitespace-nowrap z-10 bg-card px-2 py-1 rounded shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Upload SLD Form ───────────────────────────────────────────────────────────
// Supports multiple-file selection. Uploads immediately on selection (no button).
// Resets the picker after all files are uploaded so the zone is always ready.

export function UploadSLDForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("project_id", projectId);
        fd.append("file", file);
        const result: AdminActionState = await uploadSLD({ error: null }, fd);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      // Reset input so picker zone is ready for the next selection
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {/* Hidden file input — outside the click zone to prevent label re-click propagation */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          e.stopPropagation();
          handleFiles(e.target.files);
        }}
      />

      {/* Click zone: div avoids the OS-picker re-click event that <label> re-dispatches */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose PDF files to upload"
        aria-disabled={isPending}
        className="flex items-center gap-3 w-full px-3.5 py-3 rounded-lg border-2 border-dashed transition-colors"
        style={{
          borderColor: isPending ? "#005bc1" : "#d4dde4",
          background: isPending ? "rgba(0,91,193,0.04)" : undefined,
          cursor: isPending ? "default" : "pointer",
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isPending) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isPending) {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current?.click();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {isPending ? (
            <p className="text-sm text-primary font-medium">Uploading…</p>
          ) : (
            <p className="text-sm text-muted">Choose PDF(s) to upload</p>
          )}
          <p className="text-xs text-faint mt-0.5">
            {isPending ? "Please wait" : "PDF only · max 50 MB · multiple files OK"}
          </p>
        </div>
        {!isPending && (
          <span className="text-xs font-medium text-primary flex-shrink-0">Browse</span>
        )}
        {isPending && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden />
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
