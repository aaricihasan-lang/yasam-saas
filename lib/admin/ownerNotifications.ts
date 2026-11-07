/**
 * Owner bildirim zili — ortak tipler, metinler ve doğrulama (sunucu + istemci; IO yok).
 *
 * İki sınıf (migration 20280101000400_admin_owner_notifications):
 *   action (Karar bekleyen) — yalnız kaynak işlem sonuçlanınca kapanır; okundu işareti onu kapatmaz.
 *   info   (Bilgi)          — okununca okunmuş olur.
 * Bildirimlerde ad / e-posta saklanmaz; okuma anında users tablosundan gelir. Danışan, analiz veya
 * sağlık verisi hiçbir zaman bildirime yazılmaz.
 */

export type OwnerNotificationKind = "info" | "action";
export type OwnerNotificationType =
  | "basvuru"
  | "pro_talebi"
  | "inceleme"
  | "eski_kayit"
  | "odeme"
  | "deneme_basladi"
  | "deneme_bitti";

export type OwnerNotificationItem = {
  id: number;
  type: OwnerNotificationType;
  target_user_id: string | null;
  full_name: string | null;
  email: string | null;
  occurred_at: string;
  read?: boolean;
};

export type OwnerNotificationFeed = {
  actions: OwnerNotificationItem[];
  infos: OwnerNotificationItem[];
  counts: { action: number; unread_info: number };
  server_now: string;
};

export type OwnerNotificationHistoryRow = OwnerNotificationItem & {
  kind: OwnerNotificationKind;
  resolved_at: string | null;
  resolution: string | null;
};

export const OWNER_NOTIFICATION_TYPES: readonly OwnerNotificationType[] = [
  "basvuru",
  "pro_talebi",
  "inceleme",
  "eski_kayit",
  "odeme",
  "deneme_basladi",
  "deneme_bitti",
];

/** Bildirim başlığı (ad okuma anında eklenir). */
export const OWNER_NOTIFICATION_TITLE: Record<OwnerNotificationType, string> = {
  basvuru: "yeni başvuru — onay bekliyor",
  pro_talebi: "Pro üyelik talebi",
  inceleme: "şüpheli hesap incelemesi",
  eski_kayit: "eski kayıt — paket eksik",
  odeme: "ödeme “Gecikti” olarak işaretli",
  deneme_basladi: "7 günlük denemeye başladı",
  deneme_bitti: "deneme süresi doldu — kayıtları korunuyor",
};

/** Karar satırının alt açıklaması ve düğme metni. */
export const OWNER_ACTION_HINT: Partial<Record<OwnerNotificationType, { sub: string; go: string }>> = {
  basvuru: { sub: "Deneme veya Pro kararı bekliyor", go: "Karar ver" },
  pro_talebi: { sub: "Ödeme doğrulanmadan Pro açılmaz", go: "Talebi incele" },
  inceleme: { sub: "Risk işareti olan deneme hesabı", go: "İncele" },
  eski_kayit: { sub: "Modüllere erişemiyor; owner kararı gerekir", go: "İncele" },
  odeme: { sub: "Ödeme kaydını kontrol edin", go: "Kontrol et" },
};

export const OWNER_NOTIFICATION_TYPE_LABEL: Record<OwnerNotificationType, string> = {
  basvuru: "Başvuru",
  pro_talebi: "Pro talebi",
  inceleme: "Şüpheli hesap",
  eski_kayit: "Eski kayıt",
  odeme: "Ödeme",
  deneme_basladi: "Deneme başladı",
  deneme_bitti: "Deneme bitti",
};

export const OWNER_NOTIFICATION_RESOLUTION_LABEL: Record<string, string> = {
  deneme_onaylandi: "denemeye onaylandı",
  pro_onaylandi: "Pro onaylandı",
  reddedildi: "reddedildi",
  pro_gecirildi: "Pro'ya geçirildi",
  talep_kapatildi: "talep kapatıldı",
  inceleme_kaldirildi: "inceleme kaldırıldı",
  deneme_durduruldu: "deneme durduruldu",
  pasife_alindi: "hesap pasife alındı",
  odeme_durumu_guncellendi: "ödeme durumu güncellendi",
  kayit_silindi: "kayıt silindi",
  kapandi: "kapandı",
};

export const OWNER_HISTORY_STATUSES = ["all", "open", "resolved", "unread", "read"] as const;
export type OwnerHistoryStatus = (typeof OWNER_HISTORY_STATUSES)[number];

export type OwnerHistoryQuery = {
  q: string;
  type: "all" | OwnerNotificationType;
  status: OwnerHistoryStatus;
  from: string | null;
  to: string | null;
  page: number;
};

export const OWNER_HISTORY_PAGE_SIZE = 25;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD biçiminde VE takvimde gerçekten var olan gün (2026-13-40 / 2026-02-30 → false). */
function isRealIsoDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Sorgu parametrelerini sıkı doğrular; geçersiz → null. Tarihler Türkiye günü (YYYY-MM-DD). */
export function parseOwnerHistoryQuery(sp: URLSearchParams): OwnerHistoryQuery | null {
  const type = sp.get("type") ?? "all";
  const status = sp.get("status") ?? "all";
  const from = sp.get("from");
  const to = sp.get("to");
  if (type !== "all" && !(OWNER_NOTIFICATION_TYPES as readonly string[]).includes(type)) return null;
  if (!(OWNER_HISTORY_STATUSES as readonly string[]).includes(status)) return null;
  if ((from && !isRealIsoDay(from)) || (to && !isRealIsoDay(to))) return null;
  const page = Number.parseInt(sp.get("page") ?? "1", 10);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return null;
  return {
    q: (sp.get("q") ?? "").slice(0, 100),
    type: type as OwnerHistoryQuery["type"],
    status: status as OwnerHistoryStatus,
    from: from || null,
    to: to || null,
    page,
  };
}

/** Türkiye günü (YYYY-MM-DD) → o günün TR 00:00 anı (UTC ISO). */
export function istanbulDayStartIso(day: string): string {
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

/** Türkiye günü → ertesi günün TR 00:00 anı (aralık sonu, hariç). */
export function istanbulDayEndExclusiveIso(day: string): string {
  return new Date(new Date(`${day}T00:00:00+03:00`).getTime() + 86_400_000).toISOString();
}

/** DB hata kodu → HTTP durumu (ayrıntı sızdırılmaz). */
export function ownerNotificationErrorStatus(error: unknown): 400 | 403 | 500 {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "AN401") return 403;
  if (code === "AN400") return 400;
  return 500;
}

/** İşaretlenecek kimlikler: pozitif tamsayı, en fazla 500, tekil. */
export function parseMarkReadBody(body: Record<string, unknown>): { ids: number[]; all: boolean } | null {
  for (const k of Object.keys(body)) if (k !== "ids" && k !== "allInfo") return null;
  const all = body.allInfo === true;
  if (body.allInfo !== undefined && typeof body.allInfo !== "boolean") return null;
  const raw = body.ids ?? [];
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const ids: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) return null;
    if (!ids.includes(v)) ids.push(v);
  }
  if (!all && ids.length === 0) return null;
  return { ids, all };
}
