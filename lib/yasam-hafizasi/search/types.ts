/**
 * Yaşam Hafızası™ — Hızlı Tarama (Lexical Retrieval) ortak tipleri (Sprint 2 / S2.01).
 *
 * YALNIZ TİP TANIMLARI. Bu dosyada mantık YOKTUR:
 *   - normalize / sözlük / tsquery / retrieval / kanıt kapısı / skorlama / "Neden?"
 *     UYGULANMAZ (sonraki S2.* aşamaları).
 *   - AI / embedding / pgvector / PII / UI YOK.
 *
 * Değer sabitleri (skor/ağırlık/eşik/izinli değerler) `../config` dosyasındadır;
 * union tipleri tek-kaynak olması için oradaki `as const` dizilerinden türetilir.
 */

import type { YhSourceModule } from "../config";
import { YH_EVIDENCE_TYPES, YH_MATCH_TYPES } from "../config";

// ─── Kavram Kümesi (C) ───────────────────────────────────────────────────────

/** Bir kavramın kaynağı: doğrudan sorgudan mı, sözlük eş-anlamından mı geldi. */
export type ConceptOrigin = "query" | "synonym";

/** Normalize + sözlük genişletme sonrası tek bir kavram (Kavram Kümesi C öğesi). */
export interface Concept {
  /** Normalize edilmiş kavram terimi (arama/eşleşme için kullanılan biçim). */
  term: string;
  /** Kavramın kaynağı ("Neden?" içinde synonym türünü belli eder). */
  origin: ConceptOrigin;
  /** Sözlük eş-anlamıysa, hangi canonical kavramdan türediği (opsiyonel). */
  canonical?: string;
}

// ─── Eşleşme / Kanıt türleri ─────────────────────────────────────────────────

/** İzinli evidence_type değerleri ("Neden?" şablon anahtarı) — config'ten türetilir. */
export type EvidenceType = (typeof YH_EVIDENCE_TYPES)[number];

/** İzinli match type değerleri (kanıt skoru anahtarı) — config'ten türetilir. */
export type MatchType = (typeof YH_MATCH_TYPES)[number];

/**
 * Kaba eşleşme ailesi (doküman §4 öncelik sırası): kanıt hangi biçimde eşleşti.
 * matchType'ın türetildiği üst kategoridir; skor MatchType üzerinden verilir.
 */
export type MatchStrength =
  | "exact"
  | "partial"
  | "whole-word"
  | "phrase"
  | "synonym"
  | "prefix";

// ─── Aday (retrieval çıktısı, Kanıt Kapısı öncesi) ───────────────────────────

/** Kanıt Kapısı'nın tarayacağı tek bir kanıt-alanı (indeks satırından). */
export interface EvidenceField {
  /** Alanın kaynağı (provenance): hangi kolon/yol. */
  origin: string;
  /** Alanın rolü. */
  kind: EvidenceType;
  /** Alanın birebir metni (normalize edilmemiş, gösterim/iz için). */
  text: string;
  /** Alt-konum (paragraf granülerliği), varsa. */
  sectionRef?: string;
}

/** Uzman-tanımlı çapraz ilişki (evidence_type=relation için). */
export interface ExpertRelation {
  kind: string;
  targetLabel: string;
}

/**
 * search_tsv sorgusundan dönen bir aday (henüz Kanıt Kapısı'ndan geçmemiş).
 * Alanlar ana indeks satırının retrieval için gereken alt kümesidir.
 */
export interface Candidate {
  id: string;
  tenantId: string | null;
  sourceModule: YhSourceModule;
  sourceTable: string;
  sourceId: string;
  unitType: string;
  sectionRef: string | null;
  groupKey: string | null;
  title: string | null;
  snippet: string | null;
  evidenceFields: EvidenceField[];
  topicTags: string[];
  expertRelations: ExpertRelation[];
  /** DB ts_rank değeri (sıralama girdisi; görünürlüğe karar VERMEZ). */
  tsRank: number;
  sourceUpdatedAt: string | null;
}

// ─── Kanıt (Kanıt Kapısı çıktısı) ────────────────────────────────────────────

/**
 * Kanıt Kapısı'nın ürettiği somut kanıt. "Neden?" ve derece YALNIZ bundan doğar.
 * (INV-1: kanıtsız aday düşer · INV-2: "Neden?" yalnız buradan.)
 */
export interface Evidence {
  /** Hangi kavram eşleşti (Kavram Kümesi C'den). */
  concept: string;
  /** Kayıtta eşleşen birebir terim. */
  matchedTerm: string;
  /** Kanıtın türü (şablon anahtarı). */
  evidenceType: EvidenceType;
  /** Eşleşmenin skor anahtarı. */
  matchType: MatchType;
  /** Kaba eşleşme ailesi. */
  strength: MatchStrength;
  /** Bu kanıtın skoru (config.YH_EVIDENCE_SCORES'tan). */
  score: number;
  /** Alanın kaynağı (provenance), varsa. */
  fieldOrigin?: string;
  /** İlişki kanıtında hedef etiketi. */
  targetLabel?: string;
  /** Alt-konum (paragraf), varsa. */
  sectionRef?: string;
  /** Metin içindeki eşleşme aralığı [başlangıç, bitiş], varsa. */
  charSpan?: [number, number];
}

// ─── Derece / Sıralı sonuç ───────────────────────────────────────────────────

/** Adayın nihai derecesi (doküman §5). */
export type MatchDegree = "cok-guclu" | "guclu" | "zayif";

/** Deterministik "Neden gösterildi?" satırı (INV-2: yalnız Evidence'tan). */
export interface Reason {
  evidenceType: EvidenceType;
  /** Sabit şablondan üretilmiş açıklama metni (AI yok). */
  text: string;
}

/**
 * Kanıt Kapısı + skorlama + "Neden?" sonrası gösterime hazır tek sonuç.
 * Kanıtsız hiçbir kayıt bu tipe ULAŞAMAZ (INV-1).
 */
export interface RankedResult {
  id: string;
  sourceModule: YhSourceModule;
  sourceTable: string;
  sourceId: string;
  unitType: string;
  sectionRef: string | null;
  groupKey: string | null;
  title: string | null;
  snippet: string | null;
  /** Nihai derece = en yüksek kanıt skoruna göre. */
  degree: MatchDegree;
  /** Adayın skoru (en yüksek kanıt skoru; bonus uygulanmış). */
  score: number;
  /** Kanıt toplamı (sıralama tie-break girdisi). */
  evidenceScoreSum: number;
  /** Bu sonucu doğuran kanıtlar. */
  evidence: Evidence[];
  /** Deterministik "Neden?" satırları. */
  reasons: Reason[];
}

// ─── Faset / İstek / Yanıt ───────────────────────────────────────────────────

/** Modül faseti (sunum-katmanı sayaç; yeni sorgu yapmaz — doküman §8). */
export interface ModuleFacet {
  module: YhSourceModule;
  count: number;
}

/** Boş durum türü (doküman §7). */
export type EmptyReason = "cold-start" | "no-topic";

/**
 * Hızlı Tarama istek gövdesi.
 * DEĞİŞMEZ: tenant BURADA YOKTUR — yalnız session'dan çözülür (asla body'den).
 */
export interface QuickSearchRequest {
  /** Ham sorgu metni. */
  query: string;
  /** Opsiyonel modül faseti (sunum filtresi); boş → tüm izinli modüller. */
  modules?: YhSourceModule[];
  /** Shared (tenant_id IS NULL) referansları dahil et (yh_shared flag'ine bağlı). */
  allowShared?: boolean;
}

/** Hızlı Tarama yanıtı. */
export interface QuickSearchResponse {
  ok: boolean;
  /** Sorgunun nasıl anlamlandırıldığı (aramanın dürüst yapıldığının kanıtı). */
  concepts: Concept[];
  /** Dereceli, kanıtlı sonuçlar (kanıtsız kayıt burada ASLA bulunmaz). */
  results: RankedResult[];
  /** Modül faset sayaçları. */
  facets: ModuleFacet[];
  /** Sonuç yoksa boş durum sebebi (doküman §7). */
  emptyReason?: EmptyReason;
}
