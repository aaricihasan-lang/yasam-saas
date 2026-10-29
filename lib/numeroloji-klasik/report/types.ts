/**
 * Klasik Numeroloji — Word raporu girdi tipleri (SAF; IO yok).
 *
 * Kurucular YALNIZ kayıtlı, normalize edilmiş analiz nesnesini okur (sağlayıcı çağrısı / DB erişimi YOK).
 * `provider_meta` rapora HİÇ girmez (sağlayıcı adı orada tutulur) — bu yüzden kayıt tipinde yer almaz.
 */
import type { ClassicKind } from "../input";

/** Kayıtlı analiz (repository satırı ya da uzman görünümünden `toReportRecord` ile kurulur). */
export type ClassicReportRecord = {
  id?: string | null;
  kind: ClassicKind;
  title: string;
  /** Kaydedilmiş kanonik girdi (PersonInput / RelationshipInput / BusinessInput / NamesInput). */
  input: unknown;
  techniques: readonly string[];
  status: "complete" | "partial";
  /** Etiket → normalize sonuç ("chart", "bridge", "personal_day", "chaldean", "dual", "compatibility", "business_name", "dual#1"…). */
  result: Record<string, unknown>;
  methodologyVersion: string;
  apiSchemaVersion?: string | null;
  referenceDate?: string | null;
  createdAt?: string | null;
  /** Hesaplanamayan teknik etiketleri. */
  failed?: readonly string[];
};

export type ReportVariant = "summary" | "technical" | "full";

/** Kişi raporu bölüm grupları (sıra = rapor sırası). */
export type PersonReportGroup =
  | "core"
  | "karmic"
  | "timing"
  | "bridge"
  | "name_letters"
  | "hidden_subconscious"
  | "birthday_profile"
  | "maturity"
  | "chaldean"
  | "dual"
  | "lucky"
  | "stones";

export const PERSON_REPORT_GROUPS: readonly PersonReportGroup[] = Object.freeze([
  "core",
  "karmic",
  "timing",
  "bridge",
  "name_letters",
  "hidden_subconscious",
  "birthday_profile",
  "maturity",
  "chaldean",
  "dual",
  "lucky",
  "stones",
]);

export type CommonReportOptions = {
  /** Rapor tarihi (deterministik çıktı için enjekte edilir; verilmezse şimdi). */
  generatedAt?: string | Date;
  expertName?: string | null;
};

// ── Karşılaştırma (yapısal arayüz; compare/align.ts `Alignment` buna atanabilir — harness derleme denetimi) ──

export type ComparisonLegacyValue = { display: string; value?: number | null; root: number | null } | null;
export type ComparisonClassicValue = { value: number | null; type: string | null; karmicDebt: number | null; root?: number | null } | null;

export type ComparisonRow = {
  conceptKey: string;
  /** Zirve / zorluk dönem sırası; diğerlerinde null. */
  position?: number | null;
  labelTr: string;
  legacy: ComparisonLegacyValue;
  legacyMissingReason?: string | null;
  classic: ComparisonClassicValue;
  classicMissingReason?: string | null;
  /** "same_value" | "same_root" | "different" | "one_missing" | "not_comparable" (bilinmeyen değer metin olarak gösterilir). */
  relation: string;
  comparable?: string;
  sameNameDifferentFormula: boolean;
  explanation: string | null;
};

export type ComparisonOnlyItem = string | { key?: string; conceptKey?: string; labelTr: string; display?: string | null; present?: boolean };
export type ComparisonStoneItem =
  | string
  | { nameTr?: string; name?: string; nameLegacy?: string; slot?: string; slots?: readonly string[]; methods?: readonly string[]; status?: string };

export type ComparisonInput = {
  rows: readonly ComparisonRow[];
  onlyLegacy: readonly ComparisonOnlyItem[];
  onlyClassic: readonly ComparisonOnlyItem[];
  stones: {
    legacyAssigned: readonly ComparisonStoneItem[];
    classicDirect: readonly ComparisonStoneItem[];
    classicDerived: readonly ComparisonStoneItem[];
    overlap: readonly ComparisonStoneItem[];
  };
  /** Align: "legacy" | "classic" | "both" | null; ya da eksik kavram listesi. */
  missing: string | null | readonly (string | { labelTr: string })[];
};

export type ComparisonMeta = {
  /** Ekol başlığı (varsayılan: A → "Mevcut Numeroloji (A)", B → "Klasik Numeroloji (B)"). */
  schoolLabel?: string | null;
  title?: string | null;
  personName?: string | null;
  birthDate?: string | null;
  createdAt?: string | null;
  methodologyVersion?: string | null;
};

export type ComparisonReportInput = {
  alignment: ComparisonInput;
  legacyMeta: ComparisonMeta;
  classicMeta: ComparisonMeta;
  /** Uzman notu (raporun SONUNDA). */
  note?: string | null;
};
