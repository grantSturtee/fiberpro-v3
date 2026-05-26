import Link from "next/link";
import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthorityProfile = {
  id: string;
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
};

// Checklist item derived from project + authority state
export type ChecklistItem = {
  label: string;
  required: boolean;
  met: boolean;
  detail?: string;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  email:     "Email",
  portal:    "Online Portal",
  mail:      "Mail",
  courier:   "Courier / Drop-off",
  in_person: "In-person Appointment",
};

function Req({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="text-[10px] font-medium bg-[#EFF6FF] text-[#1565C0] rounded px-1.5 py-0.5">
      {label}
    </span>
  );
}

function CheckRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {/* Icon — semantic color carried by the icon itself */}
      {!item.required ? (
        <CircleDashed size={14} strokeWidth={1.5} className="text-[#9CA3AF] flex-shrink-0 mt-0.5" />
      ) : item.met ? (
        <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#16A34A] flex-shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle size={14} strokeWidth={1.5} className="text-[#D97706] flex-shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#111827]">{item.label}</p>
        {item.detail && <p className="text-[11px] text-[#6B7280] mt-0.5">{item.detail}</p>}
      </div>
      {!item.required && (
        <span className="ml-auto text-[10px] text-[#9CA3AF] flex-shrink-0 mt-0.5">not required</span>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function AuthorityRequirementsPanel({
  authority,
  checklist,
}: {
  authority: AuthorityProfile | null;
  checklist: ChecklistItem[];
}) {
  if (!authority) {
    return (
      <div className="py-2">
        <p className="text-sm text-[#6B7280]">
          No authority selected. Choose an authority in the section above to see submission requirements.
        </p>
      </div>
    );
  }

  const hasContact = authority.contact_name || authority.contact_email || authority.contact_phone;
  const reqFlags = [
    { label: "Application Form",  active: authority.requires_application },
    { label: "Certification",     active: authority.requires_certification },
    { label: "COI",               active: authority.requires_coi },
    { label: "PE Stamp",          active: authority.requires_pe },
    { label: "Hard Copies",       active: authority.requires_hard_copies },
    { label: "Certified Check",   active: authority.requires_certified_check },
  ].filter((f) => f.active);

  return (
    <div className="space-y-5">

      {/* Authority header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#111827]">{authority.name}</p>
          <p className="text-xs text-[#6B7280] capitalize">{authority.type}</p>
        </div>
        <Link
          href={`/admin/settings/authorities/${authority.id}/edit`}
          className="text-xs text-[#1565C0] hover:underline flex-shrink-0"
        >
          Edit →
        </Link>
      </div>

      {/* Submission method + format */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Submission</p>
          <p className="text-sm text-[#111827]">
            {authority.submission_method
              ? METHOD_LABELS[authority.submission_method] ?? authority.submission_method
              : <span className="text-[#9CA3AF]">Not set</span>}
          </p>
        </div>
        {authority.output_format && (
          <div>
            <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Format</p>
            <p className="text-sm text-[#111827]">{authority.output_format}</p>
          </div>
        )}
        {authority.notification_only && (
          <div className="col-span-2">
            <span className="text-[10px] font-medium text-[#D97706] bg-[#FFFBEB] rounded px-1.5 py-0.5">
              Notification Only — no permit decision
            </span>
          </div>
        )}
      </div>

      {/* Required documents */}
      {reqFlags.length > 0 && (
        <div className="border-t border-[#E5E7EB] pt-4">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Required Documents</p>
          <div className="flex flex-wrap gap-1.5">
            {reqFlags.map((f) => <Req key={f.label} label={f.label} active={f.active} />)}
          </div>
        </div>
      )}

      {/* Contact */}
      {hasContact && (
        <div className="border-t border-[#E5E7EB] pt-4">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Contact</p>
          <div className="space-y-1">
            {authority.contact_name && (
              <p className="text-sm text-[#111827]">{authority.contact_name}</p>
            )}
            {authority.contact_email && (
              <p className="text-xs text-[#6B7280]">
                <a href={`mailto:${authority.contact_email}`} className="hover:text-[#1565C0] transition-colors">
                  {authority.contact_email}
                </a>
              </p>
            )}
            {authority.contact_phone && (
              <p className="text-xs text-[#6B7280]">{authority.contact_phone}</p>
            )}
          </div>
        </div>
      )}

      {/* Submission instructions */}
      {authority.submission_instructions && (
        <div className="border-t border-[#E5E7EB] pt-4">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Submission Instructions</p>
          <p className="text-sm text-[#111827] whitespace-pre-wrap leading-relaxed">
            {authority.submission_instructions}
          </p>
        </div>
      )}

      {/* Internal notes */}
      {authority.internal_notes && (
        <div className="border-t border-[#E5E7EB] pt-4">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Internal Notes</p>
          <p className="text-sm text-[#111827] whitespace-pre-wrap leading-relaxed">
            {authority.internal_notes}
          </p>
        </div>
      )}

      {/* Submission checklist */}
      {checklist.length > 0 && (
        <div className="border-t border-[#E5E7EB] pt-4">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">Submission Checklist</p>
          <div className="divide-y divide-[#E5E7EB]">
            {checklist.map((item) => (
              <CheckRow key={item.label} item={item} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
