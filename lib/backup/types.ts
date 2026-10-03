/**
 * lib/backup — Yedek / Geri yükleme / Dışa aktarım ortak tipleri (SAF; client + server).
 *
 * FAZ1 FINAL HARDENING / PAKET BACKUP (FA-01, FA-32, SEC-020).
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccessCore";

/**
 * Tablo sınıfı:
 *  - backup       : tenant'a ait iş verisi → dışa aktarılır + geri yüklenir (exportOnly ise yalnız dışa).
 *  - child_of     : tenant_id kolonu YOK; ebeveyn üzerinden (tenant'lı ebeveynin id'leri) okunur/yazılır.
 *  - derived      : başka kayıtlardan türetilen indeks/kuyruk/anlık görüntü → yedeğe girmez.
 *  - system       : kullanıcı/oturum/güvenlik/denetim/yetki → yedeğe girmez.
 *  - global       : tenant'sız paylaşımlı referans/katalog → yedeğe girmez.
 *  - transient    : geçici iş/idempotency kaydı → yedeğe girmez.
 *  - legacy_empty : eski, prod'da boş tablo → yedeğe girmez.
 *  - excluded     : ASLA yedeğe girmez (ör. `_bak_*`).
 */
export type BackupClass =
  | "backup"
  | "child_of"
  | "derived"
  | "system"
  | "global"
  | "transient"
  | "legacy_empty"
  | "excluded";

export type TenantScope = "direct" | "none" | { parent: string; fk: string };

/** Restore'da aynı tenant'ta var olması gereken ebeveyn. */
export type FkParent = {
  column: string;
  table: string;
  /** Ebeveyn tarafındaki kolon (varsayılan "id"). */
  parentColumn?: string;
  /** ON DELETE SET NULL ilişkisi: ebeveyn yoksa satır ATLANMAZ, bu kolon null yazılır (raporlanır). */
  optional?: boolean;
  /**
   * Ebeveyn restore eden tenant'ta DEĞİL, SABİT bir tenant'ta aranır (ör. Beslenme global SİSTEM
   * besin kataloğu: uzmanın kişisel kopyası `origin_food_id` ve çalışma alanından kaldırdığı sistem
   * besini `food_id`). Verilmezse ebeveyn restore eden tenant'ta aranır (varsayılan).
   */
  parentTenantId?: string;
};

/** Storage yolu öneki şeması (tenant id ile somutlaşır). */
export type StoragePrefixKind = "tenant" | "catalog_tenant" | "healing_tenant";

export type StorageRef = { column: string; prefixes: readonly StoragePrefixKind[] };

export type RegistryEntry = {
  table: string;
  /** Lisans kapısı (ModuleGateKey) — null → modülden bağımsız (ör. destek mesajları). */
  module: ModuleGateKey | null;
  class: BackupClass;
  /** Yedek dışı sınıflar için gerekçe (yedek dosyasındaki `excluded` listesinde görünür). */
  reason?: string;
  tenantScope: TenantScope;
  pk: readonly string[];
  conflictTarget: readonly string[];
  orderBy: readonly string[];
  fkParents: readonly FkParent[];
  storageRefs: readonly StorageRef[];
  /** Tenant başına tek satır (ör. reflexology_atlas). */
  singleton?: boolean;
  /** true → yalnız dışa aktarılır; geri yüklenmez (uyarı ile atlanır). */
  exportOnly?: boolean;
  /** PK dışı, tenant içi doğal anahtar (tek kolon) — varsa "zaten mevcut" sayılır. */
  naturalKey?: string;
  /** Aynı tabloya işaret eden kolon (ör. parent_category_id) — satırlar ebeveyn-önce sıralanır. */
  selfRef?: string;
  /** Kullanıcıyı işaret eden ve restore'da oturumdaki kullanıcıya zorlanan kolonlar. */
  userColumns?: readonly string[];
  /** Bilinen generated / trigger-yönetimli kolonlar (restore izin listesine ASLA girmez). */
  generatedColumns?: readonly string[];
  /** Keyset sayfa boyutu (≤500). Büyük satırlı (base64 foto) tablolar için küçük tutulur. */
  pageSize?: number;
  label: string;
};

// ─── Yedek dosyası v3.0 ──────────────────────────────────────────────────────

export const BACKUP_FORMAT = "yasam-sistemi-backup";
export const BACKUP_VERSION = "3.0";
export const ACCEPTED_BACKUP_VERSIONS = ["1.0", "2.0", "2.1", "3.0"] as const;

export type BackupTableDump = {
  module: string | null;
  expected_count: number | null;
  row_count: number;
  complete: boolean;
  error: string | null;
  rows: Record<string, unknown>[];
};

/**
 * P2-11: Yedeğe gömülü depolama dosyası (şimdilik yalnız Human Design: harita görseli + profesyonel
 * rapor görsel snapshot'ı). `data_base64` dosyanın tamamı; geri yüklemede boyut + SHA-256 doğrulanır.
 */
export type BackupStoredFile = {
  module: string;
  bucket: string;
  path: string;
  content_type: string;
  size: number;
  sha256: string;
  data_base64: string;
};

export type BackupFileV3 = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  registry_hash: string;
  exported_at: string;
  tenant_id: string;
  /** "database_records_and_hd_files": DB kayıtları + Human Design dosyaları (P2-11). */
  scope: "database_records_only" | "database_records_and_hd_files";
  files_included: boolean;
  complete: boolean;
  tables: Record<string, BackupTableDump>;
  excluded: { table: string; class: BackupClass; reason: string }[];
  /** Gömülü dosyalar (yalnız Human Design). Eski yedeklerde yoktur. */
  files?: BackupStoredFile[];
};

// ─── Parça API sözleşmeleri ──────────────────────────────────────────────────

export type BackupPlanTable = {
  table: string;
  module: string | null;
  label: string;
  class: BackupClass;
};

export type BackupPlanResponse = {
  ok: true;
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  registry_hash: string;
  exported_at: string;
  tenant_id: string;
  file_name: string;
  tables: BackupPlanTable[];
  excluded: { table: string; class: BackupClass; reason: string }[];
};

export type BackupPageResponse = {
  ok: boolean;
  table: string;
  rows: Record<string, unknown>[];
  next_cursor: string | null;
  /** true yalnız BOŞ sayfa geldiğinde (PostgREST max-rows'a güvenilmez). */
  done: boolean;
  /** Yalnız ilk sayfada (cursor yokken) döner. */
  expected_count?: number | null;
  error?: string | null;
};

// ─── Geri yükleme raporu ─────────────────────────────────────────────────────

export type RestoreFailure = { code: string; count: number; sample_ids: string[] };

export type RestoreTableReport = {
  table: string;
  module: string | null;
  expected: number;
  inserted: number;
  already_present: number;
  skipped_unlicensed: number;
  parent_missing: number;
  failed: RestoreFailure[];
  /** Tabloda olmayan / izinli olmayan kolonlar (payload'dan çıkarıldı). */
  dropped_columns: string[];
  /** SET NULL ebeveyni bulunamadığı için null yazılan FK sayısı. */
  fk_nulled: number;
  /** Bu hesaba ait olmayan / eski geçersiz yol olduğu için görsel listesinden çıkarılan öğe sayısı. */
  storage_refs_removed: number;
  warnings: string[];
  status: "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED";
};

export type RestoreDecision =
  | { table: string; action: "restore"; module: string | null; order: number }
  | {
      table: string;
      action: "skip";
      reason:
        | "unknown_table"
        | "excluded"
        | "export_only"
        | "unlicensed"
        | "membership_inactive"
        | "system_tenant";
      module: string | null;
      detail: string;
    };

export type RestoreOverallStatus = "COMPLETE" | "PARTIAL" | "FAILED";
