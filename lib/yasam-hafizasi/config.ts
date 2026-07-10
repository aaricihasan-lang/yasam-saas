/**
 * Yaşam Hafızası™ — merkezi sabitler ve tipler (Sprint 1 / A1).
 *
 * Yalnız sabitler + tipler. Retrieval / AI / embedding / UI mantığı İÇERMEZ.
 * Hem server hem (tip amaçlı) client tarafından import edilebilir; ancak
 * gerçek DB erişimi yalnızca server-only modüllerden yapılır (bkz flags.ts).
 */

/** Fiziksel tablo adları (Sprint 1 / A1 kapsamındakiler). */
export const YH_TABLES = {
  index: "yasam_hafizasi_index",
  flags: "yasam_hafizasi_flags",
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
