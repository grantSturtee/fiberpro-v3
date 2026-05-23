// Structural slots that every active blueprint must have, regardless of the
// authority. These are the "package body" sections.
const REQUIRED_SLOTS = [
  { key: "cover_page_template_id", label: "Cover Sheet" },
  { key: "tcp_wrapper_id",         label: "TCP Wrapper" },
  { key: "tcd_wrapper_id",         label: "TCD Wrapper" },
  { key: "sld_wrapper_id",         label: "SLD Wrapper" },
] as const;

// Authority-required add-ons that block activation when missing.
//
// Only the Application Form is treated as activation-blocking. Certification
// Form and COI are flagged in the UI as "Required by authority" but their
// blueprint templates are optional — projects may upload/provide those forms
// directly when no template is configured. This intentionally diverges from
// authority_profiles.requires_certification / requires_coi as a *blueprint*
// completeness gate; those flags still drive UI labels and generation logic.
const AUTHORITY_REQUIRED_DOCS = [
  {
    requiresKey: "requires_application",
    label: "Application Form",
    keys: ["app_page_template_id", "application_template_id"],
  },
] as const;

export type AuthorityRequirements = {
  requires_application?:   boolean | null;
  requires_certification?: boolean | null;
  requires_coi?:           boolean | null;
};

export function getBlueprintMissingRequired(
  bp: Record<string, unknown>
): string[] {
  return REQUIRED_SLOTS.filter(({ key }) => !bp[key]).map(({ label }) => label);
}

export function getBlueprintMissingAuthorityDocs(
  bp: Record<string, unknown>,
  authority: AuthorityRequirements | null | undefined
): string[] {
  if (!authority) return [];
  const missing: string[] = [];
  for (const doc of AUTHORITY_REQUIRED_DOCS) {
    if (!authority[doc.requiresKey]) continue;
    const configured = doc.keys.some((k) => !!bp[k]);
    if (!configured) missing.push(doc.label);
  }
  return missing;
}

// Combined error message helper used by activation actions.
export function buildActivationError(
  missingSections: string[],
  missingAuthorityDocs: string[]
): string | null {
  if (missingSections.length === 0 && missingAuthorityDocs.length === 0) return null;
  const parts: string[] = [];
  if (missingSections.length > 0) {
    parts.push(`missing required sections: ${missingSections.join(", ")}`);
  }
  if (missingAuthorityDocs.length > 0) {
    parts.push(`missing required authority documents: ${missingAuthorityDocs.join(", ")}`);
  }
  return `Cannot activate blueprint — ${parts.join("; ")}.`;
}
