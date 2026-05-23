// Section-level access model for the project workspace.
//
// Each entry defines whether a role can VIEW and/or EDIT a given section.
// Use canViewSection / canEditSection at the call site — do not scatter
// inline role comparisons throughout page files.
//
// Expanding access later:
//   - To give designers optional package access: set package_history.view = true for designer
//   - To add a new role: add a key to SECTION_ACCESS with its full access map

export type WorkspaceSectionId =
  // Intake tab — project identity + client-provided inputs
  | "project_details"
  | "intake_files"
  | "intake_edit"
  | "sld_upload"
  // Setup tab — read-only context for design work (designer view)
  | "authority_context"
  | "tcd_reference"
  | "designer_assignment"
  // Setup tab — admin-only operational controls
  | "project_intelligence"
  | "authority_setup"
  | "template_setup"
  | "requirement_overrides"
  | "setup_checklist"
  // Design tab
  | "sld_sheets"
  | "tcp_sheets"
  | "tcp_submit"
  | "design_review"       // admin approval / revision request controls
  // Package tab
  | "package_history"
  | "package_generate"
  | "package_composition"
  | "package_separate_outputs"
  // Submission tab
  | "submission_tracking"
  // Billing tab
  | "billing"
  // Activity tab
  | "status_updates"
  | "workflow_activity";

type Access = { view: boolean; edit: boolean };

// Default for any section not explicitly listed under a role
const DENY: Access = { view: false, edit: false };

const SECTION_ACCESS: Record<string, Partial<Record<WorkspaceSectionId, Access>>> = {
  admin: {
    // Admin has full access to everything — this is the single authoritative
    // declaration; the admin page itself doesn't need runtime checks.
    project_details:       { view: true, edit: true },
    intake_files:          { view: true, edit: true },
    intake_edit:           { view: true, edit: true },
    sld_upload:            { view: true, edit: true },
    authority_context:     { view: true, edit: true },
    tcd_reference:         { view: true, edit: true },
    designer_assignment:   { view: true, edit: true },
    project_intelligence:  { view: true, edit: true },
    authority_setup:       { view: true, edit: true },
    template_setup:        { view: true, edit: true },
    requirement_overrides: { view: true, edit: true },
    setup_checklist:       { view: true, edit: true },
    sld_sheets:            { view: true, edit: true },
    tcp_sheets:            { view: true, edit: true },
    tcp_submit:            { view: true, edit: true },
    design_review:         { view: true, edit: true },
    package_history:            { view: true, edit: true },
    package_generate:           { view: true, edit: true },
    package_composition:        { view: true, edit: true },
    package_separate_outputs:   { view: true, edit: true },
    submission_tracking:   { view: true, edit: true },
    billing:               { view: true, edit: true },
    status_updates:        { view: true, edit: true },
    workflow_activity:     { view: true, edit: true },
  },

  designer: {
    // Intake tab — read-only project context
    project_details:       { view: true,  edit: false },
    intake_files:          { view: true,  edit: false },
    intake_edit:           { view: false, edit: false },
    sld_upload:            { view: false, edit: false },
    // Setup tab — read-only design reference context
    authority_context:     { view: true,  edit: false },
    tcd_reference:         { view: true,  edit: false },
    designer_assignment:   { view: true,  edit: false },
    // Admin operational controls — hidden from designers
    project_intelligence:  { view: false, edit: false },
    authority_setup:       { view: false, edit: false },
    template_setup:        { view: false, edit: false },
    requirement_overrides: { view: false, edit: false },
    setup_checklist:       { view: false, edit: false },
    // Design tab — designers own the design deliverable
    sld_sheets:            { view: true,  edit: false },
    tcp_sheets:            { view: true,  edit: true  },
    tcp_submit:            { view: true,  edit: true  },
    design_review:         { view: false, edit: false },
    // Package tab — read-only composition view; no generation controls
    package_history:            { view: true,  edit: false },
    package_generate:           { view: false, edit: false },
    package_composition:        { view: true,  edit: false },
    package_separate_outputs:   { view: false, edit: false },
    submission_tracking:   { view: false, edit: false },
    billing:               { view: false, edit: false },
    // Activity tab
    status_updates:        { view: true,  edit: true  },
    workflow_activity:     { view: true,  edit: false },
  },
};

export function canViewSection(role: string, section: WorkspaceSectionId): boolean {
  return (SECTION_ACCESS[role]?.[section] ?? DENY).view;
}

export function canEditSection(role: string, section: WorkspaceSectionId): boolean {
  return (SECTION_ACCESS[role]?.[section] ?? DENY).edit;
}
