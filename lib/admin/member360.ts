/**
 * ÜYE YÖNETİMİ 360° — SAF yardımcılar (liste satırı, yönetim özeti, dikkat nedenleri).
 *
 * ÖLÇÜM DÜRÜSTLÜĞÜ (BAĞLAYICI):
 *   - Aktivite yalnız Usage360 gerçek etkileşim rollup'ından (usage_daily) gelir;
 *     user_sessions.last_seen_at KULLANILMAZ.
 *   - Ölçüm başlangıcından önceki süre için tahmin YOK. Kapsam dolmadıysa sayı yerine
 *     "N günlük ölçüm süresi henüz tamamlanmadı · ölçüm X gündür açık" yazılır (sahte 0 YOK).
 *   - Gizli/opak "sağlık puanı" YOK: dikkat nedeni her zaman açık bir cümledir.
 */
import { daysBetweenIso, isValidIsoDate } from "@/lib/admin/memberCommercial";

/**
 * Ödeme tarihini İstanbul takvim gününe (YYYY-MM-DD) normalize eder. Düz "YYYY-MM-DD" aynen kalır;
 * saatli değer (eski timestamptz kolonu / sürücü serileştirmesi) İstanbul gününe çevrilir — böylece
 * "21.09" / "22 Eylül" gibi gün kayması oluşmaz. Geçersiz → null.
 */
export function paymentDayIso(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidIsoDate(s) ? s : null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type MemberActivityState = "today" | "d7" | "d30" | "idle30" | "idle60" | "idle90" | "unmeasured";

const ACTIVITY_STATES: readonly MemberActivityState[] = ["today", "d7", "d30", "idle30", "idle60", "idle90", "unmeasured"];

export type MemberActivity = {
  /** null = izlenmeyen satır (yönetici / demo) */
  state: MemberActivityState | null;
  isDemo: boolean;
  lastActivityAt: string | null;
  daysSince: number | null;
  /** Hiç aktivitesi yoksa bilinen hareketsizlik alt sınırı (gün) */
  idleLowerBound: number | null;
  d7ActiveDays: number | null;
  d30ActiveDays: number | null;
};

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** admin_list_users satırından aktivite alanları (eski RPC → hepsi null; kırılmaz). */
export function parseMemberActivity(row: Record<string, unknown>): MemberActivity {
  const st = typeof row.activity_state === "string" && (ACTIVITY_STATES as readonly string[]).includes(row.activity_state)
    ? (row.activity_state as MemberActivityState)
    : null;
  return {
    state: st,
    isDemo: row.is_demo_account === true,
    lastActivityAt: row.last_activity == null ? null : String(row.last_activity),
    daysSince: intOrNull(row.days_since_activity),
    idleLowerBound: intOrNull(row.idle_days_lower_bound),
    d7ActiveDays: intOrNull(row.d7_active_days),
    d30ActiveDays: intOrNull(row.d30_active_days),
  };
}

export type MemberMeasurement = { start: string | null; today: string | null; measuredDays: number | null };

export function parseMeasurement(raw: unknown): MemberMeasurement {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const start = typeof r.start === "string" && isValidIsoDate(r.start.slice(0, 10)) ? r.start.slice(0, 10) : null;
  const today = typeof r.today === "string" && isValidIsoDate(r.today.slice(0, 10)) ? r.today.slice(0, 10) : null;
  return { start, today, measuredDays: start ? intOrNull(r.measured_days ?? r.measuredDays) : null };
}

/** "3 gün önce" / "bugün" / "dün" */
export function relativeDaysLabel(days: number): string {
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  return `${days} gün önce`;
}

/** Liste satırı "Son gerçek aktivite" metni. */
export function activitySummaryLabel(a: MemberActivity): string {
  if (a.state === null) return "";
  if (a.daysSince !== null) return `Son aktivite: ${relativeDaysLabel(a.daysSince)}`;
  if (a.state === "unmeasured") return "Ölçüm henüz yeterli değil";
  if (a.idleLowerBound !== null) return `Ölçüm başından beri aktivite yok (en az ${a.idleLowerBound} gün)`;
  return "Ölçüm henüz yeterli değil";
}

export type AttentionReason = { kind: "payment_overdue" | "idle" | "payment_soon" | "security" | "pending"; text: string; tone: "rose" | "amber" };

/**
 * Açık ve anlaşılır "Dikkat" nedenleri (en fazla 2; önem sırasıyla). Skor YOK.
 *   1) Ödeme gecikmiş   2) 30+ gün kullanılmıyor   3) Ödeme ≤7 gün   4) Güvenlik uyarısı   5) Onay bekliyor
 * Ödeme nedenleri yalnız onaylı + aktif + muaf olmayan uzmanda (liste p_due ile aynı küme).
 */
export function attentionReasons(input: {
  role: string;
  approvalStatus: string;
  active: boolean;
  paymentStatus: string;
  nextPaymentDate: string | null | undefined;
  activity: MemberActivity;
  securityAlerts: number;
  todayIso: string;
}): AttentionReason[] {
  const out: AttentionReason[] = [];
  const isExpert = input.role === "expert";
  const billable = isExpert && input.approvalStatus === "approved" && input.active && input.paymentStatus !== "exempt";
  const npd = paymentDayIso(input.nextPaymentDate) ?? "";
  const due = billable && isValidIsoDate(npd) && isValidIsoDate(input.todayIso) ? daysBetweenIso(input.todayIso, npd) : null;

  if (due !== null && due < 0) out.push({ kind: "payment_overdue", text: `Ödeme ${-due} gün gecikmiş`, tone: "rose" });
  if (isExpert && input.active && input.approvalStatus === "approved") {
    const a = input.activity;
    if (a.daysSince !== null && a.daysSince >= 30) {
      out.push({ kind: "idle", text: `${a.daysSince} gündür kullanılmıyor`, tone: "amber" });
    } else if (a.daysSince === null && a.idleLowerBound !== null && a.idleLowerBound >= 30 && a.state !== "unmeasured") {
      out.push({ kind: "idle", text: `En az ${a.idleLowerBound} gündür kullanılmıyor`, tone: "amber" });
    }
  }
  if (due !== null && due >= 0 && due <= 7) {
    out.push({ kind: "payment_soon", text: due === 0 ? "Ödeme bugün" : `Ödeme ${due} gün içinde`, tone: "amber" });
  }
  if (input.securityAlerts > 0) {
    out.push({ kind: "security", text: `${input.securityAlerts} güvenlik uyarısı`, tone: input.securityAlerts >= 3 ? "rose" : "amber" });
  }
  if (isExpert && input.approvalStatus === "pending") out.push({ kind: "pending", text: "Onay bekliyor", tone: "amber" });
  return out.slice(0, 2);
}

// ── Yönetim Özeti ────────────────────────────────────────────────────────────────

export type MemberOverview = {
  today: string | null;
  measurement: { start: string | null; measuredDays: number | null };
  denominator: number;
  active7: number | null;
  active30: number | null;
  coverage7: "none" | "partial" | "full";
  coverage30: "none" | "partial" | "full";
  idle30: number | null;
  idle60: number | null;
  idle90: number | null;
  unmeasured: number | null;
  paymentOverdue: number;
  paymentDue7: number;
  paymentDue30: number;
  pending: number;
  securityAlerts: number;
};

const cov = (v: unknown): "none" | "partial" | "full" => (v === "full" || v === "partial" ? v : "none");
const n0 = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0));

export function parseMemberOverview(raw: unknown): MemberOverview {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = (r.measurement && typeof r.measurement === "object" ? r.measurement : {}) as Record<string, unknown>;
  const start = typeof m.start === "string" ? m.start.slice(0, 10) : null;
  return {
    today: typeof r.today === "string" ? r.today.slice(0, 10) : null,
    measurement: { start, measuredDays: start ? intOrNull(m.measured_days) : null },
    denominator: n0(r.denominator),
    active7: intOrNull(r.active7),
    active30: intOrNull(r.active30),
    coverage7: cov(r.coverage7),
    coverage30: cov(r.coverage30),
    idle30: intOrNull(r.idle30),
    idle60: intOrNull(r.idle60),
    idle90: intOrNull(r.idle90),
    unmeasured: intOrNull(r.unmeasured),
    paymentOverdue: n0(r.payment_overdue),
    paymentDue7: n0(r.payment_due7),
    paymentDue30: n0(r.payment_due30),
    pending: n0(r.pending),
    securityAlerts: n0(r.security_alerts),
  };
}

export type OverviewCardValue =
  | { kind: "value"; value: number; ratio: string | null; note: string | null }
  | { kind: "unavailable"; note: string };

function measuredNote(days: number | null): string {
  if (days === null) return "Kullanım ölçümü henüz başlamadı";
  return `ölçüm ${days} gündür açık`;
}

/** Yüzde (tam sayı, tr-TR "%42"). Payda 0 → null. */
export function ratioLabel(value: number, denominator: number): string | null {
  if (denominator <= 0) return null;
  return `%${Math.round((value / denominator) * 100)}`;
}

/** "Son N günde aktif" kartı (oran + kapsam notu). */
export function activeCard(o: MemberOverview, window: 7 | 30): OverviewCardValue {
  const value = window === 7 ? o.active7 : o.active30;
  const coverage = window === 7 ? o.coverage7 : o.coverage30;
  if (value === null || coverage === "none") return { kind: "unavailable", note: measuredNote(o.measurement.measuredDays) };
  return {
    kind: "value",
    value,
    ratio: ratioLabel(value, o.denominator),
    note: coverage === "partial"
      ? `Kısmi ölçüm: ${window} günün yalnız ${o.measurement.measuredDays ?? 0} günü ölçüldü`
      : `${o.denominator} aktif uzmandan`,
  };
}

/** "N+ gündür aktivitesi olmayan" kartı — kapsam dolmadıysa sayı YOK. */
export function idleCard(o: MemberOverview, threshold: 30 | 60 | 90): OverviewCardValue {
  const value = threshold === 30 ? o.idle30 : threshold === 60 ? o.idle60 : o.idle90;
  if (value === null) {
    return {
      kind: "unavailable",
      note: o.measurement.measuredDays === null
        ? "Kullanım ölçümü henüz başlamadı"
        : `${threshold} günlük ölçüm süresi henüz tamamlanmadı · ölçüm ${o.measurement.measuredDays} gündür açık`,
    };
  }
  return { kind: "value", value, ratio: ratioLabel(value, o.denominator), note: `${o.denominator} aktif uzmandan` };
}

/** Ödeme/yenileme kovası (liste p_due ile aynı sınırlar). */
export function dueBucket(nextPaymentDate: string | null | undefined, todayIso: string):
  "overdue" | "d0_7" | "d8_30" | "d31_60" | "d61_90" | "d90p" | "no_date" {
  const npd = paymentDayIso(nextPaymentDate) ?? "";
  if (!isValidIsoDate(npd) || !isValidIsoDate(todayIso)) return "no_date";
  const d = daysBetweenIso(todayIso, npd);
  if (d < 0) return "overdue";
  if (d <= 7) return "d0_7";
  if (d <= 30) return "d8_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "d90p";
}

/** "12 gün kaldı" / "Bugün" / "5 gün geçti" */
export function dueDistanceLabel(nextPaymentDate: string | null | undefined, todayIso: string): string | null {
  const npd = paymentDayIso(nextPaymentDate) ?? "";
  if (!isValidIsoDate(npd) || !isValidIsoDate(todayIso)) return null;
  const d = daysBetweenIso(todayIso, npd);
  if (d === 0) return "Bugün";
  return d > 0 ? `${d} gün kaldı` : `${-d} gün geçti`;
}

// ── Yönetim geçmişi (admin_audit_log → güvenli etiket; payload GÖSTERİLMEZ) ─────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  user_created: "Hesap oluşturuldu",
  user_activated: "Hesap aktifleştirildi",
  user_deactivated: "Hesap pasife alındı",
  user_approved: "Başvuru onaylandı",
  user_rejected: "Başvuru reddedildi",
  user_archived: "Pasife alındı ve arşivlendi",
  user_deleted: "Hesap silindi",
  password_changed_by_admin: "Parola yönetici tarafından değiştirildi",
  all_sessions_terminated: "Tüm oturumlar sonlandırıldı",
  single_session_terminated: "Bir oturum sonlandırıldı",
  own_session_terminated: "Kendi oturumu sonlandırıldı",
  desktop_limit_changed: "Masaüstü oturum limiti değişti",
  mobile_limit_changed: "Mobil oturum limiti değişti",
  tablet_limit_changed: "Tablet oturum limiti değişti",
  total_session_limit_changed: "Toplam oturum limiti değişti",
  license_settings_changed: "Lisans / oturum ayarları değişti",
  security_exempt_changed: "Güvenlik istisnası değişti",
  module_enabled: "Modül erişimi açıldı",
  module_disabled: "Modül erişimi kapatıldı",
  payment_status_changed: "Ödeme kaydı güncellendi",
  pricing_phase_changed: "Ticari fiyat dönemi değişti",
  role_changed: "Rol değişti",
  user_profile_updated: "Profil bilgileri güncellendi",
  workspace_viewed: "Çalışma alanı görüntülendi",
  main_admin_critical_action: "Ana yönetici kritik işlemi",
  library_transfer_completed: "Kütüphane aktarımı tamamlandı",
  library_transfer_failed: "Kütüphane aktarımı başarısız",
  library_transfer_retried: "Kütüphane aktarımı yeniden denendi",
  admin_web_login_pending: "Web girişi onaya düştü",
  admin_web_login_approved: "Web girişi onaylandı",
  admin_web_login_denied: "Web girişi reddedildi",
  admin_mobile_login_rejected: "Mobil giriş reddedildi",
};

export type AuditCategory = "approval" | "account" | "modules" | "commercial" | "security" | "profile" | "other";

export const AUDIT_CATEGORY: Record<string, AuditCategory> = {
  user_approved: "approval", user_rejected: "approval",
  user_created: "account", user_activated: "account", user_deactivated: "account", user_archived: "account", user_deleted: "account",
  module_enabled: "modules", module_disabled: "modules",
  payment_status_changed: "commercial", pricing_phase_changed: "commercial",
  password_changed_by_admin: "security", all_sessions_terminated: "security", single_session_terminated: "security",
  own_session_terminated: "security", desktop_limit_changed: "security", mobile_limit_changed: "security",
  tablet_limit_changed: "security", total_session_limit_changed: "security", license_settings_changed: "security",
  security_exempt_changed: "security", admin_web_login_pending: "security", admin_web_login_approved: "security",
  admin_web_login_denied: "security", admin_mobile_login_rejected: "security",
  user_profile_updated: "profile", role_changed: "profile",
};

const PRICING_OP_LABEL: Record<string, string> = { created: "eklendi", updated: "güncellendi", deleted: "silindi" };
const PAYMENT_FIELD_LABEL: Record<string, string> = {
  payment_status: "durum", last_payment_date: "son ödeme", next_payment_date: "yenileme", paid_amount: "tutar",
  payment_note: "not", agreed_fee: "ücret", billing_period: "dönem",
};
const PRICING_FIELD_LABEL: Record<string, string> = {
  starts_on: "başlangıç", ends_on: "bitiş", amount: "tutar", billing_period: "dönem", label: "etiket", terms_note: "not",
};

/**
 * Audit satırı → güvenli zaman çizelgesi metni. YALNIZ allowlist'li enum/alan ADLARI kullanılır;
 * old/new değerleri, tutar, not, e-posta vb. ASLA gösterilmez.
 */
export function auditTimelineText(row: { action: string; context?: unknown }, moduleLabel: (key: string) => string | null): string {
  const base = AUDIT_ACTION_LABELS[row.action] ?? "Yönetim işlemi";
  const ctx = (row.context && typeof row.context === "object" ? row.context : {}) as Record<string, unknown>;
  if (row.action === "pricing_phase_changed") {
    const op = typeof ctx.op === "string" ? PRICING_OP_LABEL[ctx.op] : undefined;
    const fields = Array.isArray(ctx.fields) ? ctx.fields.map((f) => PRICING_FIELD_LABEL[String(f)]).filter(Boolean) : [];
    if (!op) return base;
    return ctx.op === "updated" && fields.length ? `Ticari fiyat dönemi güncellendi (${fields.join(", ")})` : `Ticari fiyat dönemi ${op}`;
  }
  if (row.action === "payment_status_changed") {
    const fields = Array.isArray(ctx.fields) ? ctx.fields.map((f) => PAYMENT_FIELD_LABEL[String(f)]).filter(Boolean) : [];
    return fields.length ? `${base} (${fields.join(", ")})` : base;
  }
  if (row.action === "module_enabled" || row.action === "module_disabled") {
    // context.modules: string[] (20270129235900 admin_set_module_permissions) — yalnız bilinen anahtarlar etiketlenir.
    const keys = Array.isArray(ctx.modules) ? ctx.modules.map(String) : [];
    const labels = keys.map((k) => moduleLabel(k)).filter((l): l is string => Boolean(l));
    return labels.length ? `${base}: ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? "…" : ""}` : base;
  }
  return base;
}

// ── Üye detayı · Kullanım (mevcut Usage360 detay ucunun yanıtından türetilir) ──────────

export type MemberUsageSummary = {
  measurementStart: string | null;
  /** Son 30 günün kaç günü ölçüm kapsamında (0..30) — null: ölçüm başlamadı */
  measuredDaysIn30: number | null;
  coverage7: "none" | "partial" | "full";
  coverage30: "none" | "partial" | "full";
  lastActivityAt: string | null;
  d7ActiveDays: number;
  d30ActiveDays: number;
  visits30: number;
  activeSeconds30: number;
  actions30: number;
  modulesUsed: { key: string; label: string; actions: number; opened: boolean }[];
  allowedNeverOpened: number;
  channels: { channel: string; visits: number; pct: number }[];
};

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function coverageFor(mstart: string | null, from: string, to: string): "none" | "partial" | "full" {
  if (!mstart || to < mstart) return "none";
  return from < mstart ? "partial" : "full";
}

/**
 * Usage360 detay yanıtı (son 30 gün) → üye detayı özeti. Aktif gün = rollup'ta satırı olan TR günü
 * (gerçek etkileşim). Ölçüm başlangıcından önceki günler "kullanılmadı" SAYILMAZ (kapsam döner).
 */
export function summarizeMemberUsage(data: {
  today: string;
  measurementStart: string | null;
  account: { lastActivityAt: string | null };
  totals: { visits: number; activeSeconds: number; actions: number };
  daily: { day: string }[];
  modules: { module: string; label: string; allowed: boolean; status: string; actions: number }[];
  channels: { channel: string; visits: number }[];
}): MemberUsageSummary {
  const today = data.today;
  const from30 = addDaysIso(today, -29);
  const from7 = addDaysIso(today, -6);
  const ms = data.measurementStart;
  const measuredDaysIn30 = !ms ? null : ms <= from30 ? 30 : ms > today ? 0 : daysBetweenIso(ms, today) + 1;
  const days = new Set(data.daily.map((d) => d.day));
  const totalVisits = data.channels.reduce((a, c) => a + c.visits, 0);
  return {
    measurementStart: ms,
    measuredDaysIn30,
    coverage7: coverageFor(ms, from7, today),
    coverage30: coverageFor(ms, from30, today),
    lastActivityAt: data.account.lastActivityAt,
    d7ActiveDays: [...days].filter((d) => d >= from7 && d <= today).length,
    d30ActiveDays: [...days].filter((d) => d >= from30 && d <= today).length,
    visits30: data.totals.visits,
    activeSeconds30: data.totals.activeSeconds,
    actions30: data.totals.actions,
    modulesUsed: data.modules
      .filter((m) => m.status === "actioned" || m.status === "opened_only")
      .map((m) => ({ key: m.module, label: m.label, actions: m.actions, opened: true }))
      .sort((a, b) => b.actions - a.actions || a.label.localeCompare(b.label, "tr")),
    allowedNeverOpened: data.modules.filter((m) => m.allowed && m.status === "never_opened").length,
    channels: data.channels
      .filter((c) => c.visits > 0)
      .sort((a, b) => b.visits - a.visits)
      .map((c) => ({ channel: c.channel, visits: c.visits, pct: totalVisits > 0 ? Math.round((c.visits / totalVisits) * 100) : 0 })),
  };
}
