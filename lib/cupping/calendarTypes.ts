/**
 * KUPA & HACAMAT — FAZ 5 — Hacamat Takvimi + Bilgilendirme TİPLERİ.
 *
 * DB satır şekilleri (server → client). Yazılabilir alan sözleşmesi fields.ts'te
 * (ADVICE_TEMPLATE_WRITABLE / CALENDAR_PLAN_WRITABLE / CALENDAR_PLAN_DAY_WRITABLE /
 * CLIENT_ADVICE_WRITABLE). Bu tipler yalnız gösterim/okuma içindir; id/tenant_id/
 * created_at ASLA client-yazılabilir DEĞİLDİR.
 */

/** Yapısal plan yıl aralığı (DB CHECK ile birebir). Tıbbi/gün doğrulaması YOK. */
export const CUPPING_PLAN_YEAR_MIN = 1900;
export const CUPPING_PLAN_YEAR_MAX = 2200;

/** Bir plan-gün toplu (bulk) POST'ta izin verilen azami tarih sayısı. */
export const CUPPING_PLAN_DAYS_MAX_BATCH = 366;

/**
 * Bir plan-gün satırının KÖKENİ — DB kolonu `selection_source` ile birebir.
 *
 * ⚠️ LEGACY / ŞEMA UYUMLULUĞU: Ürün artık HAZIR gün üretmez (otomatik Sünnet/Altın
 *   kaldırıldı). Her yeni satır `selection_source = 'manual'` (uzman-sahipli). Union'da
 *   `'sunnah_auto'` YALNIZ üretim şemasındaki CHECK kısıtı ve temizlenmemiş eski satırlarla
 *   uyumluluk içindir; uygulama katmanı ARTIK 'sunnah_auto' YAZMAZ ve ona özel bir görünüm
 *   (yeşil/altın) UYGULAMAZ — varsa nötr "seçili" gün olarak gösterilir.
 */
export type CuppingSelectionSource = "manual" | "sunnah_auto";

/** A) Genel, yeniden kullanılabilir bilgilendirme şablonu. */
export type CuppingAdviceTemplate = {
  id: string;
  tenant_id: string;
  title: string;
  before_text: string;
  after_text: string;
  general_note: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** B) Yıllık hacamat takvim planı (profesyonel-sahipli). */
export type CuppingCalendarPlan = {
  id: string;
  tenant_id: string;
  name: string;
  year: number;
  description: string | null;
  advice_template_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** C) Plana ait somut GREGORYEN gün (DATE; Hicrî TÜRETİLİR, saklanmaz). */
export type CuppingCalendarPlanDay = {
  id: string;
  tenant_id: string;
  plan_id: string;
  /** "YYYY-MM-DD" (PostgreSQL DATE). */
  gregorian_date: string;
  /**
   * KÖKEN — DB `selection_source`. Sunucu-sahipli; client ASLA yazamaz. Yeni satırlar
   * DAİMA 'manual'. 'sunnah_auto' yalnız şema/eski-satır uyumluluğu içindir (bkz.
   * CuppingSelectionSource) — uygulama artık üretmez.
   */
  selection_source: CuppingSelectionSource;
  user_label: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** Plan + seçili günleri (GET /plans/[id] yanıt şekli). */
export type CuppingCalendarPlanWithDays = CuppingCalendarPlan & {
  days: CuppingCalendarPlanDay[];
};

/** D) Danışana-özel bilgilendirme SNAPSHOT'ı (şablondan KOPYA; canlı miras DEĞİL). */
export type CuppingClientAdvice = {
  id: string;
  tenant_id: string;
  client_id: string;
  /** Yalnız provenance — canlı senkron/miras YOK. */
  source_template_id: string | null;
  title: string;
  before_text: string;
  after_text: string;
  general_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Plan-gün toplu POST yanıtı. */
export type CuppingPlanDaysWriteResult = {
  inserted: number;
  skippedExisting: number;
};
