"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { TemplateActionState } from "@/app/(admin)/admin/settings/authorities/[id]/templates/actions";

const TYPE_OPTIONS = [
  {
    value: "application",
    label: "Application Form",
    detail: "Road occupancy / permit application — filled per-project via overlay.",
  },
  {
    value: "certification",
    label: "Certification Form",
    detail: "Contractor or engineer certification — filled per-project via overlay.",
  },
] as const;

function SubmitButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !hasFile}
      className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Uploading…" : "Upload & Create Template"}
    </button>
  );
}

export function AddAuthorityTemplateForm({
  authorityId,
  action,
}: {
  authorityId: string;
  action: (state: TemplateActionState, formData: FormData) => Promise<TemplateActionState>;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  const [fileName, setFileName] = useState<string | null>(null);

  // After a server-action error, React re-renders and the uncontrolled file
  // input loses its file reference (browser security). Reset fileName so the
  // UI is consistent with the empty input and the submit button re-disables.
  useEffect(() => {
    if (state.error) setFileName(null);
  }, [state.error]);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5">
      <input type="hidden" name="authority_id" value={authorityId} />

      {/* Template type */}
      <div>
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
          Template Type<span className="text-red-500 ml-0.5">*</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              style={{ borderColor: "#d4dde4" }}
            >
              <input
                type="radio"
                name="type"
                value={opt.value}
                defaultChecked={opt.value === "application"}
                className="mt-0.5 text-primary focus:ring-primary/20 flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-ink">{opt.label}</p>
                <p className="text-xs text-muted mt-0.5">{opt.detail}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* PDF upload */}
      <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
          PDF File<span className="text-red-500 ml-0.5">*</span>
        </p>
        <label
          className="flex items-center gap-3 w-full px-4 py-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5"
          style={{
            borderColor: fileName ? "#005bc1" : "#d4dde4",
            background: fileName ? "rgba(0,91,193,0.04)" : undefined,
          }}
        >
          <svg
            width="20" height="20" viewBox="0 0 20 20" fill="none"
            aria-hidden className="flex-shrink-0 text-muted"
          >
            <path
              d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2M7 9l3-3 3 3M10 6v8"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <div className="flex-1 min-w-0">
            {fileName ? (
              <p className="text-sm font-medium text-ink truncate">{fileName}</p>
            ) : (
              <p className="text-sm text-muted">Choose PDF to upload</p>
            )}
            <p className="text-xs text-faint mt-0.5">PDF only · max 20 MB</p>
          </div>
          <span className="text-xs font-medium text-primary flex-shrink-0">
            {fileName ? "Change" : "Browse"}
          </span>
          <input
            type="file"
            name="file"
            accept=".pdf,application/pdf"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-between gap-4 pt-2"
        style={{ borderTop: "1px solid #e3e9ec" }}
      >
        <div>
          {state.error && (
            <p className="text-xs text-red-600">{state.error}</p>
          )}
        </div>
        <SubmitButton hasFile={!!fileName} />
      </div>
    </form>
  );
}
