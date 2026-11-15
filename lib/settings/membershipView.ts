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
  TRIAL_MESSAGES,
  type TrialPhase,
} from "@/lib/trial/trialCore";
import { resolveMembershipPackageType } from "@/lib/auth/membershipAccessCore";

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

export const NO_END_DATE_TEXT = "Bitiş tarihi tanımlı değil";
export const NO_END_DATE_NOTE = "Üyelik süresi ayrıntısı için yöneticinizle iletişime geçin.";

function parseMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * ISO → Türkiye saatli Türkçe tarih: "11 Kasım 2026, 00:00". Geçersiz / boş → null.
 * formatToParts ile kurulur (ICU ayraç farkları sonucu değiştirmez).
 */
export function formatMembershipDateTime(iso: string | null | undefined): string | null {
  const ms = parseMs(iso);
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", {
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

const CONTACT_PRO = {
  label: "Pro üyelik talebi",
  hint: "Talebiniz “Admin ile İrtibat” sekmesinden yöneticinize iletilir; üyelik yönetici onayıyla açılır.",
} as const;

const CONTACT_INFO = {
  label: "Yöneticiyle iletişime geç",
  hint: "Mesajınız “Admin ile İrtibat” sekmesinden yöneticinize iletilir.",
} as const;

const TRIAL_PACKAGE_LABEL = "Ücretsiz deneme (7 gün)";

const R_TRIAL_DIGITAL =
  "Dijital İçerik ve alt modülleri (Kişisel Arşiv, Belge Çeviri, Video Çeviri, Ders Notu) ile Yaşam Hafızası deneme paketine dahil değildir.";
const R_TRIAL_CREDIT =
  "Gökyüzü Atlası, Human Design ve Numeroloji'deki Roxy hesaplamaları günlük ortak krediyle sınırlıdır; kredi Türkiye saatiyle 00.00'da yenilenir.";
const R_TRIAL_NO_EXTEND = "Deneme süresi uzatılamaz ve yeniden başlatılamaz.";
const R_READ_ONLY_VIEW = "Kayıtlarınızı görüntüleyebilir ve dışa aktarabilirsiniz.";
const R_READ_ONLY_BLOCK = "Yeni kayıt, düzenleme, silme ve yeni hesaplama yapılamaz.";
const R_RECORDS_KEPT = "Pro üyeliğe geçişte danışan ve analiz kayıtlarınız korunur.";
const R_MODULES = "Modül erişiminiz, yöneticinizin hesabınız için açtığı modüllerle sınırlıdır.";

function trialRows(
  startedAt: string | null,
  endsAt: string | null,
  extra: MembershipRow[],
): MembershipRow[] {
  const rows: MembershipRow[] = [];
  const s = formatMembershipDateTime(startedAt);
  const e = formatMembershipDateTime(endsAt);
  if (s) rows.push({ term: "Deneme başlangıcı", value: s });
  if (e) rows.push({ term: "Deneme bitişi", value: e });
  return [...rows, ...extra];
}

function proRequestRow(trial: TrialStatusLite | null): MembershipRow[] {
  if (!trial?.proRequestAt) return [];
  const at = formatMembershipDateTime(trial.proRequestAt);
  return [{ term: "Pro üyelik talebi", value: at ? `Alındı · ${at}` : "Alındı", note: "Yöneticiniz talebinizi değerlendirecektir." }];
}

/**
 * Ana çözümleyici. `trial` yalnız deneme uzmanında /api/trial/status'tan gelir (sunucu saati önceliklidir);
 * yoksa faz profilden `nowMs` ile çözülür (DB trial_phase_of ile aynı kural).
 */
export function resolveMembershipView(input: {
  profile: ProfileFetchState;
  trial?: TrialStatusLite | null;
  nowMs?: number;
}): MembershipView {
  const nowMs = input.nowMs ?? Date.now();
  const p = input.profile;

  if (p.status === "pending") {
    return {
      kind: "pending",
      packageLabel: "Onay bekliyor",
      statusLabel: "Onay bekliyor",
      tone: "warn",
      summary: "Hesabınız yönetici onayı bekliyor. Onaylandığında paket ve üyelik bilgileriniz burada görünür.",
      rows: [],
      restrictions: ["Onay tamamlanana kadar modüllere erişim kapalıdır."],
      contactCta: null,
    };
  }
  if (p.status === "error") {
    return {
      kind: "unavailable",
      packageLabel: "—",
      statusLabel: "Bilgi alınamadı",
      tone: "muted",
      summary: "Üyelik bilgileriniz şu anda alınamadı. Sayfayı yenileyip tekrar deneyin.",
      rows: [],
      restrictions: [],
      contactCta: null,
    };
  }

  const row = p.profile;

  if (str(row.role) === "admin") {
    return {
      kind: "admin",
      packageLabel: "Yönetici",
      statusLabel: "Aktif",
      tone: "ok",
      summary: "Yönetici hesabı üyelik paketine bağlı değildir; paket ve deneme kuralları bu hesaba uygulanmaz.",
      rows: [],
      restrictions: [],
      contactCta: null,
    };
  }

  if (row.is_demo_account === true) {
    return {
      kind: "demo",
      packageLabel: "Demo hesabı",
      statusLabel: "Tanıtım hesabı",
      tone: "info",
      summary:
        "Bu, sistemi tanımanız için açılmış ortak bir demo hesabıdır; kişisel bir üyelik paketi değildir. Kendi üyeliğiniz için yöneticiyle iletişime geçebilirsiniz.",
      rows: [],
      restrictions: ["Demo hesabında yedekleme, geri yükleme, dışa aktarma ve parola değiştirme işlemleri kapalıdır."],
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
            term: "Bugünkü Roxy krediniz",
            value: `${Math.max(0, t.credits.dailyLimit - t.credits.usedTotal)} / ${t.credits.dailyLimit}`,
            note: "Kalan / günlük ortak kredi. Türkiye saatiyle 00.00'da yenilenir.",
          }]
        : [];
      return {
        kind: "trial_active",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: "Deneme sürüyor",
        tone: "ok",
        summary: endsAt && formatMembershipDateTime(endsAt)
          ? `Ücretsiz deneme süreniz ${formatMembershipDateTime(endsAt)} tarihinde sona erer.`
          : "Ücretsiz deneme süreniz devam ediyor.",
        rows: trialRows(startedAt, endsAt, [...credit, ...proRequestRow(t)]),
        restrictions: [R_TRIAL_DIGITAL, R_TRIAL_CREDIT, R_TRIAL_NO_EXTEND],
        contactCta: CONTACT_PRO,
      };
    }
    if (phase === "expired" || phase === "suspended") {
      const expired = phase === "expired";
      return {
        kind: expired ? "trial_expired" : "trial_suspended",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: expired ? "Deneme sona erdi · salt okunur" : "Deneme durduruldu · salt okunur",
        tone: "warn",
        summary: expired ? TRIAL_MESSAGES.expired : TRIAL_MESSAGES.suspended,
        rows: trialRows(startedAt, endsAt, proRequestRow(t)),
        restrictions: [R_READ_ONLY_VIEW, R_READ_ONLY_BLOCK, R_RECORDS_KEPT],
        contactCta: CONTACT_PRO,
      };
    }
    if (phase === "review") {
      return {
        kind: "trial_review",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: "İncelemede",
        tone: "warn",
        summary: TRIAL_MESSAGES.review,
        rows: proRequestRow(t),
        restrictions: ["İnceleme tamamlanana kadar modüllere erişim kapalıdır."],
        contactCta: CONTACT_INFO,
      };
    }
    if (phase === "not_started") {
      return {
        kind: "trial_not_started",
        packageLabel: TRIAL_PACKAGE_LABEL,
        statusLabel: "Deneme başlamadı",
        tone: "info",
        summary: TRIAL_MESSAGES.notStarted,
        rows: [],
        restrictions: [],
        contactCta: CONTACT_INFO,
      };
    }
    // converted / none → aşağıda normal paket kuralı.
  }

  if (resolveMembershipPackageType(row) === "premium") {
    const rows: MembershipRow[] = [];
    const started = formatMembershipDateTime(row.membership_started_at == null ? null : String(row.membership_started_at));
    if (started) rows.push({ term: "Üyelik başlangıcı", value: started });
    const endsMs = parseMs(row.membership_ends_at);
    const ends = formatMembershipDateTime(row.membership_ends_at == null ? null : String(row.membership_ends_at));
    if (endsMs === null || !ends) {
      rows.push({ term: "Üyelik bitişi", value: NO_END_DATE_TEXT, note: NO_END_DATE_NOTE });
    } else if (endsMs <= nowMs) {
      rows.push({
        term: "Üyelik bitişi",
        value: ends,
        note: "Kayıtlı bitiş tarihi geçmiş görünüyor. Hesabınız şu an aktif; üyelik süresi için yöneticinizle iletişime geçin.",
      });
    } else {
      rows.push({ term: "Üyelik bitişi", value: ends });
    }
    return {
      kind: "pro_active",
      packageLabel: "Pro üyelik",
      statusLabel: "Aktif",
      tone: "ok",
      summary: "Pro üyeliğiniz aktif. Üyelik ayrıntıları yöneticiniz tarafından yönetilir.",
      rows,
      restrictions: [R_MODULES],
      contactCta: CONTACT_INFO,
    };
  }

  return {
    kind: "no_package",
    packageLabel: "Paket tanımlı değil",
    statusLabel: "Erişim kapalı",
    tone: "danger",
    summary: "Hesabınız için tanımlı bir üyelik paketi bulunmuyor; bu nedenle modüllere erişim kapalıdır.",
    rows: [],
    restrictions: ["Paket tanımlanana kadar modüllere erişim kapalıdır."],
    contactCta: CONTACT_PRO,
  };
}

/** /api/auth/profile yanıtını ProfileFetchState'e çevirir (403 "onaylanmadı" → pending). */
export function profileStateFromResponse(status: number, body: unknown): ProfileFetchState {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 200 && b.ok === true && b.profile && typeof b.profile === "object") {
    return { status: "ok", profile: b.profile as Record<string, unknown> };
  }
  if (status === 403 && typeof b.error === "string" && b.error.includes("onaylanmadı")) return { status: "pending" };
  return { status: "error" };
}
