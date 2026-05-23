"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import {
  uploadCoverPdfVersion,
  makeCoverVersionLive,
} from "@/app/(admin)/admin/settings/covers/[id]/overlay/actions";

export type CoverVersion = {
  id: string;
  filename: string;
  is_live: boolean;
  uploaded_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CoverVersionsPanel({
  templateId,
  initialVersions,
}: {
  templateId: string;
  initialVersions: CoverVersion[];
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [makeLive, setMakeLive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLive = versions.some((v) => v.is_live);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    // Auto-check "make live" when there is no live version yet.
    setMakeLive(!hasLive);
    setError(null);
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("template_id", templateId);
    fd.append("file", pendingFile);
    fd.append("make_live", String(makeLive));

    const result = await uploadCoverPdfVersion(fd);
    setUploading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Reload to reflect updated version list from server.
    window.location.reload();
  };

  const handleMakeLive = (versionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await makeCoverVersionLive(versionId, templateId);
      if (result.error) {
        setError(result.error);
      } else {
        window.location.reload();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Version list */}
      {versions.length > 0 ? (
        <div
          className="divide-y divide-surface rounded-xl overflow-hidden"
          style={{ border: "1px solid #e3e9ec" }}
        >
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink truncate">{v.filename}</span>
                  {v.is_live && (
                    <span
                      className="text-[10px] font-semibold rounded px-1.5 py-0.5"
                      style={{
                        background: "#f0faf4",
                        color: "#1a7f47",
                        border: "1px solid #b7e4c7",
                      }}
                    >
                      LIVE
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">{formatDate(v.uploaded_at)}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!v.is_live && (
                  <button
                    type="button"
                    onClick={() => handleMakeLive(v.id)}
                    disabled={isPending}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    Make Live
                  </button>
                )}
                {v.is_live && (
                  <Link
                    href={`/admin/settings/covers/${templateId}/overlay`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit Fields
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted italic">No PDF versions uploaded yet.</p>
      )}

      {/* Upload new version */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "#f7f9fc", border: "1px solid #e3e9ec" }}
      >
        <p className="text-xs font-semibold text-ink">Upload New Version</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="w-full text-sm text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded file:text-xs file:font-medium file:bg-surface file:text-ink file:border file:border-solid file:border-rule hover:file:bg-wash cursor-pointer"
        />

        {pendingFile && (
          <div className="space-y-2.5">
            {hasLive && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={makeLive}
                  onChange={(e) => setMakeLive(e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-sm text-dim">Make this the live version</span>
              </label>
            )}
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
            >
              {uploading ? "Uploading…" : "Upload Version"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
