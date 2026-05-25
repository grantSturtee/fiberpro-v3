type CompanyTopbarProps = {
  companyName?: string;
};

export function CompanyTopbar({ companyName }: CompanyTopbarProps) {
  return (
    <header
      className="flex-shrink-0 flex items-center bg-white border-b border-[#E5E7EB]"
      style={{ height: 48, padding: "0 32px" }}
    >
      {companyName && (
        <p className="text-[14px] font-semibold text-[#111827] truncate">
          {companyName}
        </p>
      )}
    </header>
  );
}
