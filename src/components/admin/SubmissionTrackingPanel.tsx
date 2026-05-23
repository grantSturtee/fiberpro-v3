"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ProjectStatus } from "@/types/domain";
import type { AuthorityProfile } from "@/components/admin/AuthorityRequirementsPanel";
import type { SubmissionActionState } from "@/app/(admin)/admin/projects/[id]/submission-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubmissionFile = {
  id: string;
  file_name: string;
  file_category: string;
  created_at: string;
};

export type SubmissionProjectFields = {
  id: string;
  status: ProjectStatus;
  submission_date: string | null;
  submission_method: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  authority_tracking_number: string | null;
  expected_response_date: string | null;
  permit_received_date: string | null;
  permit_notes: string | null;
};

type Props = {
  project: SubmissionProjectFields;
  authority: AuthorityProfile | null;
  hasApplicationFile: boolean;
  hasCertificationFile: boolean;
  permitDocFiles: SubmissionFile[];
  downloadUrls: Record<string, string>;
  // Server actions passed from the server component
  markReadyForSubmission: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  recordSubmission: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  markWaitingOnAuthority: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  markAuthorityActionNeeded: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  markPermitReceived: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  saveSubmissionFields: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUBMISSION_STATUSES: ProjectStatus[] = [
  "ready_for_submission",
  "submitted",
  "waiting_on_authority",
  "authority_action_needed",
  "permit_received",
  "closed",
];

const SUBMISSION_STATUS_LABELS: Partial<Record<ProjectStatus, string>> = {
  ready_for_submission:    "Ready for Submission",
  submitted:               "Submitted",
  waiting_on_authority:    "Awaiting Authority",
  authority_action_needed: "Action Needed",
  permit_received:         "Permit Received",
  closed:                  "Closed",
};

const SUBMISSION_STATUS_COLORS: Partial<Record<ProjectStatus, string>> = {
  ready_for_submission:    "bg-amber-100 text-amber-800",
  submitted:               "bg-blue-100 text-blue-700",
  waiting_on_authority:    "bg-sky-100 text-sky-700",
  authority_action_needed: "bg-red-100 text-red-700",
  permit_received:         "bg-green-100 text-green-700",
  closed:                  "bg-surface text-dim",
};

const SUBMISSION_METHODS = [
  { value: "email",     label: "Email" },
  { value: "portal",   label: "Online Portal" },
  { value: "mail",     label: "Mail" },
  { value: "courier",  label: "Courier" },
  { value: "in_person",label: "In Person" },
];

function formatDate(d: string | null | undefined) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

// ── Small submit buttons (need useFormStatus inside form) ─────────────────────

function SubmitBtn({ label, pendingLabel, className }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors ${className ?? "bg-primary text-white hover:bg-primary/90"}`}
    >
      {pending ? (pendingLabel ?? "Saving…") : label}
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{children}</p>;
}

function FieldVal({ value }: { value?: string | null }) {
  return <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>;
}

// ── Primary panel ─────────────────────────────────────────────────────────────

export function SubmissionTrackingPanel({
  project,
  authority,
  hasApplicationFile,
  hasCertificationFile,
  permitDocFiles,
  downloadUrls,
  markReadyForSubmission,
  recordSubmission,
  markWaitingOnAuthority,
  markAuthorityActionNeeded,
  markPermitReceived,
  saveSubmissionFields,
}: Props) {
  const inFlow = SUBMISSION_STATUSES.includes(project.status);

  if (!inFlow) {
    return (
      <p className="text-sm text-muted">
        Available after the permit package is generated and ready for submission.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status + action row */}
      <StatusActions
        project={project}
        authority={authority}
        hasApplicationFile={hasApplicationFile}
        hasCertificationFile={hasCertificationFile}
        markReadyForSubmission={markReadyForSubmission}
        recordSubmission={recordSubmission}
        markWaitingOnAuthority={markWaitingOnAuthority}
        markAuthorityActionNeeded={markAuthorityActionNeeded}
        markPermitReceived={markPermitReceived}
      />

      {/* Editable tracking fields */}
      {project.status !== "closed" && (
        <TrackingFieldsForm
          project={project}
          saveSubmissionFields={saveSubmissionFields}
        />
      )}

      {/* Received permit documents */}
      {permitDocFiles.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
            Received Permit Documents
          </p>
          <div className="divide-y divide-surface">
            {permitDocFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2">
                <p className="text-sm text-ink truncate">{f.file_name}</p>
                {downloadUrls[f.id] ? (
                  <a
                    href={downloadUrls[f.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-xs text-faint flex-shrink-0">—</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status + contextual actions ───────────────────────────────────────────────

function StatusActions({
  project,
  authority,
  hasApplicationFile,
  hasCertificationFile,
  markReadyForSubmission,
  recordSubmission,
  markWaitingOnAuthority,
  markAuthorityActionNeeded,
  markPermitReceived,
}: Omit<Props, "saveSubmissionFields" | "permitDocFiles" | "downloadUrls">) {
  const statusLabel = SUBMISSION_STATUS_LABELS[project.status] ?? project.status;
  const statusColor = SUBMISSION_STATUS_COLORS[project.status] ?? "bg-surface text-dim";

  return (
    <div className="space-y-4">
      {/* Current status badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
        {project.submission_date && project.status !== "ready_for_submission" && (
          <span className="text-xs text-muted">Submitted {formatDate(project.submission_date)}</span>
        )}
        {project.permit_received_date && project.status === "permit_received" && (
          <span className="text-xs text-muted">· Received {formatDate(project.permit_received_date)}</span>
        )}
      </div>

      {/* Authority context */}
      {authority && (
        <div className="bg-surface rounded-lg px-4 py-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="font-medium text-ink">{authority.name}</span>
            {authority.submission_method && (
              <span className="text-xs text-muted capitalize">
                Default: {SUBMISSION_METHODS.find(m => m.value === authority.submission_method)?.label ?? authority.submission_method}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-muted flex-wrap">
            {authority.contact_name && <span>Contact: {authority.contact_name}</span>}
            {authority.contact_email && <span>{authority.contact_email}</span>}
            {authority.contact_phone && <span>{authority.contact_phone}</span>}
          </div>
          {/* Doc readiness */}
          {(authority.requires_application || authority.requires_certification) && (
            <div className="flex gap-3 pt-1">
              {authority.requires_application && (
                <span className={`text-xs font-medium ${hasApplicationFile ? "text-green-600" : "text-amber-600"}`}>
                  {hasApplicationFile ? "✓ Application ready" : "⚠ Application not generated"}
                </span>
              )}
              {authority.requires_certification && (
                <span className={`text-xs font-medium ${hasCertificationFile ? "text-green-600" : "text-amber-600"}`}>
                  {hasCertificationFile ? "✓ Certification ready" : "⚠ Certification not generated"}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Context-sensitive action buttons */}
      {project.status === "ready_for_submission" && (() => {
        const missingDocs: string[] = [
          authority?.requires_application  && !hasApplicationFile  && "Application Form",
          authority?.requires_certification && !hasCertificationFile && "Certification Form",
        ].filter((x): x is string => typeof x === "string");

        return (
          <>
            {missingDocs.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">Required documents not yet generated</p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  {missingDocs.map((d) => (
                    <li key={d}>· {d} has not been generated. Regenerate the permit package to produce it.</li>
                  ))}
                </ul>
              </div>
            )}
            <RecordSubmissionForm project={project} authority={authority} recordSubmission={recordSubmission} />
          </>
        );
      })()}

      {project.status === "submitted" && (
        <div className="flex flex-wrap gap-2">
          <SimpleAction
            projectId={project.id}
            action={markWaitingOnAuthority}
            label="Mark Awaiting Authority"
            className="bg-sky-600 text-white hover:bg-sky-700"
          />
          <ActionNeededForm projectId={project.id} markAuthorityActionNeeded={markAuthorityActionNeeded} />
        </div>
      )}

      {project.status === "waiting_on_authority" && (
        <div className="flex flex-wrap gap-2">
          <ActionNeededForm projectId={project.id} markAuthorityActionNeeded={markAuthorityActionNeeded} />
          <PermitReceivedForm projectId={project.id} markPermitReceived={markPermitReceived} />
        </div>
      )}

      {project.status === "authority_action_needed" && (
        <div className="flex flex-wrap gap-2">
          <SimpleAction
            projectId={project.id}
            action={markReadyForSubmission}
            label="Mark Ready (Re-submit)"
            className="bg-primary text-white hover:bg-primary/90"
          />
          <PermitReceivedForm projectId={project.id} markPermitReceived={markPermitReceived} />
        </div>
      )}

      {project.status === "permit_received" && (
        <div className="text-xs text-muted">
          Permit received {formatDate(project.permit_received_date) ?? "—"}. Project can now be closed.
        </div>
      )}
    </div>
  );
}

// ── Record Submission form ────────────────────────────────────────────────────

function RecordSubmissionForm({
  project,
  authority,
  recordSubmission,
}: {
  project: SubmissionProjectFields;
  authority: AuthorityProfile | null;
  recordSubmission: Props["recordSubmission"];
}) {
  const [state, formAction] = useActionState(recordSubmission, { error: null });

  const today = new Date().toISOString().split("T")[0];

  return (
    <form action={formAction} className="space-y-3 border border-rule rounded-lg p-4 bg-card">
      <p className="text-xs font-semibold text-ink">Record Submission</p>
      <input type="hidden" name="project_id" value={project.id} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Submission Date</Label>
          <input
            type="date"
            name="submission_date"
            defaultValue={project.submission_date ?? today}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Method</Label>
          <select
            name="submission_method"
            defaultValue={project.submission_method ?? authority?.submission_method ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Select —</option>
            {SUBMISSION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Recipient Name</Label>
          <input
            type="text"
            name="recipient_name"
            defaultValue={project.recipient_name ?? ""}
            placeholder={authority?.contact_name ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Recipient Email</Label>
          <input
            type="email"
            name="recipient_email"
            defaultValue={project.recipient_email ?? ""}
            placeholder={authority?.contact_email ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Authority Tracking #</Label>
          <input
            type="text"
            name="authority_tracking_number"
            defaultValue={project.authority_tracking_number ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Expected Response Date</Label>
          <input
            type="date"
            name="expected_response_date"
            defaultValue={project.expected_response_date ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <textarea
          name="permit_notes"
          defaultValue={project.permit_notes ?? ""}
          rows={2}
          className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600">Recorded.</p>}

      <SubmitBtn label="Mark Submitted" pendingLabel="Saving…" className="bg-blue-600 text-white hover:bg-blue-700" />
    </form>
  );
}

// ── Simple one-click action form ───────────────────────────────────────────────

function SimpleAction({
  projectId,
  action,
  label,
  className,
}: {
  projectId: string;
  action: (s: SubmissionActionState, f: FormData) => Promise<SubmissionActionState>;
  label: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitBtn label={label} className={className} />
    </form>
  );
}

// ── Authority Action Needed form ───────────────────────────────────────────────

function ActionNeededForm({
  projectId,
  markAuthorityActionNeeded,
}: {
  projectId: string;
  markAuthorityActionNeeded: Props["markAuthorityActionNeeded"];
}) {
  const [state, formAction] = useActionState(markAuthorityActionNeeded, { error: null });
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action_notes" value="" />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitBtn label="Mark Action Needed" className="bg-red-600 text-white hover:bg-red-700" />
    </form>
  );
}

// ── Permit Received form ───────────────────────────────────────────────────────

function PermitReceivedForm({
  projectId,
  markPermitReceived,
}: {
  projectId: string;
  markPermitReceived: Props["markPermitReceived"];
}) {
  const [state, formAction] = useActionState(markPermitReceived, { error: null });
  const today = new Date().toISOString().split("T")[0];
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="date"
        name="permit_received_date"
        defaultValue={today}
        className="text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitBtn label="Mark Permit Received" className="bg-green-600 text-white hover:bg-green-700" />
    </form>
  );
}

// ── Editable tracking fields form ─────────────────────────────────────────────

function TrackingFieldsForm({
  project,
  saveSubmissionFields,
}: {
  project: SubmissionProjectFields;
  saveSubmissionFields: Props["saveSubmissionFields"];
}) {
  const [state, formAction] = useActionState(saveSubmissionFields, { error: null });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={project.id} />
      <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Tracking Details</p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <Label>Submission Date</Label>
          <input
            type="date"
            name="submission_date"
            defaultValue={project.submission_date ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Method</Label>
          <select
            name="submission_method"
            defaultValue={project.submission_method ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Select —</option>
            {SUBMISSION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Recipient Name</Label>
          <input
            type="text"
            name="recipient_name"
            defaultValue={project.recipient_name ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Recipient Email</Label>
          <input
            type="email"
            name="recipient_email"
            defaultValue={project.recipient_email ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Authority Tracking #</Label>
          <input
            type="text"
            name="authority_tracking_number"
            defaultValue={project.authority_tracking_number ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Expected Response</Label>
          <input
            type="date"
            name="expected_response_date"
            defaultValue={project.expected_response_date ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Permit Received Date</Label>
          <input
            type="date"
            name="permit_received_date"
            defaultValue={project.permit_received_date ?? ""}
            className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <textarea
          name="permit_notes"
          defaultValue={project.permit_notes ?? ""}
          rows={3}
          className="w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="Authority notes, comments, rejection reasons…"
        />
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600">Saved.</p>}

      <div className="flex justify-end">
        <SubmitBtn label="Save Details" pendingLabel="Saving…" />
      </div>
    </form>
  );
}
