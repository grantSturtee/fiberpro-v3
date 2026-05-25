type PageHeaderProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  action?: React.ReactNode;
  size?: "lg" | "sm";
};

const TITLE_STYLES: Record<"lg" | "sm", React.CSSProperties> = {
  lg: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#111827",
    textTransform: "uppercase",
    lineHeight: 1.1,
  },
  sm: {
    fontSize: 20,
    fontWeight: 600,
    color: "#111827",
    lineHeight: 1.25,
  },
};

export function PageHeader({
  title,
  subtitle,
  meta,
  action,
  size = "lg",
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {meta && (
          <div className="mb-1 text-[12px] text-[#6B7280]">{meta}</div>
        )}
        <h1 className="truncate" style={TITLE_STYLES[size]}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[14px] text-[#6B7280]">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
      )}
    </div>
  );
}
