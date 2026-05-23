"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 4.5C1.5 3.67 2.17 3 3 3h3.09l1.5 1.5H13c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-7.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconTeam() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" />
      <path d="M12 7.5a2 2 0 100-4" />
      <path d="M15 14c0-2.21-1.34-4.1-3.2-4.79" />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompanySidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { label: "Projects", href: "/company/projects", icon: <IconFolder /> },
    { label: "Invoices", href: "/company/invoices", icon: <IconInvoice /> },
    ...(role === "company_admin"
      ? [{ label: "Team", href: "/company/team", icon: <IconTeam /> }]
      : []),
  ];

  useEffect(() => {
    try {
      if (localStorage.getItem("company-sidebar-collapsed") === "true") {
        setCollapsed(true);
      }
    } catch { /* ignore */ }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("company-sidebar-collapsed", String(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-screen bg-canvas transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Brand + toggle */}
      {collapsed ? (
        <div className="h-14 flex-shrink-0 flex items-center justify-center gap-1">
          <Logo variant="icon" />
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash transition-colors flex-shrink-0"
          >
            <IconChevronRight />
          </button>
        </div>
      ) : (
        <div className="h-14 flex items-center flex-shrink-0 px-3 gap-2">
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            <Logo variant="banner" />
            <span className="text-[10px] font-semibold text-muted bg-wash rounded px-1.5 py-0.5 tracking-wide whitespace-nowrap">
              PORTAL
            </span>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash transition-colors flex-shrink-0"
          >
            <IconChevronLeft />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center rounded-lg text-sm transition-colors
                ${collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"}
                ${active
                  ? "bg-wash text-ink font-medium"
                  : "text-dim hover:bg-wash hover:text-ink"
                }
              `}
            >
              <span className={`flex-shrink-0 ${active ? "text-primary" : "text-muted"}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
