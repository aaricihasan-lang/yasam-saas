/**
 * Doğaltaş — taş başına ÇOKLU KAYNAK (WT9). SAF yardımcılar (sunucu + istemci + testler).
 *
 * Model (supabase/migrations/20271012000000_dogaltas_stone_sources.sql):
 *   - stones satırı = BİRİNCİL kaynak; adı `stones.primary_source_name` (NULL = belirtilmemiş).
 *   - public.stone_sources = EK kaynaklar; her biri aynı içerik alanlarının kendi kopyası.
 *   - Taşa özgü (kaynaktan bağımsız) alanlar: ad, görseller, atamalar (mineral/burç/organ),
 *     uyarı etiketleri → kaynak başına DEĞİL.
 */
import { normalizeTr } from "@/lib/text/turkishSearch";

/** Kaynak başına tutulan içerik alanları (stones ve stone_sources'ta AYNI adlar). */
export const SOURCE_TEXT_FIELDS = [
  "short_description",
  "general_info",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "feng_shui",
  "meditation",
  "care",
  "application",
  "warning_text",
  "source_note",
] as const;
export type SourceTextField = (typeof SOURCE_TEXT_FIELDS)[number];

export const SOURCE_FIELDS = [...SOURCE_TEXT_FIELDS, "chakras"] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];

/** Rapor/arama etiketleri (TR). */
export const SOURCE_FIELD_LABELS: Record<SourceField, string> = {
  short_description: "Kısa Açıklama",
  general_info: "Genel Bilgi",
  physical_effects: "Fiziksel Etkiler",
  spiritual_effects: "Ruhsal Etkiler",
  other_effects: "Diğer Etkiler",
  feng_shui: "Feng Shui",
  meditation: "Meditasyon",
  care: "Bakım",
  application: "Uygulama",
  warning_text: "Uyarı",
  source_note: "Kaynak Notu",
  chakras: "Çakralar",
};

/** Birincil kaynağın API/UI kimliği (stones satırı). */
export const PRIMARY_SOURCE_ID = "primary";
export const SOURCE_NAME_MAX = 200;
/** Tek alan için üst sınır (prod en uzun genel bilgi ~14k karakter; 10× pay). Kısaltma YAPILMAZ — aşan reddedilir. */
export const SOURCE_FIELD_MAX = 150_000;
/** Bir taşta en fazla ek kaynak (birincil hariç). */
export const MAX_EXTRA_SOURCES = 20;

export type SourceFields = {
  [K in SourceTextField]: string | null;
} & { chakras: string[] | null };

export type StoneSourceView = {
  /** "primary" ya da stone_sources.id */
  id: string;
  /** null → "Kaynak belirtilmemiş" (eski kayıt) */
  name: string | null;
  isPrimary: boolean;
  sortOrder: number;
  fields: SourceFields;
  updatedAt: string | null;
};

/** Görünen ad: boş/NULL → "Kaynak belirtilmemiş". */
export function sourceDisplayName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n || "Kaynak belirtilmemiş";
}

/** Kaynak adını kaydetmeden önce normalize eder (kenar boşluk + çoklu boşluk). Geçersizse "". */
export function normalizeSourceName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Aynı-kaynak anahtarı — SQL `dogaltas_source_name_key` ile AYNI kural (İ→i, I→ı, Türkçe küçük harf,
 * boşluk normalize). "Kristal Şifa Kitabı" = "kristal  şifa KİTABI".
 */
export function sourceNameKey(raw: unknown): string {
  return normalizeSourceName(raw).toLocaleLowerCase("tr-TR");
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

function chakrasOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => String(x ?? "").trim()).filter(Boolean);
  return out;
}

/** Satırdan (stones ya da stone_sources) kaynak alanlarını çıkarır. */
export function pickSourceFields(row: Record<string, unknown>): SourceFields {
  const out = {} as SourceFields;
  for (const f of SOURCE_TEXT_FIELDS) out[f] = textOrNull(row[f]);
  out.chakras = chakrasOrNull(row.chakras);
  return out;
}

/** Taş satırı + ek kaynak satırları → sıralı kaynak listesi (birincil her zaman ilk). */
export function buildStoneSourcesView(
  stone: Record<string, unknown>,
  extraRows: readonly Record<string, unknown>[],
): StoneSourceView[] {
  const primary: StoneSourceView = {
    id: PRIMARY_SOURCE_ID,
    name: textOrNull(stone.primary_source_name)?.trim() || null,
    isPrimary: true,
    sortOrder: -1,
    fields: pickSourceFields(stone),
    updatedAt: textOrNull(stone.updated_at),
  };
  const extras = [...extraRows]
    .map((r) => ({
      id: String(r.id ?? ""),
      name: textOrNull(r.source_name)?.trim() || null,
      isPrimary: false,
      sortOrder: Number(r.sort_order ?? 0) || 0,
      fields: pickSourceFields(r),
      updatedAt: textOrNull(r.updated_at),
      createdAt: String(r.created_at ?? ""),
    }))
    .filter((r) => r.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, name: r.name, isPrimary: r.isPrimary, sortOrder: r.sortOrder, fields: r.fields, updatedAt: r.updatedAt }));
  return [primary, ...extras];
}

/** Bu kaynakta hiç içerik var mı (boş alan dolu sayılmaz). */
export function sourceHasContent(fields: SourceFields): boolean {
  return SOURCE_TEXT_FIELDS.some((f) => Boolean(fields[f]?.trim())) || (fields.chakras?.length ?? 0) > 0;
}

/** Bir kaynağın aranabilir düz metni (ad + alanlar). Arama/vurgu için. */
export function sourceSearchText(view: Pick<StoneSourceView, "name" | "fields">): string {
  const parts: string[] = [];
  if (view.name) parts.push(view.name);
  for (const f of SOURCE_TEXT_FIELDS) {
    const v = view.fields[f];
    if (v?.trim()) parts.push(v);
  }
  if (view.fields.chakras?.length) parts.push(view.fields.chakras.join(", "));
  return parts.join("\n");
}

/** Kaynakta sorgu geçiyor mu (Türkçe/büyük-küçük harf uyumlu; mevcut aramalarla aynı katlama). */
export function sourceMatchesQuery(view: Pick<StoneSourceView, "name" | "fields">, query: string): boolean {
  const q = normalizeTr(query.trim());
  if (q.length < 2) return false;
  return normalizeTr(sourceSearchText(view)).includes(q);
}

export type SourcePayloadResult =
  | { ok: true; values: Partial<Record<SourceField, string | string[] | null>>; name?: string }
  | { ok: false; error: string };

/**
 * İstemci gövdesinden kaynak alanlarını doğrular. YALNIZ izinli alanlar alınır; metin aynen
 * saklanır (kırpma/kısaltma YOK — boşluktan ibaret değer NULL olur), aşırı uzun değer reddedilir.
 * `requireName`: yeni kaynak eklerken ad zorunlu.
 */
export function validateSourcePayload(body: Record<string, unknown>, opts: { requireName: boolean }): SourcePayloadResult {
  const values: Partial<Record<SourceField, string | string[] | null>> = {};
  let name: string | undefined;
  if ("source_name" in body || opts.requireName) {
    name = normalizeSourceName(body.source_name);
    if (!name) return { ok: false, error: "Kaynak adı zorunludur." };
    if (name.length > SOURCE_NAME_MAX) return { ok: false, error: `Kaynak adı en fazla ${SOURCE_NAME_MAX} karakter olabilir.` };
  }
  for (const f of SOURCE_TEXT_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v == null) { values[f] = null; continue; }
    if (typeof v !== "string") return { ok: false, error: `${SOURCE_FIELD_LABELS[f]} metin olmalıdır.` };
    if (v.length > SOURCE_FIELD_MAX) return { ok: false, error: `${SOURCE_FIELD_LABELS[f]} çok uzun.` };
    values[f] = v.trim() ? v : null;
  }
  if ("chakras" in body) {
    const v = body.chakras;
    if (v == null) values.chakras = null;
    else if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { ok: false, error: "Çakralar metin listesi olmalıdır." };
    else values.chakras = (v as string[]).map((x) => x.trim()).filter(Boolean).slice(0, 50);
  }
  return { ok: true, values, ...(name !== undefined ? { name } : {}) };
}

/** Uzmanın kendi kaynak adları (birincil + ek) → tekil, Türkçe sıralı öneri listesi. */
export function uniqueSourceNames(names: readonly (string | null | undefined)[], limit = 200): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const n = normalizeSourceName(raw);
    if (!n) continue;
    const k = sourceNameKey(n);
    if (!seen.has(k)) seen.set(k, n);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "tr")).slice(0, limit);
}
