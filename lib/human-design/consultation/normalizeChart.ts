/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Harita Normalizasyon Sözleşmesi (K3)
 * ============================================================================
 *
 * SAF, deterministik, yan etkisiz. STORED chart verisini DEĞİŞTİRMEZ; okuma
 * sırasında iki rejimi tek katmanda canonical anahtarlara çevirir:
 *   A. Engine RAW değerleri  ("Generator", "Emotional", …)
 *   B. Manuel snake_case      ("generator", "ego_heart", …)
 *
 * KAPSAM: yalnız Tip / Otorite / Kapı / Kanal. Merkez ve Profil DIŞARIDA.
 * Kanal/Kapı için canonicalKeys.ts builder'ları REUSE edilir (ikinci paralel
 * kanal listesi YOK). Bilinmeyen/eşleşmeyen değer SESSİZCE atlanmaz →
 * UnknownChartValueError. NULL/boş alan = "değer yok" (atlanır, hata değil).
 */

import { HUMAN_DESIGN_AUTHORITIES, HUMAN_DESIGN_CHANNELS, HUMAN_DESIGN_TYPES } from "../constants";
import type { HdAuthorityCode, HdTypeCode } from "../types";
import {
  buildHdAuthorityCanonicalKey,
  buildHdChannelCanonicalKeyFromCode,
  buildHdGateCanonicalKey,
  buildHdTypeCanonicalKey,
  isValidGateNumber,
  type HdCanonicalKey,
} from "../knowledge-system/canonicalKeys";
import { UnknownChartValueError } from "./errors";

// ── Canonical hedef kümeleri (constants'tan; tek gerçek kaynak) ──────────────
const TYPE_CODES: ReadonlySet<string> = new Set(HUMAN_DESIGN_TYPES.map((t) => t.code));
const AUTHORITY_CODES: ReadonlySet<string> = new Set(HUMAN_DESIGN_AUTHORITIES.map((a) => a.code));
/** Kanal kodunun resmi sırasını (dedup/sıralama için) taşır: "1-8" → index. */
const CHANNEL_ORDER: ReadonlyMap<string, number> = new Map(
  HUMAN_DESIGN_CHANNELS.map((ch, i) => [ch.code, i]),
);

// ── RAW → manuel kod alias haritaları (K3 tablosu; açık ve doğrulanabilir) ───
const RAW_TYPE_TO_CODE: Readonly<Record<string, HdTypeCode>> = {
  Generator: "generator",
  "Manifesting Generator": "manifesting_generator",
  Manifestor: "manifestor",
  Projector: "projector",
  Reflector: "reflector",
};
const RAW_AUTHORITY_TO_CODE: Readonly<Record<string, HdAuthorityCode>> = {
  Emotional: "emotional",
  Sacral: "sacral",
  Splenic: "splenic",
  Ego: "ego_heart",
  "Self-Projected": "self_projected",
  Mental: "mental_environmental",
  Lunar: "lunar",
};

// Drift kilidi: alias hedefleri constants kod kümesinin ALT KÜMESİ olmalı.
// (constants değişirse import anında fail-loud; sessiz sapma imkânsız.)
for (const code of Object.values(RAW_TYPE_TO_CODE)) {
  if (!TYPE_CODES.has(code)) throw new Error(`normalizeChart: RAW_TYPE_TO_CODE geçersiz hedef: ${code}`);
}
for (const code of Object.values(RAW_AUTHORITY_TO_CODE)) {
  if (!AUTHORITY_CODES.has(code)) {
    throw new Error(`normalizeChart: RAW_AUTHORITY_TO_CODE geçersiz hedef: ${code}`);
  }
}

/**
 * Okunan (güvenilmez) stored chart. type_code/authority_code RAW ya da manuel
 * olabilir; gates int[], channels "A-B"[] beklenir ama DB text[]/int[] içeriği
 * güvenilmez sayılır → her eleman doğrulanır.
 */
export type StoredChartLike = {
  type_code?: unknown;
  authority_code?: unknown;
  gates?: unknown;
  channels?: unknown;
};

function isAbsent(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Tip değerini (RAW|manuel) manuel koda çevirir; yoksa null; bilinmezse throw. */
function normalizeTypeCode(raw: unknown): HdTypeCode | null {
  if (isAbsent(raw)) return null;
  if (typeof raw !== "string") throw new UnknownChartValueError("type", raw);
  const v = raw.trim();
  if (TYPE_CODES.has(v)) return v as HdTypeCode;
  const mapped = RAW_TYPE_TO_CODE[v];
  if (mapped) return mapped;
  throw new UnknownChartValueError("type", raw);
}

function normalizeAuthorityCode(raw: unknown): HdAuthorityCode | null {
  if (isAbsent(raw)) return null;
  if (typeof raw !== "string") throw new UnknownChartValueError("authority", raw);
  const v = raw.trim();
  if (AUTHORITY_CODES.has(v)) return v as HdAuthorityCode;
  const mapped = RAW_AUTHORITY_TO_CODE[v];
  if (mapped) return mapped;
  throw new UnknownChartValueError("authority", raw);
}

function toArrayOrThrow(v: unknown, field: string): readonly unknown[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new UnknownChartValueError(field, v);
  return v;
}

/**
 * Stored chart'ı deterministik, tekrarsız canonical anahtar dizisine çevirir.
 * Sıra: [tip?, otorite?, ...kapılar(artan), ...kanallar(resmi sıra)].
 * Yalnız Tip/Otorite/Kapı/Kanal. Bilinmeyen değer → UnknownChartValueError.
 */
export function normalizeChartToCanonicalKeys(chart: StoredChartLike): HdCanonicalKey[] {
  const out: HdCanonicalKey[] = [];
  const seen = new Set<string>();
  const push = (k: HdCanonicalKey): void => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };

  // Tip
  const typeCode = normalizeTypeCode(chart.type_code);
  if (typeCode) push(buildHdTypeCanonicalKey(typeCode));

  // Otorite
  const authorityCode = normalizeAuthorityCode(chart.authority_code);
  if (authorityCode) push(buildHdAuthorityCanonicalKey(authorityCode));

  // Kapılar — artan sıraya diz, sonra key üret
  const gateNumbers: number[] = [];
  for (const g of toArrayOrThrow(chart.gates, "gates")) {
    if (!isValidGateNumber(g)) throw new UnknownChartValueError("gate", g);
    gateNumbers.push(g);
  }
  for (const n of [...gateNumbers].sort((a, b) => a - b)) {
    push(buildHdGateCanonicalKey(n));
  }

  // Kanallar — resmi kanal sırasına göre diz, builder ile doğrula (ters/sıfır reddi)
  const channelCodes: string[] = [];
  for (const c of toArrayOrThrow(chart.channels, "channels")) {
    if (typeof c !== "string") throw new UnknownChartValueError("channel", c);
    channelCodes.push(c);
  }
  const orderedChannels = [...channelCodes].sort((a, b) => {
    const ia = CHANNEL_ORDER.has(a) ? (CHANNEL_ORDER.get(a) as number) : Number.MAX_SAFE_INTEGER;
    const ib = CHANNEL_ORDER.has(b) ? (CHANNEL_ORDER.get(b) as number) : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
  for (const code of orderedChannels) {
    try {
      push(buildHdChannelCanonicalKeyFromCode(code));
    } catch {
      // Builder reddi (ters yön / baştaki sıfır / gerçek olmayan) → typed hata.
      throw new UnknownChartValueError("channel", code);
    }
  }

  return out;
}

/** Aynı normalize sonucu Set olarak (koşul değerlendirme için hızlı üyelik). */
export function normalizeChartToKeySet(chart: StoredChartLike): ReadonlySet<HdCanonicalKey> {
  return new Set(normalizeChartToCanonicalKeys(chart));
}
