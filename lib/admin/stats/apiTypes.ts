/**
 * FAZ 2 — Yönetici istatistik ekranının TÜKETTİĞİ admin API yanıt tipleri (tek sözleşme).
 * FAZ 1'in dört ucu (activity/modules/storage/overview) + FAZ 2'nin üç yeni ucu
 * (experts/storage-overview/storage-growth). MetricValue sözleşmesi lib/admin/stats/contract.
 */
import type { MetricValue } from "@/lib/admin/stats/contract";

export type DateRangeContract = { from: string | null; to: string | null };

// ── activity ────────────────────────────────────────────────────────────────
export type ActivityData = {
  userId: string;
  tenantId: string;
  isDemo: boolean;
  range: DateRangeContract;
  accountCreatedAt: MetricValue<string>;
  lastLoginAt: MetricValue<string>;
  lastSeenAt: MetricValue<string>;
  loginCount: MetricValue<number>;
  sessionCount: MetricValue<number>;
  activeDays: MetricValue<number>;
  channelBreakdown: MetricValue<Record<string, number>>;
  platformBreakdown: MetricValue<Record<string, number>>;
};

// ── modules ─────────────────────────────────────────────────────────────────
export type ModuleMatrixRow = {
  key: string;
  label: string;
  allowed: boolean;
  hasDurableTrace: boolean;
  existingRecordCount: MetricValue<number>;
  usageEventCount: MetricValue<number>;
  lastUsageAt: MetricValue<string>;
  used: boolean | null;
  allowedButUnused: boolean | null;
  note?: string;
};
export type ModulesData = {
  userId: string;
  tenantId: string;
  isDemo: boolean;
  range: DateRangeContract;
  allowedMetric: MetricValue<number>;
  modules: ModuleMatrixRow[];
};

// ── storage (per-workspace) ───────────────────────────────────────────────────
export type StorageBucketBreakdown = Record<
  string,
  { objectCount: number; totalBytes: number; missingSizeCount: number }
>;
export type StorageData = {
  userId: string;
  tenantId: string;
  isDemo: boolean;
  isLegacyTenant: boolean;
  objectCount: MetricValue<number>;
  totalBytes: MetricValue<number>;
  missingSizeCount: MetricValue<number>;
  byBucket: StorageBucketBreakdown;
  unattributedObjectCount: MetricValue<number>;
  unattributedBytes: MetricValue<number>;
};

// ── overview ──────────────────────────────────────────────────────────────────
export type OverviewData = {
  activeSinceDays: number;
  range: DateRangeContract;
  totalExperts: MetricValue<number>;
  activeExperts: MetricValue<number>;
  passiveExperts: MetricValue<number>;
  pendingExperts: MetricValue<number>;
  archivedExperts: MetricValue<number>;
  newExperts: MetricValue<number>;
  activeUsedExperts: MetricValue<number>;
};

// ── experts (FAZ 2 — sayfalı liste) ───────────────────────────────────────────
export type ExpertListRow = {
  userId: string;
  tenantId: string;
  fullName: string;
  email: string;
  /** active NULL olabilir (üçüncü durum) — false gibi kabul EDİLMEZ. */
  active: boolean | null;
  approvalStatus: string;
  isDemo: boolean;
  isArchived: boolean; // approved & active IS FALSE (Aşama 1 arşiv tanımı; NULL → arşiv DEĞİL)
  accountCreatedAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null; // ~ yaklaşık (heartbeat)
  sessionCount: number;
  accessibleModuleCount: number;
};
export type ExpertsData = {
  rows: ExpertListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  status: string;
  sort: string;
  includeDemo: boolean;
  note: string;
};

// ── storage-overview (FAZ 2 — sistem geneli) ──────────────────────────────────
export type StorageOverviewData = {
  attributedObjectCount: MetricValue<number>;
  attributedBytes: MetricValue<number>;
  unattributedObjectCount: MetricValue<number>;
  unattributedBytes: MetricValue<number>;
  missingSizeCount: MetricValue<number>;
  tenantCount: MetricValue<number>;
  byBucket: StorageBucketBreakdown;
  coverageNote: string;
};

// ── storage-growth (FAZ 2 — günlük geçmiş) ────────────────────────────────────
export type StorageGrowthPoint = {
  snapshotDate: string;
  tenantCount: number;
  objectCount: number;
  totalBytes: number;
  /** status <> 'complete' (partial VE failed dahil) gün-içi kayıt sayısı. */
  incompleteCount: number;
};
export type StorageGrowthData = {
  points: StorageGrowthPoint[];
  /** Seçilen aralıkta en az 1 gün var mı. */
  measurementStarted: boolean;
  /** Sistemde HİÇ günlük ölçüm var mı — true/false; SORGU HATASINDA null (belirsiz; "hiç başlamadı" UYDURULMAZ). */
  everMeasured: boolean | null;
  /** ≥2 nokta VE aynı tenant kümesi VE tümü partial değil → gerçekten karşılaştırılabilir (çizgi çizilir). */
  comparable: boolean;
  range: { from: string | null; to: string | null };
  note: string;
};
