/**
 * FAZ 1 / İP-2A — KANONİK MODÜL KULLANIM ENVANTERİ.
 *
 * Modül anahtarları lib/auth/moduleAccess.ts ModuleGateKey ile birebir. Her modül için
 * çalışma alanına (tenant) ait BİRİNCİL "mevcut kayıt" tablo(lar)ı ve durable-trace
 * bilgisi. Bu envanter yalnız READ-side (existingRecordCount) türetimi içindir.
 *
 * ÖNEMLİ AYRIMLAR (KARAR 2):
 *   * existingRecordCount = tabloda tenant'a ait satır sayısı. İŞLEM SAYISI DEĞİLDİR.
 *   * hasDurableTrace=false modüller (cosmic_calendar, ders_notu, digital_content hub)
 *     kalıcı kayıt bırakmaz → kayıt sayısı üzerinden "kullanım" ÖLÇÜLEMEZ (unavailable).
 *   * tenantColumn genelde tenant_id. Tablo/kolon dashboard-managed olabildiğinden
 *     okuma tarafı her tablo için HATAYA DAYANIKLI olmalı (yoksa module → unavailable).
 *
 * NUMEROLOJİ NOTU: kanonik yazma tablosu `numerology_records`'tır (app/api/numeroloji/
 * analyses/route.ts). Eski admin metriği `numerology_analyses` sayar (dashboard-managed,
 * doğrulanmamış/legacy) → BURADA numerology_records kanonik alınır.
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";

export type ModuleRecordSource = {
  table: string;
  /** tenant sahipliği kolonu (çalışma alanı atfı). */
  tenantColumn: string;
  /** oluşturulma zaman kolonu (lastRecordAt türetimi; yoksa omit). */
  createdColumn?: string;
};

export type ModuleUsageDescriptor = {
  key: ModuleGateKey;
  /** Kullanıcıya dönük ad (TR). */
  label: string;
  /** Kalıcı per-tenant kayıt bırakır mı (kayıt-sayısı sinyali mümkün mü)? */
  hasDurableTrace: boolean;
  /** Birincil kayıt tablo(lar)ı (durable-trace modüller için). */
  recordSources: ModuleRecordSource[];
  /** Kısa güvenli not (ölçüm kapsamı / kısıt). */
  note?: string;
};

/**
 * Kanonik envanter. recordSources tablo isimleri repo route'larından doğrulanmıştır;
 * dashboard-managed tabloların kolonları için okuma tarafı fail-safe davranır.
 */
export const MODULE_USAGE_REGISTRY: Record<ModuleGateKey, ModuleUsageDescriptor> = {
  clients: {
    key: "clients",
    label: "Danışan Yolculuğu",
    hasDurableTrace: true,
    recordSources: [{ table: "clients", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  appointments: {
    key: "appointments",
    label: "Ajanda",
    hasDurableTrace: true,
    recordSources: [{ table: "appointments", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  numerology: {
    key: "numerology",
    label: "Numeroloji",
    hasDurableTrace: true,
    recordSources: [{ table: "numerology_records", tenantColumn: "tenant_id", createdColumn: "created_at" }],
    note: "Kanonik yazma tablosu numerology_records (numerology_analyses DEĞİL).",
  },
  stones: {
    key: "stones",
    label: "Doğaltaş",
    hasDurableTrace: true,
    recordSources: [{ table: "stones", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  stok: {
    key: "stok",
    label: "Ürün & Stok Merkezi",
    hasDurableTrace: true,
    recordSources: [
      { table: "oil_inventory", tenantColumn: "tenant_id", createdColumn: "created_at" },
      { table: "soap_cream_inventory", tenantColumn: "tenant_id", createdColumn: "created_at" },
      { table: "accessory_inventory", tenantColumn: "tenant_id", createdColumn: "created_at" },
      { table: "other_inventory", tenantColumn: "tenant_id", createdColumn: "created_at" },
    ],
  },
  sifa_rehberi: {
    key: "sifa_rehberi",
    label: "Şifa Rehberi",
    hasDurableTrace: true,
    recordSources: [{ table: "healing_guides", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  energy_body: {
    key: "energy_body",
    label: "Enerji & Beden (Biyoenerji)",
    hasDurableTrace: true,
    recordSources: [{ table: "bioenergy_sessions", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  reflexology: {
    key: "reflexology",
    label: "Refleksoloji",
    hasDurableTrace: true,
    recordSources: [{ table: "reflexology_protocols", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  aromatherapy: {
    key: "aromatherapy",
    label: "Aromaterapi",
    hasDurableTrace: true,
    recordSources: [{ table: "aromatherapy_blends", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  personal_archive: {
    key: "personal_archive",
    label: "Kişisel Arşiv",
    hasDurableTrace: true,
    recordSources: [{ table: "personal_archives", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  video_ceviri: {
    key: "video_ceviri",
    label: "Video → Türkçe Dönüşüm",
    hasDurableTrace: true,
    recordSources: [{ table: "video_transcription_jobs", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  belge_ceviri: {
    key: "belge_ceviri",
    label: "Belge Çeviri Merkezi",
    hasDurableTrace: true,
    recordSources: [{ table: "belge_ceviri_jobs", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  ders_notu: {
    key: "ders_notu",
    label: "Temizlenmiş Ders Notu Merkezi",
    hasDurableTrace: false,
    recordSources: [],
    note: "Stateless dönüşüm — kalıcı per-tenant kayıt yok; yalnız usage_events ile ölçülebilir.",
  },
  human_design: {
    key: "human_design",
    label: "Human Design",
    hasDurableTrace: true,
    recordSources: [{ table: "human_design_charts", tenantColumn: "tenant_id", createdColumn: "created_at" }],
    note: "Coming-soon; kayıt tablosu mevcut.",
  },
  digital_content: {
    key: "digital_content",
    label: "Dijital İçerik Merkezi (hub)",
    hasDurableTrace: false,
    recordSources: [],
    note: "Hub kartı; kendi tablosu yok (alt modüller: personal_archive/video_ceviri/belge_ceviri/ders_notu).",
  },
  cosmic_calendar: {
    key: "cosmic_calendar",
    label: "Yaşam Takvimi / Kozmik Ajanda",
    hasDurableTrace: false,
    recordSources: [],
    note: "Always-on; per-tenant kalıcı kayıt yok → kayıt sayısı ile ölçülemez.",
  },
  cupping: {
    key: "cupping",
    label: "Kupa / Hacamat",
    hasDurableTrace: true,
    recordSources: [{ table: "cupping_protocols", tenantColumn: "tenant_id", createdColumn: "created_at" }],
  },
  beslenme: {
    key: "beslenme",
    label: "Beslenme",
    hasDurableTrace: true,
    recordSources: [{ table: "nutrition_plans", tenantColumn: "tenant_id", createdColumn: "created_at" }],
    note: "Owner-only faz; kayıt tablosu mevcut.",
  },
};

export const MODULE_USAGE_KEYS = Object.keys(MODULE_USAGE_REGISTRY) as ModuleGateKey[];

/**
 * FAZ 1'de anlamlı-işlem olayı (expert_usage_events) ÜRETEN modüller — instrumentation
 * kapsamı. Bu kümede OLMAYAN bir modülün olay sayısı 0 değil "unavailable"dır (ölçülmüyor).
 * Yeni route enstrümante edildikçe BURAYA eklenir (kod ile senkron tek doğruluk kaynağı).
 */
export const INSTRUMENTED_USAGE_MODULES = new Set<ModuleGateKey>([
  "numerology", // app/api/numeroloji/analyses (POST) → analysis_created
  "stones", // app/api/dogaltas/stones (POST) → record_created
  "reflexology", // app/api/refleksoloji/protocols (POST) → protocol_created
  "clients", // app/api/clients/[id]/analyses (POST) → analysis_created
]);

/**
 * KAPSAM (coverage) TANIMI: Bir modülün "tam kapsamlı" (fully covered) sayılması için,
 * o modüldeki TÜM anlamlı kullanım yolları (yalnız belirli create değil; update/rapor/
 * silme/analiz vb. tümü) usage_events ile enstrümante edilmiş VEYA mevcut kayıt sayısı bu
 * yolları eksiksiz temsil ediyor olmalıdır. Ancak bu durumda "kayıt=0 ∧ olay=0" → used=false /
 * allowedButUnused=true ÜRETİLEBİLİR (deriveUsed coverageComplete=true).
 *
 * ŞU AN HİÇBİR MODÜL TAM KAPSAMLI DEĞİLDİR: enstrümante 4 modülde yalnız BELİRLİ create
 * işlemleri olay üretir → negatif "kullanılmadı" sonucu güvenilir değildir → boş küme.
 * İleride tam kapsam sağlandıkça modüller BURAYA eklenir (tek doğruluk kaynağı).
 */
export const FULLY_COVERED_USAGE_MODULES = new Set<ModuleGateKey>([]);

/** Bilinen legacy (pre-multitenant) çalışma alanı — kayıt/depolama atfında işaretlenir. */
export const LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";
