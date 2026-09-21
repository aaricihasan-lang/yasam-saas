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
 * FAZ 5 / AŞAMA 5 — UZMAN-TANIMLI GÜN RENGİ (kontrollü palet anahtarı).
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Renk ANLAMI platform tarafından SABİTLENMEZ. Bu anahtarlar
 *   yalnız görsel ayrım içindir — hiçbir renk hazır tıbbi/geleneksel anlam ("uygun/yasak/
 *   sünnet/altın") TAŞIMAZ. Her rengin anlamını UZMAN kendi kısa açıklamasıyla belirler.
 * KONTROLLÜ PALET (serbest HEX DEĞİL): metin okunurluğu, Word uyumu, baskı ve erişilebilirlik
 *   için sabit anahtar/değer eşlemesi. Palet, her anahtar ayrı bir görsel/Word eşlemesine
 *   sahip olacak şekilde İLERİDE genişletilebilir. Renk yok = NULL (varsayılan seçili görünüm).
 */
export const CUPPING_DAY_COLOR_KEYS = [
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "orange",
  "pink",
] as const;
export type CuppingDayColorKey = (typeof CUPPING_DAY_COLOR_KEYS)[number];

/** color_key kontrollü palet anahtarı mı? (NULL / "renk yok" bu fonksiyonun DIŞINDA ele alınır.) */
export function isCuppingDayColorKey(v: unknown): v is CuppingDayColorKey {
  return typeof v === "string" && (CUPPING_DAY_COLOR_KEYS as readonly string[]).includes(v);
}

/**
 * Kısa açıklama (user_label) üst sınırı. SESSİZ KIRPMA YOK — sınır aşılırsa hem UI hem
 * sunucu açık doğrulama hatası verir (metin sessizce kesilmez).
 */
export const CUPPING_DAY_LABEL_MAX = 60;

/** Detay notu (note) üst sınırı — hücrede gösterilmez; yalnız düzenleme panelinde erişilir. */
export const CUPPING_DAY_NOTE_MAX = 2000;

/** Unicode kod-noktası sayısı (surrogate-çifti güvenli; naif .length DEĞİL). */
function codePointLength(s: string): number {
  return Array.from(s).length;
}

export type CuppingDayStyleInput = {
  user_label?: unknown;
  note?: unknown;
  color_key?: unknown;
};

/** Doğrulanmış gün-stili payload'u (yalnız gönderilen alanlar; boş metin → null). */
export type CuppingDayStyleFields = {
  user_label?: string | null;
  note?: string | null;
  color_key?: CuppingDayColorKey | null;
};

export type CuppingDayStyleResult =
  | { ok: true; fields: CuppingDayStyleFields }
  | { ok: false; error: string };

/**
 * FAZ 5 / AŞAMA 5 — GÜN STİLİ (renk + kısa açıklama + detay notu) DOĞRULAMA (saf; DB'siz).
 *
 * Server route'ları (PATCH gün / per-day toplu POST) VE harness bu TEK fonksiyonu paylaşır.
 *   - color_key: NULL (renk yok) veya kontrollü palet anahtarı; başka değer → hata.
 *   - user_label (kısa açıklama): boş/whitespace → null; > CUPPING_DAY_LABEL_MAX → AÇIK hata
 *       (sessiz kırpma YOK); aksi hâlde trim'lenmiş metin (güvenli düz metin; HTML render EDİLMEZ).
 *   - note (detay notu): boş → null; > CUPPING_DAY_NOTE_MAX → hata.
 * `requireAtLeastOne` true iken hiç alan gönderilmemişse hata (boş PATCH engeli).
 * `requireColorPresent` true iken (YENİ gün oluşturma) geçerli non-null color_key ZORUNLU.
 * `rejectNullColor` true iken (mevcut gün PATCH) color_key AÇIKÇA null gönderilemez (renk
 *   kaldırılamaz — renkli gün renksiz bırakılmaz; yalnız başka renkle değiştirilir).
 * Gönderilmeyen alanlar SONUÇTA YER ALMAZ (mevcut değeri korunur — kısmi güncelleme).
 */
export function normalizeCuppingDayStyle(
  input: CuppingDayStyleInput,
  opts?: { requireAtLeastOne?: boolean; requireColorPresent?: boolean; rejectNullColor?: boolean },
): CuppingDayStyleResult {
  const fields: CuppingDayStyleFields = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);

  if (has("color_key")) {
    const v = input.color_key;
    if (v === null) fields.color_key = null;
    else if (isCuppingDayColorKey(v)) fields.color_key = v;
    else return { ok: false, error: "Geçersiz renk seçimi." };
  }

  if (has("user_label")) {
    const v = input.user_label;
    if (v === null) fields.user_label = null;
    else if (typeof v === "string") {
      const t = v.trim();
      if (t === "") fields.user_label = null;
      else if (codePointLength(t) > CUPPING_DAY_LABEL_MAX)
        return { ok: false, error: `Kısa açıklama en fazla ${CUPPING_DAY_LABEL_MAX} karakter olabilir.` };
      else fields.user_label = t;
    } else return { ok: false, error: "Kısa açıklama geçersiz." };
  }

  if (has("note")) {
    const v = input.note;
    if (v === null) fields.note = null;
    else if (typeof v === "string") {
      const t = v.trim();
      if (t === "") fields.note = null;
      else if (codePointLength(t) > CUPPING_DAY_NOTE_MAX)
        return { ok: false, error: `Detay notu en fazla ${CUPPING_DAY_NOTE_MAX} karakter olabilir.` };
      else fields.note = t;
    } else return { ok: false, error: "Detay notu geçersiz." };
  }

  // Renk kaldırma yasağı (mevcut gün): color_key AÇIKÇA null → hata.
  if (opts?.rejectNullColor && Object.prototype.hasOwnProperty.call(fields, "color_key") && fields.color_key === null) {
    return { ok: false, error: "Renk kaldırılamaz; farklı bir renk seçin." };
  }
  // Renk zorunluluğu (yeni gün): geçerli non-null color_key GEREKLİ.
  if (opts?.requireColorPresent && (!Object.prototype.hasOwnProperty.call(fields, "color_key") || fields.color_key == null)) {
    return { ok: false, error: "Renk seçimi zorunludur." };
  }
  if (opts?.requireAtLeastOne && Object.keys(fields).length === 0) {
    return { ok: false, error: "Güncellenecek alan yok." };
  }
  return { ok: true, fields };
}

/**
 * Ham per-day gün öğesinden YALNIZ gerçekten GÖNDERİLMİŞ stil alanlarını çıkarır.
 *
 * KRİTİK: `undefined` enjekte ETMEZ — `{ date }` (stilsiz) gönderildiğinde color_key/user_label/
 *   note'u `undefined` ile eklemek, normalizeCuppingDayStyle'ın onları "mevcut ama geçersiz"
 *   sayıp reddetmesine yol açar. Bu fonksiyon yalnız hasOwnProperty olan anahtarları taşır →
 *   gönderilmeyen alan SONUÇTA yer almaz (mevcut değeri korunur; stilsiz gün geçerlidir).
 */
export function pickCuppingDayStyleInput(entry: Record<string, unknown>): CuppingDayStyleInput {
  const style: CuppingDayStyleInput = {};
  if (Object.prototype.hasOwnProperty.call(entry, "color_key")) style.color_key = entry.color_key;
  if (Object.prototype.hasOwnProperty.call(entry, "user_label")) style.user_label = entry.user_label;
  if (Object.prototype.hasOwnProperty.call(entry, "note")) style.note = entry.note;
  return style;
}

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
  /**
   * FAZ 5 / AŞAMA 5 — Uzman-tanımlı gün rengi (kontrollü palet anahtarı; NULL = renk yok).
   * Renk anlamı PLATFORM tarafından sabitlenmez (bkz. CuppingDayColorKey). Sunucu-tarafı
   * CHECK ile kontrollü; client yalnız allowlist (CALENDAR_PLAN_DAY_WRITABLE) üzerinden yazar.
   */
  color_key: CuppingDayColorKey | null;
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
