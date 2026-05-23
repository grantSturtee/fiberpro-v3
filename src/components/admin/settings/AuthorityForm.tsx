"use client";

import { useState, useTransition } from "react";
import type { AuthorityActionState } from "@/app/(admin)/admin/settings/authorities/actions";

export type AuthorityRow = {
  id?: string;
  name: string;
  type: string;
  submission_method: string | null;
  output_format: string | null;
  requires_application: boolean;
  requires_certification: boolean;
  requires_coi: boolean;
  requires_pe: boolean;
  requires_hard_copies: boolean;
  requires_certified_check: boolean;
  notification_only: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  submission_instructions: string | null;
  internal_notes: string | null;
  notes: string | null;
};

const SUBMISSION_METHODS = [
  { value: "", label: "— Not set —" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Online Portal" },
  { value: "mail", label: "Mail" },
  { value: "courier", label: "Courier / In-person Drop" },
  { value: "in_person", label: "In-person Appointment" },
];

const AUTHORITY_TYPES = [
  { value: "county", label: "County" },
  { value: "state", label: "State (DOT / etc.)" },
  { value: "municipality", label: "Municipality" },
];

const BOOL_FLAGS: { key: keyof AuthorityRow; label: string; description: string }[] = [
  { key: "requires_application",     label: "Application Form",    description: "Authority requires a completed application form." },
  { key: "requires_certification",   label: "Certification Form",  description: "Authority requires a contractor certification document." },
  { key: "requires_coi",             label: "COI",                 description: "Certificate of Insurance must be attached." },
  { key: "requires_pe",              label: "PE Stamp",            description: "A licensed PE must stamp the plan set." },
  { key: "requires_hard_copies",     label: "Hard Copies",         description: "Physical copies must be mailed or delivered." },
  { key: "requires_certified_check", label: "Certified Check",     description: "Payment must be by certified check." },
  { key: "notification_only",        label: "Notification Only",   description: "This authority receives a copy for notification — no permit decision." },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );
}

function Field({
  label, name, defaultValue, type = "text", placeholder, uppercase,
}: {
  label: string; name: string; defaultValue?: string | null;
  type?: string; placeholder?: string;
  // Visual-only uppercase. Submitted value is unchanged — server normalizes.
  uppercase?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={`w-full bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20${uppercase ? " uppercase-input" : ""}`}
        style={{ border: "1px solid #d4dde4" }}
      />
    </div>
  );
}

function Textarea({ label, name, defaultValue, placeholder, rows = 3 }: {
  label: string; name: string; defaultValue?: string | null;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
        style={{ border: "1px solid #d4dde4" }}
      />
    </div>
  );
}

function CheckFlag({ name, label, description, defaultChecked }: {
  name: string; label: string; description: string; defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-3.5 w-3.5 rounded border-rule text-primary focus:ring-primary/20 flex-shrink-0"
      />
      <div>
        <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
    </label>
  );
}

function SubmitBtn({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function AuthorityForm({
  action,
  defaultValues,
  submitLabel = "Save Authority",
}: {
  action: (formData: FormData) => Promise<AuthorityActionState | void>;
  defaultValues?: Partial<AuthorityRow>;
  submitLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const d = defaultValues ?? {};

  function handleAction(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={handleAction} className="space-y-8">
      {d.id && <input type="hidden" name="id" value={d.id} />}

      {/* Identity */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider">Identity</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Authority Name" name="name" defaultValue={d.name} placeholder="e.g. Bergen County ROW" uppercase />
          </div>
          <div>
            <Label>Type</Label>
            <select
              name="type"
              defaultValue={d.type ?? "county"}
              className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
            >
              {AUTHORITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Submission Method</Label>
            <select
              name="submission_method"
              defaultValue={d.submission_method ?? ""}
              className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
            >
              {SUBMISSION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Field label="Output Format" name="output_format" defaultValue={d.output_format} placeholder="e.g. plan_set, 8.5x11" />
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div className="space-y-4" style={{ borderTop: "1px solid #e3e9ec", paddingTop: "1.5rem" }}>
        <p className="text-xs font-semibold text-dim uppercase tracking-wider">Requirements</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BOOL_FLAGS.map((f) => (
            <CheckFlag
              key={f.key as string}
              name={f.key as string}
              label={f.label}
              description={f.description}
              defaultChecked={!!(d[f.key])}
            />
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-4" style={{ borderTop: "1px solid #e3e9ec", paddingTop: "1.5rem" }}>
        <p className="text-xs font-semibold text-dim uppercase tracking-wider">Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contact Name" name="contact_name" defaultValue={d.contact_name} placeholder="Permit Coordinator" />
          <Field label="Contact Phone" name="contact_phone" defaultValue={d.contact_phone} placeholder="(201) 555-0100" />
          <div className="sm:col-span-2">
            <Field label="Contact Email" name="contact_email" defaultValue={d.contact_email} type="email" placeholder="permits@countygov.test" />
          </div>
        </div>
      </div>

      {/* Instructions & Notes */}
      <div className="space-y-4" style={{ borderTop: "1px solid #e3e9ec", paddingTop: "1.5rem" }}>
        <p className="text-xs font-semibold text-dim uppercase tracking-wider">Instructions & Notes</p>
        <Textarea
          label="Submission Instructions"
          name="submission_instructions"
          defaultValue={d.submission_instructions}
          placeholder="Step-by-step instructions for submitting to this authority…"
          rows={4}
        />
        <Textarea
          label="Internal Notes"
          name="internal_notes"
          defaultValue={d.internal_notes}
          placeholder="Internal ops notes — not shown to clients…"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4" style={{ borderTop: "1px solid #e3e9ec", paddingTop: "1.5rem" }}>
        <SubmitBtn label={submitLabel} pending={isPending} />
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    </form>
  );
}
