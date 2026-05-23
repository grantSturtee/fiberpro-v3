import Link from "next/link";
import {
  WORKSPACE_TABS,
  isTabLocked,
  type WorkspaceTab,
} from "@/lib/workspace/tabConfig";

// Re-export shared types/helpers so existing import sites keep working.
export type { WorkspaceTab };
export { VALID_TABS, defaultTabForStatus } from "@/lib/workspace/tabConfig";

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden
      className="flex-shrink-0"
    >
      <rect x="2" y="6" width="8" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 6V4a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProjectWorkspaceTabs({
  projectId,
  activeTab,
  currentUserRole = "admin",
  basePath = "/admin/projects",
}: {
  projectId: string;
  activeTab: WorkspaceTab;
  currentUserRole?: string;
  basePath?: string;
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center px-6 bg-canvas"
      style={{ borderBottom: "1px solid #e3e9ec" }}
    >
      {WORKSPACE_TABS.map((tab) => {
        const locked = isTabLocked(tab.id, currentUserRole);
        const isActive = !locked && tab.id === activeTab;

        if (locked) {
          return (
            <span
              key={tab.id}
              title={`${tab.label} — not available for your role`}
              className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap text-faint border-transparent cursor-not-allowed select-none"
              aria-disabled="true"
            >
              {tab.label}
              <LockIcon />
            </span>
          );
        }

        return (
          <Link
            key={tab.id}
            href={`${basePath}/${projectId}?tab=${tab.id}`}
            className={`px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              isActive
                ? "text-primary border-[#005bc1]"
                : "text-muted border-transparent hover:text-dim"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
