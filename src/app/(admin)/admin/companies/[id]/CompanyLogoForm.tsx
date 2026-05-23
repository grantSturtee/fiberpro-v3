"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import {
  uploadCompanyLogo,
  removeCompanyLogo,
  type CompanyActionState,
} from "./actions";

const initialState: CompanyActionState = { error: null };

const ACCEPTED = "image/png,image/jpeg,image/webp";
const ACCEPTED_LABEL = "PNG, JPEG, or WebP · max 5 MB";

function UploadButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const active = !disabled && !pending;
  return (
    <button
      type="submit"
      disabled={!active}
      className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-opacity"
      style={{
        background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)",
        opacity: active ? 1 : 0.35,
        cursor: active ? "pointer" : "default",
      }}
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove logo"}
    </button>
  );
}

type Props = {
  companyId: string;
  /** Signed URL of the current logo, or null if none. Resolved server-side. */
  currentLogoUrl: string | null;
};

export function CompanyLogoForm({ companyId, currentLogoUrl }: Props) {
  const [uploadState, uploadAction] = useActionState(uploadCompanyLogo, initialState);
  const [removeState, removeAction] = useActionState(removeCompanyLogo, initialState);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const error = uploadState.error ?? removeState.error;

  return (
    <div className="space-y-4">
      {/* Preview */}
      {currentLogoUrl ? (
        <div
          className="rounded-lg p-4 flex items-center justify-center bg-canvas"
          style={{ border: "1px solid #d4dde4", minHeight: 120 }}
        >
          {/*
            Logo dimensions are unknown in advance, so use Image with `fill`
            inside a sized wrapper. unoptimized avoids a Next.js image-loader
            round-trip on a private signed URL.
          */}
          <div style={{ position: "relative", width: 240, height: 96 }}>
            <Image
              src={currentLogoUrl}
              alt="Company logo"
              fill
              unoptimized
              sizes="240px"
              style={{ objectFit: "contain" }}
            />
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg p-6 text-center text-sm text-muted bg-canvas"
          style={{ border: "1px dashed #d4dde4" }}
        >
          No logo uploaded.
        </div>
      )}

      {/* Upload form */}
      <form action={uploadAction} className="space-y-3">
        <input type="hidden" name="company_id" value={companyId} />
        <div>
          <label htmlFor="company-logo-file" className="block text-xs font-medium text-dim mb-1.5">
            {currentLogoUrl ? "Replace logo" : "Upload logo"}
          </label>
          <input
            id="company-logo-file"
            ref={fileInputRef}
            type="file"
            name="file"
            accept={ACCEPTED}
            required
            onChange={(e) => setSelectedName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-ink file:mr-3 file:py-1.5 file:px-3
                       file:rounded-lg file:border file:text-xs file:font-medium
                       file:bg-canvas file:text-dim file:cursor-pointer
                       file:hover:bg-surface"
            style={{ borderColor: "#d4dde4" }}
          />
          <p className="mt-1 text-xs text-muted">{ACCEPTED_LABEL}</p>
          {selectedName && (
            <p className="mt-1 text-xs text-dim truncate">Selected: {selectedName}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <UploadButton disabled={!selectedName} />
          {uploadState.success && !error && (
            <span className="text-xs font-medium text-emerald-600">Saved ✓</span>
          )}
        </div>
      </form>

      {/* Remove (only when a logo is present) */}
      {currentLogoUrl && (
        <form action={removeAction}>
          <input type="hidden" name="company_id" value={companyId} />
          <RemoveButton />
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
