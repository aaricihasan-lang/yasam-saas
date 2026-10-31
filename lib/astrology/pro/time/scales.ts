// Gökyüzü Atlası — ORTAK ZAMAN KATMANI: UTC → UT1 / TT dönüşümü (SAF; YALNIZ yeni profesyonel motorlar: lib/astrology/pro/**).
//
// Üretim motorları (Natal/Roxy adaptörü, William Lilly Horary, doğum saati çözümleyicisi) bu dosyayı KULLANMAZ ve bu dosya
// onları değiştirmez. astronomy-engine'in global `SetDeltaTFunction` ayarına DOKUNULMAZ (aynı süreçte Lilly varsayılanı kullanır).
//
// Büyüklükler (karıştırılmaz):
//   DUT1 = UT1 − UTC       (IERS tarafından |DUT1| < 0,9 s tutulur; 1972 → )
//   ΔT   = TT − UT1        (Dünya dönüşü ile düzgün zaman farkı; geçmişte modelden, gelecekte öngörü)
//   TT − UTC = 32,184 s + (TAI − UTC)   (SOFA: TT = TAI + 32,184 s)
//
// Dönem kuralları (girdi daima UTC ms; ms ekseni POSIX'tir, artık saniye etiketi 23:59:60 temsil edilemez → parseUtcIso reddeder):
//   1972-01-01 → 2027-06-28 (IERS tablo geçerliliği): TT = UTC + 32,184 + (TAI−UTC)  KESİN. UT1 = UTC + DUT1.
//   1961-01-01 → 1971-12-31: TT = UTC + 32,184 + (TAI−UTC, USNO formülü)          KESİN. UT1 = UTC + DUT1.
//   1961 öncesi: UTC tanımsız. Sivil saat GMT'ye (ortalama güneş zamanı) bağlıdır. OTOMATİK UT1 KABULÜ YOK — çağıran
//               `pre1961: "civil_as_ut"` (anı UT kabul et; işaretlenir) ya da "reject" seçmek ZORUNDADIR. TT = UT1 + ΔT_model.
//   2027-06-28 sonrası: gelecekteki artık saniyeler bilinmez. UT1 = UTC + DUT1 (varsayılan 0), TT = UT1 + ΔT_öngörü (işaretlenir).
// DUT1: verilmezse 0 kabul edilir ve `dut1_assumed_zero` işareti döner (bugünkü etki ≈ 15″ × |DUT1| yıldız zamanında).

import { DELTA_T_FIRST_YEAR, DELTA_T_LAST_YEAR, deltaTClassOf, deltaTModelSeconds, type DeltaTClass } from "./deltaT";
import { LEAP_TABLE_VALID_UNTIL_MS, UTC_DRIFT_ERA_START_MS, UTC_LEAP_ERA_START_MS, taiMinusUtc } from "./leapSeconds";

export const TT_MINUS_TAI_SECONDS = 32.184;
/** IERS hedefi |UT1 − UTC| < 0,9 s (1972 → ). */
export const DUT1_MAX_ABS_SECONDS = 0.9;
/** 1961–1971: UT1 − UTC'nin Morrison vd. (2021) ΔT'sinden türetilmiş en büyük mutlak değeri 0,70 s (fixture `ut1MinusUtc1961_1971`).
 *  UTC'nin o dönemki tasarım hedefi daha dardır; burada ölçülmüş TEMKİNLİ üst sınır kullanılır. */
export const UT1_UTC_BOUND_1961_1971_SECONDS = 0.7;

export type TimeBasis = "utc_leap_table" | "utc_drift_1961_1971" | "pre1961_civil_ut" | "beyond_leap_table";
export type TimeAssumption =
  | "dut1_assumed_zero"
  | "pre1961_civil_time_as_ut"
  | "future_leap_seconds_unknown"
  | "future_delta_t_predicted"
  | "historical_delta_t_model";
export type Pre1961Policy = "civil_as_ut" | "reject";
export type ScalesOptions = {
  /** Bilinen DUT1 (IERS Bülten A/B), saniye. Yalnız 1961 ve sonrası için anlamlıdır. */
  dut1Seconds?: number;
  /** 1961 öncesi için ZORUNLU açık seçim (varsayılan YOK). */
  pre1961?: Pre1961Policy;
};

export type TimeScales = {
  utcMs: number;
  /** UT1 (aynı ms ekseninde). Dünya dönüşü (yıldız zamanı, ev hesabı, doğuş/batış) bu ölçekle yapılır. */
  ut1Ms: number;
  /** TT (aynı ms ekseninde). Gezegen efemerisi bu ölçekle hesaplanır. */
  ttMs: number;
  basis: TimeBasis;
  taiMinusUtcSeconds: number | null;
  dut1Seconds: number;
  dut1Source: "supplied" | "assumed_zero" | "not_applicable";
  /** ΔT = TT − UT1 (türetilmiş ya da modelden). */
  deltaTSeconds: number;
  deltaTSource: "leap_seconds_and_dut1" | "model_table";
  deltaTClass: DeltaTClass;
  assumptions: TimeAssumption[];
  /** |UT1 − ut1Ms| için kanıtlı üst sınır (s); null = sayısal olarak kanıtlanamadı (1961 öncesi sivil saat). */
  ut1UncertaintySeconds: number | null;
};
export type TimeScalesError = { error: "invalid_input" | "out_of_range" | "pre1961_policy_required" | "pre1961_rejected"; detail: string };
export const isTimeScalesError = (x: TimeScales | TimeScalesError): x is TimeScalesError => "error" in x;

export function scalesFromUtc(utcMs: number, opts: ScalesOptions = {}): TimeScales | TimeScalesError {
  if (!Number.isFinite(utcMs)) return { error: "invalid_input", detail: "an sayısal değil" };
  const supplied = opts.dut1Seconds !== undefined;
  const dut1 = opts.dut1Seconds ?? 0;
  if (!Number.isFinite(dut1) || Math.abs(dut1) > DUT1_MAX_ABS_SECONDS) return { error: "invalid_input", detail: `DUT1 |x| ≤ ${DUT1_MAX_ABS_SECONDS} s olmalı` };
  // Aralık: ΔT tablosu (1600–2600) + uçlarda 1 yıllık tampon (hız ±1 sa ve kök tarama için; kullanıcı girdisi motorlarda ayrıca sınırlanır).
  if (deltaTModelSeconds(utcMs) === null) return { error: "out_of_range", detail: `${DELTA_T_FIRST_YEAR - 1}–${DELTA_T_LAST_YEAR + 1} dışı` };

  const tai = taiMinusUtc(utcMs);
  if (tai) {
    const ttMs = utcMs + (TT_MINUS_TAI_SECONDS + tai.seconds) * 1000;
    const ut1Ms = utcMs + dut1 * 1000;
    const drift = tai.basis === "drift_1961_1971";
    return {
      utcMs,
      ut1Ms,
      ttMs,
      basis: drift ? "utc_drift_1961_1971" : "utc_leap_table",
      taiMinusUtcSeconds: tai.seconds,
      dut1Seconds: dut1,
      dut1Source: supplied ? "supplied" : "assumed_zero",
      deltaTSeconds: (ttMs - ut1Ms) / 1000,
      deltaTSource: "leap_seconds_and_dut1",
      deltaTClass: "observed",
      assumptions: supplied ? [] : ["dut1_assumed_zero"],
      ut1UncertaintySeconds: supplied ? 0 : drift ? UT1_UTC_BOUND_1961_1971_SECONDS : DUT1_MAX_ABS_SECONDS,
    };
  }

  if (utcMs < UTC_DRIFT_ERA_START_MS) {
    if (opts.pre1961 === undefined) return { error: "pre1961_policy_required", detail: "1961 öncesi UTC tanımsız; 'civil_as_ut' ya da 'reject' açıkça seçilmeli" };
    if (opts.pre1961 === "reject") return { error: "pre1961_rejected", detail: "1961 öncesi an politika gereği reddedildi" };
    if (supplied) return { error: "invalid_input", detail: "1961 öncesinde DUT1 tanımsız" };
    const dT = deltaTModelSeconds(utcMs)!;
    const cls = deltaTClassOf(utcMs);
    return {
      utcMs,
      ut1Ms: utcMs,
      ttMs: utcMs + dT * 1000,
      basis: "pre1961_civil_ut",
      taiMinusUtcSeconds: null,
      dut1Seconds: 0,
      dut1Source: "not_applicable",
      deltaTSeconds: dT,
      deltaTSource: "model_table",
      deltaTClass: cls,
      assumptions: ["pre1961_civil_time_as_ut", ...(cls === "historical_model" ? (["historical_delta_t_model"] as const) : [])],
      ut1UncertaintySeconds: null,
    };
  }

  // 2027-06-28 ve sonrası: TAI − UTC bilinmez (yeni artık saniye ya da CGPM 2022 Karar 4 sonrası rejim belirsiz).
  const ut1Ms = utcMs + dut1 * 1000;
  const dT = deltaTModelSeconds(ut1Ms)!;
  return {
    utcMs,
    ut1Ms,
    ttMs: ut1Ms + dT * 1000,
    basis: "beyond_leap_table",
    taiMinusUtcSeconds: null,
    dut1Seconds: dut1,
    dut1Source: supplied ? "supplied" : "assumed_zero",
    deltaTSeconds: dT,
    deltaTSource: "model_table",
    deltaTClass: "predicted",
    assumptions: [...(supplied ? [] : (["dut1_assumed_zero"] as const)), "future_leap_seconds_unknown", "future_delta_t_predicted"],
    ut1UncertaintySeconds: supplied ? 0 : null,
  };
}

/** Katı UTC ISO ayrıştırıcı ("YYYY-MM-DDTHH:MM:SS(.sss)Z"). 23:59:60 (artık saniye etiketi) ms ekseninde temsil edilemez → açık hata. */
export function parseUtcIso(iso: string): number | TimeScalesError {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/.exec(iso);
  if (!m) return { error: "invalid_input", detail: "biçim YYYY-MM-DDTHH:MM:SSZ olmalı" };
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (s === 60) return { error: "invalid_input", detail: "artık saniye etiketi (:60) desteklenmez; bir sonraki saniyenin başı kullanılmalı" };
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) + (m[7] ? Math.round(Number(m[7]) * 1000) : 0);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return { error: "invalid_input", detail: "geçersiz takvim değeri" };
  }
  return ms;
}

/** Dönem sınırları (testler ve belgeler için). */
export const TIME_ERA_BOUNDARIES = { driftStart: UTC_DRIFT_ERA_START_MS, leapStart: UTC_LEAP_ERA_START_MS, leapValidUntil: LEAP_TABLE_VALID_UNTIL_MS } as const;
