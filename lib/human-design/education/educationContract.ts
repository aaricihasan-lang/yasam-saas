// Human Design — Hazır Eğitim Haritaları (FAZ 2-B1) · SAF sözleşme: tipler ve sabitler (IO yok).
// Katalog platforma aittir (tenant'sız); erişim yalnız PLATFORM OWNER'ın kişi bazında verdiği eğitmenlere açıktır.

export const EDU_TABLES = {
  subjects: "hd_education_subjects",
  sources: "hd_education_sources",
  charts: "hd_education_charts",
  publications: "hd_education_publications",
  audit: "hd_education_audit_events",
  takedowns: "hd_education_takedown_requests",
  grants: "hd_education_access_grants",
} as const;

export const EDU_RPC = {
  grant: "hd_education_grant_access",
  revoke: "hd_education_revoke_access",
  autoRevoke: "hd_education_auto_revoke_ineligible",
} as const;

export const EDU_CATEGORIES = ["bilim", "sanat", "muzik", "sinema", "edebiyat", "siyaset", "tarih", "spor", "kesif", "medya", "kraliyet", "diger"] as const;
export type EduCategory = (typeof EDU_CATEGORIES)[number];

export type EduUtcStatus = "VERIFIED" | "PENDING_VERIFICATION";
export type EduLegalStatus = "E" | "LOW_REVIEWED" | "LOW_UNREVIEWED";
export type EduPublicationStatus = "draft" | "pilot_candidate" | "approved" | "published" | "withdrawn";

export const EDU_CATEGORY_LABEL: Readonly<Record<EduCategory, string>> = Object.freeze({
  bilim: "Bilim", sanat: "Sanat", muzik: "Müzik", sinema: "Sinema", edebiyat: "Edebiyat", siyaset: "Siyaset",
  tarih: "Tarih", spor: "Spor", kesif: "Keşif", medya: "Medya", kraliyet: "Kraliyet", diger: "Diğer",
});
export const EDU_LEGAL_LABEL: Readonly<Record<EduLegalStatus, string>> = Object.freeze({
  E: "E · bekliyor", LOW_REVIEWED: "Düşük · avukat onaylı", LOW_UNREVIEWED: "Düşük · avukat incelemesi yok",
});
export const EDU_PUBLICATION_LABEL: Readonly<Record<EduPublicationStatus, string>> = Object.freeze({
  draft: "Taslak", pilot_candidate: "Pilot adayı", approved: "Onaylandı", published: "Yayında", withdrawn: "Yayından kaldırıldı",
});
export const EDU_BLOCKER_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "UTC-TEYİT": "UTC teyidi", "HUKUK-E": "Hukuk (E)", "YAŞAYAN KİŞİ": "Yaşayan kişi", KRALİYET: "Kraliyet", TANINIRLIK: "Tanınırlık",
  LİSANS: "Kaynak lisansı", TAKVİM: "Takvim dönüşümü", KAYNAK: "Kaynak kökeni", "AVUKAT-GÖRMEDİ": "Avukat incelemesi yok",
});

/** Owner envanter satırı (yalnız owner yönetim API'si döner). */
export type EduInventoryRow = {
  id: string;
  naturalKey: string;
  sourceRef: string;
  displayName: string;
  category: EduCategory;
  isLiving: boolean;
  birthDate: string;
  birthPlace: string;
  documentedLocalTime: string;
  documentQuote: string;
  birthUtc: string | null;
  utcStatus: EduUtcStatus;
  legalStatus: EduLegalStatus;
  /** Hukuk notu — içe aktarımın uzlaştırma işareti dahil (ör. "[Araştırma raporu: düşük risk — avukat onayı DEĞİL]"). */
  legalNote: string | null;
  blockers: string[];
  revision: number;
  publicationStatus: EduPublicationStatus;
  computed: boolean;
  /** Türetilmiş süreç aşaması (DB durumundan AYRI gösterilir). */
  stage: EduStage;
  sources: Array<{ role: string; url: string; institution: string | null; archiveRef: string | null; timeExplicit: boolean | null }>;
};

export type EduInventorySummary = {
  total: number;
  utcVerified: number;
  utcPending: number;
  legalE: number;
  legalUnreviewed: number;
  published: number;
};

/** Owner erişim yönetimi satırı (yalnız owner API'si). */
export type EduAccessUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  isDemo: boolean;
  humanDesign: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
  grant: { grantedAt: string; grantedBy: string | null; note: string | null } | null;
};

export type EduAccessEvent = { at: string; action: string; actorKind: string; targetUserId: string | null; targetName: string | null };

/** Eğitmen katalog kartı (yalnız yetkili eğitmen; yalnız YAYIMLI kayıt). */
export type EduCatalogCard = {
  id: string;
  displayName: string;
  category: EduCategory;
  birthDate: string;
  documentedLocalTime: string;
  birthPlace: string;
  utcVerified: true;
};

/** FAZ 2-B3 — eğitmen kişi ayrıntısı (yalnız yayımlı + okuma anında hâlâ uygun kayıt; kayıtlı doğrulanmış snapshot).
 *  provider_raw / request_body / hash / hukuk iç referansları / owner kimlikleri YOK. */
export type EduCatalogSourceView = {
  role: string; url: string; institution: string | null; documentTitle: string | null; archiveRef: string | null;
  documentDate: string | null; timeExplicit: boolean | null; primarySecondary: string | null; license: string | null;
};
export type EduCatalogDetail = EduCatalogCard & {
  calendarNote: string | null;
  documentQuote: string;
  timeStandard: string | null;
  utcOffsetSeconds: number | null;
  birthUtc: string;
  utcMethodology: string;
  latitude: number | null;
  longitude: number | null;
  sources: EduCatalogSourceView[];
  /** Kayıtlı doğrulanmış snapshot (yeniden hesap YOK). */
  chart: { version: number; computedAt: string; result: Record<string, unknown>; render: Record<string, unknown> | null };
  /** Owner yayın onayı tarihi. */
  approvedAt: string | null;
};

export const EDU_NOTE_MAX = 500;
export const EDU_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── FAZ 2-B2: owner hesaplama / doğrulama / yayın ─────────────────────────────────────────────

/** Owner'ın kaldırabileceği hukuk/yayın engelleri (gerekçe zorunlu). UTC-TEYİT, YAŞAYAN KİŞİ ve TAKVİM doğum kanıtına
 *  bağlıdır — yalnız kanıt revizyonuyla değişir; HUKUK-E ve AVUKAT-GÖRMEDİ yalnız "hukuk incelemesi kaydı" ile kalkar. */
export const EDU_OWNER_CLEARABLE_BLOCKERS = ["KRALİYET", "TANINIRLIK", "LİSANS", "KAYNAK"] as const;
export const EDU_LEGAL_REVIEW_CLEARS = ["AVUKAT-GÖRMEDİ", "HUKUK-E"] as const;

export type EduChartSummary = {
  id: string;
  version: number;
  revision: number;
  calcStatus: "OK" | "PROVIDER_ERROR" | "TIME_MISMATCH" | "BLOCKED_UTC";
  computedAt: string;
  adapterVersion: string;
  current: boolean;          // kişinin güncel kanıt revizyonuna ait mi
  timeCheck: { durum?: string; farkDakika?: number | null } | null;
  secondsSent: boolean;
};

/** Yayın ön şartları — UI kontrol listesi. DB yayın kilidi aynı şartları AYRICA uygular (tek doğruluk kaynağı DB). */
export type EduChecklist = {
  utcVerified: boolean;
  sourcePresent: boolean;
  snapshotOk: boolean;        // güncel revizyonda başarılı snapshot var
  snapshotVerified: boolean;  // owner güncel revizyondaki OK snapshot'ı doğruladı
  legalReviewed: boolean;     // LOW_REVIEWED (owner hukuk inceleme kaydı)
  noBlockers: boolean;
  notLiving: boolean;
  ownerApproved: boolean;     // status approved | published
};

export const EDU_CHECKLIST_LABEL: Readonly<Record<keyof EduChecklist, string>> = Object.freeze({
  utcVerified: "UTC doğrulanmış",
  sourcePresent: "Doğum saati kaynağı (güncel revizyon)",
  snapshotOk: "Başarılı hesap (güncel revizyon)",
  snapshotVerified: "Hesap sonucu owner tarafından doğrulandı",
  legalReviewed: "Hukuk incelemesi kayıtlı (avukat)",
  noBlockers: "Aktif yayın engeli yok",
  notLiving: "Yaşamayan kişi (mevcut kural)",
  ownerApproved: "Owner yayın onayı",
});

/** Türetilmiş süreç aşaması (UI etiketi). DB durumu (publication status) ayrı gösterilir; ikisi karıştırılmaz. */
export type EduStage = "Taslak" | "Pilot adayı" | "Doğrulama bekliyor" | "Hesaplandı" | "Yayın onayı bekliyor" | "Yayına hazır" | "Yayında" | "Yayından kaldırıldı";

export function eduStage(status: EduPublicationStatus, c: EduChecklist): EduStage {
  if (status === "withdrawn") return "Yayından kaldırıldı";
  if (status === "published") return "Yayında";
  if (status === "approved") return "Yayına hazır";
  if (c.snapshotVerified) {
    const pre = c.utcVerified && c.sourcePresent && c.legalReviewed && c.noBlockers && c.notLiving;
    return pre ? "Yayın onayı bekliyor" : "Hesaplandı";
  }
  if (c.snapshotOk) return "Doğrulama bekliyor";
  return status === "pilot_candidate" ? "Pilot adayı" : "Taslak";
}

export type EduSourceView = {
  role: string; url: string; institution: string | null; documentTitle: string | null; archiveRef: string | null;
  documentDate: string | null; accessedOn: string | null; timeExplicit: boolean | null; primarySecondary: string | null;
  usageRestriction: string | null; license: string | null;
};

export type EduAuditView = { at: string; action: string; actorKind: string; detail: Record<string, unknown> };

/** Owner kişi ayrıntısı (yalnız owner API'si; provider_raw / request_body / API anahtarı YOK). */
export type EduOwnerSubjectDetail = {
  id: string;
  displayName: string;
  category: EduCategory;
  isLiving: boolean;
  birthDate: string;
  calendarNote: string | null;
  birthPlace: string;
  latitude: number | null;
  longitude: number | null;
  documentedLocalTime: string;
  documentQuote: string;
  timeStandard: string | null;
  utcOffsetSeconds: number | null;
  birthUtc: string | null;
  utcStatus: EduUtcStatus;
  utcMethodology: string;            // eğitim UTC katmanının açıklaması veya engel nedeni
  utcComputable: boolean;
  legalStatus: EduLegalStatus;
  legalNote: string | null;
  legalReviewRef: string | null;
  legalReviewedAt: string | null;
  blockers: string[];
  revision: number;
  sources: EduSourceView[];
  charts: EduChartSummary[];
  publication: {
    status: EduPublicationStatus; chartId: string | null; chartVerifiedAt: string | null; approvedAt: string | null;
    legalClearanceRef: string | null; withdrawnAt: string | null; withdrawReason: string | null;
  };
  checklist: EduChecklist;
  stage: EduStage;
  preview: { chartId: string; version: number; result: Record<string, unknown> } | null;
  history: EduAuditView[];
  providerCallsEnabled: boolean;
};

export type EduOwnerAction =
  | { action: "pilot" } | { action: "unpilot" }
  | { action: "verify_chart"; chartId: string }
  | { action: "legal_review"; reference: string }
  | { action: "clear_blocker"; blocker: string; reason: string }
  | { action: "approve"; legalClearanceRef: string; note?: string }
  | { action: "publish" }
  | { action: "withdraw"; reason: string };
