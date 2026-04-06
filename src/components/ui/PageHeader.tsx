type PageHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  meta?: React.ReactNode; // small metadata row (e.g., breadcrumb, last updated)
};

export function PageHeader({ title, subtitle, action, meta }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {meta && (
          <div className="mb-1 text-xs text-muted">{meta}</div>
        )}
        <h1 className="text-xl font-semibold text-ink leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-dim">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
      )}
    </div>
  );
}
