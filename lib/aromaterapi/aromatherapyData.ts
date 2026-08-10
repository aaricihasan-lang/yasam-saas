import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

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

  // Provenance (P4 admin→uzman snapshot). Legacy/kendi kayıtta null.
  origin_type?: string | null;
  origin_label?: string | null;
};

/** Kayıt admin kütüphanesinden bağımsız kopya olarak mı geldi? */
export function isAdminTransferOil(row: { origin_type?: string | null }): boolean {
  return row.origin_type === "admin_transfer";
}

/** Uzman-facing provenance etiketi (admin kaynağı gizlenir; yalnız "hediye" bilgisi). */
export const ADMIN_TRANSFER_BADGE = "🎁 Adminden Gelen Bilgi";

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
  | "origin_type"
>;

// -------------------------------------------------------
// Sorgular / Yazma — hepsi güvenli server API üzerinden (service_role).
// Tarayıcı aromatherapy_oils tablosuna DOĞRUDAN erişmez (RLS-kilitli).
// Windowing (1000 tavanı) sunucu tarafında yapılır.
// -------------------------------------------------------

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

// İmza korunur: tenantId parametresi geriye dönük uyumluluk için durur; gerçek
// tenant server tarafında oturumdan belirlenir (istemci değeri güvenilmez).
export async function fetchOilList(
  _tenantId: string,
  oilType?: string,
): Promise<{ rows: OilListRow[]; error: string | null }> {
  const qs = oilType ? `?type=${encodeURIComponent(oilType)}` : "";
  const res = await fetch(`/api/aromaterapi/oils${qs}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { rows: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { rows: (j.rows as OilListRow[]) ?? [], error: null };
}

export async function fetchOilDetail(
  _tenantId: string,
  id: string,
): Promise<{ oil: AromatherapyOil | null; error: string | null; notFound: boolean }> {
  const res = await fetch(`/api/aromaterapi/oils/${id}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (res.status === 404) return { oil: null, error: null, notFound: true };
  if (!res.ok || j.ok !== true)
    return { oil: null, error: String(j.error ?? `HTTP ${res.status}`), notFound: false };
  return { oil: (j.oil as AromatherapyOil) ?? null, error: null, notFound: false };
}

// Hub sayaçları — tek çağrıda toplam/uçucu/sabit/maserasyon.
export async function fetchOilCounts(): Promise<{
  counts: { total: number; essential: number; carrier: number; maceration: number } | null;
  error: string | null;
}> {
  const res = await fetch(`/api/aromaterapi/oils?count=1`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { counts: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return {
    counts: j.counts as { total: number; essential: number; carrier: number; maceration: number },
    error: null,
  };
}

// Yağ detayında blend eşleştirmesi için id,name haritası.
export async function fetchOilNameMap(): Promise<{
  names: { id: string; name: string }[];
  error: string | null;
}> {
  const res = await fetch(`/api/aromaterapi/oils?names=1`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { names: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { names: (j.names as { id: string; name: string }[]) ?? [], error: null };
}

// -------------------------------------------------------
// Yazma işlemleri — server API (tenant_id oturumdan zorlanır).
// -------------------------------------------------------

export async function createOil(
  fields: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const res = await fetch(`/api/aromaterapi/oils`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { id: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { id: (j.id as string) ?? null, error: null };
}

export async function updateOil(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const res = await fetch(`/api/aromaterapi/oils/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function deleteOil(id: string): Promise<{ error: string | null }> {
  const res = await fetch(`/api/aromaterapi/oils/${id}`, { method: "DELETE", headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function deleteOils(
  ids: string[],
): Promise<{ deletedIds: string[]; error: string | null }> {
  const clean = ids.filter((x) => typeof x === "string" && x.trim().length > 0);
  if (clean.length === 0) return { deletedIds: [], error: null };
  const res = await fetch(`/api/aromaterapi/oils`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ ids: clean }),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { deletedIds: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { deletedIds: (j.deletedIds as string[]) ?? [], error: null };
}

// -------------------------------------------------------
// Yardımcılar
// -------------------------------------------------------

// Türkçe İ/ı/I/i arama eşleştirmesi.
// JS'in `toLowerCase()`'i "İ" harfini "i" + birleşik nokta (U+0307) yapar ve
// noktasız "ı" ile noktalı "i" ayrık kalır; bu yüzden "BİBERİYE" araması
// "Biberiye" kaydını kaçırır. Bu fonksiyon dört I türevini de tek "i"ye indirger.
// Sonuç: "BİBERİYE" = "Biberiye" = "biberiye", "İNCELE" = "İncele" = "incele".
const COMBINING_DOT_ABOVE = String.fromCharCode(0x0307);

export function foldForSearch(value: string): string {
  return value
    .replace(/[İIıi]/g, "i") // dört I türevi → i (toLowerCase'in noktalı-i sorununu atlar)
    .toLowerCase() // kalan harfleri küçült (ş, ğ, ü, ö, ç...)
    .split(COMBINING_DOT_ABOVE)
    .join(""); // olası birleşik nokta (U+0307) temizlenir
}

// Arama alanları — TEK ortak kaynak. matchesOilSearch (blend araması) ve
// buildOilSearchBlob (OilsPage indeksi) aynı listeyi kullanır → alan listesi drift etmez.
// Dizi alanları (therapeutic_properties, target_systems) düz string'lere açılır.
function oilSearchStrings(row: OilListRow): string[] {
  return [
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
    ...(row.therapeutic_properties ?? []),
    ...(row.target_systems ?? []),
  ];
}

export function matchesOilSearch(row: OilListRow, search: string): boolean {
  if (!search.trim()) return true;
  const q = foldForSearch(search.trim());
  return oilSearchStrings(row).some((f) => (f ? foldForSearch(f).includes(q) : false));
}

// PERF-2B: satır başına fold'lanmış arama blob'u — rows yüklenince BİR KEZ üretilir.
// Alanlar "\n" ile birleşir: tek-satır arama sorgusu "\n" içeremeyeceğinden, sorgu
// yalnız tek bir alan segmentinin içinde eşleşebilir → alanlar-arası false-positive
// imkânsızdır ve mevcut per-field .includes semantiği birebir korunur. foldForSearch
// aynen uygulandığı için Türkçe İ/ı normalizasyonu byte-eş kalır.
// Arama tarafı: foldForSearch(query) sonucunu blob.includes(...) ile karşılaştırın.
export function buildOilSearchBlob(row: OilListRow): string {
  return oilSearchStrings(row)
    .map((f) => (f ? foldForSearch(f) : ""))
    .join("\n");
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
