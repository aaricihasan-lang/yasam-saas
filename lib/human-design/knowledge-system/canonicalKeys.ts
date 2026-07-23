/**
 * HD-2B — Human Design Bilgi Sistemi · Canonical Anahtar Sözleşmesi
 * ================================================================
 *
 * Bu dosya, profesyonel Human Design Bilgi Sistemi'nin İLK kapsamı için
 * canonical (kanonik) anahtar tiplerini ve saf yardımcılarını tanımlar.
 *
 * İLK PROFESYONEL CANONICAL ENTITY KAPSAMI (yalnız 4 aile):
 *   - tip_*      → Tip
 *   - otorite_*  → Otorite
 *   - kapi_*     → Kapı (1–64)
 *   - kanal_*    → Kanal (iki geçerli Kapı)
 *
 * KAPSAM DIŞI (bilinçli olarak canonical ENTITY sayılmaz):
 *   - profil_*, tanim_*, merkez_tanimli_*, merkez_acik_*  → mevcut rapor
 *     kod aileleri; buildCodesFromChart() üretmeye devam eder (regresyon
 *     korunur), fakat HD-2B entity sözleşmesine dahil DEĞİLDİR.
 *   - strateji_*  → Strateji ayrı entity değildir; Tip sözleşmesinin alanıdır.
 *   - 384 kapı çizgisi (line)  → bu fazda YOK.
 *
 * BİREBİR UYUM: Buradaki builder çıktıları, production'daki
 * `buildCodesFromChart()` (app/human-design/rapor-olustur/helpers/hdRapor.ts)
 * çıktısıyla — tip_/otorite_/kapi_/kanal_ aileleri için — BİREBİR eşleşir.
 * Mevcut normalizasyon davranışı KOPYALANMAZ, ESAS ALINIR:
 *   - Tip/Otorite kodu zaten normalize sabit koddur → doğrudan kullanılır.
 *   - Kapı: `kapi_${gateNumber}` (sayı doğrudan).
 *   - Kanal: `kanal_${gateA}_${gateB}`; kapı sırası kanal kimliğinden gelir,
 *            YENİDEN SIRALANMAZ (production `"34-57" → "kanal_34_57"` ile aynı).
 *
 * HD-2B-FIX1 — CANONICAL KİMLİK TEKİLLİĞİ (2 değişmez):
 *   (1) STRICT LEXICAL: guard/parser YALNIZ builder'ın üreteceği tekil metni
 *       kabul eder. Baştaki sıfır / ondalık / işaret / whitespace / ek segment
 *       reddedilir. Bir anahtar ancak yeniden builder ile üretildiğinde metinle
 *       BİREBİR aynıysa canonical'dır (round-trip).
 *   (2) GERÇEK 36 KANAL: Kanal builder/guard/parser YALNIZ mevcut resmi
 *       HUMAN_DESIGN_CHANNELS kümesindeki 36 kanalı, resmi sırasıyla kabul eder.
 *       `kanal_1_2` (gerçek değil) ve `kanal_57_34` (ters sıra) REDDEDİLİR.
 *       Ters yön SESSİZCE normalize EDİLMEZ; açıkça reddedilir.
 *
 * Bu dosya saf/deterministiktir: ağ yok, DB yok, yan etki yok.
 */

import {
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_TYPES,
} from "../constants";
import type { HdAuthorityCode, HdTypeCode } from "../types";

// ────────────────────────────────────────────────────────────────────────────
// Entity türü
// ────────────────────────────────────────────────────────────────────────────

/** İlk profesyonel canonical entity aileleri. (profil/tanim/merkez/strateji YOK) */
export type HdCanonicalEntityKind = "tip" | "otorite" | "kapi" | "kanal";

export const HD_CANONICAL_ENTITY_KINDS: readonly HdCanonicalEntityKind[] = [
  "tip",
  "otorite",
  "kapi",
  "kanal",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Canonical anahtar tipleri (template-literal)
// ────────────────────────────────────────────────────────────────────────────

/** `tip_generator`, `tip_manifesting_generator`, … */
export type HdTypeCanonicalKey = `tip_${HdTypeCode}`;

/** `otorite_sacral`, `otorite_emotional`, … */
export type HdAuthorityCanonicalKey = `otorite_${HdAuthorityCode}`;

/**
 * `kapi_1` … `kapi_64`.
 * NOT: TypeScript template-literal `${number}` aralığı tip düzeyinde daraltamaz;
 * 1–64 sınırı çalışma zamanında {@link isHdGateCanonicalKey} ile zorlanır.
 */
export type HdGateCanonicalKey = `kapi_${number}`;

/**
 * `kanal_34_57`, `kanal_10_20`, …
 * Biçim: `kanal_${gateA}_${gateB}`; sıra kanal kimliğinden korunur.
 */
export type HdChannelCanonicalKey = `kanal_${number}_${number}`;

/** İlk kapsamdaki tüm canonical anahtarlar. */
export type HdCanonicalKey =
  | HdTypeCanonicalKey
  | HdAuthorityCanonicalKey
  | HdGateCanonicalKey
  | HdChannelCanonicalKey;

// ────────────────────────────────────────────────────────────────────────────
// Sabit doğrulama kümeleri (runtime)
// ────────────────────────────────────────────────────────────────────────────

const TYPE_CODES: ReadonlySet<string> = new Set(HUMAN_DESIGN_TYPES.map((t) => t.code));
const AUTHORITY_CODES: ReadonlySet<string> = new Set(
  HUMAN_DESIGN_AUTHORITIES.map((a) => a.code),
);

/**
 * Resmi 36 Kanalın canonical anahtar kümesi — `"34-57" → "kanal_34_57"`.
 * Kanal builder/guard/parser'ın TEK yetkili doğrulama kaynağı: bu küme resmi
 * kanal sırasını ve gerçek üyeliği taşır (baştaki sıfır/ters yön burada yok).
 */
const OFFICIAL_CHANNEL_KEYS: ReadonlySet<string> = new Set(
  HUMAN_DESIGN_CHANNELS.map((ch) => `kanal_${ch.code.replace(/-/g, "_")}`),
);

/** Geçerli Kapı numarası: 1–64 arası tam sayı. */
export function isValidGateNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 64;
}

// ────────────────────────────────────────────────────────────────────────────
// Builder'lar — geçersiz girdide açıklayıcı hata fırlatır
// ────────────────────────────────────────────────────────────────────────────

export function buildHdTypeCanonicalKey(typeCode: HdTypeCode): HdTypeCanonicalKey {
  if (!TYPE_CODES.has(typeCode)) {
    throw new Error(`Geçersiz Tip kodu: ${JSON.stringify(typeCode)}`);
  }
  return `tip_${typeCode}`;
}

export function buildHdAuthorityCanonicalKey(
  authorityCode: HdAuthorityCode,
): HdAuthorityCanonicalKey {
  if (!AUTHORITY_CODES.has(authorityCode)) {
    throw new Error(`Geçersiz Otorite kodu: ${JSON.stringify(authorityCode)}`);
  }
  return `otorite_${authorityCode}`;
}

export function buildHdGateCanonicalKey(gateNumber: number): HdGateCanonicalKey {
  if (!isValidGateNumber(gateNumber)) {
    throw new Error(`Geçersiz Kapı numarası (1–64 bekleniyor): ${JSON.stringify(gateNumber)}`);
  }
  return `kapi_${gateNumber}`;
}

/**
 * `kanal_${gateA}_${gateB}` üretir.
 * Kurallar: iki gate de 1–64, gateA ≠ gateB VE çift resmi 36 Kanal kümesinde,
 * RESMİ SIRASIYLA bulunmalı. SIRALAMA/normalizasyon YAPILMAZ — ters yön
 * (ör. 57,34) sessizce çevrilmez, açıkça reddedilir. Geçerli örnek
 * `"34-57" → "kanal_34_57"` (production `buildCodesFromChart` ile birebir).
 */
export function buildHdChannelCanonicalKey(
  gateA: number,
  gateB: number,
): HdChannelCanonicalKey {
  if (!isValidGateNumber(gateA) || !isValidGateNumber(gateB)) {
    throw new Error(
      `Geçersiz Kanal kapıları (1–64 bekleniyor): ${JSON.stringify([gateA, gateB])}`,
    );
  }
  if (gateA === gateB) {
    throw new Error(`Kanal aynı Kapıyı iki kez kullanamaz: ${JSON.stringify([gateA, gateB])}`);
  }
  const key = `kanal_${gateA}_${gateB}` as const;
  if (!OFFICIAL_CHANNEL_KEYS.has(key)) {
    throw new Error(
      `Kanal resmi 36 kanal kümesinde yok veya ters sırada: ${JSON.stringify([gateA, gateB])}`,
    );
  }
  return key;
}

/**
 * Kanal kimliğinden (`"34-57"` gibi) canonical anahtar üretir.
 * STRICT: baştaki sıfır kabul edilmez; çift resmi 36 Kanal kümesinde resmi
 * sırasıyla bulunmalıdır (üyelik ve sıra {@link buildHdChannelCanonicalKey}
 * içinde zorlanır). Production `channel.replace(/-/g, "_")` davranışıyla resmi
 * kodlar için birebir aynı sonuç.
 */
export function buildHdChannelCanonicalKeyFromCode(
  channelCode: string,
): HdChannelCanonicalKey {
  const m = /^(\d+)-(\d+)$/.exec(channelCode);
  if (!m) {
    throw new Error(`Geçersiz Kanal kimliği (\"A-B\" bekleniyor): ${JSON.stringify(channelCode)}`);
  }
  // Strict decimal: baştaki sıfır reddedilir ("01-08" → hata; round-trip bozulur).
  if (m[1] !== String(Number(m[1])) || m[2] !== String(Number(m[2]))) {
    throw new Error(`Kanal kimliğinde kanonik olmayan biçim: ${JSON.stringify(channelCode)}`);
  }
  return buildHdChannelCanonicalKey(Number(m[1]), Number(m[2]));
}

// ────────────────────────────────────────────────────────────────────────────
// Type guard'lar
// ────────────────────────────────────────────────────────────────────────────

export function isHdTypeCanonicalKey(s: string): s is HdTypeCanonicalKey {
  return s.startsWith("tip_") && TYPE_CODES.has(s.slice("tip_".length));
}

export function isHdAuthorityCanonicalKey(s: string): s is HdAuthorityCanonicalKey {
  return s.startsWith("otorite_") && AUTHORITY_CODES.has(s.slice("otorite_".length));
}

export function isHdGateCanonicalKey(s: string): s is HdGateCanonicalKey {
  if (!s.startsWith("kapi_")) return false;
  const rest = s.slice("kapi_".length);
  // STRICT: baştaki sıfır yok, ondalık/işaret/whitespace/ek segment yok.
  // `kapi_01`/`kapi_001`/`kapi_1.0`/`kapi_+1`/`kapi_ 1`/`kapi_34_1` reddedilir.
  if (!/^[1-9]\d*$/.test(rest)) return false;
  return isValidGateNumber(Number(rest));
}

export function isHdChannelCanonicalKey(s: string): s is HdChannelCanonicalKey {
  // TEK yetkili kaynak: resmi 36 kanal canonical anahtar kümesi. Bu küme
  // strict-decimal + resmi sıra + gerçek üyeliği birlikte zorlar; `kanal_1_2`,
  // `kanal_57_34`, `kanal_01_08`, `kanal_1-8`, `kanal_10_20_extra` reddedilir.
  return OFFICIAL_CHANNEL_KEYS.has(s);
}

export function isHdCanonicalKey(s: string): s is HdCanonicalKey {
  return (
    isHdTypeCanonicalKey(s) ||
    isHdAuthorityCanonicalKey(s) ||
    isHdGateCanonicalKey(s) ||
    isHdChannelCanonicalKey(s)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Parser
// ────────────────────────────────────────────────────────────────────────────

export type HdParsedCanonicalKey =
  | { kind: "tip"; key: HdTypeCanonicalKey; typeCode: HdTypeCode }
  | { kind: "otorite"; key: HdAuthorityCanonicalKey; authorityCode: HdAuthorityCode }
  | { kind: "kapi"; key: HdGateCanonicalKey; gateNumber: number }
  | { kind: "kanal"; key: HdChannelCanonicalKey; gateA: number; gateB: number };

/** Canonical anahtarı yapısal parçalara çözer. Tanımsız/kapsam-dışı ise null. */
export function parseHdCanonicalKey(s: string): HdParsedCanonicalKey | null {
  if (isHdTypeCanonicalKey(s)) {
    return { kind: "tip", key: s, typeCode: s.slice("tip_".length) as HdTypeCode };
  }
  if (isHdAuthorityCanonicalKey(s)) {
    return {
      kind: "otorite",
      key: s,
      authorityCode: s.slice("otorite_".length) as HdAuthorityCode,
    };
  }
  if (isHdGateCanonicalKey(s)) {
    return { kind: "kapi", key: s, gateNumber: Number(s.slice("kapi_".length)) };
  }
  if (isHdChannelCanonicalKey(s)) {
    const m = /^(\d+)_(\d+)$/.exec(s.slice("kanal_".length))!;
    return { kind: "kanal", key: s, gateA: Number(m[1]), gateB: Number(m[2]) };
  }
  return null;
}

/** Anahtardan entity türünü döner; kapsam dışıysa null. */
export function hdCanonicalEntityKindOf(s: string): HdCanonicalEntityKind | null {
  return parseHdCanonicalKey(s)?.kind ?? null;
}
