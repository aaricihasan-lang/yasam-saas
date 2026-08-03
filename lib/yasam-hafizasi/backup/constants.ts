/**
 * BF-12B — Satış öncesi tam yedekleme aracı: sabitler.
 *
 * SALT LOKAL ARAÇ. Runtime/browser bundle'ına ithal EDİLMEZ (yalnız local-only
 * CLI + harness kullanır). Hiçbir gerçek secret / production bağlantı değeri içermez.
 *
 * Tenant sınıfları BF-12A2 census + BF-1B sentetik namespace sözleşmesine göredir.
 */

/** Owner/admin bağımsız tenant — KEEP (backup'a dahil, cleanup'a girmez). */
export const OWNER_ADMIN_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

/** Demo tenant — REVIEW. */
export const DEMO_TENANT_ID = "40f842a0-e3e8-448c-8971-9a938e1faccb";

/** Üç test uzman tenantı — BACKUP_THEN_DELETE. */
export const TEST_EXPERT_TENANT_IDS = [
  "32c5d611-2fe1-4795-a54e-a5c0ebbc5606",
  "53fa797f-33f8-49c1-bfaa-0e99955e864d",
  "6675222e-72d4-402d-a8c4-585c45ec8e63",
] as const;

/** Userless / legacy tenant (numeroloji legacy fallback) — REVIEW_CLEANUP. */
export const USERLESS_LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export type TenantClass =
  | "owner_admin_keep"
  | "demo_review"
  | "test_expert_backup_then_delete"
  | "userless_legacy_review"
  | "null_shared"
  | "unmatched_orphan";

/** Bilinen tenant kimliği → sınıf eşlemesi (UUID → sınıf). */
export const TENANT_CLASS_BY_ID: Readonly<Record<string, TenantClass>> = {
  [OWNER_ADMIN_TENANT_ID]: "owner_admin_keep",
  [DEMO_TENANT_ID]: "demo_review",
  [TEST_EXPERT_TENANT_IDS[0]]: "test_expert_backup_then_delete",
  [TEST_EXPERT_TENANT_IDS[1]]: "test_expert_backup_then_delete",
  [TEST_EXPERT_TENANT_IDS[2]]: "test_expert_backup_then_delete",
  [USERLESS_LEGACY_TENANT_ID]: "userless_legacy_review",
};

/** Verilen tenant kimliğini (veya null) sınıfına çevirir. */
export function classifyTenant(tenantId: string | null | undefined): TenantClass {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    return "null_shared";
  }
  return TENANT_CLASS_BY_ID[tenantId] ?? "unmatched_orphan";
}

/**
 * Owner/admin kapısı için beklenen koşul (BF-12B preflight):
 *   role='admin' AND admin_level='owner' AND active=true AND tenant_id=OWNER_ADMIN_TENANT_ID
 * ve bu koşula uyan EXACT 1 kullanıcı.
 */
export const OWNER_GATE = {
  role: "admin",
  adminLevel: "owner",
  active: true,
  tenantId: OWNER_ADMIN_TENANT_ID,
  expectedCount: 1,
} as const;

/**
 * Hassas kolon adı desenleri (catalog discovery). Bu adları taşıyan DOLU kolonlar
 * explicit policy gerektirir; yoksa backup FAIL-CLOSED olur.
 */
export const SENSITIVE_COLUMN_PATTERNS: readonly RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /credential/i,
  /authorization/i,
  /auth[_-]?token/i,
];

/**
 * Encrypted full-fidelity archive'a dahil edilmesine izin verilen TEK hassas kolon.
 * (Hesap tam geri yüklenebilsin diye; public manifest/Word/log'da ASLA görünmez.)
 */
export const SENSITIVE_ALLOWLIST: readonly string[] = ["users.password_hash"];

/**
 * Non-null bulunursa backup'ı FAIL-CLOSED yapan kolonlar (plaintext parola export'u yasak).
 */
export const SENSITIVE_FAIL_IF_NONNULL: readonly string[] = ["users.password"];

export type RestorePolicy =
  | "RESTORE"
  | "ARCHIVE_ONLY"
  | "DO_NOT_RESTORE"
  | "SYSTEM_SCHEMA_ONLY";

/**
 * Tablo bazlı restore politikası varsayılanları (BF-12A2 + BF-12B madde 10).
 * Burada OLMAYAN ama production'da DOLU tablo → coverage engine FAIL-CLOSED
 * (silent skip yok). Bu yalnız bilinen özel-durum override'larıdır; genel
 * tenant-owned iş verisi otomatik RESTORE alır (policy.ts).
 */
export const TABLE_POLICY_OVERRIDES: Readonly<Record<string, RestorePolicy>> = {
  // Kimlik tablosu (tenant_id kolonu yok ama restore gerekli).
  tenants: "RESTORE",
  // Teknik / audit / güvenlik → ARCHIVE_ONLY (encrypted arşivde tutulur, otomatik restore edilmez)
  security_events: "ARCHIVE_ONLY",
  support_messages: "ARCHIVE_ONLY",
  admin_audit_log: "ARCHIVE_ONLY",
  provisioning_events: "ARCHIVE_ONLY",
  aromatherapy_claim_audit_events: "ARCHIVE_ONLY",
  aromatherapy_content_audit_events: "ARCHIVE_ONLY",
  aromatherapy_content_delete_tombstones: "ARCHIVE_ONLY",
  hd_content_audit_events: "ARCHIVE_ONLY",
  yebs_audit_events: "ARCHIVE_ONLY",
  user_payment_history: "ARCHIVE_ONLY",
  // Yaşam Hafızası CDC/index → ARCHIVE_ONLY (rebuildable_technical; forensic archive)
  yasam_hafizasi_index: "ARCHIVE_ONLY",
  yasam_hafizasi_outbox: "ARCHIVE_ONLY",
  yasam_hafizasi_flags: "ARCHIVE_ONLY",
  // Session/token & rebuild edilebilir → DO_NOT_RESTORE (yalnız metadata/count)
  user_sessions: "DO_NOT_RESTORE",
  demo_numerology_ip_usage: "DO_NOT_RESTORE",
};

/**
 * Yaşam Hafızası index kaynak modülleri (config ile aynı). Word aggregate özeti için.
 */
export const YH_SOURCE_MODULES = [
  "refleksoloji",
  "sifa_rehberi",
  "biyoenerji",
  "dogaltas",
  "aromaterapi",
  "kisisel_arsiv",
  // BF-14: config.YH_SOURCE_MODULES ile senkron (additif numeroloji ailesi).
  "numeroloji",
] as const;

/** Owner tenantında diğer uzmanlarca canlı okunan shared-read tablo(lar). */
export const OWNER_SHARED_READ_TABLES: readonly string[] = ["stone_knowledge_articles"];

/**
 * Bilinen global/canonical (tenant/user/client sahipliği OLMAYAN) referans tablolar.
 * Sahiplik kolonu olmayan bir tablo BURADA yoksa → UNRESOLVED (fail-closed): yeni
 * sınıflandırılmamış dolu tablo sessizce "canonical" sayılmaz.
 */
export const KNOWN_CANONICAL_TABLES: ReadonlySet<string> = new Set([
  "yebs_traditions",
  "yebs_schools",
  "yebs_concepts",
  "yebs_concept_labels",
  "yebs_sources",
  "yebs_claims",
  "yebs_claim_sources",
  "yebs_concept_relations",
  "yebs_concept_relation_sources",
  "hd_canonical_entities",
  "hd_canonical_types",
  "hd_canonical_authorities",
  "hd_canonical_gates",
  "hd_canonical_channels",
  "hd_canonical_content",
  "hd_content_evidence",
  "hd_sources",
  "hd_source_passages",
  "hd_original_texts",
  "hd_faithful_translations",
  "stone_knowledge_categories",
  "hacamat_rules",
  "aromatherapy_chemical_families",
]);

/** Backup arşiv/format sürümü (versioned envelope). */
export const BACKUP_FORMAT_VERSION = "bf12b-1.0.0";

/** Tamamlanmışlık işaretçisi dosyası — yalnız tüm doğrulamalar PASS sonrası yazılır. */
export const COMPLETE_MARKER = "COMPLETE";

/** Bilinen Supabase Storage bucket adları (repo + BF-12A2 census; census 6 bucket). */
export const KNOWN_STORAGE_BUCKETS = [
  "video-temp",
  "belge-ceviri",
  "stone-photos",
  "hd-chart-images",
  "personal-archive",
  "client-analysis-images",
] as const;
