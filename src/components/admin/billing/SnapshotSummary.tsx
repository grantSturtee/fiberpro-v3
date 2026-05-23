"use client";

/**
 * SnapshotSummary (Phase E3)
 *
 * Human-readable summary of an invoice's pricing snapshot. NOT a raw JSON
 * dump. Surfaces the pricing rule, authority/jurisdiction, package linkage,
 * and resolution trail so admins can answer "why is this the total?".
 *
 * If the invoice's pricing_snapshot is empty or pre-V1 (e.g. legacy invoices
 * created before the snapshot builder existed), renders a quiet placeholder.
 */

import type { PricingSnapshotV1 } from "@/types/invoice";

type Props = {
  snapshot: PricingSnapshotV1 | Record<string, never> | null | undefined;
};

function isV1(
  s: PricingSnapshotV1 | Record<string, never> | null | undefined
): s is PricingSnapshotV1 {
  return !!s && typeof s === "object" && "schema_version" in s &&
    (s as PricingSnapshotV1).schema_version === 1;
}

function fmt(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function SnapshotSummary({ snapshot }: Props) {
  if (!isV1(snapshot)) {
    return (
      <div className="text-[11px] text-muted italic px-3 py-2 bg-canvas border border-rule rounded-md">
        No pricing snapshot recorded for this invoice.
      </div>
    );
  }

  const s = snapshot;
  const lines: Array<{ label: string; value: React.ReactNode }> = [];

  // Source: rule or override
  if (s.override) {
    lines.push({
      label: "Source",
      value: (
        <span>
          Project-level override — {fmt(s.override.amount)}
          {s.override.reason ? (
            <span className="text-muted"> · {s.override.reason}</span>
          ) : null}
        </span>
      ),
    });
  } else if (s.pricing_rule) {
    lines.push({
      label: "Pricing rule",
      value: (
        <span>
          {s.pricing_rule.name}
          {s.calculation.plan_multiplier !== 1 && (
            <span className="text-muted"> · ×{s.calculation.plan_multiplier} plan</span>
          )}
          {s.calculation.complexity_multiplier !== 1 && (
            <span className="text-muted"> · ×{s.calculation.complexity_multiplier} complexity</span>
          )}
        </span>
      ),
    });
  } else {
    lines.push({
      label: "Pricing rule",
      value: <span className="text-muted italic">No rule matched — manual base price.</span>,
    });
  }

  // Authority / jurisdiction
  const authName = s.authority?.name ?? null;
  const jurName  = s.jurisdiction?.authority_name ?? null;
  if (authName || jurName) {
    lines.push({
      label: "Authority",
      value: (
        <span>
          {authName ?? jurName}
          {authName && jurName && authName !== jurName ? (
            <span className="text-muted"> ({jurName})</span>
          ) : null}
        </span>
      ),
    });
  }

  // Project context
  if (s.project) {
    const planType = s.project.type_of_plan;
    const sheets = s.project.sheet_count;
    const bits: string[] = [];
    if (planType) bits.push(planType);
    if (sheets != null) bits.push(`${sheets} sheet${sheets === 1 ? "" : "s"}`);
    if (s.project.is_rush) bits.push("rush");
    if (s.project.pe_required) bits.push("PE required");
    if (bits.length > 0) {
      lines.push({
        label: "Project context",
        value: <span>{bits.join(" · ")}</span>,
      });
    }
  }

  // Package linkage
  lines.push({
    label: "Package",
    value: s.package?.file_id ? (
      <span className="text-emerald-700">
        Linked
        {s.package.generated_at && (
          <span className="text-muted">
            {" · generated "}
            {new Date(s.package.generated_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        )}
      </span>
    ) : (
      <span className="text-amber-700 italic">No permit package referenced.</span>
    ),
  });

  // Computed total breakdown
  if (s.calculation) {
    lines.push({
      label: "Calculation",
      value: (
        <span className="text-muted">
          {fmt(s.calculation.subtotal_pre_multiplier)} subtotal →
          {" "}{fmt(s.calculation.grand_total_before_discount)} pre-discount
          {s.calculation.discount_amount > 0 && (
            <> · −{fmt(s.calculation.discount_amount)} discount</>
          )}
          {" "}= {fmt(s.calculation.total)} total
        </span>
      ),
    });
  }

  // Resolution trail — the admin-visible explanation
  const trail = s.resolution_trail ?? [];

  return (
    <div className="bg-canvas border border-rule rounded-md px-3 py-2.5 space-y-2">
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
        Pricing Snapshot Summary
      </p>

      <dl className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr] gap-2 text-[11px]">
            <dt className="text-muted">{line.label}</dt>
            <dd className="text-ink">{line.value}</dd>
          </div>
        ))}
      </dl>

      {trail.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted hover:text-ink">
            Resolution trail ({trail.length})
          </summary>
          <ul className="mt-1.5 ml-3 space-y-0.5 list-disc list-inside text-dim">
            {trail.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
