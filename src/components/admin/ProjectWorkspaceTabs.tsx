import Link from "next/link";
import { Lock } from "lucide-react";
import {
  WORKSPACE_TABS,
  isTabLocked,
  type WorkspaceTab,
} from "@/lib/workspace/tabConfig";

// Re-export shared types/helpers so existing import sites keep working.
export type { WorkspaceTab };
export { VALID_TABS, defaultTabForStatus } from "@/lib/workspace/tabConfig";

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
    <div className="flex-shrink-0 flex items-center px-6 bg-[#F8F9FB] border-b border-[#E5E7EB]">
      {WORKSPACE_TABS.map((tab) => {
        const locked = isTabLocked(tab.id, currentUserRole);
        const isActive = !locked && tab.id === activeTab;

        if (locked) {
          return (
            <span
              key={tab.id}
              title={`${tab.label} — not available for your role`}
              className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap text-[#9CA3AF] border-transparent cursor-not-allowed select-none"
              aria-disabled="true"
            >
              {tab.label}
              <Lock size={10} strokeWidth={1.5} className="flex-shrink-0" />
            </span>
          );
        }

        return (
          <Link
            key={tab.id}
            href={`${basePath}/${projectId}?tab=${tab.id}`}
            className={`px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              isActive
                ? "text-[#1565C0] border-[#1565C0]"
                : "text-[#6B7280] border-transparent hover:text-[#111827]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
