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
              <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
              {description && (
                <p className="mt-0.5 text-xs text-[#6B7280]">{description}</p>
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
      className={`bg-white border border-[#E5E7EB] rounded-lg ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-[#6B7280]">{description}</p>
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
