/**
 * FAZ 1 / İP-6 — FAZ 2 VERİ SÖZLEŞMESİ (tipli metric contract).
 *
 * FAZ 2 görsel ekranı bu tipleri DOĞRUDAN tüketir. Her metrik; kapsamını (user hesabı
 * mı, workspace/tenant mı, system mi), güvenilirlik durumunu, birimini ve ölçüm
 * başlangıcını AÇIKÇA taşır. Böylece FAZ 2 "ölçülemeyen"i "0" gibi göstermez.
 *
 * BAĞLAYICI: value === null → ölçülemez/veri yok (unavailable/derived-null). value === 0
 * → GERÇEK sıfır (ölçüldü, sıfır). İkisi KARIŞTIRILMAZ.
 */

/** Metrik kapsamı — KARAR 1: giriş/etkinlik user; kayıt/depolama workspace. */
export type MetricScope = "user" | "workspace" | "system";

/** Güvenilirlik durumu. */
export type MetricStatus = "measured" | "derived" | "approximate" | "unavailable";

/** Birim. */
export type MetricUnit =
  | "event"
  | "session"
  | "record"
  | "object"
  | "byte"
  | "day"
  | "count"
  | "user"
  | "timestamp";

export type MetricValue<T = number> = {
  /** Ölçülen değer. null = ölçülemez/veri yok (0 ile KARIŞTIRILMAZ). */
  value: T | null;
  scope: MetricScope;
  status: MetricStatus;
  unit: MetricUnit;
  /**
   * Bu metriğin güvenilir ölçülmeye başladığı tarih (ISO). Yeni ölçümler (usage_events,
   * client_channel, storage snapshot) için etkinleştikleri tarih; geçmiş uydurulmaz.
   * Mevcut kaynaklardan (user_sessions, users) türetilenlerde ilgili kaydın başlangıcı.
   */
  measurementStartDate?: string | null;
  /** Bu değerin hesaplandığı an (ISO). */
  measuredAt?: string | null;
  /** Kısa, güvenli (PII'siz) ölçüm yöntemi açıklaması. */
  note?: string;
};

export function makeMetric<T>(
  value: T | null,
  scope: MetricScope,
  status: MetricStatus,
  unit: MetricUnit,
  extra?: Partial<Pick<MetricValue<T>, "measurementStartDate" | "measuredAt" | "note">>,
): MetricValue<T> {
  return {
    value,
    scope,
    status,
    unit,
    measurementStartDate: extra?.measurementStartDate ?? null,
    measuredAt: extra?.measuredAt ?? null,
    note: extra?.note,
  };
}

/** Ölçülemeyen metrik kısayolu (value=null, status=unavailable). */
export function unavailableMetric<T>(
  scope: MetricScope,
  unit: MetricUnit,
  note?: string,
): MetricValue<T> {
  return makeMetric<T>(null, scope, "unavailable", unit, { note });
}

/**
 * "Modül kullanıldı mı?" SAF kararı — yeterli ölçüm kanıtı yoksa null.
 *   - recVal / evtVal: existingRecordCount.value / usageEventCount.value (ölçülemez → null).
 *   - Pozitif kayıt VEYA pozitif olay → true.
 *   - YALNIZ her İKİ sinyal de ÖLÇÜLDÜ ve sıfır ise → false (tek başına kayıt-yokluğu veya
 *     sınırlı olay kapsamı "kullanılmadı" demeye YETMEZ → null).
 */
export function deriveUsed(recVal: number | null, evtVal: number | null): boolean | null {
  if ((recVal != null && recVal > 0) || (evtVal != null && evtVal > 0)) return true;
  if (recVal === 0 && evtVal === 0) return false;
  return null;
}

/** Tüm expert-stats admin yanıtlarının ortak zarfı (FAZ 2 sözleşmesi). */
export type StatsEnvelope<T> = {
  ok: true;
  /** Ölçüm başlangıç sınırı (geçmiş bu tarihten önce güvenilir değil). */
  contractVersion: 1;
  data: T;
};
