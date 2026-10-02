/**
 * Refleksoloji Atlas — saf şekil doğrulama (sunucu PUT) + savunmacı bölge temizliği.
 *
 * Amaç (dar hardening): renderer'ı/Word'ü çökertebilecek bozuk bölge (null, id'siz,
 * sayı olmayan koordinat, dizi olmayan points) sunucuya KABUL EDİLMEZ; istemci de
 * yerel belgeyi normalize ederken aynı kuralla bu tür bölgeleri ayıklar → istemci
 * asla 400 alacak bir belge göndermez. Bilinmeyen ekstra alanlar korunur (geriye uyum).
 */

/**
 * Sınırlar kötüye kullanım / bozuk istemci korumasıdır; gerçekçi klinik atlas hacminin
 * ÇOK üstünde tutulur (mevcut bir atlasın senkronu bu sınırlar yüzünden ASLA kilitlenmesin).
 * Gövde sınırı platform istek sınırının (≈4.5 MB) hemen altındadır — onu aşan istek zaten
 * platformca reddedilir; bu kontrol yalnız kontrollü 413 + Türkçe mesaj sağlar.
 */
export const ATLAS_LIMITS = {
  MAX_BODY_BYTES: 4 * 1024 * 1024,
  MAX_ORGANS: 5000,
  MAX_ORGAN_NAME_LEN: 300,
  MAX_REGIONS_PER_ORGAN: 2000,
  MAX_POINTS_PER_REGION: 20000,
  MAX_ORGAN_LIST: 5000,
} as const;

const FEET = ["sol", "sag"] as const;
const NUMERIC_FIELDS = ["cx", "cy", "rx", "ry", "angle", "x1", "y1", "x2", "y2", "lineWidth"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Bölge renderlanabilir mi (null/id'siz/bozuk alan → hayır). Ekstra alanlar serbest. */
export function isValidStoredRegion(r: unknown): boolean {
  if (!isPlainObject(r)) return false;
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 200) return false;
  if (typeof r.shape !== "string" || r.shape.length === 0 || r.shape.length > 40) return false;
  for (const f of NUMERIC_FIELDS) {
    if (r[f] !== undefined && r[f] !== null && !isFiniteNumber(r[f])) return false;
  }
  if (r.points !== undefined && r.points !== null) {
    if (!Array.isArray(r.points) || r.points.length > ATLAS_LIMITS.MAX_POINTS_PER_REGION) return false;
    for (const p of r.points) {
      if (!isPlainObject(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return false;
    }
  }
  if (r.color !== undefined && r.color !== null && (typeof r.color !== "string" || r.color.length > 80)) {
    return false;
  }
  return true;
}

/** Organ girdisindeki geçersiz bölgeleri ayıklar (yerinde DEĞİL — yeni nesne). */
export function sanitizeOrganEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [view, bucket] of Object.entries(entry)) {
    if (!isPlainObject(bucket)) {
      out[view] = bucket;
      continue;
    }
    const b: Record<string, unknown> = { ...bucket };
    for (const foot of FEET) {
      if (foot in bucket) {
        b[foot] = Array.isArray(bucket[foot]) ? (bucket[foot] as unknown[]).filter(isValidStoredRegion) : [];
      }
    }
    out[view] = b;
  }
  return out;
}

export type AtlasValidationError = { status: 400 | 413; code: "ATLAS_INVALID" | "ATLAS_TOO_LARGE"; error: string };

/**
 * Sunucu PUT gövdesi doğrulaması. `document` organ→girdi haritası (+ `_meta`),
 * `organ_list` string dizisi olmalı. Bölgeler `isValidStoredRegion` kuralına uymalı.
 */
export function validateAtlasPayload(input: {
  document: unknown;
  organList: unknown;
  bodyBytes: number;
}): AtlasValidationError | null {
  if (input.bodyBytes > ATLAS_LIMITS.MAX_BODY_BYTES) {
    return { status: 413, code: "ATLAS_TOO_LARGE", error: "Atlas belgesi çok büyük." };
  }
  const invalid = (detail: string): AtlasValidationError => ({
    status: 400,
    code: "ATLAS_INVALID",
    error: `Geçersiz atlas verisi (${detail}).`,
  });
  if (!isPlainObject(input.document)) return invalid("belge");
  if (input.organList !== undefined && !Array.isArray(input.organList)) return invalid("organ listesi");
  const list = Array.isArray(input.organList) ? input.organList : [];
  if (list.length > ATLAS_LIMITS.MAX_ORGAN_LIST) return invalid("organ listesi çok uzun");
  for (const o of list) {
    if (typeof o !== "string" || o.length > ATLAS_LIMITS.MAX_ORGAN_NAME_LEN) return invalid("organ adı");
  }

  const entries = Object.entries(input.document);
  if (entries.length > ATLAS_LIMITS.MAX_ORGANS + 1) return invalid("organ sayısı");
  for (const [key, value] of entries) {
    if (key === "_meta") {
      if (value !== undefined && value !== null && !isPlainObject(value)) return invalid("_meta");
      continue;
    }
    if (key.length === 0 || key.length > ATLAS_LIMITS.MAX_ORGAN_NAME_LEN) return invalid("organ adı");
    if (!isPlainObject(value)) return invalid(`organ girdisi: ${key.slice(0, 40)}`);
    let count = 0;
    for (const bucket of Object.values(value)) {
      if (!isPlainObject(bucket)) return invalid(`görünüm: ${key.slice(0, 40)}`);
      for (const foot of FEET) {
        const arr = bucket[foot];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) return invalid(`ayak listesi: ${key.slice(0, 40)}`);
        for (const r of arr) {
          if (!isValidStoredRegion(r)) return invalid(`bölge: ${key.slice(0, 40)}`);
          count += 1;
        }
      }
    }
    if (count > ATLAS_LIMITS.MAX_REGIONS_PER_ORGAN) return invalid(`bölge sayısı: ${key.slice(0, 40)}`);
  }
  return null;
}
