import { supabase } from "@/lib/supabase";

// -------------------------------------------------------
// Tipler
// -------------------------------------------------------

export const OIL_TYPES: { value: string; label: string }[] = [
  { value: "essential", label: "Uçucu Yağ" },
  { value: "carrier", label: "Sabit Yağ" },
  { value: "hydrosol", label: "Hidrosol" },
  { value: "resin", label: "Reçine" },
  { value: "absolute", label: "Mutlak / Ekstrakt" },
];

export const OIL_TYPE_LABELS: Record<string, string> = {
  essential: "Uçucu Yağ",
  carrier: "Sabit Yağ",
  hydrosol: "Hidrosol",
  resin: "Reçine",
  absolute: "Mutlak / Ekstrakt",
};

export function oilTypeLabel(oilType: string): string {
  return OIL_TYPE_LABELS[oilType] ?? oilType;
}

export function oilTypeBadgeClass(oilType: string): string {
  switch (oilType) {
    case "essential":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "carrier":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "hydrosol":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "resin":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "absolute":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export type AromatherapyOil = {
  id: string;
  tenant_id: string | null;
  name: string;
  latin_name: string;
  oil_type: string;
  category: string;
  extraction_method: string;
  plant_part: string;
  origin: string;
  aroma_profile: string;
  aroma_note: string;
  color: string;
  consistency: string;
  main_components: string;
  therapeutic_properties: string[];
  benefits: string;
  emotional_benefits: string;
  physical_benefits: string;
  spiritual_benefits: string;
  skin_benefits: string;
  usage_methods: string;
  dilution_ratio: string;
  safety_notes: string;
  contraindications: string;
  blends_well_with: string[];
  chakra_connection: string;
  element_connection: string;
  notes: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type OilListRow = Pick<
  AromatherapyOil,
  | "id"
  | "tenant_id"
  | "name"
  | "latin_name"
  | "oil_type"
  | "category"
  | "origin"
  | "aroma_profile"
  | "benefits"
  | "physical_benefits"
  | "emotional_benefits"
  | "skin_benefits"
  | "spiritual_benefits"
  | "usage_methods"
  | "chakra_connection"
  | "element_connection"
  | "therapeutic_properties"
  | "created_at"
  | "updated_at"
>;

const LIST_SELECT =
  "id,tenant_id,name,latin_name,oil_type,category,origin,aroma_profile,benefits,physical_benefits,emotional_benefits,skin_benefits,spiritual_benefits,usage_methods,chakra_connection,element_connection,therapeutic_properties,created_at,updated_at";

// -------------------------------------------------------
// Sorgular
// -------------------------------------------------------

export async function fetchOilList(tenantId: string): Promise<{
  rows: OilListRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("aromatherapy_oils")
    .select(LIST_SELECT)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as OilListRow[], error: null };
}

export async function fetchOilDetail(
  tenantId: string,
  id: string,
): Promise<{
  oil: AromatherapyOil | null;
  error: string | null;
  notFound: boolean;
}> {
  const { data, error } = await supabase
    .from("aromatherapy_oils")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return { oil: null, error: null, notFound: true };
    return { oil: null, error: error.message, notFound: false };
  }
  return { oil: data as AromatherapyOil, error: null, notFound: false };
}

// -------------------------------------------------------
// Yardımcılar
// -------------------------------------------------------

export function matchesOilSearch(row: OilListRow, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.trim().toLowerCase();
  const fields = [
    row.name,
    row.latin_name,
    row.category,
    row.origin,
    row.aroma_profile,
    row.benefits,
    row.physical_benefits,
    row.emotional_benefits,
    row.skin_benefits,
    row.spiritual_benefits,
    row.usage_methods,
    row.chakra_connection,
    row.element_connection,
  ];
  return (
    fields.some((f) => f?.toLowerCase().includes(q)) ||
    (row.therapeutic_properties ?? []).some((p) => p.toLowerCase().includes(q))
  );
}

export function oilListRowPreview(row: OilListRow, max = 120): string {
  for (const text of [row.physical_benefits, row.emotional_benefits, row.benefits, row.aroma_profile]) {
    const t = text?.trim();
    if (t) return t.length > max ? t.slice(0, max) + "…" : t;
  }
  return "";
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,،;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

// -------------------------------------------------------
// Boş form
// -------------------------------------------------------

export type OilFormData = Omit<
  AromatherapyOil,
  "id" | "tenant_id" | "is_active" | "created_at" | "updated_at"
> & {
  therapeutic_properties_raw: string;
  blends_well_with_raw: string;
};

export const EMPTY_OIL_FORM: OilFormData = {
  name: "",
  latin_name: "",
  oil_type: "essential",
  category: "",
  extraction_method: "",
  plant_part: "",
  origin: "",
  aroma_profile: "",
  aroma_note: "",
  color: "",
  consistency: "",
  main_components: "",
  therapeutic_properties: [],
  therapeutic_properties_raw: "",
  benefits: "",
  emotional_benefits: "",
  physical_benefits: "",
  spiritual_benefits: "",
  skin_benefits: "",
  usage_methods: "",
  dilution_ratio: "",
  safety_notes: "",
  contraindications: "",
  blends_well_with: [],
  blends_well_with_raw: "",
  chakra_connection: "",
  element_connection: "",
  notes: "",
  source: "",
};

export function oilToFormData(oil: AromatherapyOil): OilFormData {
  return {
    name: oil.name,
    latin_name: oil.latin_name,
    oil_type: oil.oil_type,
    category: oil.category,
    extraction_method: oil.extraction_method,
    plant_part: oil.plant_part,
    origin: oil.origin,
    aroma_profile: oil.aroma_profile,
    aroma_note: oil.aroma_note,
    color: oil.color,
    consistency: oil.consistency,
    main_components: oil.main_components,
    therapeutic_properties: oil.therapeutic_properties ?? [],
    therapeutic_properties_raw: tagsToInput(oil.therapeutic_properties ?? []),
    benefits: oil.benefits,
    emotional_benefits: oil.emotional_benefits,
    physical_benefits: oil.physical_benefits,
    spiritual_benefits: oil.spiritual_benefits,
    skin_benefits: oil.skin_benefits,
    usage_methods: oil.usage_methods,
    dilution_ratio: oil.dilution_ratio,
    safety_notes: oil.safety_notes,
    contraindications: oil.contraindications,
    blends_well_with: oil.blends_well_with ?? [],
    blends_well_with_raw: tagsToInput(oil.blends_well_with ?? []),
    chakra_connection: oil.chakra_connection,
    element_connection: oil.element_connection,
    notes: oil.notes,
    source: oil.source,
  };
}
