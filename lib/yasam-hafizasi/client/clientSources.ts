/**
 * BF-14 Paket 1 — Client-scoped kaynak kaydı (DORMANT; SAF).
 *
 * BAĞLAYICI: professional YH_INDEX_SOURCES'a DOKUNMAZ (ayrı kayıt). Tüm girdiler
 * `enabled: false` (trigger yok, event yok, indexleme yok — aktivasyon BF-11E).
 *
 * PII SÖZLEŞMESİ: yalnız PII-siz etiket/kod/tarih kolonları indexlenebilir.
 * `piiDenylist` alanları title/snippet/searchText/topic'e ASLA girmez (validator
 * bunu zorlar). Serbest sağlık/terapi metni ve ad/soyad/telefon/adres/doğum/kan
 * indexlenmez (SNAPSHOT_ONLY / EXCLUDE — BF-14A matrisine göre).
 */

/** Client-scoped modül etiketi (professional YhSourceModule'den AYRI). */
export type ClientSourceModule =
  | "danisan_kombinasyon"
  | "danisan_tas"
  | "danisan_seans"
  | "danisan_odev"
  | "randevu"
  | "human_design";

export const CLIENT_MODULE_LABELS: Record<ClientSourceModule, string> = {
  danisan_kombinasyon: "Kombinasyon",
  danisan_tas: "Danışan Taşı",
  danisan_seans: "Seans",
  danisan_odev: "Ödev",
  randevu: "Randevu",
  human_design: "Human Design",
};

/** Client kaynak → uygulama-içi ALLOWLIST route (modül ana sayfası; per-record yok). */
export const CLIENT_MODULE_ROUTES: Record<ClientSourceModule, string> = {
  danisan_kombinasyon: "/dogaltas",
  danisan_tas: "/dogaltas",
  danisan_seans: "/danisan-yolculugu",
  danisan_odev: "/danisan-yolculugu",
  randevu: "/danisan-yolculugu",
  human_design: "/human-design",
};

export interface ClientSourceConfig {
  readonly sourceKey: string;
  readonly sourceModule: ClientSourceModule;
  readonly tableName: string;
  readonly primaryKey: string;
  /** client_id kolon adı (fail-closed: her client kaynağında ZORUNLU). */
  readonly clientColumn: string;
  /** tenant_id kolon adı. */
  readonly tenantColumn: string;
  /** olay tarihi kolonu (occurred_at). */
  readonly occurredAtColumn: string | null;
  /** değişim izleme kolonu (yoksa null → content_hash). */
  readonly updatedAtColumn: string | null;
  readonly titleColumns: readonly string[];
  readonly searchTextColumns: readonly string[];
  readonly snippetColumns: readonly string[];
  readonly topicTagsColumns: readonly string[];
  /** İNDEKSLENMESİ YASAK kolonlar (PII/serbest-metin). Validator zorlar. */
  readonly piiDenylist: readonly string[];
  /** DORMANT — aktivasyon BF-11E'de. */
  readonly enabled: boolean;
}

/**
 * İlk-satış güvenli client kaynak seti (BF-14A matrisi). Hepsi enabled:false.
 * Yalnız PII-siz etiket/kod/tarih; serbest-metin/isim daima piiDenylist'te.
 */
export const YH_CLIENT_INDEX_SOURCES: readonly ClientSourceConfig[] = [
  {
    sourceKey: "danisan:combinations",
    sourceModule: "danisan_kombinasyon",
    tableName: "client_combinations",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    titleColumns: ["name"],
    searchTextColumns: ["stones_text", "notes_text", "notes_text_2"],
    snippetColumns: ["stones_text"],
    topicTagsColumns: [],
    piiDenylist: ["note", "description"],
    enabled: false,
  },
  {
    sourceKey: "danisan:stones",
    sourceModule: "danisan_tas",
    tableName: "client_stones",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "stone_date",
    updatedAtColumn: null,
    titleColumns: ["stone_name"],
    searchTextColumns: ["stone_type", "usage_area", "combination_text"],
    snippetColumns: ["stone_type"],
    topicTagsColumns: ["stone_type"],
    piiDenylist: ["note", "other_notes", "warning_text"],
    enabled: false,
  },
  {
    sourceKey: "danisan:sessions",
    sourceModule: "danisan_seans",
    tableName: "client_sessions",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "session_date",
    updatedAtColumn: null,
    titleColumns: ["session_type"],
    searchTextColumns: ["session_type"],
    snippetColumns: ["session_type"],
    topicTagsColumns: ["session_type"],
    piiDenylist: ["session_note", "actions_done", "suggestions", "next_plan", "fee", "duration_minutes"],
    enabled: false,
  },
  {
    sourceKey: "danisan:homeworks",
    sourceModule: "danisan_odev",
    tableName: "client_homeworks",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "start_date",
    updatedAtColumn: null,
    // NOT: serbest `title` isim taşıyabilir → indexlenmez (denylist). Kart başlığı = tür.
    titleColumns: ["homework_type"],
    searchTextColumns: ["homework_type", "status"],
    snippetColumns: ["status"],
    topicTagsColumns: ["homework_type"],
    piiDenylist: ["title", "description", "expert_note", "client_feedback"],
    enabled: false,
  },
  {
    sourceKey: "danisan:appointments",
    sourceModule: "randevu",
    tableName: "appointments",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "appointment_date",
    updatedAtColumn: null,
    // serbest `title` isim taşıyabilir + `notes` PII → indexlenmez. Yalnız status.
    titleColumns: [],
    searchTextColumns: ["status"],
    snippetColumns: [],
    topicTagsColumns: ["status"],
    piiDenylist: ["title", "notes"],
    enabled: false,
  },
  {
    sourceKey: "danisan:hd-charts",
    sourceModule: "human_design",
    tableName: "human_design_charts",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    occurredAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    titleColumns: ["type_code"],
    searchTextColumns: ["type_code", "authority_code", "profile_code", "definition_code"],
    snippetColumns: ["authority_code"],
    topicTagsColumns: ["active_centers", "gates", "channels"],
    piiDenylist: ["client_name", "birth_date", "birth_time", "birth_place", "notes"],
    enabled: false,
  },
];

/** Bir config'in indexlenebilir kolonlarında hiçbir denylist alanı OLMADIĞINI zorlar. */
export function assertNoDenylistedIndexColumns(config: ClientSourceConfig): void {
  const indexed = new Set<string>([
    ...config.titleColumns,
    ...config.searchTextColumns,
    ...config.snippetColumns,
    ...config.topicTagsColumns,
  ]);
  for (const denied of config.piiDenylist) {
    if (indexed.has(denied)) {
      throw new Error(
        `PII ihlali: '${config.sourceKey}' index kolonu denylist alanı içeriyor: ${denied}`,
      );
    }
  }
}

/** Tüm client kaynaklarını doğrular (harness + import-zamanı güvenlik). */
export function validateAllClientSources(): void {
  for (const c of YH_CLIENT_INDEX_SOURCES) assertNoDenylistedIndexColumns(c);
}

export function clientModuleLabel(module: string): string {
  return Object.prototype.hasOwnProperty.call(CLIENT_MODULE_LABELS, module)
    ? CLIENT_MODULE_LABELS[module as ClientSourceModule]
    : module;
}

export function clientSourceLinkFor(module: string): string | null {
  return Object.prototype.hasOwnProperty.call(CLIENT_MODULE_ROUTES, module)
    ? CLIENT_MODULE_ROUTES[module as ClientSourceModule]
    : null;
}

export function isClientSourceModule(value: unknown): value is ClientSourceModule {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLIENT_MODULE_LABELS, value);
}
