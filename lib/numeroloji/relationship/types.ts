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

export type SpouseCompatibilityLayer = {
  // İsim + Doğum Tarihi Uyumu
  aNameSum: number;
  bNameSum: number;
  aDobSum: number;
  bDobSum: number;
  aValue: number;
  bValue: number;
  coupleValue: number;
  classification: CompatibilityClassification;
  // İsim + Soyisim + Doğum Tarihi Uyumu (Soyadı Etkisi)
  aNameWithSurnameSum: number;
  bNameWithSurnameSum: number;
  aValueWithSurname: number;
  bValueWithSurname: number;
  coupleValueWithSurname: number;
  classificationWithSurname: CompatibilityClassification;
  unmappedLetters: string[];
  provenance: Provenance;
};

export type MarriageDateEffectLayer = {
  marriageDate: string;
  marriageDigitSum: number; // nikâh tarihi ham rakam toplamı
  /** İsim+Doğum couple değeri + nikâh toplamı → yeni sayı. */
  baseCoupleValue: number;
  combinedValue: number;
  classification: CompatibilityClassification;
  provenance: Provenance;
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

  spouseCompatibility: SpouseCompatibilityLayer;
  marriageDateEffect: MarriageDateEffectLayer | null;

  // BİLEREK YOK: globalScore / overallScore / compatibilityScore
};
