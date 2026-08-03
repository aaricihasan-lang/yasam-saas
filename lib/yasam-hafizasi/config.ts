/**
 * Yaşam Hafızası™ — merkezi sabitler ve tipler (Sprint 1 / A1).
 *
 * Yalnız sabitler + tipler. Retrieval / AI / embedding / UI mantığı İÇERMEZ.
 * Hem server hem (tip amaçlı) client tarafından import edilebilir; ancak
 * gerçek DB erişimi yalnızca server-only modüllerden yapılır (bkz flags.ts).
 */

/** Fiziksel tablo adları. */
export const YH_TABLES = {
  index: "yasam_hafizasi_index",
  flags: "yasam_hafizasi_flags",
  /** Küratörlü eş-anlam/kavram sözlüğü (Sprint 2 / retrieval; DDL S2.02). */
  topicDictionary: "yh_topic_dictionary",
} as const;

/**
 * İndekslenen kaynak modüller (FAZ 0 envanteri — bilgi/kütüphane, PII-DIŞI).
 * NOT: reflexology_notes ve bioenergy_sessions ihtiyatla PII kabul edildiği için
 * bu listedeki modüllerin kapsamı dışındadır (F5'e ertelendi).
 */
export const YH_SOURCE_MODULES = [
  "refleksoloji",
  "sifa_rehberi",
  "biyoenerji",
  "dogaltas",
  "aromaterapi",
  "kisisel_arsiv",
  // BF-14 Birleşik Modül Kaynak Genişletme: ADDITİF professional aile (numeroloji bilgi
  // bankası / kaynak katalogu). Yalnız DORMANT (enabled:false) source contract; mevcut
  // 6 aile ve davranışları DEĞİŞMEZ. source_module DB CHECK'i length>0 (enum yok).
  "numeroloji",
] as const;
export type YhSourceModule = (typeof YH_SOURCE_MODULES)[number];

/** İndekslenebilir birim türleri (index tablosu CHECK ile aynı). */
export const YH_UNIT_TYPES = ["record", "section", "row"] as const;
export type YhUnitType = (typeof YH_UNIT_TYPES)[number];

/** Feature flag anahtarları (tenant-seviyesi; user override YOK). */
export const YH_FLAG_KEYS = [
  "yh_enabled",
  "yh_hizli",
  "yh_derin",
  "yh_semantic",
  "yh_client_pii",
  "yh_shared",
] as const;
export type YhFlagKey = (typeof YH_FLAG_KEYS)[number];

/** Tenant flag durumu (hepsi boolean). */
export type YhFlags = Record<YhFlagKey, boolean>;

/** Varsayılan flag durumu: kademeli rollout için tümü kapalı. */
export const YH_DEFAULT_FLAGS: YhFlags = {
  yh_enabled: false,
  yh_hizli: false,
  yh_derin: false,
  yh_semantic: false,
  yh_client_pii: false,
  yh_shared: false,
};

/**
 * Demo tenant kimliği — indeksleme ve sorgu katmanında hariç tutulur
 * (mevcut biyoenerji RLS deseniyle aynı sabit).
 */
export const YH_DEMO_TENANT_ID = "40f842a0-e3e8-448c-8971-9a938e1faccb";

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 2 / Retrieval (Hızlı Tarama) sabitleri — yalnız DEĞERLER.
// Kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md (§3 ağırlık, §5 skor/derece).
// Mantık YOK: normalize/tsquery/skorlama/kapı bu dosyada UYGULANMAZ.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aday tavanı: Kanıt Kapısı'na girecek maksimum aday satır sayısı (doküman §3).
 * search_tsv sorgusu ts_rank ile sıralanıp bu tavanla kesilir.
 */
export const YH_CANDIDATE_LIMIT = 150;

/**
 * tsvector ağırlık katsayıları (doküman §3).
 * A=title · B=tag/ilişki · C=paragraf/korpus · D=diğer.
 * NOT: Bu değerler yalnız referanstır; ts_rank çağrısı retrieval aşamasında yapılır.
 */
export const YH_TSV_WEIGHTS = {
  A: 1.0,
  B: 0.6,
  C: 0.35,
  D: 0.15,
} as const;

/**
 * İzinli evidence_type değerleri — "Neden gösterildi?" şablon anahtarları (doküman §6).
 * Kanıt Kapısı ürettiği her kanıtı bu türlerden biriyle etiketler.
 */
export const YH_EVIDENCE_TYPES = [
  "title",
  "tag",
  "relation",
  "paragraph",
  "note",
  "synonym",
] as const;

/**
 * İzinli match type değerleri — kanıt skoru anahtarları (doküman §5).
 * Sıra, öncelik/skor sırasıyla aynıdır (yüksekten düşüğe).
 */
export const YH_MATCH_TYPES = [
  "exact-title",
  "exact-relation",
  "exact-tag",
  "partial-title",
  "partial-tag-relation",
  "whole-word-paragraph",
  "whole-word-note",
  "synonym-paragraph",
  "prefix-partial",
  "indirect",
] as const;

/**
 * Kanıt skorları (doküman §5, KİLİTLİ). Adayın derecesi = en yüksek kanıt skoru.
 */
export const YH_EVIDENCE_SCORES = {
  "exact-title": 100,
  "exact-relation": 95,
  "exact-tag": 90,
  "partial-title": 80,
  "partial-tag-relation": 70,
  "whole-word-paragraph": 60,
  "whole-word-note": 55,
  "synonym-paragraph": 40,
  "prefix-partial": 25,
  indirect: 15,
} as const;

/**
 * Derece eşikleri (doküman §5, KİLİTLİ):
 *   skor ≥ 90        → çok güçlü
 *   55 ≤ skor ≤ 89   → güçlü
 *   skor < 55        → zayıf
 * Değerler kapsayıcı alt sınırlardır; karşılaştırma retrieval aşamasında yapılır.
 */
export const YH_DEGREE_THRESHOLDS = {
  /** Bu değer ve üzeri → çok güçlü. */
  cokGuclu: 90,
  /** Bu değer ve üzeri (fakat cokGuclu altında) → güçlü; altı → zayıf. */
  guclu: 55,
} as const;
