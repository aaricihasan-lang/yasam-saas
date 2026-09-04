// ─────────────────────────────────────────────────────────────────────────────
// PROFESYONEL İLİŞKİ MOTORU — TYPED RESULT CONTRACT (canonical v2)
//
// KAYNAK: Hasan Hoca "kitap 1. seviye" + "kitap 2. seviye" PDF'leri (course_notes).
// Ayyüce / Florence YOKTUR.
//
// KRİTİK: Tek bir "genel/global uyum skoru" alanı YOKTUR. Kaynakta metni bulunan
// katmanlar catalogs'tan doldurulur (status COMPUTED); bulunmayan metin UYDURULMAZ.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceStatus =
  | "COMPUTED"
  | "VERIFIED_SOURCE"
  | "SOURCE_MISSING"
  | "SOURCE_MISSING_MAPPING"
  | "SOURCE_MISSING_DERIVATION"
  | "SOURCE_SAMPLE_CONFLICT";

export type Provenance = {
  methodId: string;
  sourceFamily: "course_notes";
  formulaVersion: number;
  sourcePage?: string;
};

export type RelationshipPerson = {
  name: string;
  surname: string;
  birthDate: string;
  pin8: number[];
  lifeCodeDigit: number; // doğum tarihi → tek hane
  birthdayDigit: number; // gün → tek hane
  acquisitionDigit: number; // (gün+ay) → tek hane
  nameNumber: number; // isim+soyisim harf toplamı → tek hane
};

// ── Katman tipleri ───────────────────────────────────────────────────────────

/** Her kişi için ayrı 1–9 katalog metni (İsim / Yaşam Kodu / Edinim / Doğum Günü). */
export type PerPersonPairLayer = {
  aDigit: number;
  bDigit: number;
  aText: string | null;
  bText: string | null;
  status: SourceStatus;
  provenance: Provenance;
};

/** Yönlü münasebet (A satırı → B hedefi ve B → A). "Kiminle ne tür ilişki". */
export type DirectionalLayer = {
  aDigit: number;
  bDigit: number;
  aToB: string | null;
  bToA: string | null;
  status: SourceStatus;
  provenance: Provenance;
};

/** Tek rakamlı, tek metinli katman (Ruh Duygusu / Neden Bir Aradayız). */
export type SingleTextLayer = {
  digit: number;
  /** Yalnız "Neden Bir Aradayız" için: ilk 8 sinerji hanesinin toplamı. */
  sum?: number;
  text: string | null;
  status: SourceStatus;
  provenance: Provenance;
};

export type CommonTopicsLayer = {
  aNameNumber: number;
  bNameNumber: number;
  commonDigit: number;
  text: string | null;
  status: SourceStatus;
  provenance: Provenance;
};

export type SynergyStep = { index: number; a: number; b: number; sum: number; result: number };

export type HaneInterpretation = {
  position: number; // 1..8
  field: string;
  value: number;
  text: string | null;
};

export type SynergyPinLayer = {
  pin: number[];
  steps: SynergyStep[];
  /** Her hanenin (1..8) değerine karşılık gelen kaynak yorumu. */
  haneInterpretations: HaneInterpretation[];
  provenance: Provenance;
};

export type TriangleNode = {
  position: number;
  field: string;
  value: number;
  text: string | null;
};

export type RelationshipTriangleLayer = {
  positions: number[];
  excludedPositions: number[];
  nodes: TriangleNode[];
  ruleText: string;
  status: SourceStatus;
  provenance: Provenance;
};

export type ElementBalanceLayer = {
  counts: { Hava: number; Su: number; Ateş: number; Toprak: number; Nötr: number };
  highlighted: string[]; // tie KORUNUR
  levels: { element: string; count: number; level: string | null }[];
  provenance: Provenance;
};

export type DominanceLayer = {
  baskin: number;
  edilgen: number;
  provenance: Provenance;
};

// CompatClass / CompatibilityClassification — Ev/İşyeri (Business) uyum motorunun
// PAYLAŞTIĞI sınıflandırma tipleridir (lib/numeroloji/business bunları import eder).
// FAZ 6'da Eş Uyumu / Nikâh KALDIRILDI ama bu tipler KORUNUR (shared primitive).
export type CompatClass = "İYİ" | "KÖTÜ" | "KÇB";

export type CompatibilityClassification = {
  status: "COMPUTED" | "SOURCE_MISSING";
  number: number;
  digits: number[];
  classes: CompatClass[];
  percentage: number | null;
  polarity: "UYUMLU" | "UYUMSUZ" | null;
  label: string | null;
  note?: string;
};

export type RelationshipAnalysisResult = {
  persons: [RelationshipPerson, RelationshipPerson];

  lifeCodeCompatibility: PerPersonPairLayer; // Yaşam Kodu Sayısı İçin İlişkiler
  nameNumberCompatibility: PerPersonPairLayer; // İsim Sayısı ve İlişkiler
  acquisitionCompatibility: PerPersonPairLayer; // Edinim Sayısı ve İlişkiler
  birthdayCompatibility: PerPersonPairLayer; // Doğum Günü Sayısı ve İlişkiler
  commonTopics: CommonTopicsLayer; // Ortak Rakamların Yorumu
  relationshipType: DirectionalLayer; // Kiminle ne tür ilişki (yönlü 1×9)

  synergyPin: SynergyPinLayer;
  whyTogether: SingleTextLayer;
  relationshipSoulFeeling: SingleTextLayer;
  relationshipTriangle: RelationshipTriangleLayer;

  elementBalance: ElementBalanceLayer;
  dominance: DominanceLayer;

  // BİLEREK YOK: globalScore / overallScore / compatibilityScore
  // FAZ 6'da KALDIRILDI: spouseCompatibility (Eş Uyumu) + marriageDateEffect (Nikâh/Birliktelik Tarihi).
};
