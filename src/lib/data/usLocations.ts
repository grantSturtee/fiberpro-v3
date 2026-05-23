/**
 * US states + counties for cover template matching.
 *
 * All 50 states are listed. County data is currently seeded only for NJ, NY,
 * and PA — the primary operating states. For all other states countiesForState
 * returns [] and the UI shows "No counties loaded yet."
 *
 * To extend: add an entry to COUNTIES_BY_STATE using the two-letter USPS
 * abbreviation as the key.
 */

export type StateEntry = { abbr: string; name: string };

export const STATES: StateEntry[] = [
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
];

export const COUNTIES_BY_STATE: Record<string, string[]> = {
  NJ: [
    "Atlantic", "Bergen", "Burlington", "Camden", "Cape May",
    "Cumberland", "Essex", "Gloucester", "Hudson", "Hunterdon",
    "Mercer", "Middlesex", "Monmouth", "Morris", "Ocean",
    "Passaic", "Salem", "Somerset", "Sussex", "Union", "Warren",
  ],
  NY: [
    "Albany", "Allegany", "Bronx", "Broome", "Cattaraugus", "Cayuga",
    "Chautauqua", "Chemung", "Chenango", "Clinton", "Columbia",
    "Cortland", "Delaware", "Dutchess", "Erie", "Essex", "Franklin",
    "Fulton", "Genesee", "Greene", "Hamilton", "Herkimer", "Jefferson",
    "Kings", "Lewis", "Livingston", "Madison", "Monroe", "Montgomery",
    "Nassau", "New York", "Niagara", "Oneida", "Onondaga", "Ontario",
    "Orange", "Orleans", "Oswego", "Otsego", "Putnam", "Queens",
    "Rensselaer", "Richmond", "Rockland", "St. Lawrence", "Saratoga",
    "Schenectady", "Schoharie", "Schuyler", "Seneca", "Steuben",
    "Suffolk", "Sullivan", "Tioga", "Tompkins", "Ulster", "Warren",
    "Washington", "Wayne", "Westchester", "Wyoming", "Yates",
  ],
  PA: [
    "Adams", "Allegheny", "Armstrong", "Beaver", "Bedford", "Berks",
    "Blair", "Bradford", "Bucks", "Butler", "Cambria", "Cameron",
    "Carbon", "Centre", "Chester", "Clarion", "Clearfield", "Clinton",
    "Columbia", "Crawford", "Cumberland", "Dauphin", "Delaware", "Elk",
    "Erie", "Fayette", "Forest", "Franklin", "Fulton", "Greene",
    "Huntingdon", "Indiana", "Jefferson", "Juniata", "Lackawanna",
    "Lancaster", "Lawrence", "Lebanon", "Lehigh", "Luzerne", "Lycoming",
    "McKean", "Mercer", "Mifflin", "Monroe", "Montgomery", "Montour",
    "Northampton", "Northumberland", "Perry", "Philadelphia", "Pike",
    "Potter", "Schuylkill", "Snyder", "Somerset", "Sullivan",
    "Susquehanna", "Tioga", "Union", "Venango", "Warren", "Washington",
    "Wayne", "Westmoreland", "Wyoming", "York",
  ],
};

/** Return counties for a state abbreviation, or [] if not yet loaded. */
export function countiesForState(abbr: string): string[] {
  return COUNTIES_BY_STATE[abbr] ?? [];
}
