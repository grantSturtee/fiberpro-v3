"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SectionCard } from "@/components/ui/SectionCard";
import { updateIntakeDetails, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";
import { formatDate, humanize } from "@/lib/utils/format";
import { US_STATES } from "@/lib/constants/authorities";

// ── Props ─────────────────────────────────────────────────────────────────────

export type IntakeProject = {
  id: string;
  job_name: string;
  job_number_client: string | null;
  rhino_pm: string | null;
  comcast_manager: string | null;
  submitted_to_fiberpro: string | null;
  requested_approval_date: string | null;
  type_of_plan: string | null;
  job_type: string | null;
  authority_type: string | null;
  county: string | null;
  township: string | null;
  city: string | null;
  state: string | null;
  job_address: string | null;
  notes: string | null;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function FieldPair({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm text-ink bg-canvas rounded-lg px-3 py-1.5 outline-none transition-colors";
const inputStyle = { border: "1px solid #d4dde4" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60 transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

// ── Authority display helper (matches page logic) ─────────────────────────────

function authorityLabel(p: Pick<IntakeProject, "authority_type" | "county" | "city">) {
  if (p.authority_type === "njdot") return "NJDOT";
  if (p.county) return `${p.county} County`;
  if (p.city) return p.city;
  return humanize(p.authority_type);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditIntakeForm({ project }: { project: IntakeProject }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    updateIntakeDetails,
    { error: null }
  );

  // Return to read view on successful save
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  return (
    <SectionCard
      title="Intake & Core Data"
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        // ── Edit form ──────────────────────────────────────────────────────────
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="project_id" value={project.id} />

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">

            {/* Job Name — full width */}
            <div className="col-span-2 sm:col-span-3">
              <FormField label="Job Name">
                <input
                  type="text"
                  name="job_name"
                  defaultValue={project.job_name}
                  required
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
            </div>

            <FormField label="Client Job #">
              <input type="text" name="job_number_client" defaultValue={project.job_number_client ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Rhino PM">
              <input type="text" name="rhino_pm" defaultValue={project.rhino_pm ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Comcast Manager">
              <input type="text" name="comcast_manager" defaultValue={project.comcast_manager ?? ""} className={inputCls} style={inputStyle} />
            </FormField>

            <FormField label="Submitted to FiberPro">
              <input type="date" name="submitted_to_fiberpro" defaultValue={project.submitted_to_fiberpro ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Requested Approval">
              <input type="date" name="requested_approval_date" defaultValue={project.requested_approval_date ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="State">
              <select name="state" defaultValue={project.state ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                {US_STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.abbr} – {s.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Type of Plan">
              <select name="type_of_plan" defaultValue={project.type_of_plan ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                <option value="aerial">Aerial</option>
                <option value="underground">Underground</option>
                <option value="mixed">Mixed</option>
                <option value="other">Other</option>
              </select>
            </FormField>
            <FormField label="Job Type">
              <select name="job_type" defaultValue={project.job_type ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                <option value="tcp">TCP</option>
                <option value="sld">SLD</option>
                <option value="full_package">Full Package</option>
                <option value="revision">Revision</option>
                <option value="other">Other</option>
              </select>
            </FormField>
            <FormField label="Authority">
              <select name="authority_type" defaultValue={project.authority_type ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                <option value="county">County</option>
                <option value="njdot">State (NJDOT)</option>
                <option value="municipal">Municipal</option>
                <option value="other">Other</option>
              </select>
            </FormField>

            <FormField label="County">
              <input type="text" name="county" defaultValue={project.county ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Township">
              <input type="text" name="township" defaultValue={project.township ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="City / Municipality">
              <input type="text" name="city" defaultValue={project.city ?? ""} required className={inputCls} style={inputStyle} />
            </FormField>

            {/* Job Address — spans 2 */}
            <div className="col-span-2">
              <FormField label="Job Address">
                <input type="text" name="job_address" defaultValue={project.job_address ?? ""} required className={inputCls} style={inputStyle} />
              </FormField>
            </div>
          </div>

          {/* Notes */}
          <FormField label="Notes">
            <textarea
              name="notes"
              rows={3}
              defaultValue={project.notes ?? ""}
              className="w-full text-sm text-ink bg-canvas rounded-lg px-3 py-2 resize-none outline-none transition-colors"
              style={inputStyle}
              placeholder="Internal notes…"
            />
          </FormField>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <SaveButton />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            {state.error && <p className="text-xs text-red-600 ml-2">{state.error}</p>}
          </div>
        </form>
      ) : (
        // ── Read view ──────────────────────────────────────────────────────────
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <FieldPair label="Job Number (Client)"   value={project.job_number_client} />
            <FieldPair label="Rhino PM"              value={project.rhino_pm} />
            <FieldPair label="Comcast Manager"       value={project.comcast_manager} />
            <FieldPair label="Submitted to FiberPro" value={formatDate(project.submitted_to_fiberpro)} />
            <FieldPair label="Requested Approval"    value={formatDate(project.requested_approval_date)} />
            <FieldPair label="Type of Plan"          value={humanize(project.type_of_plan)} />
            <FieldPair label="Job Type"              value={humanize(project.job_type)} />
            <FieldPair label="Authority"             value={authorityLabel(project)} />
            <FieldPair label="County"                value={project.county} />
            <FieldPair label="Township"              value={project.township} />
            <FieldPair label="City / Municipality"   value={project.city} />
            <FieldPair label="Job Address"           value={project.job_address} />
          </div>
          {project.notes && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-ink">{project.notes}</p>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
