"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { markSetupComplete, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SetupChecklistProps = {
  projectId: string;
  hasAuthority: boolean;
  hasActiveTemplate: boolean;
  missingBlueprintSections: string[];
  requiresApplicationForm: boolean;
  hasApplicationFormTemplate: boolean;
  hasSld: boolean;
  hasTcd: boolean;
  hasDesigner: boolean;
  // Whether the "Mark Setup Complete" button should be rendered. Existing
  // intake_review / waiting_on_client gating lives in the page; this prop just
  // toggles the form section so the readiness panel can stay visible after
  // Setup is marked complete.
  showMarkComplete: boolean;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon({ met }: { met: boolean }) {
  return met ? (
    <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#16A34A] flex-shrink-0" />
  ) : (
    <Circle size={14} strokeWidth={1.5} className="text-[#9CA3AF] flex-shrink-0" />
  );
}

function CheckRow({
  label,
  met,
  detail,
}: {
  label: string;
  met: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5"><CheckIcon met={met} /></span>
      <div className="min-w-0">
        <span className="text-xs text-[#111827]">{label}</span>
        {detail && (
          <span className={`block text-[11px] mt-0.5 ${met ? "text-[#6B7280]" : "text-[#D97706]"}`}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors disabled:opacity-50"
    >
      {pending ? "Checking…" : "Mark Setup Complete"}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SetupChecklist({
  projectId,
  hasAuthority,
  hasActiveTemplate,
  missingBlueprintSections,
  requiresApplicationForm,
  hasApplicationFormTemplate,
  hasSld,
  hasTcd,
  hasDesigner,
  showMarkComplete,
}: SetupChecklistProps) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    markSetupComplete,
    { error: null }
  );

  // Blueprint required-sections row state. Only meaningful once an active
  // template is in place — otherwise the parent "Active package template"
  // row is the actionable blocker.
  const sectionsMet = hasActiveTemplate && missingBlueprintSections.length === 0;
  const sectionsDetail = !hasActiveTemplate
    ? "Pending active template"
    : missingBlueprintSections.length > 0
      ? `Missing: ${missingBlueprintSections.join(", ")}`
      : undefined;

  // Application Form template row state. Only shown when authority/override
  // requires the form. If the active template isn't resolved yet, mark unmet
  // and explain.
  const appFormMet = requiresApplicationForm && hasActiveTemplate && hasApplicationFormTemplate;
  const appFormDetail = !hasActiveTemplate
    ? "Pending active template"
    : !hasApplicationFormTemplate
      ? "No Application Form template selected on the active blueprint"
      : undefined;

  // Aggregate readiness (used for the Mark Setup Complete copy). The action
  // itself enforces server-side rules; this is just informative.
  const allMet =
    hasAuthority &&
    hasActiveTemplate &&
    missingBlueprintSections.length === 0 &&
    (!requiresApplicationForm || hasApplicationFormTemplate) &&
    hasSld &&
    hasTcd &&
    hasDesigner;

  return (
    <div className="rounded-lg px-3 py-3 bg-[#F8F9FB] border border-[#E5E7EB]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280] mb-2">
        Setup Readiness
      </p>

      <div className="space-y-2 mb-3">
        <CheckRow label="Permitting authority selected" met={hasAuthority} />
        <CheckRow
          label="Active package template configured"
          met={hasActiveTemplate}
          detail={!hasActiveTemplate && hasAuthority
            ? "Activate a blueprint for this authority in Settings → Package Templates"
            : undefined}
        />
        <CheckRow
          label="Blueprint required sections complete"
          met={sectionsMet}
          detail={sectionsDetail}
        />
        {requiresApplicationForm && (
          <CheckRow
            label="Application Form template configured"
            met={appFormMet}
            detail={appFormDetail}
          />
        )}
        <CheckRow label="SLD reference sheet uploaded" met={hasSld} />
        <CheckRow label="TCD devices selected"        met={hasTcd} />
        <CheckRow label="Designer assigned"           met={hasDesigner} />
      </div>

      {showMarkComplete ? (
        <form action={formAction}>
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex items-center gap-2 flex-wrap">
            <SubmitBtn />
            {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
          </div>
        </form>
      ) : (
        allMet ? (
          <p className="text-xs text-[#16A34A] font-medium">
            All readiness items complete.
          </p>
        ) : (
          <p className="text-xs text-[#6B7280]">
            Items above need attention before this project is fully set up.
          </p>
        )
      )}
    </div>
  );
}
