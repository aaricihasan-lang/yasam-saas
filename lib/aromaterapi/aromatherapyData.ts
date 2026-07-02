import { supabase } from "@/lib/supabase";

// -------------------------------------------------------
// Yağ Tipleri
// -------------------------------------------------------

export const OIL_TYPES: { value: string; label: string }[] = [
  { value: "essential",  label: "Uçucu Yağ" },
  { value: "carrier",    label: "Sabit Yağ" },
  { value: "maceration", label: "Maserasyon Yağı" },
  { value: "hydrosol",   label: "Hidrosol" },
  { value: "resin",      label: "Reçine" },
  { value: "absolute",   label: "Mutlak / Ekstrakt" },
];

export const OIL_TYPE_LABELS: Record<string, string> = {
  essential:  "Uçucu Yağ",
  carrier:    "Sabit Yağ",
  maceration: "Maserasyon Yağı",
  hydrosol:   "Hidrosol",
  resin:      "Reçine",
  absolute:   "Mutlak / Ekstrakt",
};

export function oilTypeLabel(oilType: string): string {
  return OIL_TYPE_LABELS[oilType] ?? oilType;
}

export function oilTypeBadgeClass(oilType: string): string {
  switch (oilType) {
    case "essential":  return "border-amber-200 bg-amber-50 text-amber-800";
    case "carrier":    return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "maceration": return "border-rose-200 bg-rose-50 text-rose-800";
    case "hydrosol":   return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "resin":      return "border-orange-200 bg-orange-50 text-orange-800";
    case "absolute":   return "border-violet-200 bg-violet-50 text-violet-800";
    default:           return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

// -------------------------------------------------------
// Ana Tip
// -------------------------------------------------------

export type AromatherapyOil = {
  id: string;
  tenant_id: string | null;

  // Kimlik
  name: string;
  latin_name: string;
  english_name: string;
  oil_type: string;
  category: string;

  // Botanik & Kaynak
  extraction_method: string;
  plant_part: string;
  origin: string;
  shelf_life: string;

  // Yağ Özellikleri
  aroma_profile: string;
  aroma_note: string;
  color: string;
  consistency: string;
  is_photosensitive: boolean;

  // Kimyasal İçerik
  main_components: string;
  therapeutic_properties: string[];

  // Ruhsal & Duygusal
  emotional_benefits: string;
  spiritual_benefits: string;
  physical_benefits: string;
  skin_benefits: string;
  benefits: string;

  // Kullanım Şekilleri
  diffuser_usage: string;
  massage_usage: string;
  usage_methods: string;
  dilution_ratio: string;

  // Uyumlu Yağlar
  blends_well_with: string[];
  target_systems: string[];
  chakra_connection: string;
  element_connection: string;

  // Önlemler & Güvenlik
  safety_notes: string;
  contraindications: string;

  // Notlar
  images: string[];
  notes: string;
  source: string;

  // Meta
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

// -------------------------------------------------------
// Liste Satırı
// -------------------------------------------------------

export type OilListRow = Pick<
  AromatherapyOil,
  | "id"
  | "tenant_id"
  | "name"
  | "latin_name"
  | "english_name"
  | "oil_type"
  | "category"
  | "origin"
  | "aroma_profile"
  | "plant_part"
  | "main_components"
  | "benefits"
  | "physical_benefits"
  | "emotional_benefits"
  | "skin_benefits"
  | "spiritual_benefits"
  | "diffuser_usage"
  | "massage_usage"
  | "usage_methods"
  | "safety_notes"
  | "chakra_connection"
  | "element_connection"
  | "therapeutic_properties"
  | "is_photosensitive"
  | "target_systems"
  | "created_at"
  | "updated_at"
>;

const LIST_SELECT =
  "id,tenant_id,name,latin_name,english_name,oil_type,category,origin,aroma_profile," +
  "plant_part,main_components,benefits,physical_benefits,emotional_benefits,skin_benefits," +
  "spiritual_benefits,diffuser_usage,massage_usage,usage_methods,safety_notes," +
  "chakra_connection,element_connection,therapeutic_properties,is_photosensitive,target_systems," +
  "created_at,updated_at";

// -------------------------------------------------------
// Sorgular
// -------------------------------------------------------

// PostgREST tek istekte en fazla ~1000 satır döndürür (varsayılan max-rows).
// Kütüphane 1000 kaydı geçtiğinde kayıtların sessizce kaybolmaması için
// tüm sayfalar .range() ile döngüyle çekilir. Böylece sayaç, arama ve filtre
// TÜM kayıtlar üzerinde doğru çalışır.
const OIL_PAGE_SIZE = 1000;

export async function fetchOilList(
  tenantId: string,
  oilType?: string,
): Promise<{ rows: OilListRow[]; error: string | null }> {
  const all: OilListRow[] = [];

  for (let from = 0; ; from += OIL_PAGE_SIZE) {
    let query = supabase
      .from("aromatherapy_oils")
      .select(LIST_SELECT)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .eq("is_active", true);

    if (oilType) query = query.eq("oil_type", oilType);

    // İkincil "id" sıralaması, aynı ada sahip kayıtlarda sayfa sınırında
    // atlama/tekrarı önleyen kararlı bir sıralama sağlar.
    const { data, error } = await query
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + OIL_PAGE_SIZE - 1);

    if (error) return { rows: [], error: error.message };

    const page = (data ?? []) as unknown as OilListRow[];
    all.push(...page);

    // Tam sayfadan az geldiyse son sayfadayız; döngüyü bitir.
    if (page.length < OIL_PAGE_SIZE) break;
  }

  return { rows: all, error: null };
}

export async function fetchOilDetail(
  tenantId: string,
  id: string,
): Promise<{ oil: AromatherapyOil | null; error: string | null; notFound: boolean }> {
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
    row.english_name,
    row.category,
    row.origin,
    row.aroma_profile,
    row.plant_part,
    row.main_components,
    row.benefits,
    row.physical_benefits,
    row.emotional_benefits,
    row.skin_benefits,
    row.spiritual_benefits,
    row.diffuser_usage,
    row.massage_usage,
    row.usage_methods,
    row.safety_notes,
    row.chakra_connection,
    row.element_connection,
  ];
  return (
    fields.some((f) => f?.toLowerCase().includes(q)) ||
    (row.therapeutic_properties ?? []).some((p) => p.toLowerCase().includes(q)) ||
    (row.target_systems ?? []).some((s) => s.toLowerCase().includes(q))
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

export function parseImageUrls(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// -------------------------------------------------------
// Form Tipi
// -------------------------------------------------------

export type OilFormData = Omit<
  AromatherapyOil,
  "id" | "tenant_id" | "is_active" | "created_at" | "updated_at"
> & {
  therapeutic_properties_raw: string;
  blends_well_with_raw: string;
  images_raw: string;
  target_systems_raw: string;
};

export const EMPTY_OIL_FORM: OilFormData = {
  // Kimlik
  name: "",
  latin_name: "",
  english_name: "",
  oil_type: "essential",
  category: "",

  // Botanik & Kaynak
  extraction_method: "",
  plant_part: "",
  origin: "",
  shelf_life: "",

  // Yağ Özellikleri
  aroma_profile: "",
  aroma_note: "",
  color: "",
  consistency: "",
  is_photosensitive: false,

  // Kimyasal İçerik
  main_components: "",
  therapeutic_properties: [],
  therapeutic_properties_raw: "",

  // Ruhsal & Duygusal
  emotional_benefits: "",
  spiritual_benefits: "",
  physical_benefits: "",
  skin_benefits: "",
  benefits: "",

  // Kullanım Şekilleri
  diffuser_usage: "",
  massage_usage: "",
  usage_methods: "",
  dilution_ratio: "",

  // Uyumlu Yağlar
  blends_well_with: [],
  blends_well_with_raw: "",
  target_systems: [],
  target_systems_raw: "",
  chakra_connection: "",
  element_connection: "",

  // Önlemler & Güvenlik
  safety_notes: "",
  contraindications: "",

  // Notlar
  images: [],
  images_raw: "",
  notes: "",
  source: "",
};

export function oilToFormData(oil: AromatherapyOil): OilFormData {
  return {
    name: oil.name,
    latin_name: oil.latin_name,
    english_name: oil.english_name ?? "",
    oil_type: oil.oil_type,
    category: oil.category,

    extraction_method: oil.extraction_method ?? "",
    plant_part: oil.plant_part ?? "",
    origin: oil.origin ?? "",
    shelf_life: oil.shelf_life ?? "",

    aroma_profile: oil.aroma_profile ?? "",
    aroma_note: oil.aroma_note ?? "",
    color: oil.color ?? "",
    consistency: oil.consistency ?? "",
    is_photosensitive: oil.is_photosensitive ?? false,

    main_components: oil.main_components ?? "",
    therapeutic_properties: oil.therapeutic_properties ?? [],
    therapeutic_properties_raw: tagsToInput(oil.therapeutic_properties ?? []),

    emotional_benefits: oil.emotional_benefits ?? "",
    spiritual_benefits: oil.spiritual_benefits ?? "",
    physical_benefits: oil.physical_benefits ?? "",
    skin_benefits: oil.skin_benefits ?? "",
    benefits: oil.benefits ?? "",

    diffuser_usage: oil.diffuser_usage ?? "",
    massage_usage: oil.massage_usage ?? "",
    usage_methods: oil.usage_methods ?? "",
    dilution_ratio: oil.dilution_ratio ?? "",

    blends_well_with: oil.blends_well_with ?? [],
    blends_well_with_raw: tagsToInput(oil.blends_well_with ?? []),
    target_systems: oil.target_systems ?? [],
    target_systems_raw: tagsToInput(oil.target_systems ?? []),
    chakra_connection: oil.chakra_connection ?? "",
    element_connection: oil.element_connection ?? "",

    safety_notes: oil.safety_notes ?? "",
    contraindications: oil.contraindications ?? "",

    images: oil.images ?? [],
    images_raw: (oil.images ?? []).join("\n"),
    notes: oil.notes ?? "",
    source: oil.source ?? "",
  };
}
