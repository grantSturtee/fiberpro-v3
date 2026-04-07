"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/ui/SignOutButton";

// ── Icons (inline SVG, 16×16 grid) ──────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
    </svg>
  );
}

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

function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="2" width="10" height="12" rx="1" fill="currentColor" opacity=".25" />
      <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5.5" y="5" width="2" height="2" rx=".5" fill="currentColor" />
      <rect x="8.5" y="5" width="2" height="2" rx=".5" fill="currentColor" />
      <rect x="5.5" y="8" width="2" height="2" rx=".5" fill="currentColor" />
      <rect x="8.5" y="8" width="2" height="2" rx=".5" fill="currentColor" />
      <rect x="6" y="11" width="4" height="3" rx=".5" fill="currentColor" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="5.5" r="2.5" fill="currentColor" />
      <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="5" r="2" fill="currentColor" opacity=".6" />
      <path d="M14 13c0-2.21-1.34-4-3-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

function IconBilling() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="currentColor" opacity=".2" />
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="6.5" width="13" height="2" fill="currentColor" opacity=".35" />
      <rect x="3.5" y="9.5" width="3" height="1" rx=".5" fill="currentColor" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      <path
        d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M12.6 3.4l-.7.7M4.1 11.9l-.7.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Chevron for collapse toggle
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

// ── Nav definition ───────────────────────────────────────────────────────────

const navItems = [
  { label: "Dashboard",  href: "/admin",           icon: <IconGrid />,     exact: true },
  { label: "Projects",   href: "/admin/projects",   icon: <IconFolder /> },
  { label: "Companies",  href: "/admin/companies",  icon: <IconBuilding /> },
  { label: "Users",      href: "/admin/users",      icon: <IconUsers /> },
  { label: "Billing",    href: "/admin/billing",    icon: <IconBilling /> },
  { label: "Settings",   href: "/admin/settings",   icon: <IconSettings /> },
];

// ── Props ────────────────────────────────────────────────────────────────────

type SidebarUser = {
  displayName: string;
  role: string;
  initials: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export function AdminSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      if (localStorage.getItem("admin-sidebar-collapsed") === "true") {
        setCollapsed(true);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar-collapsed", String(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-screen bg-canvas transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width: collapsed ? 52 : 220 }}
    >
      {/* Brand + toggle */}
      <div className="h-14 flex items-center flex-shrink-0 px-3 gap-2">
        {collapsed ? (
          // Collapsed: just the "F" mark, centered
          <div className="flex-1 flex justify-center">
            <span className="text-sm font-bold text-primary">F</span>
          </div>
        ) : (
          // Expanded: full brand mark
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-bold text-ink tracking-tight whitespace-nowrap">
              Fiber<span className="text-primary">Pro</span>
            </span>
            <span className="text-[10px] font-semibold text-muted bg-wash rounded px-1.5 py-0.5 tracking-wide whitespace-nowrap">
              V3
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash transition-colors flex-shrink-0"
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
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
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User identity */}
      <div className="px-1.5 py-3 flex-shrink-0">
        {collapsed ? (
          // Collapsed: avatar centered, sign out below
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center"
              title={user.displayName}
            >
              <span className="text-[10px] font-semibold text-primary">{user.initials}</span>
            </div>
            <SignOutButton />
          </div>
        ) : (
          // Expanded: full user row
          <div className="rounded-lg bg-wash px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-primary">{user.initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink truncate">{user.displayName}</p>
              <p className="text-[10px] text-muted capitalize">{user.role}</p>
            </div>
            <SignOutButton />
          </div>
        )}
      </div>
    </aside>
  );
}
