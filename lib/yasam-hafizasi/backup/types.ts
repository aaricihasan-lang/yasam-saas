/**
 * BF-12B — Ortak tipler. Salt lokal araç; runtime bundle'a ithal edilmez.
 */
import type { RestorePolicy, TenantClass } from "./constants";

/** Bir DB satırı — kolon adı → değer (bilinmeyen tip; canonical serializer güvenli işler). */
export type Row = Record<string, unknown>;

/** Kolon meta verisi (information_schema türevli). */
export interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultExpr: string | null;
}

/** Foreign key kenarı. */
export interface ForeignKey {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL" | "NO ACTION" | "SET DEFAULT";
}

/** Tek tablo şema metası. */
export interface TableSchema {
  name: string;
  columns: ColumnMeta[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  foreignKeys: ForeignKey[];
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyNames: string[];
  approxRows: number;
}

/** Bir tablo için üretilen coverage kararı. */
export interface TablePolicyDecision {
  table: string;
  restorePolicy: RestorePolicy;
  reason: string;
  hasTenantColumn: boolean;
  tenantColumn: string | null;
  ownerSharedRead: boolean;
  sensitiveColumns: string[];
  sensitiveAllowed: string[];
  /** false → sahiplik/politikası güvenle çözülemedi (fail-closed adayı). */
  resolved: boolean;
}

/** Hassas alan tarama sonucu. */
export interface SensitiveScanResult {
  discovered: { table: string; column: string; nonNullCount: number }[];
  allowed: string[];
  failClosed: { table: string; column: string; reason: string }[];
}

/** Bir tablonun sayfalanmış dışa aktarımı + mutabakat. */
export interface TableExport {
  table: string;
  rowCount: number;
  reconciledSnapshotCount: number;
  primaryKey: string[];
  pageSize: number;
  pages: number;
  canonicalSha256: string;
  duplicatePrimaryKeys: number;
  restorePolicy: RestorePolicy;
  tenantColumn: string | null;
  perTenantCounts: Record<string, number>;
}

/** Tenant sınıfı → satır/tablo footprint özeti. */
export interface TenantFootprint {
  klass: TenantClass;
  totalRows: number;
  byTable: Record<string, number>;
}

/** Storage objesi mantıksal kaydı (private manifest). */
export interface StorageObjectRecord {
  bucket: string;
  /** Ham path — YALNIZ private (encrypted) manifestte. */
  rawPath: string;
  /** Opaque artifact adı (public tarafta görünür; ham path'i açığa çıkarmaz). */
  opaqueName: string;
  size: number;
  sha256: string;
  /** Sınıf etiketi (TenantClass ya da 'non_tenant_prefix' / 'unmatched_uuid_tenant'). */
  tenantClass: string;
  tenantId: string | null;
}

/** Storage bucket/sınıf aggregate (public manifest). */
export interface StorageAggregate {
  totalObjects: number;
  totalBytes: number;
  byBucket: Record<string, { objects: number; bytes: number }>;
  byClass: Record<string, { objects: number; bytes: number }>;
}

/** AES-256-GCM şifreli zarf. */
export interface EncryptedEnvelope {
  v: string;
  alg: "aes-256-gcm";
  kdf: "scrypt";
  kdfParams: { N: number; r: number; p: number; keyLen: number };
  salt: string; // base64
  iv: string; // base64
  tag: string; // base64
  aad: string; // artifact logical identity + version
  ciphertext: string; // base64
  plaintextSha256: string;
  ciphertextSha256: string;
}

/** Restore planı (topolojik sıra + politika). */
export interface RestorePlan {
  restoreOrder: string[];
  archiveOnly: string[];
  doNotRestore: string[];
  systemOnly: string[];
  deferredForeignKeys: ForeignKey[];
  /** RESTORE child'ın non-nullable FK'sinin parent'ı restore kapsamında YOK → dry-run fail. */
  missingParents: string[];
  storageRestoreOrder: string[];
  cycles: string[][];
  notes: string[];
}

/** Public manifest — PII / ham içerik / path / secret YOK. */
export interface PublicManifest {
  report: "bf12b-public-manifest";
  backupFormatVersion: string;
  toolVersion: string;
  originMainSha: string;
  projectRef: string | null;
  dbVersion: string | null;
  startedAt: string;
  finishedAt: string | null;
  source: "fixture" | "production";
  tableCount: number;
  totalRows: number;
  tenantClassTotals: Record<string, number>;
  storageAggregate: StorageAggregate;
  encryptedArtifacts: { name: string; ciphertextSha256: string }[];
  ownerSharedReadDependency: { table: string; ownerRows: number }[];
  complete: boolean;
}

/** Private manifest — encrypted. Exact mapping + sınıflandırma + restore policy. */
export interface PrivateManifest {
  report: "bf12b-private-manifest";
  backupFormatVersion: string;
  originMainSha: string;
  source: "fixture" | "production";
  ownerGate: OwnerGateResult;
  tableExports: TableExport[];
  policyDecisions: TablePolicyDecision[];
  sensitiveScan: SensitiveScanResult;
  tenantFootprints: TenantFootprint[];
  storageObjects: StorageObjectRecord[];
  restorePlan: RestorePlan;
}

/** Owner/admin kapısı sonucu. */
export interface OwnerGateResult {
  matchedUserId: string | null;
  matchedTenantId: string | null;
  matchedCount: number;
  passed: boolean;
  reason: string;
}

/** Doğrulama raporu (validate + restore dry-run + checksum). */
export interface ValidationReport {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  errors: string[];
}

/** Tek tablo veri kaynağı (port). Fixture + pg adaptörleri bunu uygular. */
export interface DbReader {
  /** public şemadaki tüm base tablolar (catalog). */
  listTables(): Promise<string[]>;
  /** Tek tablo şema metası. */
  getTableSchema(table: string): Promise<TableSchema>;
  /** Snapshot içindeki tablo satır sayısı (mutabakat için). */
  countRows(table: string): Promise<number>;
  /**
   * Deterministik sayfa. PK sırasına göre; `after` son görülen PK değerleridir
   * (keyset). PK yoksa canonical sıralama uygulanır (reader sözleşmesi).
   */
  readPage(table: string, pageSize: number, after: unknown[] | null): Promise<Row[]>;
  /** DB sürümü (metadata). */
  version(): Promise<string>;
  /** Kaynak proje referansı (varsa). */
  projectRef(): string | null;
  /** Kaynak türü. */
  source(): "fixture" | "production";
  /** Kapat (bağlantı varsa). */
  close(): Promise<void>;
}

/** Storage objesi listesi girdisi (port). */
export interface StorageListItem {
  bucket: string;
  path: string;
  size: number;
  updatedAt: string;
}

/** Storage veri kaynağı (port). Fixture + supabase adaptörleri bunu uygular. */
export interface StorageReader {
  listAll(): Promise<StorageListItem[]>;
  download(bucket: string, path: string): Promise<Buffer>;
  source(): "fixture" | "production";
}
