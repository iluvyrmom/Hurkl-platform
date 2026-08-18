import type { DebrisCategory } from "@/lib/domain/facility";

export const DEBRIS_CATEGORY_LABELS: Record<DebrisCategory, string> = {
  general_junk: "General Junk",
  yard_debris: "Yard Debris",
  construction_debris: "Construction Debris",
  appliances: "Appliances",
  tires: "Tires",
  electronics: "Electronics",
  mattresses: "Mattresses",
  furniture: "Furniture",
  metal_scrap: "Metal Scrap",
  hazmat: "Hazmat",
};

export const DEBRIS_CATEGORIES: DebrisCategory[] = Object.keys(
  DEBRIS_CATEGORY_LABELS,
) as DebrisCategory[];

export const LOAD_SIZE_PRESETS = [
  { label: "1/8 Load", yards: 1.5 },
  { label: "1/4 Load", yards: 3 },
  { label: "1/2 Load", yards: 6 },
  { label: "3/4 Load", yards: 9 },
  { label: "Full Load", yards: 12 },
] as const;
