"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/ui/SignOutButton";

const navItems = [
  { label: "Projects", href: "/company/projects" },
];

type CompanyHeaderProps = {
  companyName?: string;
};

export function CompanyHeader({ companyName }: CompanyHeaderProps) {
  const pathname = usePathname();

  return (
    <header
      className="flex-shrink-0 bg-card"
      style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.07)" }}
    >
      {/* ── Primary bar ── */}
      <div className="h-14 flex items-center px-6 gap-6">

        {/* Wordmark + company context */}
        <Link href="/company" className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-sm font-bold text-ink tracking-tight">
            Fiber<span className="text-primary">Pro</span>
          </span>
          {companyName && (
            <>
              <span className="text-faint text-sm">/</span>
              <span className="text-sm font-medium text-dim">{companyName}</span>
            </>
          )}
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0.5">
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
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Submit Project
          </Link>

          {/* Account */}
          <div
            className="flex items-center gap-2.5 pl-3"
            style={{ borderLeft: "1px solid #e3e9ec" }}
          >
            <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
              {/* TODO: Replace with user initials from session */}
              <span className="text-[10px] font-semibold text-primary">
                {companyName ? companyName.slice(0, 1).toUpperCase() : "?"}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
