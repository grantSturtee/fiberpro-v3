// ── resolveRequirements ────────────────────────────────────────────────────────
// Computes the effective per-requirement boolean for a project by applying
// project-level overrides on top of the linked authority_profile defaults.
//
// Tri-state override semantics (matches the DB column design):
//   NULL  = inherit the authority_profile default
//   true  = force required regardless of authority setting
//   false = force suppressed regardless of authority setting
//
// pe_required is the pre-existing PE override column and follows the same semantics.
// All other overrides use the req_*_override column naming convention.

export type AuthorityRequirementDefaults = {
  requires_application:     boolean;
  requires_certification:   boolean;
  requires_coi:             boolean;
  requires_pe:              boolean;
  requires_hard_copies:     boolean;
  requires_certified_check: boolean;
  notification_only:        boolean;
};

export type ProjectRequirementOverrides = {
  req_application_override:       boolean | null;
  req_certification_override:     boolean | null;
  req_coi_override:               boolean | null;
  req_hard_copies_override:       boolean | null;
  req_certified_check_override:   boolean | null;
  req_notification_only_override: boolean | null;
  pe_required:                    boolean | null; // pre-existing PE override column
};

export type ResolvedRequirements = {
  requiresApplication:    boolean;
  requiresCertification:  boolean;
  requiresCoi:            boolean;
  requiresPe:             boolean;
  requiresHardCopies:     boolean;
  requiresCertifiedCheck: boolean;
  notificationOnly:       boolean;
};

export function resolveRequirements(
  authority: AuthorityRequirementDefaults,
  overrides: ProjectRequirementOverrides
): ResolvedRequirements {
  return {
    requiresApplication:    overrides.req_application_override       ?? authority.requires_application,
    requiresCertification:  overrides.req_certification_override     ?? authority.requires_certification,
    requiresCoi:            overrides.req_coi_override               ?? authority.requires_coi,
    requiresPe:             overrides.pe_required                    ?? authority.requires_pe,
    requiresHardCopies:     overrides.req_hard_copies_override       ?? authority.requires_hard_copies,
    requiresCertifiedCheck: overrides.req_certified_check_override   ?? authority.requires_certified_check,
    notificationOnly:       overrides.req_notification_only_override ?? authority.notification_only,
  };
}

// Returns true if any project-level override differs from the authority default.
// Used by the UI to show an "overridden" indicator on the requirements panel.
export function hasRequirementOverrides(
  authority: AuthorityRequirementDefaults,
  overrides: ProjectRequirementOverrides
): boolean {
  const resolved = resolveRequirements(authority, overrides);
  return (
    resolved.requiresApplication   !== authority.requires_application    ||
    resolved.requiresCertification !== authority.requires_certification  ||
    resolved.requiresCoi           !== authority.requires_coi            ||
    resolved.requiresPe            !== authority.requires_pe             ||
    resolved.requiresHardCopies    !== authority.requires_hard_copies    ||
    resolved.requiresCertifiedCheck !== authority.requires_certified_check ||
    resolved.notificationOnly      !== authority.notification_only
  );
}
