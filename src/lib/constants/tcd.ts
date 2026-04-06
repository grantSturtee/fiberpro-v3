import type { TcdLibraryItem } from "@/types/domain";

// Placeholder TCD library data.
// TODO: Replace with Supabase query — tcd_library table.
// Each item will have a fileUrl pointing to a PDF in Supabase Storage.

export const TCD_LIBRARY_PLACEHOLDER: TcdLibraryItem[] = [
  {
    id: "tcd-1",
    code: "TCD-1",
    description: "2-lane road, shoulder closure, no flaggers",
    category: "shoulder",
  },
  {
    id: "tcd-2",
    code: "TCD-2",
    description: "Divided highway shoulder closure, no flaggers",
    category: "shoulder",
  },
  {
    id: "tcd-3",
    code: "TCD-3",
    description: "2-lane road, lane/shoulder closure, flaggers required",
    category: "lane",
  },
  {
    id: "tcd-5",
    code: "TCD-5",
    description: "Ramp closure, no flaggers",
    category: "ramp",
  },
  {
    id: "tcd-11",
    code: "TCD-11",
    description: "Single lane alternating, flaggers required",
    category: "lane",
  },
  {
    id: "tcd-14",
    code: "TCD-14",
    description: "Two-lane highway, median crossover",
    category: "highway",
  },
  {
    id: "tcd-20",
    code: "TCD-20",
    description: "Intersection approach closure, signal modification",
    category: "intersection",
  },
];
