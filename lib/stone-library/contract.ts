// Doğaltaş Kütüphanesi (F1) · SAF sözleşme: sabitler ve tipler (IO yok).
// Kütüphane platforma aittir (tenant'sız); uzmanların kendi taş kayıtlarından (stones / stone_sources /
// stone_entries …) TAMAMEN bağımsızdır. Bkz. supabase/migrations/20271201000000_stone_library_core.sql.

export const STONE_LIBRARY_TITLE = "Yaşam Sistemi Doğaltaş Kütüphanesi";
export const STONE_LIBRARY_MENU_LABEL = "Doğaltaş Kütüphanesi";

/** Hazırlık kapısı: yalnız tam "true" ise kütüphane uçları vardır (varsayılan KAPALI → 404). */
export const STONE_LIBRARY_ENV_FLAG = "STONE_LIBRARY_ENABLED";

/** Uzman yüzeyine giden TEK yol: yayın RPC'leri (tablolara hiçbir rolün doğrudan ayrıcalığı yoktur). */
export const STONE_LIBRARY_RPC = {
  viewerAllowed: "stone_library_viewer_allowed",
  expertSearch: "stone_library_expert_search",
  expertStone: "stone_library_expert_stone",
  /** F3: filtre kataloğu (yalnız yayındaki taşlarda bulunan değerler + sayıları). */
  expertFacets: "stone_library_expert_facets",
} as const;

/** Owner yönetim RPC'leri (F2/F3 route'ları kullanır; her biri DB'de owner'ı yeniden doğrular). */
export const STONE_LIBRARY_OWNER_RPC = {
  sourceSave: "stone_library_source_save",
  documentAdd: "stone_library_document_add",
  stoneSave: "stone_library_stone_save",
  stoneSetStatus: "stone_library_stone_set_status",
  /** F3: service_role yetkisi KAPALI (owner kararı: alternatif ad bu aşamada eklenmez). */
  nameAdd: "stone_library_name_add",
  externalIdLink: "stone_library_external_id_link",
  recordAdd: "stone_library_record_add",
  recordSetCurrent: "stone_library_record_set_current",
  facetAdd: "stone_library_facet_add",
  review: "stone_library_review",
  settingsSave: "stone_library_settings_save",
  delete: "stone_library_delete",
  restore: "stone_library_restore",
  batchOpen: "stone_library_batch_open",
  batchSetStatus: "stone_library_batch_set_status",
  batchReserveCall: "stone_library_batch_reserve_call",
  batchLog: "stone_library_batch_log",
  batchQuota: "stone_library_batch_quota",
  rawPut: "stone_library_raw_put",
  batchRollback: "stone_library_batch_rollback",
  grant: "stone_library_grant_access",
  revoke: "stone_library_revoke_access",
  ownerStone: "stone_library_owner_stone",
  ownerOverview: "stone_library_owner_overview",
  // F3
  ownerReadiness: "stone_library_owner_readiness",
  healthDecision: "stone_library_health_decision",
  ownerBulkReview: "stone_library_owner_bulk_review",
  ownerIntegrity: "stone_library_owner_integrity",
} as const;

/**
 * F3 yayın durumları: taslak → incelemede → yayına hazır → yayında → yayından kaldırılmış (hidden).
 * Yayın yalnız "yayına hazır" ya da "yayından kaldırılmış" durumundan ve hazırlık kontrolü geçerse (DB zorlar).
 */
export const STONE_LIBRARY_STATUSES = ["draft", "review", "ready", "published", "hidden"] as const;
export type StoneLibraryStatus = (typeof STONE_LIBRARY_STATUSES)[number];

/**
 * Sağlık içeriği yayın modu (DB ayarı). legal_review: hukuk onayı. owner_decision (F3 "C" modeli): hukuk onayı VEYA taş bazında
 * owner'ın yazılı yayın kararı. Her iki modda da genel kilit ayrıca açılmalı; varsayılan legal_review + KAPALI.
 * Owner kararı hukuki inceleme yerine GEÇMEZ; içerik yalnız uyarı eklendiği için yasal kabul edilmez.
 */
export const STONE_LIBRARY_HEALTH_MODES = ["legal_review", "owner_decision"] as const;
export type StoneLibraryHealthMode = (typeof STONE_LIBRARY_HEALTH_MODES)[number];

export const STONE_LIBRARY_FIELDS = [
  "description",
  "meaning_spiritual",
  "meaning_emotional",
  "meaning_physical",
  "affirmation",
  "general",
  "usage",
  "meditation",
  "care",
  "cleansing",
  "warning",
  "history",
  "other",
] as const;
export type StoneLibraryField = (typeof STONE_LIBRARY_FIELDS)[number];

/** Sağlık açısından her zaman hassas alanlar (DB CHECK ile de zorlanır). */
export const STONE_LIBRARY_HEALTH_FIELDS: ReadonlySet<StoneLibraryField> = new Set(["meaning_physical"]);

export const STONE_LIBRARY_LANGS = ["tr", "en"] as const;
export type StoneLibraryLang = (typeof STONE_LIBRARY_LANGS)[number];

export const STONE_LIBRARY_KEYED_FACETS = ["chakra", "zodiac", "element", "color", "planet"] as const;
export type StoneLibraryKeyedFacet = (typeof STONE_LIBRARY_KEYED_FACETS)[number];

/** Owner'ın kesin metni (DB varsayılanı ile birebir; owner ayarlardan değiştirebilir). */
export const STONE_LIBRARY_HEALTH_NOTICE_TR =
  "Bu kütüphanede yer alan bilgiler geleneksel ve tamamlayıcı uygulamalara ilişkin bilgilendirme amaçlıdır. Tıbbi tanı veya tedavi yöntemi değildir; sağlık uzmanının değerlendirmesinin yerine geçmez.";

/**
 * Owner'ın önerdiği AYRI tıbbi bilgilendirme (DB varsayılanı ile birebir; özgün kaynak metinlerinin İÇİNE eklenmez,
 * uzman ekranında ayrı bileşen olarak gösterilir).
 */
export const STONE_LIBRARY_MEDICAL_NOTICE_TR =
  "Bu kütüphanede yer alan bilgiler doğaltaşlara ilişkin geleneksel, kültürel ve tamamlayıcı uygulama kaynaklarından derlenmiştir. Bilgiler tıbbi teşhis veya tedavi önerisi niteliğinde değildir ve profesyonel sağlık hizmetlerinin yerine geçmez.";

/** Arama listesi önizlemesi: kaynak metnin ilk 240 karakteri (kesildiyse sonuna "…"). Ayrıntıda metnin TAMAMI gösterilir. */
export const STONE_LIBRARY_EXCERPT_CHARS = 240;
export const STONE_LIBRARY_EXCERPT_ELLIPSIS = "…";

export const STONE_LIBRARY_SEARCH_LIMITS = Object.freeze({
  queryMax: 80,
  pageMax: 50,
  pageDefault: 30,
  offsetMax: 10000,
  filterValuesMax: 20,
});

// ── Uzman DTO (yalnız bu alanlar istemciye gider) ────────────────────────────────────────────────
export type StoneLibraryFacetValue = { key: string; label_tr: string; label_en: string };

export type StoneLibraryListItem = {
  slug: string;
  name_tr: string;
  name_en: string | null;
  /** Lisanslı görsel servis edilebilir mi (baytlar yalnız /api/dogaltas/kutuphane/[slug]/gorsel ucundan). */
  has_image: boolean;
  facets: Partial<Record<"chakra" | "zodiac" | "element" | "color", StoneLibraryFacetValue[]>>;
  /** Arama önizlemesi: ilk 240 karakter (+ "…" kesildiyse). Kaynak metnin yerine geçmez; tam metin ayrıntı ucundadır. */
  excerpt: string | null;
  /** Özet zorunlu atıflı bir kaynaktan geliyorsa atıf metni (lisans gereği özetle birlikte gösterilir). */
  excerpt_attribution: string | null;
};

export type StoneLibrarySearchResult = {
  total: number;
  limit: number;
  offset: number;
  items: StoneLibraryListItem[];
};

/** content = kaynak metnin TAMAMI, karakteri karakterine (kırpma / düzeltme yok). health_related: tıbbi bilgilendirme bileşeni göstergesi. */
export type StoneLibrarySectionField = { field: StoneLibraryField; lang: StoneLibraryLang; content: string; health_related: boolean };

export type StoneLibrarySection = {
  /** Belge içi sıra anahtarı ("s1", "s2" …) — kaynak kimliği DEĞİLDİR. */
  key: string;
  /** Görünürlük kararına göre çözülmüş etiket: gerçek ad / owner adı / null (gizli). */
  label: string | null;
  attribution: string | null;
  fields: StoneLibrarySectionField[];
};

export type StoneLibraryStoneDoc = {
  slug: string;
  name_tr: string;
  name_en: string | null;
  aliases: { lang: string; name: string }[];
  facets: {
    chakra?: StoneLibraryFacetValue[];
    zodiac?: StoneLibraryFacetValue[];
    element?: StoneLibraryFacetValue[];
    color?: StoneLibraryFacetValue[];
    planet?: StoneLibraryFacetValue[];
    keyword?: { lang: string; text: string }[];
    birth_month?: number[];
    numerical_vibration?: number[];
  };
  hardness: { min: number; max: number } | null;
  pairings: { slug: string; name_tr: string; name_en: string | null }[];
  /** Yalnız boyut bilgisi; URL / depo yolu / sağlayıcı YOK. */
  image: { available: true; width: number; height: number; attribution: string | null } | null;
  sections: StoneLibrarySection[];
  health_notice: { tr: string; en: string };
  /** Ayrı tıbbi bilgilendirme bileşeni (F3). Kaynak metinlerin içine eklenmez. */
  medical_notice: { tr: string; en: string };
  /** Belgede sağlıkla ilgili (sağlık işaretli) içerik gösteriliyor mu → bilgilendirme bileşeni öne çıkarılır. */
  has_health_content: boolean;
  /** F6: alan başına gösterim katmanı (OWNER_SURUMU → DOGRULANMIS_TR_CEVIRI → KAYNAK_TR). Kaynak metinler `sections` içinde kalır. */
  display: StoneLibraryDisplay;
  /** F6: owner ek bilgileri ve kullanım uyarıları (çeviriden / kaynak metinden AYRI bölüm). */
  owner_info: { kind: "note" | "warning"; title: string | null; body: string }[];
  updated_at: string;
};

/** F6 gösterim katmanı. Etiketler arayüzde sabit metne çevrilir; iç yönetim durumu (taslak / eskimiş / sürüm no) içermez. */
export const STONE_LIBRARY_DISPLAY_FIELDS = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation", "keywords"] as const;
export type StoneLibraryDisplayField = (typeof STONE_LIBRARY_DISPLAY_FIELDS)[number];
export const STONE_LIBRARY_DISPLAY_SOURCES = ["OWNER_SURUMU", "DOGRULANMIS_TR_CEVIRI", "KAYNAK_TR"] as const;
export type StoneLibraryDisplaySource = (typeof STONE_LIBRARY_DISPLAY_SOURCES)[number];
export type StoneLibraryDisplay = {
  fields: { field: StoneLibraryDisplayField; display_source: StoneLibraryDisplaySource; content: string; health_related: boolean }[];
  /** Alanda yayındaki doğrulanmış çeviri var mı (yoksa arayüz "Doğrulanmış çeviri" seçeneğini kapatır). */
  verified_available: Partial<Record<StoneLibraryDisplayField, boolean>>;
  /** Yayındaki doğrulanmış çeviri metni (alan owner sürümüyle gösterilse bile uzman "Doğrulanmış çeviri" seçeneğinde görür). */
  verified_content: Partial<Record<StoneLibraryDisplayField, string>>;
};

/** F6: arayüzde gösterilen sabit kaynak etiketleri (sağlayıcı adı YOK). */
export const STONE_LIBRARY_DISPLAY_LABEL_TR: Record<StoneLibraryDisplaySource, string> = {
  OWNER_SURUMU: "Owner sürümü",
  DOGRULANMIS_TR_CEVIRI: "Doğrulanmış Türkçe çeviri",
  KAYNAK_TR: "Kaynak metin (Türkçe)",
};

/** F3 filtre kataloğu: yalnız yayındaki taşlarda gerçekten bulunan değerler (tahmin / üretim yok). */
export type StoneLibraryFacetCatalog = {
  total: number;
  facets: Partial<Record<StoneLibraryKeyedFacet, (StoneLibraryFacetValue & { count: number })[]>>;
  birth_month: { value: number; count: number }[];
  hardness: { min: number; max: number } | null;
};
