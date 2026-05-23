import type { ValidationIssue } from "@/lib/templates/validatePageTemplate";
import { groupBySeverity } from "@/lib/templates/validatePageTemplate";

const SEVERITY_STYLE = {
  critical: {
    container: "border-red-200 bg-red-50",
    badge:     "bg-red-600 text-white",
    label:     "Critical",
    dot:       "bg-red-600",
  },
  warning: {
    container: "border-amber-200 bg-amber-50",
    badge:     "bg-amber-500 text-white",
    label:     "Warning",
    dot:       "bg-amber-500",
  },
  info: {
    container: "border-slate-200 bg-slate-50",
    badge:     "bg-slate-500 text-white",
    label:     "Info",
    dot:       "bg-slate-400",
  },
} as const;

export function TemplateDiagnosticsPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
        <span className="text-emerald-900">No issues detected with this template.</span>
      </div>
    );
  }

  const grouped = groupBySeverity(issues);
  const order: Array<keyof typeof SEVERITY_STYLE> = ["critical", "warning", "info"];

  return (
    <div className="space-y-2">
      {order.map((sev) => {
        const list = grouped[sev];
        if (list.length === 0) return null;
        const style = SEVERITY_STYLE[sev];
        return (
          <div
            key={sev}
            className={`rounded-lg border ${style.container} px-4 py-3`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${style.badge}`}>
                {style.label}
              </span>
              <span className="text-xs text-muted">
                {list.length} {list.length === 1 ? "issue" : "issues"}
              </span>
            </div>
            <ul className="space-y-1">
              {list.map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className="flex items-start gap-2 text-sm text-ink">
                  <span className={`mt-1.5 inline-block w-1 h-1 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
