"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";

// ── Nav definition ───────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { label: "My Work", href: "/designer",         icon: LayoutDashboard },
  { label: "Profile", href: "/designer/profile", icon: UserCircle },
];

// ── Props ────────────────────────────────────────────────────────────────────

type SidebarUser = {
  displayName: string;
  role: string;
  avatarUrl: string | null;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ── Component ────────────────────────────────────────────────────────────────

export function DesignerSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem("designer-sidebar-collapsed") === "true") {
        setCollapsed(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("designer-sidebar-collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function isActive(href: string) {
    // My Work also covers /designer/projects/* (the project detail pages),
    // matching the original DesignerSidebar behavior.
    if (href === "/designer") {
      return pathname === "/designer" || pathname.startsWith("/designer/projects");
    }
    return pathname.startsWith(href);
  }

  function NavLink({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={[
          "flex items-center rounded-lg transition-colors",
          "h-9 text-[13px] font-medium leading-[18px]",
          collapsed ? "justify-center px-0" : "gap-[10px] px-3",
          active
            ? "bg-[#E8F0FE] text-[#1565C0]"
            : "text-[#6B7280] hover:bg-[#F3F4F6]",
        ].join(" ")}
      >
        <Icon size={18} strokeWidth={1.5} className="flex-shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-screen bg-[#F4F5F7] border-r border-[#E5E7EB] transition-all duration-200 ease-in-out overflow-hidden"
      style={{ width: collapsed ? 56 : 200 }}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center px-3" style={{ height: 48 }}>
        {!collapsed && (
          <span
            className="flex-1 truncate"
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: "#1565C0",
              textTransform: "uppercase",
            }}
          >
            GRANTED
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={[
            "flex items-center justify-center w-6 h-6 rounded text-[#9CA3AF]",
            "hover:text-[#6B7280] transition-colors flex-shrink-0",
            collapsed ? "mx-auto" : "",
          ].join(" ")}
        >
          {collapsed
            ? <ChevronRight size={16} strokeWidth={1.5} />
            : <ChevronLeft  size={16} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 pt-1 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 pt-2 pb-3 border-t border-[#E5E7EB]">
        {collapsed ? (
          <div className="flex justify-center">
            <Link href="/designer/profile" title={user.displayName}>
              <Avatar user={user} />
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/designer/profile"
              className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
            >
              <Avatar user={user} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#111827] leading-tight truncate">
                  {user.displayName}
                </p>
                <p className="text-[11px] font-normal text-[#6B7280] leading-tight truncate mt-0.5">
                  {formatRole(user.role)}
                </p>
              </div>
            </Link>
            <form action={signOut} className="flex-shrink-0">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="flex items-center justify-center w-6 h-6 rounded text-[#6B7280] hover:text-[#DC2626] transition-colors"
              >
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Avatar (inline) ──────────────────────────────────────────────────────────
// Matches the design spec (32px circle, #1565C0 bg, white initials, 12px 600).
// Falls back to avatarUrl photo when provided.

function Avatar({ user }: { user: SidebarUser }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: 32, height: 32 }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: 32,
        height: 32,
        background: "#1565C0",
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {getInitials(user.displayName)}
    </div>
  );
}
