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

export const EDU_NOTE_MAX = 500;
export const EDU_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
