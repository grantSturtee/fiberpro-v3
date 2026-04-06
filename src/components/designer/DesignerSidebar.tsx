"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/ui/SignOutButton";

function IconWork() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="1.5" fill="currentColor" opacity=".2" />
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 9h6M5 11.5h3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const navItems = [
  { label: "My Work", href: "/designer", icon: <IconWork />, exact: true },
];

export function DesignerSidebar() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href || pathname.startsWith("/designer/projects");
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col h-screen bg-canvas">
      {/* Wordmark */}
      <div className="h-14 flex items-center px-5 flex-shrink-0">
        <span className="text-sm font-bold text-ink tracking-tight">
          Fiber<span className="text-primary">Pro</span>
        </span>
        <span className="ml-2 text-[10px] font-semibold text-muted bg-wash rounded px-1.5 py-0.5 tracking-wide">
          V3
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${
                  active
                    ? "bg-wash text-ink font-medium"
                    : "text-dim hover:bg-wash hover:text-ink"
                }
              `}
            >
              <span className={active ? "text-primary" : "text-muted"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User area */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="rounded-lg bg-wash px-3 py-2.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
            {/* TODO: Replace with session user initials */}
            <span className="text-[10px] font-semibold text-primary">MW</span>
          </div>
          <div className="min-w-0 flex-1">
            {/* TODO: Replace with session user data */}
            <p className="text-xs font-medium text-ink truncate">Designer</p>
            <p className="text-[10px] text-muted">FiberPro</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
