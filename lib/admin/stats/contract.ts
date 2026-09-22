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
 *   - Pozitif GÜVENİLİR kayıt VEYA pozitif olay → true (her zaman geçerli pozitif kanıt).
 *   - NEGATİF sonuç (used=false) YALNIZ modülün TÜM anlamlı kullanım yolları gerçekten
 *     kapsanıyorsa (coverageComplete=true) ve her iki sinyal de ölçülüp sıfırsa üretilir.
 *     Aksi halde (kısmi enstrümantasyon / kayıt-yokluğu / limited kapsam) → null.
 *   Bu; "yalnız belirli create'ler enstrümante" durumunda kayıt=0 ∧ olay=0'ın tek başına
 *   used=false / allowedButUnused=true üretmesini ÖNLER.
 */
export function deriveUsed(
  recVal: number | null,
  evtVal: number | null,
  coverageComplete: boolean,
): boolean | null {
  if ((recVal != null && recVal > 0) || (evtVal != null && evtVal > 0)) return true;
  if (coverageComplete && recVal === 0 && evtVal === 0) return false;
  return null;
}

/**
 * usageEventCount için istenen tarih aralığının ölçüm başlangıcına göre durumu (SAF).
 *   - measurementStart null → "unavailable" (ölçüm başlamamış/bilinmiyor; tarih uydurulmaz).
 *   - Aralık tamamen başlangıçtan ÖNCE bitiyorsa (to <= start) → "unavailable" (measured=0 üretme).
 *   - Aralık başlangıcı KESİYORSA (from yok veya from < start) → "approximate" (yalnız kapsanan
 *     kısım ölçülür; tüm dönem ölçülmüş gibi gösterilmez).
 *   - Aralık tamamen başlangıç SONRASINDA (from >= start) → "measured" (gerçek sıfır/pozitif korunur).
 * NOT: measurementStart = ilk kayıtlı olaydan (MIN occurred_at) türer → enstrümantasyonun
 *   gerçek başlangıcına ilişkin SINIRLI bir göstergedir (kesin deploy tarihi değildir).
 */
export function classifyUsageWindow(
  measurementStart: string | null,
  from: string | null,
  to: string | null,
): "measured" | "approximate" | "unavailable" {
  if (measurementStart == null) return "unavailable";
  const startMs = Date.parse(measurementStart);
  if (Number.isNaN(startMs)) return "unavailable";
  const toMs = to ? Date.parse(to) : null;
  if (toMs != null && !Number.isNaN(toMs) && toMs <= startMs) return "unavailable";
  const fromMs = from ? Date.parse(from) : null;
  if (fromMs == null || Number.isNaN(fromMs) || fromMs < startMs) return "approximate";
  return "measured";
}

/** Tüm expert-stats admin yanıtlarının ortak zarfı (FAZ 2 sözleşmesi). */
export type StatsEnvelope<T> = {
  ok: true;
  /** Ölçüm başlangıç sınırı (geçmiş bu tarihten önce güvenilir değil). */
  contractVersion: 1;
  data: T;
};
