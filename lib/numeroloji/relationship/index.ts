import { parseBirthDate } from "../ortak";
import type {
  HaneInterpretation,
  Provenance,
  RelationshipAnalysisResult,
  RelationshipPerson,
  SourceStatus,
  TriangleNode,
} from "./types";
import {
  CATALOG_SOURCE_PAGES,
  DIRECTIONAL_REL,
  DOGUM_GUNU_REL,
  EDINIM_REL,
  HANE_FIELD_BY_POSITION,
  HANE_REL,
  ISIM_SAYISI_REL,
  NEDEN_BIR_ARADAYIZ_REL,
  ORTAK_RAKAM_REL,
  RUH_DUYGUSU_REL,
  TRIANGLE_EXCLUDED_POSITIONS,
  TRIANGLE_FIELD_BY_POSITION,
  TRIANGLE_POSITIONS,
  TRIANGLE_RULE_NOTE,
  YASAM_KODU_REL,
} from "./catalogs";
import {
  calcAcquisition,
  calcBirthdayDigit,
  calcDominance,
  calcLifeCodeDigit,
  calcNameNumberSingle,
  calcSynergyElements,
  calcSynergyPin,
  calcWhyTogether,
  elementLevel,
  highlightedElements,
  pin8From,
} from "./calculations";

export * from "./types";
export * from "./compatibilityAlphabet";
export * from "./calculations";
export * from "./catalogs";

const SOURCE_FAMILY = "course_notes" as const;
function prov(methodId: string, sourcePage?: string): Provenance {
  return { methodId, sourceFamily: SOURCE_FAMILY, formulaVersion: 1, sourcePage };
}
function lookup(cat: Record<number, string>, key: number): string | null {
  return cat[key] ?? null;
}
function statusOf(text: string | null): SourceStatus {
  return text ? "COMPUTED" : "SOURCE_MISSING";
}

export type RelationshipInput = {
  person1: { name: string; surname: string; birthDate: string };
  person2: { name: string; surname: string; birthDate: string };
};

function normDate(raw: string): string {
  return (raw || "").trim().replace(/\//g, ".");
}

export function isRelationshipInputValid(input: RelationshipInput): boolean {
  return parseBirthDate(normDate(input.person1.birthDate)) !== null && parseBirthDate(normDate(input.person2.birthDate)) !== null;
}

function buildPerson(p: { name: string; surname: string; birthDate: string }): RelationshipPerson | null {
  const bd = normDate(p.birthDate);
  const pin8 = pin8From(bd);
  const lifeCodeDigit = calcLifeCodeDigit(bd);
  const birthdayDigit = calcBirthdayDigit(bd);
  const acquisitionDigit = calcAcquisition(bd);
  const nameNumber = calcNameNumberSingle(p.name, p.surname);
  if (!pin8 || lifeCodeDigit == null || birthdayDigit == null || acquisitionDigit == null) return null;
  return { name: p.name.trim(), surname: p.surname.trim(), birthDate: bd, pin8, lifeCodeDigit, birthdayDigit, acquisitionDigit, nameNumber: nameNumber ?? 0 };
}

function reduceTo1To9(n: number): number {
  let cur = Math.abs(n);
  while (cur > 9) cur = String(cur).split("").reduce((x, c) => x + Number(c), 0);
  return cur === 0 ? 9 : cur;
}

/**
 * Profesyonel İlişki Analizi (canonical v2 — kaynak: kitap 1.+2. seviye).
 * Tüm katmanlar kaynak katalog metinleriyle doldurulur. TEK GENEL SKOR YOKTUR.
 */
export function analyzeRelationship(input: RelationshipInput): RelationshipAnalysisResult | null {
  const a = buildPerson(input.person1);
  const b = buildPerson(input.person2);
  if (!a || !b) return null;

  // ── Sinerji PIN ailesi ─────────────────────────────────────────────────────
  const synergy = calcSynergyPin(a.pin8, b.pin8);
  const why = calcWhyTogether(synergy.pin);
  const soulDigit = synergy.pin[7];

  const haneInterpretations: HaneInterpretation[] = synergy.pin.map((value, i) => {
    const position = i + 1;
    return { position, field: HANE_FIELD_BY_POSITION[position], value, text: lookup(HANE_REL[position] ?? {}, value) };
  });

  // ── Enerji dağılımı ────────────────────────────────────────────────────────
  const counts = calcSynergyElements(synergy.pin);
  const highlighted = highlightedElements(counts);
  const levels = (Object.keys(counts) as (keyof typeof counts)[]).map((element) => ({ element, count: counts[element], level: elementLevel(counts[element]) }));
  const dom = calcDominance(synergy.pin);

  // ── İlişki Üçgeni ──────────────────────────────────────────────────────────
  const triangleNodes: TriangleNode[] = TRIANGLE_POSITIONS.map((position) => {
    const value = synergy.pin[position - 1];
    return { position, field: TRIANGLE_FIELD_BY_POSITION[position], value, text: lookup(HANE_REL[position] ?? {}, value) };
  });

  // FAZ 6: Eş Uyumu (spouseCompatibility) ve Nikâh/Birliktelik Tarihi Etkisi
  // (marriageDateEffect) ürün kapsamından KALDIRILDI. Sinerji PIN / üçgen / ortak
  // rakam katmanları bunlardan bağımsızdır. Ev/İşyeri uyum motorunun paylaştığı
  // compatibilityAlphabet + rawBirthDigitSum + CompatClass primitive'leri korunur
  // (bu dosyadan re-export edilir), yalnız burada tüketilmez.

  const lifeA = lookup(YASAM_KODU_REL, a.lifeCodeDigit);
  const lifeB = lookup(YASAM_KODU_REL, b.lifeCodeDigit);
  const nameA = lookup(ISIM_SAYISI_REL, a.nameNumber);
  const nameB = lookup(ISIM_SAYISI_REL, b.nameNumber);
  const edA = lookup(EDINIM_REL, a.acquisitionDigit);
  const edB = lookup(EDINIM_REL, b.acquisitionDigit);
  const bdA = lookup(DOGUM_GUNU_REL, a.birthdayDigit);
  const bdB = lookup(DOGUM_GUNU_REL, b.birthdayDigit);
  const commonDigit = reduceTo1To9(a.nameNumber + b.nameNumber);
  const commonText = lookup(ORTAK_RAKAM_REL, commonDigit);
  const dirAtoB = lookup(DIRECTIONAL_REL[a.lifeCodeDigit] ?? {}, b.lifeCodeDigit);
  const dirBtoA = lookup(DIRECTIONAL_REL[b.lifeCodeDigit] ?? {}, a.lifeCodeDigit);
  const soulText = lookup(RUH_DUYGUSU_REL, soulDigit);
  const whyText = lookup(NEDEN_BIR_ARADAYIZ_REL, why.digit);

  return {
    persons: [a, b],

    lifeCodeCompatibility: { aDigit: a.lifeCodeDigit, bDigit: b.lifeCodeDigit, aText: lifeA, bText: lifeB, status: statusOf(lifeA && lifeB ? "x" : null), provenance: prov("course_life_code_relation_v1", CATALOG_SOURCE_PAGES.yasamKodu) },
    nameNumberCompatibility: { aDigit: a.nameNumber, bDigit: b.nameNumber, aText: nameA, bText: nameB, status: statusOf(nameA && nameB ? "x" : null), provenance: prov("course_name_number_relation_v1", CATALOG_SOURCE_PAGES.isimSayisi) },
    acquisitionCompatibility: { aDigit: a.acquisitionDigit, bDigit: b.acquisitionDigit, aText: edA, bText: edB, status: statusOf(edA && edB ? "x" : null), provenance: prov("course_acquisition_relation_v1", CATALOG_SOURCE_PAGES.edinim) },
    birthdayCompatibility: { aDigit: a.birthdayDigit, bDigit: b.birthdayDigit, aText: bdA, bText: bdB, status: statusOf(bdA && bdB ? "x" : null), provenance: prov("course_birthday_relation_v1", CATALOG_SOURCE_PAGES.dogumGunu) },
    commonTopics: { aNameNumber: a.nameNumber, bNameNumber: b.nameNumber, commonDigit, text: commonText, status: statusOf(commonText), provenance: prov("course_common_topics_v1", CATALOG_SOURCE_PAGES.ortakRakam) },
    relationshipType: { aDigit: a.lifeCodeDigit, bDigit: b.lifeCodeDigit, aToB: dirAtoB, bToA: dirBtoA, status: statusOf(dirAtoB && dirBtoA ? "x" : null), provenance: prov("course_relationship_type_v1", CATALOG_SOURCE_PAGES.directional) },

    synergyPin: { pin: synergy.pin, steps: synergy.steps, haneInterpretations, provenance: prov("course_synergy_pin_v1") },
    whyTogether: { digit: why.digit, sum: why.sum, text: whyText, status: statusOf(whyText), provenance: prov("course_why_together_v1", CATALOG_SOURCE_PAGES.nedenBirAradayiz) },
    relationshipSoulFeeling: { digit: soulDigit, text: soulText, status: statusOf(soulText), provenance: prov("course_relationship_soul_feeling_v1", CATALOG_SOURCE_PAGES.ruhDuygusu) },
    relationshipTriangle: {
      positions: TRIANGLE_POSITIONS,
      excludedPositions: TRIANGLE_EXCLUDED_POSITIONS,
      nodes: triangleNodes,
      ruleText: TRIANGLE_RULE_NOTE,
      status: "COMPUTED",
      provenance: prov("course_relationship_triangle_v1", CATALOG_SOURCE_PAGES.hane),
    },

    elementBalance: { counts, highlighted, levels, provenance: prov("course_relationship_elements_v1") },
    dominance: { baskin: dom.baskin, edilgen: dom.edilgen, provenance: prov("course_relationship_processing_type_v1") },
  };
}
