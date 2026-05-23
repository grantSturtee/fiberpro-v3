"use client";

import { useState, useEffect, useRef } from "react";
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
  // job_type intentionally omitted from UI — field exists in DB but is no longer shown
  authority_type: string | null;
  county: string | null;
  // township intentionally omitted from UI — field exists in DB but is no longer shown
  city: string | null;
  state: string | null;
  // Phase A — structured address. Optional; existing projects load with these
  // null and fall back to job_address / job_name on display.
  street_address: string | null;
  zip_code: string | null;
  job_address: string | null;
  milepost_start: string | null;
  milepost_end: string | null;
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

// ── Save button — muted until dirty, matches AllowedStatesForm pattern ────────

function SaveButton({ isDirty }: { isDirty: boolean }) {
  const { pending } = useFormStatus();
  const active = isDirty && !pending;
  return (
    <button
      type="submit"
      disabled={!active}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-[opacity]"
      style={{
        background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)",
        opacity: active ? 1 : 0.35,
        cursor: active ? "pointer" : "default",
      }}
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

// ── Authority display helper ──────────────────────────────────────────────────

function authorityLabel(p: Pick<IntakeProject, "authority_type" | "county" | "city">) {
  if (p.authority_type === "njdot") return "NJDOT";
  if (p.county) return `${p.county} County`;
  if (p.city) return p.city;
  return humanize(p.authority_type);
}

// ── Milepost display helper ───────────────────────────────────────────────────

function formatMileposts(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} –`;
  if (end) return `– ${end}`;
  return null;
}

// ── Address display helper ────────────────────────────────────────────────────
// Builds the "City, ST ZIP" line from whatever structured pieces are present.
function formatCityStateZip(city: string | null, state: string | null, zip: string | null): string | null {
  const left = city?.trim() || null;
  const right = [state?.trim(), zip?.trim()].filter(Boolean).join(" ") || null;
  if (left && right) return `${left}, ${right}`;
  return left || right;
}

// ── Dirty check — compare FormData snapshot against saved project values ──────

function isFormDirty(fd: FormData, p: IntakeProject): boolean {
  const s = (key: string) => ((fd.get(key) as string) ?? "").trim();
  return (
    s("job_name")               !== (p.job_name               ?? "") ||
    s("job_address")            !== (p.job_address             ?? "") ||
    s("street_address")         !== (p.street_address          ?? "") ||
    s("zip_code")               !== (p.zip_code                ?? "") ||
    s("job_number_client")      !== (p.job_number_client       ?? "") ||
    s("rhino_pm")               !== (p.rhino_pm                ?? "") ||
    s("comcast_manager")        !== (p.comcast_manager         ?? "") ||
    s("type_of_plan")           !== (p.type_of_plan            ?? "") ||
    s("authority_type")         !== (p.authority_type          ?? "") ||
    s("milepost_start")         !== (p.milepost_start          ?? "") ||
    s("milepost_end")           !== (p.milepost_end            ?? "") ||
    s("state")                  !== (p.state                   ?? "") ||
    s("county")                 !== (p.county                  ?? "") ||
    s("city")                   !== (p.city                    ?? "") ||
    s("submitted_to_fiberpro")  !== (p.submitted_to_fiberpro   ?? "") ||
    s("requested_approval_date") !== (p.requested_approval_date ?? "")
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditIntakeForm({ project }: { project: IntakeProject }) {
  const [editing, setEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    updateIntakeDetails,
    { error: null }
  );

  // Return to read view on successful save; dirty state resets with it
  useEffect(() => {
    if (state.success) {
      setEditing(false);
      setIsDirty(false);
    }
  }, [state.success]);

  function handleFormChange() {
    if (!formRef.current) return;
    setIsDirty(isFormDirty(new FormData(formRef.current), project));
  }

  return (
    <SectionCard
      flat
      title="Project Request"
      description="Core details as submitted with the intake request."
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => { setEditing(true); setIsDirty(false); }}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        // ── Edit form ──────────────────────────────────────────────────────────
        <form ref={formRef} action={formAction} onChange={handleFormChange} className="space-y-4">
          <input type="hidden" name="project_id" value={project.id} />

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">

            {/* Phase A — structured address (primary) */}
            <div className="col-span-2 sm:col-span-3">
              <FormField label="Street Address">
                <input
                  type="text"
                  name="street_address"
                  defaultValue={project.street_address ?? ""}
                  placeholder="e.g. 123 Main St"
                  className={`${inputCls} uppercase-input`}
                  style={inputStyle}
                />
              </FormField>
            </div>

            <FormField label="ZIP Code">
              <input
                type="text"
                name="zip_code"
                defaultValue={project.zip_code ?? ""}
                placeholder="e.g. 07601"
                className={`${inputCls} uppercase-input`}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Client Job #">
              <input type="text" name="job_number_client" defaultValue={project.job_number_client ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Rhino PM">
              <input type="text" name="rhino_pm" defaultValue={project.rhino_pm ?? ""} className={`${inputCls} uppercase-input`} style={inputStyle} />
            </FormField>
            <FormField label="Comcast Manager">
              <input type="text" name="comcast_manager" defaultValue={project.comcast_manager ?? ""} className={`${inputCls} uppercase-input`} style={inputStyle} />
            </FormField>

            {/* Row 3 — plan type, authority, mileposts */}
            <FormField label="Type of Plan">
              <select name="type_of_plan" defaultValue={project.type_of_plan ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                <option value="aerial">Aerial</option>
                <option value="underground">Underground</option>
                <option value="mixed">Mixed</option>
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

            {/* Mileposts — compact two-input group in one grid cell */}
            <div>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Mileposts</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  name="milepost_start"
                  defaultValue={project.milepost_start ?? ""}
                  placeholder="Start"
                  className="w-full text-sm text-ink bg-canvas rounded-lg px-2.5 py-1.5 outline-none transition-colors uppercase-input"
                  style={inputStyle}
                />
                <span className="text-muted text-sm flex-shrink-0">–</span>
                <input
                  type="text"
                  name="milepost_end"
                  defaultValue={project.milepost_end ?? ""}
                  placeholder="End"
                  className="w-full text-sm text-ink bg-canvas rounded-lg px-2.5 py-1.5 outline-none transition-colors uppercase-input"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Row 4 — location */}
            <FormField label="State">
              <select name="state" defaultValue={project.state ?? ""} className={inputCls} style={inputStyle}>
                <option value="">— None —</option>
                {US_STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.abbr} – {s.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="County">
              <input type="text" name="county" defaultValue={project.county ?? ""} className={`${inputCls} uppercase-input`} style={inputStyle} />
            </FormField>
            {/* City / Municipality — optional */}
            <FormField label="City / Municipality">
              <input type="text" name="city" defaultValue={project.city ?? ""} className={`${inputCls} uppercase-input`} style={inputStyle} />
            </FormField>

            {/* Row 5 — dates */}
            <FormField label="Submitted to GRANTED">
              <input type="date" name="submitted_to_fiberpro" defaultValue={project.submitted_to_fiberpro ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label="Requested Approval">
              <input type="date" name="requested_approval_date" defaultValue={project.requested_approval_date ?? ""} className={inputCls} style={inputStyle} />
            </FormField>
          </div>

          {/* ── Legacy fields ─────────────────────────────────────────────────
              job_name (NOT NULL) and job_address are still read by PDF
              mappings and several display surfaces. Going forward they are
              auto-derived at project creation from the structured address;
              on edit we leave them alone unless the admin explicitly changes
              them here.
          */}
          <details className="mt-2 pt-3" style={{ borderTop: "1px dashed #e3e9ec" }}>
            <summary className="cursor-pointer text-[11px] font-medium text-muted uppercase tracking-wider">
              Legacy fields (Job Name / Job Address)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-3">
                <FormField label="Job Name (legacy)">
                  <input
                    type="text"
                    name="job_name"
                    defaultValue={project.job_name}
                    required
                    className={`${inputCls} uppercase-input`}
                    style={inputStyle}
                  />
                </FormField>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <FormField label="Job Address (legacy)">
                  <input
                    type="text"
                    name="job_address"
                    defaultValue={project.job_address ?? ""}
                    placeholder="e.g. 123 Main St, Hackensack NJ 07601"
                    className={`${inputCls} uppercase-input`}
                    style={inputStyle}
                  />
                </FormField>
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <SaveButton isDirty={isDirty} />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            {state.error && <p className="text-xs text-red-600 ml-2">{state.error}</p>}
          </div>

          {/* Project Notes — read-only in edit mode, positioned below actions */}
          {project.notes && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid #e3e9ec" }}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Project Notes</p>
              <p className="text-sm text-ink">{project.notes}</p>
            </div>
          )}
        </form>
      ) : (
        // ── Read view ─────────────────────────────────────────────────────────
        // Group 1: Job identity (name, type, authority, mileposts)
        // Group 2: Location (address, state, county, city)
        // Group 3: Timeline (submitted, requested approval)
        // Group 4: Account identifiers (client job #, Rhino PM, Comcast manager)
        <>
          {/* Job identity */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <FieldPair label="Job Name" value={project.job_name} />
            </div>
            <FieldPair label="Type of Plan" value={humanize(project.type_of_plan)} />
            <FieldPair label="Authority"    value={authorityLabel(project)} />
            <FieldPair label="Mileposts"    value={formatMileposts(project.milepost_start, project.milepost_end)} />
          </div>

          {/* Location — leads with structured address; falls back to legacy
              job_address when no street_address has been entered yet. */}
          <div className="mt-4 pt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3" style={{ borderTop: "1px solid #e3e9ec" }}>
            <div className="col-span-2 sm:col-span-3">
              {project.street_address ? (
                <div>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Address</p>
                  <p className="text-sm text-ink">{project.street_address}</p>
                  {formatCityStateZip(project.city, project.state, project.zip_code) && (
                    <p className="text-sm text-ink">
                      {formatCityStateZip(project.city, project.state, project.zip_code)}
                    </p>
                  )}
                </div>
              ) : (
                <FieldPair label="Job Address" value={project.job_address || project.job_name} />
              )}
            </div>
            <FieldPair label="State"             value={project.state} />
            <FieldPair label="County"            value={project.county} />
            <FieldPair label="City / Municipality" value={project.city} />
          </div>

          {/* Timeline */}
          <div className="mt-4 pt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3" style={{ borderTop: "1px solid #e3e9ec" }}>
            <FieldPair label="Submitted to GRANTED" value={formatDate(project.submitted_to_fiberpro)} />
            <FieldPair label="Requested Approval"    value={formatDate(project.requested_approval_date)} />
          </div>

          {/* Account identifiers */}
          <div className="mt-4 pt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3" style={{ borderTop: "1px solid #e3e9ec" }}>
            <FieldPair label="Client Job #"    value={project.job_number_client} />
            <FieldPair label="Rhino PM"        value={project.rhino_pm} />
            <FieldPair label="Comcast Manager" value={project.comcast_manager} />
          </div>

          {project.notes && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Project Notes</p>
              <p className="text-sm text-ink">{project.notes}</p>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
