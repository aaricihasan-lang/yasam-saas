/**
 * atlasNormalize — Refleksoloji atlas belgesi CANONICAL normalizasyon sınırı.
 *
 * AMAÇ: Downstream (editör, kayıtlı atlas, protokol, Word) yalnızca EKOLE BAĞIMSIZ
 * 3-görünüm şeklini görsün: `taban / yan_ic / yan_dis`. Eski (legacy) belgeler
 * `{ taban, yan }` şeklindeydi ve Yan İç/Dış ayrımı organ adından türetiliyordu.
 * Bu modül eski `yan` bucket'ını KAYIPSIZ olarak explicit bucket'lara dönüştürür.
 *
 * SUNUCU-GÜVENLİ: window/localStorage YOK; yalnız TYPE-ONLY import (atlasStorage
 * değer importu YASAK — istemci "use client" zincirini sunucuya çekmemek için,
 * atlasRegionsCore ile aynı disiplin). Client loadAtlas/hydrate + server Word route
 * bu tek sınırdan geçer.
 *
 * BU MODÜL, organ ADINDAN görünüm türeten TEK yerdir (yalnız LEGACY dönüşüm için;
 * yeni ürün kuralı DEĞİL). Runtime'ın hiçbir yeni yolu organ adına bakmaz.
 */
import type {
  AtlasDocument,
  AtlasFootBucket,
  AtlasOrganEntry,
  StoredRegion,
} from "@/lib/atlasStorage";

type LegacyView = "yan";
type AnyBucketKey = "taban" | "yan_ic" | "yan_dis" | LegacyView;

/**
 * LEGACY-ONLY: eski `yan` bölgesinin hedef explicit görünümü. Mevcut production
 * davranışını KORUR (mesane/rahim/prostat → yan_ic, diğerleri → yan_dis). Bu YENİ
 * ÜRÜN KURALI DEĞİL — yalnız eski verinin bugün göründüğü yeri korumak içindir.
 */
const LEGACY_YAN_IC_HINTS = ["mesane", "rahim", "prostat"] as const;
export function legacyYanTarget(organName: string): "yan_ic" | "yan_dis" {
  const n = organName.trim().toLocaleLowerCase("tr");
  return LEGACY_YAN_IC_HINTS.some((h) => n.includes(h)) ? "yan_ic" : "yan_dis";
}

function emptyBucket(): AtlasFootBucket {
  return { sol: [], sag: [] };
}

function emptyEntry(): AtlasOrganEntry {
  return { taban: emptyBucket(), yan_ic: emptyBucket(), yan_dis: emptyBucket() };
}

/** Kaynak bucket'ı hedefe kopyalar; region.id zaten görülmüşse (dedup) ATLAR. */
function copyBucket(
  src: AtlasFootBucket | undefined,
  dest: AtlasFootBucket,
  seen: Set<string>,
): void {
  if (!src) return;
  for (const foot of ["sol", "sag"] as const) {
    const list = Array.isArray(src[foot]) ? src[foot] : [];
    for (const stored of list) {
      const id = (stored as StoredRegion)?.id;
      if (typeof id === "string") {
        if (seen.has(id)) continue; // §8 dedup: explicit bucket kazanır, legacy duplicate atlanır
        seen.add(id);
      }
      dest[foot].push(stored);
    }
  }
}

function isEntryLike(value: unknown): value is Record<AnyBucketKey, AtlasFootBucket | undefined> {
  // _meta'da "taban" yok → organ entry'yi güvenle ayırır. Yeni/legacy/mixed hepsi taban taşır.
  return typeof value === "object" && value !== null && "taban" in value;
}

/**
 * Tek organ entry'sini canonical 3-görünüme dönüştürür. Sıra: explicit bucket'lar
 * ÖNCE (id'ler işaretlenir), sonra legacy `yan` → hedef explicit'e EKLENİR (dedup).
 * Geometry/color/foot/id DEĞİŞMEZ; region sayısı korunur (duplicate hariç).
 */
function normalizeOrganEntry(entry: unknown, organName: string): AtlasOrganEntry {
  const out = emptyEntry();
  if (!isEntryLike(entry)) return out;
  const e = entry;
  const seen = new Set<string>();

  // 1) explicit / canonical bucket'lar (yeni şekil) — ÖNCE (kimlikleri sabitler)
  copyBucket(e.taban, out.taban, seen);
  copyBucket(e.yan_ic, out.yan_ic, seen);
  copyBucket(e.yan_dis, out.yan_dis, seen);

  // 2) LEGACY "yan" bucket'ı → organ adına göre tek hedef explicit'e (dedup vs. seen)
  if (e.yan) {
    copyBucket(e.yan, out[legacyYanTarget(organName)], seen);
  }

  return out;
}

/**
 * Belgeyi canonical 3-görünüm şekline getirir. IDEMPOTENT:
 * normalize(normalize(doc)) deep-eşit normalize(doc). Yeni belge → NO-OP (aynı içerik).
 * `_meta` ve organ-olmayan anahtarlar DOKUNULMADAN geçer.
 */
export function normalizeAtlasDocument(doc: unknown): AtlasDocument {
  const out: Record<string, unknown> = {};
  if (doc && typeof doc === "object") {
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      if (key === "_meta") {
        out._meta = value;
      } else if (isEntryLike(value)) {
        out[key] = normalizeOrganEntry(value, key);
      } else {
        out[key] = value; // bilinmeyen anahtar — koru
      }
    }
  }
  if (!out._meta) out._meta = { version: "1", updated_at: "" };
  return out as unknown as AtlasDocument;
}

/** Belgede legacy `yan` bucket'ı taşıyan organ sayısı (backfill raporlama/harness). */
export function countLegacyYanEntries(doc: unknown): number {
  if (!doc || typeof doc !== "object") return 0;
  let n = 0;
  for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
    if (key === "_meta") continue;
    if (isEntryLike(value) && (value as Record<string, unknown>).yan) n += 1;
  }
  return n;
}
