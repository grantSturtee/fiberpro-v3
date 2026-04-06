// Authority and location constants for NJ telecom permit workflows.
// Used in intake forms, project display, and jurisdiction configuration.

export const AUTHORITY_TYPE_OPTIONS = [
  "County",
  "NJDOT",
  "Municipal",
  "Other",
] as const;

export type AuthorityTypeDisplay = (typeof AUTHORITY_TYPE_OPTIONS)[number];

// All 21 NJ counties, alphabetical.
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
