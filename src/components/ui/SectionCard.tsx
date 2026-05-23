type SectionCardProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
  id?: string;
  flat?: boolean; // white-workspace mode: no card shell (bg/shadow/radius)
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  noPad = false,
  id,
  flat = false,
}: SectionCardProps) {
  if (flat) {
    return (
      <div id={id} className={className}>
        {(title || action) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
              {description && (
                <p className="mt-0.5 text-xs text-muted">{description}</p>
              )}
            </div>
            {action && (
              <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
            )}
          </div>
        )}
        <div className={noPad ? "" : title || action ? "px-6 pb-6" : "p-6"}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`bg-card rounded-xl ${className}`}
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            )}
          </div>
          {action && (
            <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
          )}
        </div>
      )}
      <div className={noPad ? "" : title || action ? "px-6 pb-6" : "p-6"}>
        {children}
      </div>
    </div>
  );
}
