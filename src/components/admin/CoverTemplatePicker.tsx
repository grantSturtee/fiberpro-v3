"use client";

import { useState } from "react";

type CoverTemplate = {
  id: string;
  name: string;
  authority_type: string | null;
  county: string | null;
};

export function CoverTemplatePicker({
  templates,
  defaultId,
  compact = false,
}: {
  templates: CoverTemplate[];
  defaultId?: string | null;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(defaultId ?? "");

  if (templates.length === 0) {
    return <input type="hidden" name="cover_template_id" value="" />;
  }

  const select = (
    <select
      name="cover_template_id"
      value={selected}
      onChange={(e) => setSelected(e.target.value)}
      className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
      style={{ border: "1px solid #d4dde4" }}
    >
      <option value="">— None —</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.county ? ` (${t.county} County)` : ""}
        </option>
      ))}
    </select>
  );

  if (compact) return select;

  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5">Cover Sheet Template</label>
      {select}
    </div>
  );
}
