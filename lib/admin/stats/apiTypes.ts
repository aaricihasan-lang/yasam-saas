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

// ─── USAGE360 2C — Admin 360 (yalnız teknik kullanım sayıları; içerik YOK) ─────

export type Usage360Coverage = "none" | "partial" | "full";

export type Usage360ExpertRow = {
  userId: string;
  fullName: string;
  email: string;
  active: boolean | null;
  approvalStatus: string;
  isDemo: boolean;
  isArchived: boolean;
  accountCreatedAt: string | null;
  lastLoginAt: string | null;
  /** Son teknik temas (ikincil; insan etkileşimi değil). */
  lastSeenAt: string | null;
  /** Usage360 son gerçek etkileşim/işlem; ölçüm yoksa null. */
  lastActivityAt: string | null;
  today: { visits: number; activeSeconds: number; modules: number; actions: number };
  d7ActiveDays: number;
  d30ActiveDays: number;
  channelVisits30d: Record<string, number>;
  accessibleModuleCount: number;
};

export type Usage360ExpertsData = {
  rows: Usage360ExpertRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  today: string;
  measurementStart: string | null;
  sort: string;
  status: string;
  includeDemo: boolean;
};

export type Usage360Counts = {
  visits: number; activeSeconds: number; moduleOpens: number; actions: number;
  creates: number; updates: number; deletes: number; analyses: number;
  reportsGenerated: number; reportsExported: number; uploads: number; aiTasks: number; failures: number;
};

export type Usage360DailyRow = Usage360Counts & { day: string; modulesUsed: number; firstAt: string | null; lastAt: string | null };

export type Usage360ModuleStatus = "actioned" | "opened_only" | "never_opened" | "not_measured";

export type Usage360ModuleRow = Omit<Usage360Counts, "visits"> & {
  module: string;
  label: string;
  allowed: boolean;
  status: Usage360ModuleStatus;
  firstAt: string | null;
  lastAt: string | null;
  firstEverAt: string | null;
  lastEverAt: string | null;
  activeDays: number;
  lastActionAt: string | null;
};

export type Usage360ChannelRow = { channel: string; visits: number; activeSeconds: number; moduleOpens: number; actions: number; lastAt: string | null };
export type Usage360DeviceRow = { channel: string; osFamily: string; browserFamily: string; appVersion: string | null; visits: number; lastAt: string | null };
export type Usage360LocationRow = { country: string | null; city: string | null; visits: number; lastAt: string | null };
export type Usage360HeatCell = { dow: number; hour: number; days: number };
export type Usage360FailureRow = { module: string; label: string; errorClass: string; count: number; lastAt: string | null };

export type Usage360DetailData = {
  userId: string;
  from: string;
  to: string;
  today: string;
  measurementStart: string | null;
  coverage: Usage360Coverage;
  account: {
    active: boolean;
    approvalStatus: string | null;
    createdAt: string | null;
    approvedAt: string | null;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    activeAuthSessions: number | null;
    allowedModules: { key: string; label: string }[];
  };
  totals: Usage360Counts & { firstAt: string | null; lastAt: string | null; activeUsageDays: number; actionDays: number };
  modulesUsed: number;
  modulesWithActions: number;
  daily: Usage360DailyRow[];
  modules: Usage360ModuleRow[];
  channels: Usage360ChannelRow[];
  devices: Usage360DeviceRow[];
  locations: Usage360LocationRow[];
  heatmap: Usage360HeatCell[];
  failures: Usage360FailureRow[];
};

export type Usage360TimelineRow = {
  at: string;
  module: string;
  label: string;
  action: string;
  subEntity: string | null;
  failedAction: string | null;
  errorClass: string | null;
  channel: string | null;
  source: string | null;
  itemBucket: string | null;
};

export type Usage360TimelineData = { rows: Usage360TimelineRow[]; nextCursor: string | null; from: string; to: string };
