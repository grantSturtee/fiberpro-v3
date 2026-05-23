import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";

export const metadata: Metadata = { title: "Authorities" };

const TYPE_LABELS: Record<string, string> = {
  county:       "County",
  state:        "State",
  municipality: "Municipality",
};

const METHOD_LABELS: Record<string, string> = {
  email:      "Email",
  portal:     "Portal",
  mail:       "Mail",
  courier:    "Courier",
  in_person:  "In-person",
};

const REQ_FLAGS = [
  { key: "requires_application",     label: "App" },
  { key: "requires_certification",   label: "Cert" },
  { key: "requires_coi",             label: "COI" },
  { key: "requires_pe",              label: "PE" },
  { key: "requires_hard_copies",     label: "Hard Copies" },
  { key: "requires_certified_check", label: "Cert. Check" },
] as const;

type AuthRow = {
  id: string;
  name: string;
  type: string;
  submission_method: string | null;
  contact_name: string | null;
  contact_email: string | null;
  requires_application: boolean;
  requires_certification: boolean;
  requires_coi: boolean;
  requires_pe: boolean;
  requires_hard_copies: boolean;
  requires_certified_check: boolean;
  notification_only: boolean;
};

export default async function AuthoritiesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("authority_profiles")
    .select(
      "id, name, type, submission_method, contact_name, contact_email, " +
      "requires_application, requires_certification, requires_coi, requires_pe, " +
      "requires_hard_copies, requires_certified_check, notification_only"
    )
    .order("name", { ascending: true });

  const authorities = (data ?? []) as unknown as AuthRow[];

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SettingsBackButton href="/admin/settings" label="Settings" />
          <h1 className="text-xl font-semibold text-ink">Permitting Authorities</h1>
          <p className="mt-0.5 text-sm text-muted">{authorities.length} configured</p>
        </div>
        <Link
          href="/admin/settings/authorities/new"
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Add Authority
        </Link>
      </div>

      {authorities.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {authorities.map((a) => {
              const activeFlags = REQ_FLAGS.filter((f) => a[f.key]);
              return (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink">{a.name}</span>
                        <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                          {TYPE_LABELS[a.type] ?? a.type}
                        </span>
                        {a.submission_method && (
                          <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                            {METHOD_LABELS[a.submission_method] ?? a.submission_method}
                          </span>
                        )}
                        {a.notification_only && (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                            Notification Only
                          </span>
                        )}
                      </div>
                      {a.contact_name && (
                        <p className="text-xs text-muted mt-0.5">
                          {a.contact_name}
                          {a.contact_email && ` · ${a.contact_email}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {(a.requires_application || a.requires_certification) && (
                        <Link
                          href={`/admin/settings/authorities/${a.id}/templates`}
                          className="text-xs text-muted hover:text-primary transition-colors"
                        >
                          Templates
                        </Link>
                      )}
                      <Link
                        href={`/admin/settings/authorities/${a.id}/edit`}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                  {activeFlags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeFlags.map((f) => (
                        <span key={f.key} className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5">
                          {f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No authorities yet.</p>
          <Link
            href="/admin/settings/authorities/new"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Add the first one →
          </Link>
        </div>
      )}
    </div>
  );
}
