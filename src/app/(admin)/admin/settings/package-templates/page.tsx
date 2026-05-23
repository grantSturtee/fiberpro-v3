import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { BlueprintCreateForm } from "./BlueprintCreateForm";

export const metadata: Metadata = { title: "Package Templates" };

type BlueprintStatus = "draft" | "active" | "inactive";

type BlueprintRow = {
  id: string;
  description: string | null;
  work_type: string | null;
  status: BlueprintStatus;
  created_at: string;
  // Legacy template FK columns (runtime-facing — used by generate-package bridge)
  cover_sheet_template_id: string | null;
  application_template_id: string | null;
  certification_template_id: string | null;
  // New page_template FK columns (written by blueprint editor UI)
  cover_page_template_id: string | null;
  app_page_template_id: string | null;
  cert_page_template_id: string | null;
  tcp_wrapper_id: string | null;
  tcd_wrapper_id: string | null;
  sld_wrapper_id: string | null;
  coi_template_id: string | null;
  authority_profiles: { name: string } | null;
};

type AuthorityOption = { id: string; name: string };

export default async function PackageTemplatesPage() {
  const supabase = await createClient();

  const [{ data: blueprints }, { data: authorities }] = await Promise.all([
    supabase
      .from("package_blueprints")
      .select(
        "id, description, work_type, status, created_at, " +
        "cover_sheet_template_id, application_template_id, certification_template_id, " +
        "cover_page_template_id, app_page_template_id, cert_page_template_id, " +
        "tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id, coi_template_id, " +
        "authority_profiles(name)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("authority_profiles")
      .select("id, name")
      .order("name"),
  ]);

  const rows = (blueprints ?? []) as unknown as BlueprintRow[];
  const authorityOptions = (authorities ?? []) as unknown as AuthorityOption[];

  const active   = rows.filter((r) => r.status === "active");
  const draft    = rows.filter((r) => r.status === "draft");
  const inactive = rows.filter((r) => r.status === "inactive");

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <SettingsBackButton href="/admin/settings" label="Settings" />
        <h1 className="text-xl font-semibold text-ink">Package Templates</h1>
        <p className="mt-0.5 text-sm text-muted">
          Configure which slots (cover, TCP, SLD, TCD, application form,
          certification form) make up each authority&apos;s permit package.
        </p>
      </div>

      {/* Active blueprints */}
      {active.length > 0 ? (
        <SectionCard noPad title="Active blueprints">
          <div className="divide-y divide-surface">
            {active.map((bp) => (
              <BlueprintListRow key={bp.id} bp={bp} />
            ))}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-10 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            No active blueprints yet. Create and activate one below.
          </p>
        </div>
      )}

      {/* Draft blueprints */}
      {draft.length > 0 && (
        <SectionCard noPad title="Draft blueprints">
          <div className="divide-y divide-surface">
            {draft.map((bp) => (
              <BlueprintListRow key={bp.id} bp={bp} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Create */}
      <SectionCard title="Create blueprint" description="Blueprints start as Draft — configure slots, then activate.">
        {authorityOptions.length === 0 ? (
          <p className="text-sm text-muted">
            No authorities configured.{" "}
            <Link href="/admin/settings/authorities/new" className="text-primary hover:underline">
              Add one first →
            </Link>
          </p>
        ) : (
          <BlueprintCreateForm authorities={authorityOptions} />
        )}
      </SectionCard>

      {/* Inactive */}
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} inactive blueprint{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div
            className="mt-3 bg-card rounded-xl overflow-hidden divide-y divide-surface"
            style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}
          >
            {inactive.map((bp) => (
              <BlueprintListRow key={bp.id} bp={bp} dim />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BlueprintStatus }) {
  if (status === "active") {
    return (
      <span className="text-[10px] font-semibold bg-green-50 text-green-700 rounded px-1.5 py-0.5">
        Active
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
        Draft
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
      Inactive
    </span>
  );
}

function WorkTypeBadge({ workType }: { workType: string | null }) {
  if (!workType) {
    return (
      <span className="text-[10px] font-medium text-faint bg-surface rounded px-1.5 py-0.5 border border-rule">
        No work type
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-dim bg-surface rounded px-1.5 py-0.5 border border-rule capitalize">
      {workType}
    </span>
  );
}

// green = configured, blue = required+missing, gray = optional+not included
function SlotBadge({
  label,
  configured,
  optional = false,
}: {
  label: string;
  configured: boolean;
  optional?: boolean;
}) {
  if (configured) {
    return (
      <span className="text-[10px] font-semibold bg-green-50 text-green-700 rounded px-1.5 py-0.5">
        {label}
      </span>
    );
  }
  if (optional) {
    return (
      <span className="text-[10px] font-medium text-faint bg-surface rounded px-1.5 py-0.5 border border-rule">
        {label}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 border border-blue-200">
      {label}
    </span>
  );
}

function BlueprintListRow({
  bp,
  dim = false,
}: {
  bp: BlueprintRow;
  dim?: boolean;
}) {
  return (
    <div className={`px-5 py-4 flex items-start justify-between gap-4 ${dim ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink">
            {bp.authority_profiles?.name ?? "Unknown authority"}
          </span>
          <StatusBadge status={bp.status} />
          <WorkTypeBadge workType={bp.work_type} />
        </div>
        {bp.description && (
          <p className="text-xs text-muted mt-0.5">{bp.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SlotBadge
            label="Cover"
            configured={bp.cover_page_template_id !== null || bp.cover_sheet_template_id !== null}
          />
          <SlotBadge label="TCP"   configured={bp.tcp_wrapper_id !== null} />
          <SlotBadge label="TCD"   configured={bp.tcd_wrapper_id !== null} />
          <SlotBadge label="SLD"   configured={bp.sld_wrapper_id !== null} />
          <SlotBadge
            label="App Form"
            configured={bp.app_page_template_id !== null || bp.application_template_id !== null}
            optional
          />
          <SlotBadge
            label="Cert Form"
            configured={bp.cert_page_template_id !== null || bp.certification_template_id !== null}
            optional
          />
        </div>
      </div>
      <Link
        href={`/admin/settings/package-templates/${bp.id}`}
        className="flex-shrink-0 text-xs text-primary hover:underline"
      >
        Configure →
      </Link>
    </div>
  );
}
