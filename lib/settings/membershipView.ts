/**
 * F4 — "Üyeliğim" sekmesi (salt-okunur) SAF durum çözümleyicisi. IO / env / DB / ağ YOK.
 *
 * Kaynaklar (yalnız mevcut uçlar — yeni sözleşme YOK):
 *   - GET /api/auth/profile → oturum sahibinin güvenli profil whitelist'i (PROFILE_USER_SELECT).
 *   - GET /api/trial/status → YALNIZ 7 günlük deneme uzmanında (trial_kind = 'self_7d'): sunucu saatli
 *     faz + günlük Roxy kredi sayacı (DB sayaç okuması; Roxy çağrısı YOK) + açık Pro talebi tarihi.
 *
 * Kurallar koddan doğrulanmıştır (uydurma metin YOK):
 *   - Erişim kuralı lib/auth/membershipAccessCore: admin → tam; uzman → active + approved + package premium.
 *     Tarih alanları (membership_ends_at, trial_ends_at) deneme rejimi dışındaki hesaplarda erişime GİRMEZ.
 *   - 7 günlük deneme (lib/trial/trialCore): aktif pencere → tam; süresi dolmuş / durdurulmuş → salt-okunur
 *     (görüntüleme + dışa aktarma); inceleme / başlamamış → erişim yok. Uzatma yok. Dijital İçerik ailesi kapalı.
 *   - Deneme rejimi dışı hesapta eski trial_* tarihleri (Pro onayında korunan tarihçe) GÖSTERİLMEZ.
 * Pro onayı (admin "Pro Üyeliği Onayla") package_type = 'premium' yazar → kullanıcıya "Pro üyelik" denir.
 */
import {
  isSelfTrialRow,
  resolveTrialPhase,
  type TrialPhase,
} from "@/lib/trial/trialCore";
import { resolveMembershipPackageType } from "@/lib/auth/membershipAccessCore";
import { localeTag } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import trSettingsMembership from "@/messages/tr/settings.membership.json";
import trTrial from "@/messages/tr/trial.json";

/**
 * I18N: görünen metinler katalogdan (settings.membership.* + trial.messages.*). Çözümleyici SAF kalır:
 * çağıran ekran dilindeki çeviriciyi (`useTranslations()` kök) verir; verilmezse kaynak dil (tr) katalog
 * metni kullanılır → Türkçe çıktı bugünküyle birebir (katalog değerleri eski sabitlerin kopyasıdır).
 * `kind` / `tone` dil-bağımsız kalır; kontrol akışı metne bağlanmaz.
 */
export type MembershipTx = (key: string, values?: Record<string, string>) => string;

const TR_SOURCE: Record<string, unknown> = { ...trSettingsMembership, ...trTrial };

/**
 * Kaynak dil (tr) çeviricisi — yalnız düz `{ad}` yer tutucuları (bu katalogda ICU çoğul / seçim yok).
 * Anahtar bulunamazsa HAM ANAHTAR ASLA gösterilmez → boş metin (güvenli yedek; bugün tüm anahtarlar mevcut, testle kilitli).
 */
export const trMembershipTx: MembershipTx = (key, values) => {
  let node: unknown = TR_SOURCE;
  for (const part of key.split(".")) node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  const text = typeof node === "string" ? node : "";
  return values ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m)) : text;
};

export const MEMBERSHIP_TIME_ZONE = "Europe/Istanbul";

export type MembershipViewKind =
  | "admin"
  | "demo"
  | "trial_active"
  | "trial_expired"
  | "trial_suspended"
  | "trial_review"
  | "trial_not_started"
  | "pro_active"
  | "no_package"
  | "pending"
  | "unavailable";

export type MembershipTone = "ok" | "info" | "warn" | "danger" | "muted";

export type MembershipRow = { term: string; value: string; note?: string };

export type MembershipView = {
  kind: MembershipViewKind;
  packageLabel: string;
  statusLabel: string;
  tone: MembershipTone;
  summary: string;
  rows: MembershipRow[];
  /** Yalnız koddan doğrulanmış erişim kuralları. */
  restrictions: string[];
  /** Pro talebi / bilgi için mevcut "Admin ile İrtibat" sekmesine yönlendirme. null → buton yok. */
  contactCta: { label: string; hint: string } | null;
};

/** Sunucu /api/trial/status gövdesinin (trial alanı) kullandığımız alt kümesi. */
export type TrialStatusLite = {
  phase: TrialPhase;
  startedAt: string | null;
  endsAt: string | null;
  serverNow: string | null;
  credits: { dailyLimit: number; usedTotal: number } | null;
  proRequestAt: string | null;
};

export type ProfileFetchState =
  | { status: "ok"; profile: Record<string, unknown> }
  /** 403 + "henüz onaylanmadı" (verifyUserRequest pending/rejected dalı). */
  | { status: "pending" }
  | { status: "error" };

export const NO_END_DATE_TEXT = trMembershipTx("settings.membership.noEndDate");
export const NO_END_DATE_NOTE = trMembershipTx("settings.membership.noEndDateNote");

function parseMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * ISO → Türkiye saatli Türkçe tarih: "11 Kasım 2026, 00:00". Geçersiz / boş → null.
 * formatToParts ile kurulur (ICU ayraç farkları sonucu değiştirmez).
 */
export function formatMembershipDateTime(iso: string | null | undefined, locale: ActiveLocale = DEFAULT_LOCALE): string | null {
  const ms = parseMs(iso);
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: MEMBERSHIP_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase();
}

const M = "settings.membership";
type DateFmt = (iso: string | null | undefined) => string | null;

function trialRows(tx: MembershipTx, fmt: DateFmt, startedAt: string | null, endsAt: string | null, extra: MembershipRow[]): MembershipRow[] {
  const rows: MembershipRow[] = [];
  const s = fmt(startedAt);
  const e = fmt(endsAt);
  if (s) rows.push({ term: tx(`${M}.rows.trialStart`), value: s });
  if (e) rows.push({ term: tx(`${M}.rows.trialEnd`), value: e });
  return [...rows, ...extra];
}

function proRequestRow(tx: MembershipTx, fmt: DateFmt, trial: TrialStatusLite | null): MembershipRow[] {
  if (!trial?.proRequestAt) return [];
  const at = fmt(trial.proRequestAt);
  return [{
    term: tx(`${M}.rows.proRequest`),
    value: at ? tx(`${M}.rows.proRequestReceivedAt`, { at }) : tx(`${M}.rows.proRequestReceived`),
    note: tx(`${M}.rows.proRequestNote`),
  }];
}

/**
 * Ana çözümleyici. `trial` yalnız deneme uzmanında /api/trial/status'tan gelir (sunucu saati önceliklidir);
 * yoksa faz profilden `nowMs` ile çözülür (DB trial_phase_of ile aynı kural).
 */
export function resolveMembershipView(input: {
  profile: ProfileFetchState;
  trial?: TrialStatusLite | null;
  nowMs?: number;
  /** Ekran dilinde çevirici (kök anahtarlar); yoksa kaynak dil (tr). */
  tx?: MembershipTx;
  /** Tarih gösterim dili (yalnız biçim; saat dilimi her zaman Europe/Istanbul). */
  locale?: ActiveLocale;
}): MembershipView {
  const nowMs = input.nowMs ?? Date.now();
  const p = input.profile;
  const tx = input.tx ?? trMembershipTx;
  const fmt: DateFmt = (iso) => formatMembershipDateTime(iso, input.locale ?? DEFAULT_LOCALE);
  const CONTACT_PRO = { label: tx(`${M}.contactPro.label`), hint: tx(`${M}.contactPro.hint`) };
  const CONTACT_INFO = { label: tx(`${M}.contactInfo.label`), hint: tx(`${M}.contactInfo.hint`) };
  const TRIAL_PACKAGE_LABEL = tx(`${M}.views.trial.package`);
  const rule = (k: string) => tx(`${M}.rules.${k}`);

  if (p.status === "pending") {
    return {
      kind: "pending",
      packageLabel: tx(`${M}.views.pending.package`),
      statusLabel: tx(`${M}.views.pending.status`),
      tone: "warn",
      summary: tx(`${M}.views.pending.summary`),
      rows: [],
      restrictions: [rule("pendingClosed")],
      contactCta: null,
    };
  }
  if (p.status === "error") {
    return {
      kind: "unavailable",
      packageLabel: "—",
      statusLabel: tx(`${M}.views.unavailable.status`),
      tone: "muted",
      summary: tx(`${M}.views.unavailable.summary`),
      rows: [],
      restrictions: [],
      contactCta: null,
    };
  }

  const row = p.profile;

  if (str(row.role) === "admin") {
    return {
      kind: "admin",
      packageLabel: tx(`${M}.views.admin.package`),
      statusLabel: tx(`${M}.views.admin.status`),
      tone: "ok",
      summary: tx(`${M}.views.admin.summary`),
      rows: [],
      restrictions: [],
      contactCta: null,
    };
  }

  if (row.is_demo_account === true) {
    return {
      kind: "demo",
      packageLabel: tx(`${M}.views.demo.package`),
      statusLabel: tx(`${M}.views.demo.status`),
      tone: "info",
      summary: tx(`${M}.views.demo.summary`),
      rows: [],
      restrictions: [rule("demoClosed")],
      contactCta: CONTACT_INFO,
    };
  }

  if (isSelfTrialRow(row)) {
    const t = input.trial ?? null;
    const profilePhase = resolveTrialPhase(row, nowMs);
    // Pro'ya geçmiş deneme satırı (converted) → Pro üyelik dalı; aksi halde sunucu fazı önceliklidir.
    const phase: TrialPhase = profilePhase === "converted" ? "converted" : t?.phase ?? profilePhase;
    const startedAt = t?.startedAt ?? (row.trial_started_at == null ? null : String(row.trial_started_at));
    const endsAt = t?.endsAt ?? (row.trial_ends_at == null ? null : String(row.trial_ends_at));

    if (phase === "active") {
      const credit: MembershipRow[] = t?.credits
        ? [{
            term: tx(`${M}.rows.credit`),
            value: `${Math.max(0, t.credits.dailyLimit - t.credits.usedTotal)} / ${t.credits.dailyLimit}`,
            note: tx(`${M}.rows.creditNote`),
          }]
        : [];
      return {
        kind: "trial_active",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: tx(`${M}.views.trial.statusActive`),
        tone: "ok",
        summary: endsAt && fmt(endsAt)
          ? tx(`${M}.views.trial.summaryEndsAt`, { at: fmt(endsAt) ?? "" })
          : tx(`${M}.views.trial.summaryOngoing`),
        rows: trialRows(tx, fmt, startedAt, endsAt, [...credit, ...proRequestRow(tx, fmt, t)]),
        restrictions: [rule("trialDigital"), rule("trialCredit"), rule("trialNoExtend")],
        contactCta: CONTACT_PRO,
      };
    }
    if (phase === "expired" || phase === "suspended") {
      const expired = phase === "expired";
      return {
        kind: expired ? "trial_expired" : "trial_suspended",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: expired ? tx(`${M}.views.trial.statusExpired`) : tx(`${M}.views.trial.statusSuspended`),
        tone: "warn",
        summary: expired ? tx("trial.messages.expired") : tx("trial.messages.suspended"),
        rows: trialRows(tx, fmt, startedAt, endsAt, proRequestRow(tx, fmt, t)),
        restrictions: [rule("readOnlyView"), rule("readOnlyBlock"), rule("recordsKept")],
        contactCta: CONTACT_PRO,
      };
    }
    if (phase === "review") {
      return {
        kind: "trial_review",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: tx(`${M}.views.trial.statusReview`),
        tone: "warn",
        summary: tx("trial.messages.review"),
        rows: proRequestRow(tx, fmt, t),
        restrictions: [rule("reviewClosed")],
        contactCta: CONTACT_INFO,
      };
    }
    if (phase === "not_started") {
      return {
        kind: "trial_not_started",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: tx(`${M}.views.trial.statusNotStarted`),
        tone: "info",
        summary: tx("trial.messages.notStarted"),
        rows: [],
        restrictions: [],
        contactCta: CONTACT_INFO,
      };
    }
    // converted / none → aşağıda normal paket kuralı.
  }

  if (resolveMembershipPackageType(row) === "premium") {
    const rows: MembershipRow[] = [];
    const started = fmt(row.membership_started_at == null ? null : String(row.membership_started_at));
    if (started) rows.push({ term: tx(`${M}.rows.membershipStart`), value: started });
    const endsMs = parseMs(row.membership_ends_at);
    const ends = fmt(row.membership_ends_at == null ? null : String(row.membership_ends_at));
    if (endsMs === null || !ends) {
      rows.push({ term: tx(`${M}.rows.membershipEnd`), value: tx(`${M}.noEndDate`), note: tx(`${M}.noEndDateNote`) });
    } else if (endsMs <= nowMs) {
      rows.push({
        term: tx(`${M}.rows.membershipEnd`),
        value: ends,
        note: tx(`${M}.rows.membershipEndPassedNote`),
      });
    } else {
      rows.push({ term: tx(`${M}.rows.membershipEnd`), value: ends });
    }
    return {
      kind: "pro_active",
      packageLabel: tx(`${M}.views.pro.package`),
      statusLabel: tx(`${M}.views.pro.status`),
      tone: "ok",
      summary: tx(`${M}.views.pro.summary`),
      rows,
      restrictions: [rule("modules")],
      contactCta: CONTACT_INFO,
    };
  }

  return {
    kind: "no_package",
    packageLabel: tx(`${M}.views.noPackage.package`),
    statusLabel: tx(`${M}.views.noPackage.status`),
    tone: "danger",
    summary: tx(`${M}.views.noPackage.summary`),
    rows: [],
    restrictions: [rule("noPackageClosed")],
    contactCta: CONTACT_PRO,
  };
}

/** /api/auth/profile yanıtını ProfileFetchState'e çevirir (403 "onaylanmadı" → pending). */
export function profileStateFromResponse(status: number, body: unknown): ProfileFetchState {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 200 && b.ok === true && b.profile && typeof b.profile === "object") {
    return { status: "ok", profile: b.profile as Record<string, unknown> };
  }
  // i18n-ignore: lib/auth/userGuard'ın dil-bağımsız kodu olmayan (çevrilmeyen) Türkçe 403 metniyle eşleşme — KOORDİNATÖR İSTEĞİ: kod eklenmeli.
  if (status === 403 && typeof b.error === "string" && b.error.includes("onaylanmadı")) return { status: "pending" };
  return { status: "error" };
}
