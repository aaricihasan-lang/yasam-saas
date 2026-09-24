/**
 * Biyoenerji güvenli API — kaynak (tablo) yapılandırması.
 * Sunucu tarafında kullanılır (verifyUserRequest + service_role). İstemciden
 * doğrudan tablo erişimi yerine /api/biyoenerji/[resource] üzerinden gider.
 */

export type BioResourceConfig = {
  table: string;
  /** ilike araması yapılacak metin kolonları */
  search: readonly string[];
  /** liste sıralama kolonu */
  orderCol: string;
  orderAsc: boolean;
  /** insert/update'te kabul edilen kolonlar (tenant_id/id/created_at asla) */
  write: readonly string[];
  /** boş bırakılamayacak birincil alan (trim sonrası) — UI ile birebir */
  required: string;
  /** required alan boşsa dönecek kullanıcı-dostu mesaj (UI mesajıyla aynı) */
  requiredMsg: string;
};

export const BIO_RESOURCES: Record<string, BioResourceConfig> = {
  sessions: {
    table: "bioenergy_sessions",
    search: ["title", "content", "category", "source", "note"],
    orderCol: "created_at",
    orderAsc: false,
    write: ["title", "content", "category", "source", "note"],
    required: "title",
    requiredMsg: "Seans başlığı zorunludur.",
  },
  "energy-bodies": {
    table: "bioenergy_energy_bodies",
    search: ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
    orderCol: "source_uid",
    orderAsc: true,
    write: ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
    required: "source_uid",
    requiredMsg: "Enerji bedeni / katman zorunludur.",
  },
  "subconscious-causes": {
    table: "bioenergy_subconscious_causes",
    search: ["title", "category", "content", "note_text"],
    orderCol: "title",
    orderAsc: true,
    write: ["source_uid", "title", "category", "content", "note_text"],
    required: "title",
    requiredMsg: "Başlık zorunludur.",
  },
  imaginations: {
    table: "bioenergy_imaginations",
    search: ["title", "category", "text", "notes", "source"],
    orderCol: "title",
    orderAsc: true,
    write: ["source_id", "title", "category", "text", "notes", "source"],
    required: "title",
    requiredMsg: "İmajinasyon başlığı zorunludur.",
  },
  symbols: {
    table: "bioenergy_symbols",
    search: ["symbol", "title", "category", "meaning", "source"],
    orderCol: "title",
    orderAsc: true,
    write: ["symbol", "title", "category", "meaning", "source"],
    required: "symbol",
    requiredMsg: "Sembol adı zorunludur.",
  },
  chakras: {
    table: "bioenergy_chakras",
    search: ["name", "organs", "glands", "color", "stones", "causes", "physical", "mental", "notes"],
    orderCol: "name",
    orderAsc: true,
    // FAZ 2 — quick-fact kolonları (sanskrit_name/element/location/bija_mantra) yazılabilir
    // eklendi (kolonlar DB'de mevcut; migration YOK). Legacy alanlar backward-compat için korunur.
    write: [
      "source_uid", "name", "organs", "glands", "color", "stones", "causes", "physical", "mental", "notes",
      "sanskrit_name", "element", "location", "bija_mantra",
    ],
    required: "name",
    requiredMsg: "Çakra adı zorunludur.",
  },
};

export function getBioResource(resource: string): BioResourceConfig | null {
  return Object.prototype.hasOwnProperty.call(BIO_RESOURCES, resource)
    ? BIO_RESOURCES[resource]
    : null;
}

/** ilike araması için güvenli terim — PostgREST or() filtresini bozacak karakterleri çıkarır */
export function sanitizeBioSearch(term: string | null | undefined): string {
  return (term ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Body'den yalnız izinli kolonları al (tenant_id/id/created_at vb. dışlanır) */
export function pickWritableBioFields(
  cfg: BioResourceConfig,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cfg.write) {
    if (Object.prototype.hasOwnProperty.call(body, col)) out[col] = body[col];
  }
  return out;
}

// ── BIO-005 / BIO-009 — sunucu-canonical alan doğrulama + normalizasyon ──────
//
// Uzunluk sınırları KÖTÜ AMAÇLI/kontrolsüz payload'ı engellemek içindir; gerçek
// editöryal kullanımı KIRMAYACAK kadar geniş tutulur. DB kolon tipleri repo'da
// olmadığından (base DDL out-of-band) bunlar app-layer canonical katmandır.
const LONG_TEXT_FIELDS = new Set<string>([
  "content", "note", "text", "notes", "meaning",
  "genel_tanim", "gorevi", "bozulma", "not_text", "note_text",
  "causes", "physical", "mental",
]);
const MID_TEXT_FIELDS = new Set<string>([
  "organs", "glands", "stones", "onerilen_taslar", "color",
]);
const LONG_MAX = 100_000; // ~100 KB serbest metin (klinik/editöryal içerik için bol)
const MID_MAX = 2_000; // virgüllü listeler (organlar, taşlar…)
const SHORT_MAX = 500; // başlık/ad/kategori/kaynak/uid gibi kısa alanlar

function maxLenFor(field: string): number {
  if (LONG_TEXT_FIELDS.has(field)) return LONG_MAX;
  if (MID_TEXT_FIELDS.has(field)) return MID_MAX;
  return SHORT_MAX;
}

export type BioValidationResult =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Yazılabilir alanları doğrular + normalize eder (BIO-005 + BIO-009):
 *   - Yalnız cfg.write kolonları (whitelist; tenant_id/id/created_at ASLA).
 *   - Tip: string | null | undefined; aksi → hata (tip karışıklığı engellenir).
 *   - Trim: baş/son boşluk temizlenir. İç boşluk/paragraf/newline KORUNUR;
 *     lowercase/uppercase veya İ/ı dönüşümü YAPILMAZ.
 *   - null → null, "" (trim sonrası) → "" olarak KORUNUR (client null/empty
 *     seçimine dokunulmaz; backward-compat).
 *   - maxLength: alan tipine göre üst sınır (aşılırsa hata).
 *   - required: birincil alan trim sonrası boş olamaz.
 *
 * @param opts.partial PATCH için true → required yalnız body'de VARSA denetlenir
 *                      (kısmi güncelleme eski kayıtları kırmaz).
 */
export function validateBioFields(
  cfg: BioResourceConfig,
  body: Record<string, unknown>,
  opts: { partial: boolean },
): BioValidationResult {
  const out: Record<string, unknown> = {};

  for (const col of cfg.write) {
    if (!Object.prototype.hasOwnProperty.call(body, col)) continue;
    const raw = body[col];

    if (raw === null || raw === undefined) {
      out[col] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return { ok: false, error: "Geçersiz alan değeri." };
    }
    const trimmed = raw.trim();
    if (trimmed.length > maxLenFor(col)) {
      return { ok: false, error: "Girdiğiniz metin çok uzun. Lütfen kısaltın." };
    }
    out[col] = trimmed;
  }

  // required — POST'ta her zaman; PATCH'te yalnız alan gönderildiyse.
  const requiredProvided = Object.prototype.hasOwnProperty.call(out, cfg.required);
  if (!opts.partial || requiredProvided) {
    const val = out[cfg.required];
    if (typeof val !== "string" || val.trim().length === 0) {
      return { ok: false, error: cfg.requiredMsg };
    }
  }

  return { ok: true, fields: out };
}
