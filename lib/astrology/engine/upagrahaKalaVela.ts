// Astroloji — ATL-B01 (30.10.2026): zaman tabanlı upagrahaların (Kala-velā) BPHS kuralıyla YEREL hesabı (SAF; ağ yok).
//
// Neden: hesaplama servisi Kala, Mrityu, Ardhaprahara ve Yamaghantaka'yı, yöneticisiz parçayı Satürn parçasının HEMEN ARDINA koyan
// sırayla (P. V. R. Narasimha Rao, "Vedic Astrology: An Integrated Approach" §4.3 / Jagannatha Hora / PyJHora sırası) ama parçanın
// BAŞLANGICIYLA veriyor. Ürünün dayanağı BPHS'tir (Santhanam çevirisi, Bölüm 3, şl. 66–70): gündüz (geceyse gece) süresi 8 eşit
// parçaya bölünür; yedi parça haftanın günü yöneticisinden (gece: o günün 5. yöneticisinden) başlayarak hafta sırasıyla dağıtılır;
// SEKİZİNCİ parça yöneticisizdir; nokta = parçanın BAŞLANGICINDA yükselen burç derecesi (şl. 70). Aynı sıra, Panchanga'nın evrensel
// Yamaganda (Jüpiter parçası) ve Gulika kāla tablolarıyla birebir aynıdır (servisin kendi Panchanga yanıtı da bu tabloyu verir).
//
// Hesap: gün doğumu / batımı = Güneş'in üst kenarı + standart kırılma (astronomy-engine SearchRiseSet; servisin Gulika'sıyla
// kalibre edildi, bkz. scripts/astrology/upagraha-kalavela.harness.ts); yükselen = görünür yıldız zamanı + gerçek eğiklik,
// doğu ufku (kutup enleminde batan nokta seçilmez); sidereal = tropikal − ayanamsa. Ayanamsa servisin doğum anı için yankıladığı
// değerdir (aynı çerçeve); parça başlangıcına presesyon hızıyla taşınır (12 saatte < 0,001°).
// Gulika da AYNI yolla hesaplanır ve yalnız TUTARLILIK DENETİMİ için döner (servisin Gulika'sı BPHS ile aynıdır; yerel Gulika
// servisinkinden sapıyorsa yerel gün doğumu / yükselen kuralı o harita için doğrulanamamış demektir → değer üretilmez).

import * as AE from "astronomy-engine";

export const KALA_VELA_LORDS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
export type KalaVelaLord = (typeof KALA_VELA_LORDS)[number];
export const KALA_VELA_IDS = ["kala", "mrityu", "ardhaprahara", "yamaghantaka", "gulika"] as const;
export type KalaVelaId = (typeof KALA_VELA_IDS)[number];
export const KALA_VELA_LORD_OF: Readonly<Record<KalaVelaId, KalaVelaLord>> = { kala: "sun", mrityu: "mars", ardhaprahara: "mercury", yamaghantaka: "jupiter", gulika: "saturn" };
/** Presesyon hızı (derece / gün), ayanamsayı doğum anından parça başlangıcına taşımak için (≈ 50,29″ / yıl). */
const PRECESSION_DEG_PER_DAY = 50.29 / 3600 / 365.25;

export type KalaVelaInput = {
  /** Yerel doğum tarihi YYYY-MM-DD ve saati HH:MM[:SS] (istek gövdesiyle aynı). */
  date: string;
  time: string;
  /** Doğum anının UTC ofseti (saat; istek gövdesinin `timezone` alanı). */
  offsetHours: number;
  latitude: number;
  longitude: number;
  /** Doğum anı için seçilen çerçevenin ayanamsası (derece). */
  ayanamsaDegrees: number;
};
export type KalaVelaPoint = { id: KalaVelaId; longitude: number; part: number; startUtc: string };
export type KalaVelaResult =
  | {
      ok: true;
      isDay: boolean;
      /** Vedik günün (gün doğumundan başlar) haftanın günü, Pazar = 0. */
      weekday: number;
      segmentStartUtc: string;
      segmentEndUtc: string;
      /** 8 parçanın yöneticileri (null = yöneticisiz 8. parça). */
      lords: (KalaVelaLord | null)[];
      points: Record<KalaVelaId, KalaVelaPoint>;
    }
  | { ok: false; reason: "invalid_input" | "sun_does_not_rise_or_set" };

const n360 = (x: number) => ((x % 360) + 360) % 360;
const R = Math.PI / 180;

/** Yerel tarih + saat + ofset → UTC ms (geçersizse null). */
export function birthUtcMs(date: string, time: string, offsetHours: number): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!d || !t || !Number.isFinite(offsetHours)) return null;
  const ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], t[3] ? +t[3] : 0);
  return Number.isFinite(ms) ? ms - offsetHours * 3600_000 : null;
}

/** Tropikal yükselen (doğu ufku): görünür yıldız zamanı + gerçek eğiklik. Kutup enleminde batan kesişim seçilmez. */
export function tropicalAscendant(utcMs: number, latitude: number, longitude: number): number {
  const t = AE.MakeTime(new Date(utcMs));
  const ramc = n360(AE.SiderealTime(t) * 15 + longitude);
  const eps = AE.e_tilt(t).tobl * R;
  const th = ramc * R;
  const phi = latitude * R;
  let asc = n360(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / R);
  // Doğu ufku denetimi: ekliptik noktasının saat açısı 180°…360° (doğuda, yükseliyor) olmalı.
  const ra = Math.atan2(Math.sin(asc * R) * Math.cos(eps), Math.cos(asc * R)) / R;
  if (Math.sin((ramc - ra) * R) > 0) asc = n360(asc + 180);
  return asc;
}

function riseSet(obs: AE.Observer, dir: 1 | -1, fromMs: number, limitDays: number): number | null {
  const r = AE.SearchRiseSet(AE.Body.Sun, obs, dir, AE.MakeTime(new Date(fromMs)), limitDays);
  return r ? r.date.getTime() : null;
}

export function computeKalaVela(input: KalaVelaInput): KalaVelaResult {
  const { latitude, longitude, offsetHours, ayanamsaDegrees } = input;
  const birth = birthUtcMs(input.date, input.time, offsetHours);
  if (birth === null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(ayanamsaDegrees) || Math.abs(latitude) > 90) return { ok: false, reason: "invalid_input" };
  const obs = new AE.Observer(latitude, longitude, 0);
  // Doğumdan önceki son gün doğumu (Vedik gün gün doğumunda başlar).
  let rise: number | null = null;
  for (let from = birth - 2 * 86400_000; ; ) {
    const r = riseSet(obs, 1, from, 2);
    if (r === null || r > birth) break;
    rise = r;
    from = r + 60_000;
  }
  if (rise === null) return { ok: false, reason: "sun_does_not_rise_or_set" };
  const set = riseSet(obs, -1, rise, 1);
  if (set === null) return { ok: false, reason: "sun_does_not_rise_or_set" };
  const isDay = birth < set;
  let start = rise;
  let end = set;
  if (!isDay) {
    const next = riseSet(obs, 1, set, 1);
    if (next === null || next <= birth) return { ok: false, reason: "sun_does_not_rise_or_set" };
    start = set;
    end = next;
  }
  const weekday = new Date(rise + offsetHours * 3600_000).getUTCDay();
  const first = isDay ? weekday : (weekday + 4) % 7;
  const lords: (KalaVelaLord | null)[] = [...Array.from({ length: 7 }, (_, k) => KALA_VELA_LORDS[(first + k) % 7]), null];
  const len = (end - start) / 8;
  const points = {} as Record<KalaVelaId, KalaVelaPoint>;
  for (const id of KALA_VELA_IDS) {
    const k = lords.indexOf(KALA_VELA_LORD_OF[id]);
    const at = start + k * len;
    const ay = ayanamsaDegrees + ((at - birth) / 86400_000) * PRECESSION_DEG_PER_DAY;
    points[id] = { id, longitude: n360(tropicalAscendant(at, latitude, longitude) - ay), part: k + 1, startUtc: new Date(Math.round(at)).toISOString() };
  }
  return { ok: true, isDay, weekday, segmentStartUtc: new Date(start).toISOString(), segmentEndUtc: new Date(end).toISOString(), lords, points };
}

// ─── Teknik veriye uygulama (projeksiyon) ──────────────────────────────────────
/** Yerel Gulika ↔ servis Gulika'sı tutarlılık sınırı (derece). Servis 2 haneye yuvarlar (±0,005); 200 haritada ölçülen en büyük fark 0,0052°. */
export const KALA_VELA_GULIKA_TOLERANCE = 0.02;
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
const REPLACED: readonly KalaVelaId[] = ["kala", "mrityu", "ardhaprahara", "yamaghantaka"];
type PointLike = { id: string; longitude: number; [k: string]: unknown };
type TechnicalLike = { frame: { ayanamsaDegrees: number }; timeBased: PointLike[]; partial?: unknown; [k: string]: unknown };

/**
 * Servisin teknik verisinde YALNIZ Kala, Mrityu, Ardhaprahara ve Yamaghantaka'yı BPHS yerel değeriyle değiştirir (2 ondalık; burç, derece,
 * nakshatra ve pada boylamdan). Gulika, Mandi, Güneş türevliler, çerçeve ve diğer alanlar AYNEN kalır. Kısmi sonuçta (kutup günü)
 * nokta değişikliği yoktur (yalnız yöntem işareti). Yerel hesap yapılamaz ya da yerel Gulika servisinkinden sapıyorsa değer ÜRETİLMEZ (hata).
 */
export function applyBphsKalaVela<T extends TechnicalLike>(
  technical: T,
  body: { date: string; time: string; offsetHours: number; latitude: number; longitude: number },
  nakshatras: readonly string[],
): { ok: true; technical: T & { kalaVela: { method: "bphs_part_start"; isDay: boolean; weekday: number } } } | { ok: false; errors: string[] } | { ok: true; technical: T & { kalaVela: { method: "bphs_part_start" } }; unchanged: true } {
  // Kısmi sonuç: noktalar aynen; yalnız yöntem işareti (yeni kayıt, BPHS notları) — gündüz/gece tanımsız.
  if (technical.partial || technical.timeBased.length === 0) return { ok: true, technical: { ...technical, kalaVela: { method: "bphs_part_start" as const } }, unchanged: true };
  const k = computeKalaVela({ ...body, ayanamsaDegrees: technical.frame.ayanamsaDegrees });
  if (!k.ok) return { ok: false, errors: [`kala-velā: BPHS yerel hesabı yapılamadı (${k.reason})`] };
  const gul = technical.timeBased.find((p) => p.id === "gulika");
  const gd = gul ? Math.abs(((k.points.gulika.longitude - gul.longitude + 540) % 360) - 180) : Infinity;
  if (!(gd <= KALA_VELA_GULIKA_TOLERANCE)) return { ok: false, errors: [`kala-velā: yerel Gulika servis Gulika'sından ${Number.isFinite(gd) ? gd.toFixed(3) + "°" : "—"} farklı (sınır ${KALA_VELA_GULIKA_TOLERANCE}°)`] };
  const span = 360 / 27;
  const timeBased = technical.timeBased.map((p) => {
    if (!(REPLACED as readonly string[]).includes(p.id)) return p;
    let L = Math.round(k.points[p.id as KalaVelaId].longitude * 100) / 100;
    if (L >= 360) L -= 360;
    const ni = Math.min(26, Math.floor(L / span));
    return {
      ...p,
      longitude: L,
      rashi: SIGNS[Math.floor(L / 30) % 12],
      degreeInRashi: Math.round((L % 30) * 100) / 100,
      nakshatra: nakshatras[ni],
      nakshatraIndex: ni + 1,
      pada: Math.min(4, Math.floor((L - ni * span) / (span / 4)) + 1),
    };
  });
  return { ok: true, technical: { ...technical, timeBased, kalaVela: { method: "bphs_part_start" as const, isDay: k.isDay, weekday: k.weekday } } };
}
