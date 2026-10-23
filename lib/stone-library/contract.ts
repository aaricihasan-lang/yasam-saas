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
} as const;

/** Owner yönetim RPC'leri (F2/F3 route'ları kullanır; her biri DB'de owner'ı yeniden doğrular). */
export const STONE_LIBRARY_OWNER_RPC = {
  sourceSave: "stone_library_source_save",
  documentAdd: "stone_library_document_add",
  stoneSave: "stone_library_stone_save",
  stoneSetStatus: "stone_library_stone_set_status",
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
} as const;

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
  facets: Partial<Record<"chakra" | "zodiac" | "element" | "color", StoneLibraryFacetValue[]>>;
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

export type StoneLibrarySectionField = { field: StoneLibraryField; lang: StoneLibraryLang; content: string };

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
  sections: StoneLibrarySection[];
  health_notice: { tr: string; en: string };
  updated_at: string;
};
