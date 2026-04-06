"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/ui/SignOutButton";

const navItems = [
  { label: "Projects", href: "/company/projects" },
];

export function CompanyHeader() {
  const pathname = usePathname();

  return (
    <header className="h-14 bg-card flex items-center px-6 flex-shrink-0"
      style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.07)" }}>
      {/* Wordmark */}
      <Link href="/company" className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold text-ink tracking-tight">
          Fiber<span className="text-primary">Pro</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex items-center gap-1 ml-8">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-3 py-1.5 rounded-md text-sm transition-colors
                ${
                  active
                    ? "bg-canvas text-ink font-medium"
                    : "text-dim hover:text-ink hover:bg-canvas"
                }
              `}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/company/submit"
          className="px-3.5 py-1.5 rounded-md text-sm font-medium text-white bg-primary hover:bg-primary-dim transition-colors"
        >
          + Submit Project
        </Link>

        {/* TODO: Replace with session user data + dropdown */}
        <div className="flex items-center gap-2 pl-3"
          style={{ borderLeft: "1px solid #e3e9ec" }}>
          <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center">
            <span className="text-[10px] font-semibold text-primary">JD</span>
          </div>
          <div className="hidden sm:block">
            {/* TODO: Replace with session user data */}
            <p className="text-xs font-medium text-ink leading-none">My Account</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
