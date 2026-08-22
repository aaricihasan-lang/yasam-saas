/**
 * BF-14 / PRIVATE MEMORY — Client-scoped kaynak kaydı (CODE GATE AÇIK; SAF).
 *
 * BAĞLAYICI: professional YH_INDEX_SOURCES'a DOKUNMAZ (ayrı kayıt). Tüm girdiler
 * `enabled: true` (compile-time/registry kapısı açık — activationMatrix registryEnabled ile
 * BİREBİR). Ancak processing hâlâ ÇİFT KAPI ile fail-closed: registryEnabled tek başına
 * aktive ETMEZ; runtime `public.yh_source_activation` is_active=true (BF-11E) + worker env
 * `YH_CLIENT_OUTBOX_WORKER_ENABLED=true` gerekir. DB row yok / is_active=false → INACTIVE.
 *
 * GİZLİLİK SÖZLEŞMESİ (Private Memory Politika Kilidi):
 *   - Bu index tamamen PRIVATE / SENSITIVE kabul edilir. "PII-free index" varsayımı
 *     KALDIRILDI: danışan klinik SERBEST METNİ (seans notu, sağlık notu, öneri, ödev
 *     açıklaması, randevu notu, taş notu...) searchText'e BİLEREK dahil edilir ve
 *     aranabilir olur. Güvenlik REDACTION'a değil AUTHORIZATION'a dayanır (tenant+client
 *     fail-closed; ad index'e kopyalanmaz, query-time resolve edilir).
 *   - `piiDenylist` yalnızca DOĞRUDAN KİMLİK/İLETİŞİM kolonlarını (ad/soyad/telefon/
 *     adres/e-posta/doğum) veya anlamsız sayısal alanları kapsar; bunlar title/snippet/
 *     searchText/topic'e ASLA girmez (validator zorlar). Doğrudan kimlik kolonları zaten
 *     danışan ana kaydında (clients) yaşar ve kaynak değildir; kohort kaynaklarındaki tek
 *     doğrudan-kimlik kolonu client_notes.adres'tir (denylist'te).
 */

/** Client-scoped modül etiketi (professional YhSourceModule'den AYRI). */
export type ClientSourceModule =
  | "danisan_kombinasyon"
  | "danisan_tas"
  | "danisan_seans"
  | "danisan_odev"
  | "danisan_not"
  | "randevu"
  | "human_design";

export const CLIENT_MODULE_LABELS: Record<ClientSourceModule, string> = {
  danisan_kombinasyon: "Kombinasyon",
  danisan_tas: "Danışan Taşı",
  danisan_seans: "Seans",
  danisan_odev: "Ödev",
  danisan_not: "Not",
  randevu: "Randevu",
  human_design: "Human Design",
};

/** Client kaynak → uygulama-içi ALLOWLIST route (modül ana sayfası; per-record yok). */
export const CLIENT_MODULE_ROUTES: Record<ClientSourceModule, string> = {
  danisan_kombinasyon: "/dogaltas",
  danisan_tas: "/dogaltas",
  danisan_seans: "/danisan-yolculugu",
  danisan_odev: "/danisan-yolculugu",
  danisan_not: "/danisan-yolculugu",
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
  /** İNDEKSLENMESİ YASAK kolonlar (doğrudan kimlik/iletişim veya anlamsız sayısal). Validator zorlar. */
  readonly piiDenylist: readonly string[];
  /** DORMANT — aktivasyon BF-11E'de. */
  readonly enabled: boolean;
}

/**
 * Private Memory ilk cohort (Politika Kilidi md.12): 6 danışan kaynağı. Klinik serbest
 * metin searchText'e dahildir; doğrudan kimlik/iletişim kolonları daima piiDenylist'te.
 * Registry kapısı AÇIK (enabled:true); 6/6 kaynak production'da aktive edildi (BF-11E
 * yh_source_activation.is_active=true, activation_class=FUTURE_ONLY_READY, backfill_allowed=false).
 * Runtime yine de çift kapılıdır (registryEnabled VE DB is_active). Sıra harness ile
 * hizalıdır (index [2] = danisan:sessions).
 *
 * DEFER (md.13): human_design_charts (ayrı hassas alan) + client_analyses → kaynak DEĞİL.
 * EXCLUDE: photos/media, DOCX, report_snapshots.
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
    searchTextColumns: ["stones_text", "notes_text", "notes_text_2", "note", "description"],
    snippetColumns: ["stones_text"],
    topicTagsColumns: [],
    piiDenylist: [],
    enabled: true,
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
    searchTextColumns: ["stone_type", "usage_area", "combination_text", "note", "other_notes", "warning_text"],
    snippetColumns: ["usage_area"],
    topicTagsColumns: ["stone_type"],
    piiDenylist: [],
    enabled: true,
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
    // Klinik serbest metin ARANABİLİR (Politika Kilidi md.1): seans notu + eylemler + öneri + plan.
    searchTextColumns: ["session_type", "session_note", "actions_done", "suggestions", "next_plan"],
    snippetColumns: ["session_note"],
    topicTagsColumns: ["session_type"],
    // Sayısal/klinik-dışı alanlar (kimlik değil, arama gürültüsü) → index dışı.
    piiDenylist: ["fee", "duration_minutes"],
    enabled: true,
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
    // Kart başlığı = tür; serbest ödev başlığı/açıklaması/notu klinik metin olarak ARANABİLİR.
    titleColumns: ["homework_type"],
    searchTextColumns: ["homework_type", "title", "description", "expert_note", "client_feedback", "status"],
    snippetColumns: ["description"],
    topicTagsColumns: ["homework_type", "status"],
    piiDenylist: [],
    enabled: true,
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
    // Randevu konusu/notu klinik bağlam taşır → ARANABİLİR.
    titleColumns: ["title"],
    searchTextColumns: ["title", "notes", "status"],
    snippetColumns: ["notes"],
    topicTagsColumns: ["status"],
    piiDenylist: [],
    enabled: true,
  },
  {
    sourceKey: "danisan:notes",
    sourceModule: "danisan_not",
    tableName: "client_notes",
    primaryKey: "id",
    clientColumn: "client_id",
    tenantColumn: "tenant_id",
    // client_notes danışan başına tek satır (upsert); doğal olay tarihi yok.
    occurredAtColumn: null,
    updatedAtColumn: null,
    titleColumns: [],
    // Birincil klinik serbest metin: sağlık notu + öneriler + genel notlar (Politika Kilidi md.1).
    searchTextColumns: ["saglik_notu", "oneriler", "notlar"],
    snippetColumns: ["saglik_notu"],
    topicTagsColumns: [],
    // adres = doğrudan iletişim/kimlik kolonu (Politika Kilidi md.3) → index dışı.
    piiDenylist: ["adres"],
    enabled: true,
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
        `Denylist ihlali: '${config.sourceKey}' index kolonu denylist alanı içeriyor: ${denied}`,
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
