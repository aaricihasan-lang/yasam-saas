import {
  parseMembershipFromRow,
  type MembershipDisplay,
  type MembershipSnapshot,
} from "@/lib/auth/membership";
import { buildPremiumModulePermissionsPayload } from "@/lib/auth/modulePermissions";
import {
  normalizeApprovalStatus,
  normalizeRole,
} from "@/lib/auth/yasamUser";
import { limitFromDb } from "@/lib/admin/licenseLimits";
import { paymentDayIso } from "@/lib/admin/member360";
import { resolveMembershipPackageType } from "@/lib/auth/membershipAccessCore";
import {
  BILLING_PERIOD_LABELS,
  isBillingPeriod,
  type BillingPeriod,
} from "@/lib/admin/memberCommercial";

export type ManagedUserRole = "admin" | "expert";

export type LicenseType = "single" | "professional" | "family" | "partner" | "team" | "custom";
export type SecurityMode = "strict" | "normal" | "flexible";

export type LicenseSettings = {
  licenseType: LicenseType;
  allowedActiveSessions: number;
  allowedLocations: number;
  allowedDesktopSessions: number;
  allowedMobileSessions: number;
  allowedTabletSessions: number;
  allowedUnknownSessions: number;
  securityMode: SecurityMode;
  securityExempt: boolean;
  licenseNote: string;
};

export const LICENSE_TYPE_OPTIONS: { value: LicenseType; label: string }[] = [
  { value: "single",       label: "Bireysel"    },
  { value: "professional", label: "Profesyonel" },
  { value: "family",       label: "Aile"        },
  { value: "partner",      label: "Ortak"       },
  { value: "team",         label: "Ekip"        },
  { value: "custom",       label: "Özel"        },
];

export const SECURITY_MODE_OPTIONS: { value: SecurityMode; label: string }[] = [
  { value: "strict",   label: "Sıkı"   },
  { value: "normal",   label: "Normal" },
  { value: "flexible", label: "Esnek"  },
];

/**
 * DB default ile AYNI (P3 migration 20260918: tüm limit kolonları default -1 = sınırsız).
 * Yalnız yükleme öncesi yer tutucu; kayıt her zaman DB'den okunan değerle başlar.
 */
export const DEFAULT_LICENSE_SETTINGS: LicenseSettings = {
  licenseType:            "single",
  allowedActiveSessions:  -1,
  allowedLocations:       1,
  allowedDesktopSessions: -1,
  allowedMobileSessions:  -1,
  allowedTabletSessions:  -1,
  allowedUnknownSessions: -1,
  securityMode:           "normal",
  securityExempt:         false,
  licenseNote:            "",
};

export type LicensePreset = { label: string; settings: LicenseSettings };

/**
 * Hazır presetler. MEM-001: eski "0" değerleri "ayrı limit yok" niyetiyle yazılmıştı; P3
 * semantiğinde 0 = GİRİŞ KAPALI olduğundan tablet/tanınmayan cihazları sessizce yasaklıyordu.
 * Niyet korunarak -1 (toplam limit içinde serbest) yapıldı. Preset admin notunu SİLMEZ
 * (UI, mevcut notu korur).
 */
export const LICENSE_PRESETS: LicensePreset[] = [
  { label: "Standart",    settings: { licenseType: "single",       allowedActiveSessions: 2,  allowedLocations: 2, allowedDesktopSessions: 1, allowedMobileSessions: 1, allowedTabletSessions: -1, allowedUnknownSessions: -1, securityMode: "normal",   securityExempt: false, licenseNote: "" } },
  { label: "Profesyonel", settings: { licenseType: "professional", allowedActiveSessions: 4,  allowedLocations: 2, allowedDesktopSessions: 2, allowedMobileSessions: 1, allowedTabletSessions: 1,  allowedUnknownSessions: -1, securityMode: "normal",   securityExempt: false, licenseNote: "" } },
  { label: "Aile",        settings: { licenseType: "family",       allowedActiveSessions: 6,  allowedLocations: 2, allowedDesktopSessions: 2, allowedMobileSessions: 3, allowedTabletSessions: 1,  allowedUnknownSessions: -1, securityMode: "flexible", securityExempt: false, licenseNote: "" } },
  { label: "Ortak",       settings: { licenseType: "partner",      allowedActiveSessions: 8,  allowedLocations: 2, allowedDesktopSessions: 3, allowedMobileSessions: 3, allowedTabletSessions: 2,  allowedUnknownSessions: -1, securityMode: "flexible", securityExempt: false, licenseNote: "" } },
  { label: "Ekip",        settings: { licenseType: "team",         allowedActiveSessions: 12, allowedLocations: 4, allowedDesktopSessions: 6, allowedMobileSessions: 4, allowedTabletSessions: 2,  allowedUnknownSessions: -1, securityMode: "flexible", securityExempt: false, licenseNote: "" } },
];

export type ApprovalStatusUi = "pending" | "approved" | "rejected";

export const ADMIN_MODULE_UI_KEYS = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "stok",
  "sifa_rehberi",
  "reflexology",
  "energy_body",
  "aromatherapy",
  "personal_archive",
  // FAZ1 FINAL HARDENING: "video_ceviri" ve "ders_notu" toggle'ları KALDIRILDI — bu AI yüzeyleri
  // yalnız admin'e açıktır (moduleAccessCore.ADMIN_ONLY_MODULE_KEYS); uzmana verilemez. UI artık bu
  // anahtarları YÖNETMEDİĞİ için mergeAdminModulePermissions mevcut DB değerlerini aynen KORUR
  // (veri değişmez; sunucu bu bayrakları admin olmayan için zaten yok sayar).
  "belge_ceviri",
  "digital_content",
  // FAZ 1 / MEM-005: satılabilir modüller — gerçek server kapısı anahtarları (moduleAccessCore
  // ModuleGateKey + moduleRouteRegistry: app/api/hd → human_design; kozmik takvim + app/api/hacamat
  // → cosmic_calendar). Önceden listede YOKTU → yeni üyeye verilemiyor, mevcut üyeden alınamıyordu.
  "human_design",
  // Human Design alt-yetkisi (capability): "Sistem Yorumu" — kayıtlı RoxyAPI açıklamaları. MODÜL
  // DEĞİL (onay "en az bir modül" kuralına / modül sayısına girmez); human_design ile BİRLİKTE gerekir.
  // Varsayılan KAPALI; Premium payload'ında YOK → admin uzman bazında açar.
  "hd_system_reading",
  "cosmic_calendar",
  // Kupa & Hacamat — normal satılabilir modül; admin buradan açıp kapatabilir (canonical anahtar).
  "cupping",
  // Beslenme — normal satılabilir/grantable modül (admin↔uzman özellik paritesi). Admin buradan
  // module_permissions.beslenme=true/false yönetir → uzman TAM Beslenme modülüne erişir (CUSTOM besin
  // yönetimi dahil). Canonical anahtar; toggle render + save/load zincirinde taşınır. Ayrı "Manuel
  // Besin Yönetimi" (beslenme_manual_food) yeteneği KALDIRILDI — artık okunmayan inert legacy key.
  "beslenme",
] as const;

export type AdminModuleUiKey = (typeof ADMIN_MODULE_UI_KEYS)[number];

export type AdminModulePermissions = Record<AdminModuleUiKey, boolean>;

export const ADMIN_MODULE_UI_LABELS: Record<AdminModuleUiKey, string> = {
  clients: "Danışan Yönetimi",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  stok: "Ürün & Stok Merkezi",
  sifa_rehberi: "Şifa Rehberi",
  reflexology: "Refleksoloji",
  energy_body: "Biyoenerji",
  aromatherapy: "Aromaterapi",
  personal_archive: "Kişisel Arşiv",
  belge_ceviri: "Belge Çeviri Merkezi",
  digital_content: "Dijital İçerik Merkezi",
  human_design: "Human Design",
  hd_system_reading: "Human Design — Sistem Yorumu",
  cosmic_calendar: "Kozmik Takvim / Yaşam Takvimi",
  cupping: "Kupa & Hacamat",
  beslenme: "Beslenme",
};

export const ADMIN_MODULE_UI_DESCRIPTIONS: Partial<Record<AdminModuleUiKey, string>> = {
  digital_content:
    "Hub kartı: yalnız alt modüllerden (Kişisel Arşiv, Belge Çeviri) biri açıksa erişim verir. AI araçları yalnız yöneticiye açıktır.",
  belge_ceviri: "PDF → Word dönüşümü ve geçmiş. OCR / PDF → Türkçe Word gibi AI araçları yalnız yöneticiye açıktır.",
  human_design: "Human Design harita, analiz ve rapor modülü.",
  hd_system_reading:
    "Hesaplanmış haritada sistem açıklamalarını (Sistem Yorumu) gösterir. Human Design modülü de açık olmalıdır.",
  cosmic_calendar:
    "Kozmik Ajanda / Yaşam Takvimi ve takvime bağlı hacamat zamanlama kuralları & raporları.",
  cupping: "Kupa & Hacamat uygulama modülü (protokoller, takvim ve raporlar).",
  beslenme: "Beslenme modülünün tamamına (planlar, danışan-bound akış, Besinler / CUSTOM besin yönetimi dahil) erişim verir.",
};

export const DEFAULT_ADMIN_MODULE_PERMISSIONS: AdminModulePermissions = {
  clients: false,
  appointments: false,
  numerology: false,
  stones: false,
  stok: false,
  sifa_rehberi: false,
  reflexology: false,
  energy_body: false,
  aromatherapy: false,
  personal_archive: false,
  belge_ceviri: false,
  digital_content: false,
  human_design: false,
  hd_system_reading: false,
  cosmic_calendar: false,
  cupping: false,
  beslenme: false,
};

/**
 * Anahtar türü: "module" = gerçek erişim açan satılabilir modül · "hub" = yalnız alt
 * modüllerle etkili kart bayrağı (digital_content) · "capability" = bir modülün alt-yetkisi
 * (hd_system_reading; tek başına erişim açmaz, ana modülle birlikte gerekir). Onayda "en az bir
 * modül" kuralı, açık modül sayısı ve üye filtresi yalnız "module" türünü sayar. (Eski
 * beslenme_manual_food yeteneği main'de üründen kaldırılmıştı; tür bu kez Human Design için kullanılır.)
 */
export type AdminModuleKind = "module" | "hub" | "capability";

export const ADMIN_MODULE_KIND: Record<AdminModuleUiKey, AdminModuleKind> = {
  clients: "module",
  appointments: "module",
  numerology: "module",
  stones: "module",
  stok: "module",
  sifa_rehberi: "module",
  reflexology: "module",
  energy_body: "module",
  aromatherapy: "module",
  personal_archive: "module",
  belge_ceviri: "module",
  digital_content: "hub",
  human_design: "module",
  hd_system_reading: "capability",
  cosmic_calendar: "module",
  cupping: "module",
  beslenme: "module",
};

const ADMIN_MODULE_UI_KEY_SET: ReadonlySet<string> = new Set<string>(ADMIN_MODULE_UI_KEYS);

/** Kanonik server-side whitelist kontrolü (UI listesi ile AYNI kaynak). */
export function isAdminModuleUiKey(key: unknown): key is AdminModuleUiKey {
  return typeof key === "string" && ADMIN_MODULE_UI_KEY_SET.has(key);
}

const ADMIN_MODULE_TR_ALIAS_TO_UI: Record<string, AdminModuleUiKey> = {
  danisan_yonetimi: "clients",
  ajanda: "appointments",
  numeroloji: "numerology",
  dogaltas: "stones",
  stock: "stok",
  healing: "sifa_rehberi",
  refleksoloji: "reflexology",
  biyoenerji: "energy_body",
  aromaterapi: "aromatherapy",
  kisisel_arsiv: "personal_archive",
  kupa: "cupping",
  hacamat_terapi: "cupping",
};

/** Kanonik UI anahtarı → DB'de saklanabilen eski TR alias anahtarları. */
export function adminModuleAliasKeys(key: AdminModuleUiKey): string[] {
  return Object.entries(ADMIN_MODULE_TR_ALIAS_TO_UI)
    .filter(([, ui]) => ui === key)
    .map(([alias]) => alias);
}

/** Tüm eski TR alias anahtarları (onayda seçim dışı kalan modül alias ile açık kalmasın). */
export const ADMIN_MODULE_ALIAS_KEYS: readonly string[] = Object.keys(ADMIN_MODULE_TR_ALIAS_TO_UI);

export type ModuleChangesValidation =
  | { ok: true; changes: Partial<Record<AdminModuleUiKey, boolean>> }
  | { ok: false; error: string };

/**
 * MEM-007/008: modül değişiklik isteği — YALNIZ bilinen kanonik anahtar + YALNIZ boolean.
 * Bilinmeyen anahtar (ör. is_admin, yasam_hafizasi, TR alias) veya non-boolean → hata (400).
 */
export function validateModuleChanges(raw: unknown): ModuleChangesValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Modül değişikliği (changes) nesnesi gerekli." };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: "En az bir modül değişikliği gerekli." };
  if (entries.length > ADMIN_MODULE_UI_KEYS.length) {
    return { ok: false, error: "Çok fazla modül değişikliği." };
  }
  const changes: Partial<Record<AdminModuleUiKey, boolean>> = {};
  for (const [k, v] of entries) {
    if (!isAdminModuleUiKey(k)) return { ok: false, error: "Bilinmeyen modül anahtarı." };
    if (typeof v !== "boolean") return { ok: false, error: "Modül izni true/false olmalıdır." };
    changes[k] = v;
  }
  return { ok: true, changes };
}

export type ApprovalModulesValidation =
  | { ok: true; selected: AdminModuleUiKey[]; fullMap: Record<AdminModuleUiKey, boolean> }
  | { ok: false; error: string };

/**
 * MEM-004: onay sırasında seçilen modüller (kanonik anahtar dizisi). En az bir GERÇEK modül
 * ("module" türü) zorunlu. fullMap = TÜM grantable anahtarlar (seçilen=true, diğer=false) →
 * onay sonrası tam olarak seçilen modüller açık olur.
 */
export function validateApprovalModules(raw: unknown): ApprovalModulesValidation {
  if (!Array.isArray(raw)) return { ok: false, error: "Açılacak modüller listesi gerekli." };
  if (raw.length > ADMIN_MODULE_UI_KEYS.length) return { ok: false, error: "Geçersiz modül listesi." };
  const selected = new Set<AdminModuleUiKey>();
  for (const k of raw) {
    if (!isAdminModuleUiKey(k)) return { ok: false, error: "Bilinmeyen modül anahtarı." };
    selected.add(k);
  }
  if (![...selected].some((k) => ADMIN_MODULE_KIND[k] === "module")) {
    return { ok: false, error: "Onay için en az bir modül seçilmelidir." };
  }
  const fullMap = { ...DEFAULT_ADMIN_MODULE_PERMISSIONS };
  for (const k of selected) fullMap[k] = true;
  return { ok: true, selected: ADMIN_MODULE_UI_KEYS.filter((k) => selected.has(k)), fullMap };
}

/** Gerçek erişim açan (kind=module) açık modüller — sabit "Erişim VAR" yerine gerçek sayı. */
export function enabledAccessModules(perms: AdminModulePermissions): AdminModuleUiKey[] {
  return ADMIN_MODULE_UI_KEYS.filter((k) => ADMIN_MODULE_KIND[k] === "module" && perms[k] === true);
}

export type PaymentStatusUi = "paid" | "pending" | "overdue" | "exempt" | "unknown";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusUi, string> = {
  paid: "Ödendi",
  pending: "Bekliyor",
  overdue: "Gecikti",
  exempt: "Ödemeden Muaf",
  unknown: "Belirtilmemiş",
};

/**
 * Ödeme durumu seçenekleri. "Belirtilmemiş" (unknown) BİLİNÇLİ olarak seçilebilir: daha önce
 * bilinmeyen durum düzenleme formunda sessizce "Bekliyor"a çevriliyordu (veri bozulması).
 * Kaydedilirse DB'de NULL olarak tutulur.
 */
export const PAYMENT_STATUS_SELECT_OPTIONS: {
  value: PaymentStatusUi;
  label: string;
}[] = [
  { value: "unknown", label: "Belirtilmemiş" },
  { value: "paid", label: "Ödendi" },
  { value: "pending", label: "Bekliyor" },
  { value: "overdue", label: "Gecikti" },
  { value: "exempt", label: "Ödemeden Muaf" },
];

export type PaymentSnapshot = {
  status: PaymentStatusUi;
  statusLabel: string;
  lastPaymentAt?: string;
  lastPaymentLabel: string;
  nextPaymentAt?: string;
  nextPaymentLabel: string;
  paidAmountLabel: string;
  paidAmountRaw?: number;
  note?: string;
  /** M4 — uzman bazlı anlaşılan ücret + ödeme dönemi (yalnız kayıt; otomasyon yok). */
  agreedFeeRaw?: number;
  agreedFeeLabel: string;
  billingPeriod?: BillingPeriod;
  billingPeriodLabel: string;
};

export type PaymentEditDraft = {
  status: PaymentStatusUi;
  lastPaymentDate: string;
  nextPaymentDate: string;
  paidAmount: string;
  note: string;
  agreedFee: string;
  billingPeriod: BillingPeriod | "";
};

function pickPaymentString(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function normalizePaymentToken(value?: string): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, "_");
}

function parsePaymentStatus(raw?: string): PaymentStatusUi {
  const token = normalizePaymentToken(raw);
  if (token === "paid" || token === "odendi" || token === "ödendi") return "paid";
  if (token === "pending" || token === "bekliyor" || token === "waiting") {
    return "pending";
  }
  if (token === "overdue" || token === "gecikti" || token === "late") return "overdue";
  if (token === "exempt" || token === "muaf") return "exempt";
  return "unknown";
}

export function formatPaymentDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPaidAmount(raw: unknown): { label: string; amount?: number } {
  if (raw == null || raw === "") return { label: "—" };
  const num = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (Number.isNaN(num)) return { label: String(raw) };
  return {
    label: new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(num),
    amount: num,
  };
}

export function parsePaymentFromRow(row: Record<string, unknown>): PaymentSnapshot {
  const statusValue = row.payment_status;
  const status =
    statusValue == null || String(statusValue).trim() === ""
      ? "unknown"
      : parsePaymentStatus(String(statusValue));

  const lastPaymentAt = pickPaymentString(row, [
    "last_payment_date",
    "last_payment_at",
    "son_odeme_tarihi",
  ]);
  const nextPaymentAt = pickPaymentString(row, [
    "next_payment_date",
    "next_payment_at",
    "sonraki_odeme_tarihi",
  ]);

  const paidRaw = row.paid_amount ?? row.paidAmount ?? row.odenen_tutar;
  const { label: paidAmountLabel, amount: paidAmountRaw } = formatPaidAmount(paidRaw);

  const note = pickPaymentString(row, ["payment_note", "paymentNote", "odeme_notu"]);
  const { label: agreedFeeLabel, amount: agreedFeeRaw } = formatPaidAmount(row.agreed_fee);
  const billingPeriod = isBillingPeriod(row.billing_period) ? row.billing_period : undefined;

  return {
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    lastPaymentAt,
    lastPaymentLabel: formatPaymentDate(lastPaymentAt),
    nextPaymentAt,
    nextPaymentLabel: formatPaymentDate(nextPaymentAt),
    paidAmountLabel,
    paidAmountRaw,
    note,
    agreedFeeRaw,
    agreedFeeLabel,
    billingPeriod,
    billingPeriodLabel: billingPeriod ? BILLING_PERIOD_LABELS[billingPeriod] : "—",
  };
}

export function rowHasPaymentColumns(row: Record<string, unknown>): boolean {
  return "payment_status" in row;
}

export const PAYMENT_UPDATE_KEYS = [
  "payment_status",
  "last_payment_date",
  "next_payment_date",
  "paid_amount",
  "payment_note",
  "agreed_fee",
  "billing_period",
] as const;

export type PaymentHistoryEntry = {
  id: string;
  userId: string;
  status: PaymentStatusUi;
  statusLabel: string;
  paymentDateLabel: string;
  /** Ham ödeme günü (YYYY-MM-DD) — fiyat dönemi eşlemesi için; yoksa undefined. */
  paymentDateIso?: string;
  nextPaymentDateLabel: string;
  amountLabel: string;
  agreedFeeLabel: string;
  billingPeriodLabel: string;
  note?: string;
  createdAtLabel: string;
};

export function formatDateTimeTr(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mapPaymentHistoryRow(
  row: Record<string, unknown>,
): PaymentHistoryEntry {
  const statusValue = row.payment_status;
  const status =
    statusValue == null || String(statusValue).trim() === ""
      ? "unknown"
      : parsePaymentStatus(String(statusValue));

  const paymentDate = pickPaymentString(row, ["payment_date", "last_payment_date"]);
  const nextPaymentDate = pickPaymentString(row, ["next_payment_date"]);
  const { label: amountLabel } = formatPaidAmount(row.paid_amount);
  const note = pickPaymentString(row, ["payment_note"]);
  const createdAt =
    row.created_at != null ? String(row.created_at) : undefined;
  const { label: agreedFeeLabel } = formatPaidAmount(row.agreed_fee);
  const period = isBillingPeriod(row.billing_period) ? row.billing_period : undefined;

  return {
    id: row.id != null ? String(row.id) : "",
    userId: row.user_id != null ? String(row.user_id) : "",
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    paymentDateLabel: formatPaymentDate(paymentDate),
    paymentDateIso: paymentDayIso(paymentDate) ?? undefined,
    nextPaymentDateLabel: formatPaymentDate(nextPaymentDate),
    amountLabel,
    agreedFeeLabel,
    billingPeriodLabel: period ? BILLING_PERIOD_LABELS[period] : "—",
    note,
    createdAtLabel: formatDateTimeTr(createdAt),
  };
}

/**
 * Ödeme geçmişi satırı — kaydedilen SON durumun anlık görüntüsü + işlemi yapan admin.
 * `state` users kolon adlarıyla (payment_status, last_payment_date, …, agreed_fee, billing_period).
 */
export function buildPaymentHistoryInsertPayload(
  userId: string,
  state: Record<string, unknown>,
  actorAdminId: string | null = null,
): Record<string, unknown> {
  return {
    user_id: userId,
    payment_status: state.payment_status ?? null,
    payment_date: state.last_payment_date ?? null,
    next_payment_date: state.next_payment_date ?? null,
    paid_amount: state.paid_amount ?? null,
    payment_note: state.payment_note ?? null,
    agreed_fee: state.agreed_fee ?? null,
    billing_period: state.billing_period ?? null,
    actor_admin_id: actorAdminId,
  };
}

/** UI taslağı → API gövdesi (`draft`). Doğrulama SUNUCUDA (validatePaymentDraft) yapılır. */
export function buildPaymentDraftRequestBody(draft: PaymentEditDraft): Record<string, unknown> {
  return {
    status: draft.status,
    lastPaymentDate: draft.lastPaymentDate.trim(),
    nextPaymentDate: draft.nextPaymentDate.trim(),
    paidAmount: draft.paidAmount.trim(),
    note: draft.note,
    agreedFee: draft.agreedFee.trim(),
    billingPeriod: draft.billingPeriod,
  };
}

export function isoToDateInputValue(iso?: string): string {
  if (!iso) return "";
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Kayıtlı ödeme → düzenleme taslağı. Durum OLDUĞU GİBİ taşınır: "Belirtilmemiş" (unknown)
 * artık sessizce "Bekliyor"a çevrilmez (kaydet → istenmeden pending yazılıyordu).
 */
export function paymentSnapshotToEditDraft(payment: PaymentSnapshot): PaymentEditDraft {
  return {
    status: payment.status,
    lastPaymentDate: isoToDateInputValue(payment.lastPaymentAt),
    nextPaymentDate: isoToDateInputValue(payment.nextPaymentAt),
    paidAmount:
      payment.paidAmountRaw != null ? String(payment.paidAmountRaw) : "",
    note: payment.note ?? "",
    agreedFee: payment.agreedFeeRaw != null ? String(payment.agreedFeeRaw) : "",
    billingPeriod: payment.billingPeriod ?? "",
  };
}

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  approvalStatus: ApprovalStatusUi;
  modulePermissions: AdminModulePermissions;
  membership: MembershipSnapshot;
  membershipDisplay: MembershipDisplay;
  payment: PaymentSnapshot;
  licenseSettings: LicenseSettings;
  adminLevel?: string;
  createdAt?: string;
  approvedAt?: string;
};

export function parseAdminModulePermissions(raw: unknown): AdminModulePermissions {
  const perms = { ...DEFAULT_ADMIN_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of ADMIN_MODULE_UI_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  for (const [alias, uiKey] of Object.entries(ADMIN_MODULE_TR_ALIAS_TO_UI)) {
    if (row[alias] === true) perms[uiKey] = true;
  }
  return perms;
}

export function premiumAdminModulePermissions(): AdminModulePermissions {
  return parseAdminModulePermissions(buildPremiumModulePermissionsPayload());
}

export function adminPermissionsToPayload(
  perms: AdminModulePermissions,
): Record<string, boolean> {
  return { ...perms };
}

/**
 * Admin "Modül İzinleri" UI'sının YÖNETTİĞİ anahtar kümesi: registry canonical anahtarlar
 * + bunların Türkçe alias'ları. Bu kümenin DIŞINDaki mevcut izinler kaydederken KORUNUR.
 */
const UI_MANAGED_PERMISSION_KEYS: ReadonlySet<string> = new Set<string>([
  ...ADMIN_MODULE_UI_KEYS,
  ...Object.keys(ADMIN_MODULE_TR_ALIAS_TO_UI),
]);

/**
 * Admin modül-izin kaydı için GÜVENLİ birleştirme (wholesale-overwrite DEĞİL).
 *
 * UI yalnız `ADMIN_MODULE_UI_KEYS`'i (+ alias'larını) yönetir. Kaydederken UI'nın
 * YÖNETMEDİĞİ mevcut izinler — human_design, cosmic_calendar, yasam_hafizasi ve
 * gelecekteki yetenek bayrakları — KORUNMALIDIR; aksi halde tek bir modül toggle'ı kaydı
 * bu izinleri sessizce REVOKE eder (kullanıcı yetkisi/veri bütünlüğü kaybı). UI'nın bildiği
 * alias'lar (danisan_yonetimi vb.) canonical anahtara göç ettiği için DÜŞÜRÜLÜR (mevcut
 * davranış korunur). Sonuç düz boolean map'tir (kolon temiz kalır).
 *
 * @param oldPerms DB'deki mevcut module_permissions (JSONB, güvenilmez tipli)
 * @param uiPayload adminPermissionsToPayload(...) — TÜM registry anahtarları (boolean)
 */
export function mergeAdminModulePermissions(
  oldPerms: unknown,
  uiPayload: Record<string, boolean>,
): Record<string, boolean> {
  const merged: Record<string, boolean> = { ...uiPayload };
  if (oldPerms && typeof oldPerms === "object") {
    for (const [k, v] of Object.entries(oldPerms as Record<string, unknown>)) {
      if (!UI_MANAGED_PERMISSION_KEYS.has(k)) merged[k] = v === true;
    }
  }
  return merged;
}

export function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function mapApprovalStatus(value: unknown): ApprovalStatusUi {
  const s = normalizeApprovalStatus(value);
  if (s === "approved" || s === "rejected") return s;
  return "pending";
}

function parseLocations(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function parseLicenseSettings(row: Record<string, unknown>): LicenseSettings {
  const VALID_LICENSE_TYPES: LicenseType[] = ["single", "professional", "family", "partner", "team", "custom"];
  const VALID_SECURITY_MODES: SecurityMode[] = ["strict", "normal", "flexible"];

  const rawType = String(row.license_type ?? "single").trim();
  const licenseType: LicenseType = VALID_LICENSE_TYPES.includes(rawType as LicenseType)
    ? (rawType as LicenseType)
    : "single";

  const rawMode = String(row.security_mode ?? "normal").trim();
  const securityMode: SecurityMode = VALID_SECURITY_MODES.includes(rawMode as SecurityMode)
    ? (rawMode as SecurityMode)
    : "normal";

  return {
    licenseType,
    // MEM-001: KAYIPSIZ round-trip — -1 (sınırsız) / 0 (kapalı) / N aynen korunur
    // (eski Math.max(1|0, …) -1'i 1/0'a çevirip "Kaydet"te üyeyi cihazlardan kilitliyordu).
    allowedActiveSessions:  limitFromDb(row.allowed_active_sessions),
    allowedLocations:       parseLocations(row.allowed_locations),
    allowedDesktopSessions: limitFromDb(row.allowed_desktop_sessions),
    allowedMobileSessions:  limitFromDb(row.allowed_mobile_sessions),
    allowedTabletSessions:  limitFromDb(row.allowed_tablet_sessions),
    allowedUnknownSessions: limitFromDb(row.allowed_unknown_sessions),
    securityMode,
    securityExempt: row.security_exempt === true,
    licenseNote:    row.license_note != null ? String(row.license_note) : "",
  };
}

/**
 * FAZ 1 / MEM-013 — yeni ürün modeli göstergesi (tek paket):
 *   PAKET: onaylı uzman = Premium (paket seçimi YOK; Deneme/Pro gösterilmez)
 *   HESAP DURUMU: Aktif / Pasif (users.active — pasif üyede "Aktif" çelişkisi yok)
 * Sunucu üyelik kapısı (membershipAccessCore) onaylı uzmanda paket=premium ister; onay RPC'leri
 * premium yazar. Premium OLMAYAN eski onaylı kayıt (legacyPackage) "Premium" diye GÖSTERİLMEZ —
 * gösterge sunucunun gerçek kararıyla aynı ("Paket eksik"; Deneme/Pro dili yok).
 */
export function buildManagedMembershipDisplay(input: {
  role: ManagedUserRole;
  approvalStatus: ApprovalStatusUi;
  active: boolean;
  legacyPackage?: boolean;
}): MembershipDisplay {
  const legacy = input.role === "expert" && input.approvalStatus === "approved" && input.legacyPackage === true;
  const packageLabel =
    input.role === "admin"
      ? "Yönetici"
      : legacy
        ? "Paket eksik (eski kayıt)"
        : input.approvalStatus === "approved"
          ? "Premium"
          : input.approvalStatus === "pending"
            ? "Onay bekliyor"
            : "—";
  return {
    packageLabel,
    statusLabel: input.active ? "Aktif" : "Pasif",
    trialEndLabel: "—",
    remainingDaysLabel: "—",
    durationNote: legacy
      ? "Modül erişimi kapalı — yeniden onay gerekir"
      : input.role === "expert" && input.approvalStatus === "approved"
        ? "Süresiz / yönetici pasife alana kadar"
        : "—",
  };
}

export function mapDbUser(row: Record<string, unknown>): ManagedUser {
  const roleRaw = normalizeRole(row.role);
  const role: ManagedUserRole = roleRaw === "admin" ? "admin" : "expert";
  const id = row.id != null ? String(row.id).trim() : "";
  const fullName = String(row.full_name ?? row.name ?? "").trim();
  const email = String(row.email ?? "").trim();
  const membership = parseMembershipFromRow(row);
  const active = row.active === true;
  const approvalStatus = mapApprovalStatus(row.approval_status);

  return {
    id: id || email,
    fullName: fullName || email || "İsimsiz kullanıcı",
    email,
    role,
    active,
    approvalStatus,
    modulePermissions: parseAdminModulePermissions(row.module_permissions),
    membership,
    membershipDisplay: buildManagedMembershipDisplay({
      role,
      approvalStatus,
      active,
      legacyPackage: role === "expert" && resolveMembershipPackageType(row) !== "premium",
    }),
    payment: parsePaymentFromRow(row),
    licenseSettings: parseLicenseSettings(row),
    adminLevel:
      row.admin_level != null ? String(row.admin_level).trim() : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
    approvedAt: row.approved_at != null ? String(row.approved_at) : undefined,
  };
}

export function rowHasMembershipColumns(row: Record<string, unknown>): boolean {
  return (
    "package_type" in row ||
    "membership_status" in row ||
    "trial_ends_at" in row ||
    "plan" in row
  );
}

export function sortUsersForAdmin(list: ManagedUser[]): ManagedUser[] {
  const order: Record<ApprovalStatusUi, number> = {
    pending: 0,
    approved: 1,
    rejected: 2,
  };
  return [...list].sort((a, b) => {
    const byApproval = order[a.approvalStatus] - order[b.approvalStatus];
    if (byApproval !== 0) return byApproval;
    if (!a.createdAt || !b.createdAt) return 0;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
