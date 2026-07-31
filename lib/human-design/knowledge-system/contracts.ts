/**
 * HD-2B — Human Design Bilgi Sistemi · Çekirdek Veri Sözleşmeleri
 * ==============================================================
 *
 * Uygulama/veri sözleşmesi düzeyinde (NİHAİ DB kolon şeması DEĞİL) minimal,
 * geleceğe dayanıklı TypeScript sözleşmeleri.
 *
 * İLK KAPSAM: Tip, Otorite, Kapı (64), Kanal (36) + minimal ilişkiler.
 * Bu turda tablo/migration/RLS YOK; yalnız tip düzeyi sözleşme + saf doğrulayıcı.
 *
 * KAPSAM DIŞI (bu fazda sözleşme ZORUNLU KILMAZ):
 *   384 kapı çizgisi, gezegen aktivasyonları, profiller/tanımlar içerik
 *   sistemi, merkez içerik tablosu, inkarnasyon haçları, değişkenler/oklar,
 *   ilişki analizleri, gelişmiş rapor sentezi.
 *
 * Erişim/teslim (entitlement, admin→uzman paylaşımı, snapshot/canlı/hibrit)
 * MODELİ BURADA UYGULANMAZ; bu sözleşmeler ileride seçilecek erişim
 * yönteminden bağımsızdır (karar HD-2C/HD-2I öncesi kilitlenecek).
 */

import type { HdCenterCode } from "../types";
import type {
  HdAuthorityCanonicalKey,
  HdChannelCanonicalKey,
  HdGateCanonicalKey,
  HdTypeCanonicalKey,
} from "./canonicalKeys";
import {
  buildHdAuthorityCanonicalKey,
  buildHdChannelCanonicalKeyFromCode,
  buildHdGateCanonicalKey,
  buildHdTypeCanonicalKey,
  isValidGateNumber,
  parseHdCanonicalKey,
} from "./canonicalKeys";
import type { HdAuthorityCode, HdChannelCode, HdTypeCode } from "../types";

// ────────────────────────────────────────────────────────────────────────────
// Ortak yardımcı tipler
// ────────────────────────────────────────────────────────────────────────────

/** Merkez anahtarı — mevcut merkez sabit kodlarını yeniden kullanır (yeni tablo YOK). */
export type HdCenterKey = HdCenterCode;

/**
 * Devre (circuit) ailesi — iyi bilinen üç Human Design devresi. Minimal ve
 * nullable; frozen engine'den bağımsız, ileride genişletilebilir.
 */
export type HdCircuitKey = "individual" | "tribal" | "collective";

/** Yayın durumu — minimal. */
export type HdContentStatus = "draft" | "published";

/** Kaynak referansı — kaynaklı-iddia için minimal biçim (HD-2D'yi zorlamaz). */
export type HdSourceRef = {
  label: string;
  url?: string | null;
  note?: string | null;
};

/**
 * Tüm canonical içerik kayıtlarının paylaştığı taban alanlar.
 * `canonicalKey` her entity'de daha dar bir tiple override edilir.
 */
export type HdCanonicalContentBase = {
  canonicalKey: string;
  nameTr: string;
  nameOriginal: string;
  generalDescription: string;
  reportText: string;
  status: HdContentStatus;
  /** Pozitif tam sayı; içerik revizyonu. */
  version: number;
  sourceRefs: HdSourceRef[];
  /** İçerik AI tarafından üretildiyse işaretlenir (opsiyonel). */
  isAiGenerated?: boolean;
  /** İnsan onayı zaman damgası (ISO) — yoksa null/tanımsız. */
  humanApprovedAt?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// A. Tip sözleşmesi — Strateji AYRI ENTITY DEĞİL, burada bir ALAN.
// ────────────────────────────────────────────────────────────────────────────

export type HdTypeContract = HdCanonicalContentBase & {
  canonicalKey: HdTypeCanonicalKey;
  typeCode: HdTypeCode;
  /** Strateji: Tip'e ait alan (bağımsız strateji_* canonical entity YOK). */
  strategyText: string;
  /** İmza (signature) teması. */
  signatureText: string;
  /** Yanlış-benlik (not-self) teması. */
  notSelfText: string;
};

// ────────────────────────────────────────────────────────────────────────────
// B. Otorite sözleşmesi
// ────────────────────────────────────────────────────────────────────────────

export type HdAuthorityContract = HdCanonicalContentBase & {
  canonicalKey: HdAuthorityCanonicalKey;
  authorityCode: HdAuthorityCode;
  decisionMechanism: string;
  applicationText: string;
  cautionNotes: string;
};

// ────────────────────────────────────────────────────────────────────────────
// C. Kapı sözleşmesi — ÇİZGİ (line) ALANI YOK.
// ────────────────────────────────────────────────────────────────────────────

export type HdGateContract = HdCanonicalContentBase & {
  canonicalKey: HdGateCanonicalKey;
  /** 1–64. */
  gateNumber: number;
  centerKey: HdCenterKey;
  /** Harmonik/karşı kapı (1–64) veya bilinmiyorsa null. */
  oppositeGateNumber: number | null;
  circuitKey: HdCircuitKey | null;
  generalTheme: string;
};

// ────────────────────────────────────────────────────────────────────────────
// D. Kanal sözleşmesi — iki geçerli Kapı, aynı Kapı iki kez KULLANILAMAZ.
// ────────────────────────────────────────────────────────────────────────────

export type HdChannelContract = HdCanonicalContentBase & {
  canonicalKey: HdChannelCanonicalKey;
  /** Kanal kimliği, ör. "34-57". */
  channelCode: HdChannelCode;
  gateA: number;
  gateB: number;
  centerA: HdCenterKey;
  centerB: HdCenterKey;
  circuitKey: HdCircuitKey | null;
  generalTheme: string;
  fullChannelText: string;
  /** Tek uçlu (hanging gate) bağlam açıklaması. */
  hangingGateContext: string;
};

// ────────────────────────────────────────────────────────────────────────────
// E. İlişki sözleşmeleri — yalnız ilk kapsam için gerekli minimal ilişkiler.
// ────────────────────────────────────────────────────────────────────────────

/** Kapı ↔ Kanal üyeliği. */
export type HdGateChannelRelation = {
  gate: HdGateCanonicalKey;
  channel: HdChannelCanonicalKey;
};

/** Kapı → Merkez. */
export type HdGateCenterRelation = {
  gate: HdGateCanonicalKey;
  center: HdCenterKey;
};

/** Kanal → iki Merkez. */
export type HdChannelCentersRelation = {
  channel: HdChannelCanonicalKey;
  centerA: HdCenterKey;
  centerB: HdCenterKey;
};

// ────────────────────────────────────────────────────────────────────────────
// Saf doğrulayıcılar (deterministik, yan etkisiz, test edilebilir)
// ────────────────────────────────────────────────────────────────────────────

const CONTENT_STATUSES: ReadonlySet<string> = new Set<HdContentStatus>(["draft", "published"]);

export function isHdContentStatus(v: unknown): v is HdContentStatus {
  return typeof v === "string" && CONTENT_STATUSES.has(v);
}

/** Version pozitif tam sayı mı? */
export function isValidContentVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Anahtarın çözümlenen türü beklenen entity ile uyuşuyor mu? */
export function canonicalKeyMatchesKind(
  key: string,
  kind: "tip" | "otorite" | "kapi" | "kanal",
): boolean {
  return parseHdCanonicalKey(key)?.kind === kind;
}

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/** Builder'ı güvenli çağırır; geçersiz girdide null döner (hata fırlatmaz). */
function safeBuild(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Taban içerik alanlarını doğrular; sorun listesini döner (boş = geçerli).
 * `published` durumda çekirdek metin alanları dolu olmalı; `draft` gevşektir.
 */
export function validateHdContentBase(
  c: Partial<HdCanonicalContentBase>,
  expectedKind: "tip" | "otorite" | "kapi" | "kanal",
): string[] {
  const problems: string[] = [];
  if (typeof c.canonicalKey !== "string" || !canonicalKeyMatchesKind(c.canonicalKey, expectedKind)) {
    problems.push(`canonicalKey ${expectedKind} türüyle uyumsuz: ${JSON.stringify(c.canonicalKey)}`);
  }
  if (!isValidContentVersion(c.version)) {
    problems.push(`version pozitif tam sayı olmalı: ${JSON.stringify(c.version)}`);
  }
  if (!isHdContentStatus(c.status)) {
    problems.push(`status geçersiz: ${JSON.stringify(c.status)}`);
  }
  if (!Array.isArray(c.sourceRefs)) {
    problems.push("sourceRefs dizi olmalı");
  }
  if (c.status === "published") {
    if (!nonEmpty(c.nameTr)) problems.push("published: nameTr boş olamaz");
    if (!nonEmpty(c.generalDescription)) problems.push("published: generalDescription boş olamaz");
    if (!nonEmpty(c.reportText)) problems.push("published: reportText boş olamaz");
  }
  return problems;
}

export function validateHdTypeContract(c: Partial<HdTypeContract>): string[] {
  const problems = validateHdContentBase(c, "tip");
  // Strateji Tip alanı olmalı (ayrı entity değil).
  if (typeof c.strategyText !== "string") problems.push("strategyText Tip alanı olmalı (string)");
  if (c.status === "published" && !nonEmpty(c.strategyText)) {
    problems.push("published Tip: strategyText boş olamaz");
  }
  // KİMLİK UYUMU: canonicalKey === buildHdTypeCanonicalKey(typeCode)
  const expected = safeBuild(() => buildHdTypeCanonicalKey(c.typeCode as never));
  if (expected === null) {
    problems.push(`typeCode geçersiz: ${JSON.stringify(c.typeCode)}`);
  } else if (c.canonicalKey !== expected) {
    problems.push(
      `canonicalKey typeCode ile uyuşmuyor: ${JSON.stringify(c.canonicalKey)} ≠ ${expected}`,
    );
  }
  return problems;
}

export function validateHdAuthorityContract(c: Partial<HdAuthorityContract>): string[] {
  const problems = validateHdContentBase(c, "otorite");
  if (typeof c.decisionMechanism !== "string") {
    problems.push("decisionMechanism string olmalı");
  }
  // KİMLİK UYUMU: canonicalKey === buildHdAuthorityCanonicalKey(authorityCode)
  const expected = safeBuild(() => buildHdAuthorityCanonicalKey(c.authorityCode as never));
  if (expected === null) {
    problems.push(`authorityCode geçersiz: ${JSON.stringify(c.authorityCode)}`);
  } else if (c.canonicalKey !== expected) {
    problems.push(
      `canonicalKey authorityCode ile uyuşmuyor: ${JSON.stringify(c.canonicalKey)} ≠ ${expected}`,
    );
  }
  return problems;
}

export function validateHdGateContract(c: Partial<HdGateContract>): string[] {
  const problems = validateHdContentBase(c, "kapi");
  if (!isValidGateNumber(c.gateNumber)) {
    problems.push(`gateNumber 1–64 olmalı: ${JSON.stringify(c.gateNumber)}`);
  } else {
    // KİMLİK UYUMU: canonicalKey === buildHdGateCanonicalKey(gateNumber)
    const expected = buildHdGateCanonicalKey(c.gateNumber);
    if (c.canonicalKey !== expected) {
      problems.push(
        `canonicalKey gateNumber ile uyuşmuyor: ${JSON.stringify(c.canonicalKey)} ≠ ${expected}`,
      );
    }
  }
  if (!(c.oppositeGateNumber === null || isValidGateNumber(c.oppositeGateNumber))) {
    problems.push(`oppositeGateNumber 1–64 veya null olmalı: ${JSON.stringify(c.oppositeGateNumber)}`);
  }
  // Çizgi (line) alanı bu sözleşmede YOKTUR — varlığı hatadır.
  if ("line" in (c as Record<string, unknown>)) {
    problems.push("Kapı sözleşmesinde çizgi (line) alanı bulunamaz");
  }
  return problems;
}

export function validateHdChannelContract(c: Partial<HdChannelContract>): string[] {
  const problems = validateHdContentBase(c, "kanal");
  if (!isValidGateNumber(c.gateA) || !isValidGateNumber(c.gateB)) {
    problems.push(`gateA/gateB 1–64 olmalı: ${JSON.stringify([c.gateA, c.gateB])}`);
  } else if (c.gateA === c.gateB) {
    problems.push("Kanal aynı Kapıyı iki kez kullanamaz (gateA ≠ gateB)");
  }
  // KİMLİK UYUMU: channelCode gerçek+kanonik olmalı; canonicalKey ve gateA/gateB
  // (resmi sırayla) aynı Kanalı göstermeli.
  const expectedKey = safeBuild(() =>
    buildHdChannelCanonicalKeyFromCode(c.channelCode as string),
  );
  if (expectedKey === null) {
    problems.push(`channelCode gerçek/kanonik Kanal değil: ${JSON.stringify(c.channelCode)}`);
  } else {
    if (c.canonicalKey !== expectedKey) {
      problems.push(
        `canonicalKey channelCode ile uyuşmuyor: ${JSON.stringify(c.canonicalKey)} ≠ ${expectedKey}`,
      );
    }
    const parsed = parseHdCanonicalKey(expectedKey);
    if (parsed && parsed.kind === "kanal" && (c.gateA !== parsed.gateA || c.gateB !== parsed.gateB)) {
      problems.push(
        `gateA/gateB channelCode ile uyuşmuyor veya ters sırada: ` +
          `${JSON.stringify([c.gateA, c.gateB])} ≠ ${JSON.stringify([parsed.gateA, parsed.gateB])}`,
      );
    }
  }
  return problems;
}

// ────────────────────────────────────────────────────────────────────────────
// FAZ-2 ADDİTİF — Merkezî içerik hattı köprü sözleşmeleri
// ============================================================================
// Mevcut HD-2B tenant-bağımsız içerik sözleşmeleri (yukarısı) DEĞİŞTİRİLMEZ.
// Fiziksel merkezî şema/tip/persistence AYRI dosyalardadır
// (lib/human-design/admin/centralContent*). Burada yalnız iki katman arasındaki
// kararlı köprü değerleri additif olarak ilan edilir (kaynak evidence ilişki
// türü + sadık çeviri durumu). Bunlar migration CHECK'leriyle birebir olmalıdır.

/** İçerik ↔ kaynak pasajı evidence ilişki türü (hd_content_evidence.relation_type). */
export type HdEvidenceRelationType =
  | "supports"
  | "contradicts"
  | "school_specific"
  | "background";

export const HD_EVIDENCE_RELATION_TYPES: readonly HdEvidenceRelationType[] = [
  "supports",
  "contradicts",
  "school_specific",
  "background",
];

/** Sadık çeviri yayın durumu (hd_faithful_translations.status). */
export type HdFaithfulTranslationStatus = "draft" | "verified" | "archived";

export function isHdEvidenceRelationType(v: unknown): v is HdEvidenceRelationType {
  return typeof v === "string" && (HD_EVIDENCE_RELATION_TYPES as readonly string[]).includes(v);
}
