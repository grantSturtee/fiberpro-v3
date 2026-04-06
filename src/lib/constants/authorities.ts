// Authority and location constants for telecom permit workflows.
// NJ-first but structured for multi-state extensibility.

// ── Authority type ─────────────────────────────────────────────────────────────
// Display labels for the permit-issuing authority type.
// "State" maps to the `njdot` DB enum value for now (NJ-first).
// TODO: When expanding to multi-state, add a `state_dot` enum value to the schema.

export const AUTHORITY_TYPE_OPTIONS = [
  "County",
  "State",
  "Municipal",
  "Other",
] as const;

export type AuthorityTypeDisplay = (typeof AUTHORITY_TYPE_OPTIONS)[number];

// Maps display label → DB enum value (authority_type column).
export const AUTHORITY_TYPE_DB_MAP: Record<AuthorityTypeDisplay, string> = {
  County:    "county",
  State:     "njdot",     // Stored as njdot in DB; generalizable in a later migration
  Municipal: "municipal",
  Other:     "other",
};

// ── US States ─────────────────────────────────────────────────────────────────
// Full list for state selection in location fields.
// Current workflow is NJ-focused; other states are present for completeness.

export const US_STATES = [
  { abbr: "AL", name: "Alabama" },
  { abbr: "AK", name: "Alaska" },
  { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" },
  { abbr: "CA", name: "California" },
  { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" },
  { abbr: "DE", name: "Delaware" },
  { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" },
  { abbr: "HI", name: "Hawaii" },
  { abbr: "ID", name: "Idaho" },
  { abbr: "IL", name: "Illinois" },
  { abbr: "IN", name: "Indiana" },
  { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" },
  { abbr: "KY", name: "Kentucky" },
  { abbr: "LA", name: "Louisiana" },
  { abbr: "ME", name: "Maine" },
  { abbr: "MD", name: "Maryland" },
  { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" },
  { abbr: "MN", name: "Minnesota" },
  { abbr: "MS", name: "Mississippi" },
  { abbr: "MO", name: "Missouri" },
  { abbr: "MT", name: "Montana" },
  { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" },
  { abbr: "NH", name: "New Hampshire" },
  { abbr: "NJ", name: "New Jersey" },
  { abbr: "NM", name: "New Mexico" },
  { abbr: "NY", name: "New York" },
  { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" },
  { abbr: "OH", name: "Ohio" },
  { abbr: "OK", name: "Oklahoma" },
  { abbr: "OR", name: "Oregon" },
  { abbr: "PA", name: "Pennsylvania" },
  { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" },
  { abbr: "SD", name: "South Dakota" },
  { abbr: "TN", name: "Tennessee" },
  { abbr: "TX", name: "Texas" },
  { abbr: "UT", name: "Utah" },
  { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" },
  { abbr: "WA", name: "Washington" },
  { abbr: "WV", name: "West Virginia" },
  { abbr: "WI", name: "Wisconsin" },
  { abbr: "WY", name: "Wyoming" },
] as const;

export type USState = (typeof US_STATES)[number];

// ── NJ Counties ───────────────────────────────────────────────────────────────
// Kept for admin-side use and reference.
// Not used in client-facing form (county is a free-text field in the submit form).

export const NJ_COUNTIES = [
  "Atlantic",
  "Bergen",
  "Burlington",
  "Camden",
  "Cape May",
  "Cumberland",
  "Essex",
  "Gloucester",
  "Hudson",
  "Hunterdon",
  "Mercer",
  "Middlesex",
  "Monmouth",
  "Morris",
  "Ocean",
  "Passaic",
  "Salem",
  "Somerset",
  "Sussex",
  "Union",
  "Warren",
] as const;

export type NJCounty = (typeof NJ_COUNTIES)[number];
