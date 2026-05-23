import Link from "next/link";

type Props = {
  href: string;
  label: string;
  className?: string;
  noMargin?: boolean;
};

export function SettingsBackButton({ href, label, className = "", noMargin = false }: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 ${noMargin ? "" : "mb-4 "}px-2.5 py-1 rounded-md border border-[#d4dde4] bg-canvas text-xs font-medium text-muted hover:text-ink hover:border-[#b0bec5] transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M8 10L4 6.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Link>
  );
}
