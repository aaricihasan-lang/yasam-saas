/**
 * Vedik noktalar (Upagraha · Heliakal) — YALNIZ TEST / DOĞRULAMA amaçlı BAĞIMSIZ yaklaşık hesap (astronomy-engine).
 * Ürün kodunda KULLANILMAZ (hesap motoru sağlayıcıdır). Harness ve şema-örneği fixture üreticisi kullanır.
 *
 *   • Yükselen (Lagna): GAST + boylam → RAMC; ortalama eğiklik; klasik atan2 formülü; sidereal = tropikal − ayanamsa.
 *   • Gün doğumu / batımı: astronomy-engine SearchRiseSet (üst kenar + standart kırılma).
 *   • Kala-velā (zaman tabanlı) upagrahalar: doğum gündüzse gündüz, geceyse gece süresi 8 eşit parçaya bölünür; gündüz parçalarının
 *     yöneticileri haftanın gününün yöneticisinden başlar, gece parçalarınınki o günün 5. yöneticisinden; 8. parça yöneticisizdir.
 *     Kala = Güneş, Mrityu = Mars, Ardhaprahara = Merkür, Yamaghantaka = Jüpiter, Gulika = Satürn parçası. Konum = parçanın
 *     BAŞLANGICINDAKİ Lagna (Mandi için bazı ekoller parçanın ORTASINI kullanır — ekol farkı).
 *   • Aprakasha (Güneş türevli) grahalar: Dhuma = Güneş + 133°20′; Vyatipata = 360° − Dhuma; Parivesha = Vyatipata + 180°;
 *     Indra Chapa = 360° − Parivesha; Upaketu = Indra Chapa + 16°40′ (= Güneş − 30°).
 *   • Heliakal (yaklaşık): akşam (Güneş'in doğusundaki) graha için gün batımı ile grahanın batışı arasındaki, sabah grahası için
 *     grahanın doğuşu ile gün doğumu arasındaki süre yıldız-zamanı derecesine çevrilir (kalamsa ölçüsü); Surya Siddhanta sınırı:
 *     Ay 12, Jüpiter 11, Satürn 15, Mars 17, Venüs 10 (geri 8), Merkür 14 (geri 12).
 */
import * as AE from "astronomy-engine";

export const norm = (x: number) => ((x % 360) + 360) % 360;
/** Lahiri yaklaşık: J2000'de 23°51′11″ + 50,2788″/yıl (mevcut harness'larla aynı). */
export const lahiriApprox = (t: AE.AstroTime) => 23.85305 + (t.ut / 365.25) * (50.2788 / 3600);

export function tropicalAscendant(at: Date, lat: number, lon: number): number {
  const t = AE.MakeTime(at);
  const ramc = norm(AE.SiderealTime(t) * 15 + lon);
  const T = t.tt / 36525;
  const eps = (23.439291 - 0.0130042 * T) * (Math.PI / 180);
  const th = ramc * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  return norm((Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180) / Math.PI);
}
export const siderealAscendant = (at: Date, lat: number, lon: number, ayanamsa: number) => norm(tropicalAscendant(at, lat, lon) - ayanamsa);

export function sunRiseSet(dayLocalMidnightUtcMs: number, lat: number, lon: number): { rise: Date; set: Date } {
  const obs = new AE.Observer(lat, lon, 0);
  const start = AE.MakeTime(new Date(dayLocalMidnightUtcMs));
  const rise = AE.SearchRiseSet(AE.Body.Sun, obs, +1, start, 1);
  const set = AE.SearchRiseSet(AE.Body.Sun, obs, -1, start, 1);
  if (!rise || !set) throw new Error("gün doğumu/batımı yok");
  return { rise: rise.date, set: set.date };
}

/** Haftanın günü yöneticileri (Pazar = 0). */
export const WEEKDAY_LORDS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
export const TIME_UPAGRAHA_LORD: Record<string, (typeof WEEKDAY_LORDS)[number]> = { kala: "sun", mrityu: "mars", ardhaprahara: "mercury", yamaghantaka: "jupiter", gulika: "saturn" };

/** Doğum anı için 8'li bölüm: gündüz/gece, Vedik gün (gün doğumundan başlar), parça sınırları ve yöneticileri. */
export function eightfold(birthUtc: Date, offsetHours: number, lat: number, lon: number) {
  const localMid = (ms: number) => {
    const l = new Date(ms + offsetHours * 3600_000);
    return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - offsetHours * 3600_000;
  };
  const day0 = localMid(birthUtc.getTime());
  const today = sunRiseSet(day0, lat, lon);
  let isDay: boolean;
  let start: Date;
  let end: Date;
  let vedicDayMid: number;
  if (birthUtc >= today.rise && birthUtc < today.set) {
    isDay = true;
    start = today.rise;
    end = today.set;
    vedicDayMid = day0;
  } else if (birthUtc >= today.set) {
    isDay = false;
    start = today.set;
    end = sunRiseSet(day0 + 86_400_000, lat, lon).rise;
    vedicDayMid = day0;
  } else {
    // gün doğumundan önce: Vedik gün bir önceki takvim günü; gece önceki günün batımından başlar.
    const prev = sunRiseSet(day0 - 86_400_000, lat, lon);
    isDay = false;
    start = prev.set;
    end = today.rise;
    vedicDayMid = day0 - 86_400_000;
  }
  const wd = new Date(vedicDayMid + offsetHours * 3600_000 + 12 * 3600_000).getUTCDay();
  const part = (end.getTime() - start.getTime()) / 8;
  const parts = Array.from({ length: 8 }, (_, k) => ({
    k: k + 1,
    lord: k === 7 ? null : WEEKDAY_LORDS[(wd + (isDay ? 0 : 4) + k) % 7],
    start: new Date(start.getTime() + k * part),
    end: new Date(start.getTime() + (k + 1) * part),
  }));
  return { isDay, weekday: wd, start, end, parts };
}

export function timeUpagrahas(birthUtc: Date, offsetHours: number, lat: number, lon: number, ayanamsa: number) {
  const e = eightfold(birthUtc, offsetHours, lat, lon);
  const at = (lord: string, mid = false) => {
    const p = e.parts.find((x) => x.lord === lord)!;
    const when = mid ? new Date((p.start.getTime() + p.end.getTime()) / 2) : p.start;
    return { part: p.k, at: when, longitude: siderealAscendant(when, lat, lon, ayanamsa) };
  };
  return {
    eightfold: e,
    kala: at("sun"),
    mrityu: at("mars"),
    ardhaprahara: at("mercury"),
    yamaghantaka: at("jupiter"),
    gulika: at("saturn"),
    mandiMid: at("saturn", true),
  };
}

export function sunBasedUpagrahas(sunSidereal: number) {
  const dhuma = norm(sunSidereal + 133 + 20 / 60);
  const vyatipata = norm(360 - dhuma);
  const parivesha = norm(vyatipata + 180);
  const indraChapa = norm(360 - parivesha);
  const upaketu = norm(indraChapa + 16 + 40 / 60);
  return { dhuma, vyatipata, parivesha, indraChapa, upaketu };
}

// ─── Heliakal (yaklaşık) ───────────────────────────────────────────────────────
export const HELIACAL_BODIES = { moon: AE.Body.Moon, mars: AE.Body.Mars, mercury: AE.Body.Mercury, jupiter: AE.Body.Jupiter, venus: AE.Body.Venus, saturn: AE.Body.Saturn } as const;
export type HeliacalGraha = keyof typeof HELIACAL_BODIES;
export const kalamsaOf = (g: HeliacalGraha, retro: boolean) => ({ moon: 12, jupiter: 11, saturn: 15, mars: 17, venus: retro ? 8 : 10, mercury: retro ? 12 : 14 })[g];
const SIDEREAL_DEG_PER_DAY = 360.98564736629;
export const eclLon = (b: AE.Body, d: Date) => AE.Ecliptic(AE.GeoVector(b, AE.MakeTime(d), true)).elon;
export function elongation(g: HeliacalGraha, d: Date): number {
  return ((eclLon(HELIACAL_BODIES[g], d) - eclLon(AE.Body.Sun, d) + 540) % 360) - 180;
}
export function isRetro(g: HeliacalGraha, d: Date): boolean {
  if (g === "moon") return false;
  const b = HELIACAL_BODIES[g];
  const a = eclLon(b, new Date(d.getTime() - 3600_000 * 6));
  const c = eclLon(b, new Date(d.getTime() + 3600_000 * 6));
  return ((c - a + 540) % 360) - 180 < 0;
}
/** Bir yerel gün için grahanın kalamsa ölçüsü (yaklaşık) ve ufku. */
export function heliacalDay(g: HeliacalGraha, dayLocalMidnightUtcMs: number, lat: number, lon: number) {
  const obs = new AE.Observer(lat, lon, 0);
  const sun = sunRiseSet(dayLocalMidnightUtcMs, lat, lon);
  const el = elongation(g, sun.rise);
  const west = el > 0;
  const body = HELIACAL_BODIES[g];
  const alt = (d: Date) => {
    const eq = AE.Equator(body, AE.MakeTime(d), obs, true, true);
    return AE.Horizon(AE.MakeTime(d), obs, eq.ra, eq.dec, "normal").altitude;
  };
  const toDeg = (ms: number) => (ms / 86_400_000) * SIDEREAL_DEG_PER_DAY;
  let cross: Date | null = null;
  let timeDegrees: number;
  if (west) {
    // Akşam: gün batımında ufkun üstündeyse batışı SONRA (pozitif), altındaysa ÖNCE batmıştır (negatif).
    const up = alt(sun.set) > 0;
    const s2 = AE.SearchRiseSet(body, obs, -1, AE.MakeTime(sun.set), up ? 1 : -1);
    cross = s2 ? s2.date : null;
    timeDegrees = cross ? toDeg(cross.getTime() - sun.set.getTime()) : NaN;
  } else {
    // Sabah: gün doğumunda ufkun üstündeyse doğuşu ÖNCE (pozitif), altındaysa SONRA doğar (negatif).
    const up = alt(sun.rise) > 0;
    const r2 = AE.SearchRiseSet(body, obs, +1, AE.MakeTime(sun.rise), up ? -1 : 1);
    cross = r2 ? r2.date : null;
    timeDegrees = cross ? toDeg(sun.rise.getTime() - cross.getTime()) : NaN;
  }
  // Güneş'e karşıt yarıda (|uzanım| > 90°) graha gece gökyüzündedir: ölçü Güneş parıltısı sınırının çok üstünde kabul edilir
  // (yaklaşık hesabın karşı ufuk geçişinde işaret değiştirmesi önlenir; yalnız 90°+ uzanımda).
  if (Math.abs(el) > 90 && !(timeDegrees > 30)) timeDegrees = Math.abs(el);
  const retro = isRetro(g, sun.rise);
  const kalamsa = kalamsaOf(g, retro);
  // Grahanın Güneş'ten "yanlış" tarafta (ör. akşam grahası Güneş'ten önce batıyor) olması → ölçü negatif → görünmez.
  return { horizon: west ? ("west" as const) : ("east" as const), timeDegrees, kalamsa, retrograde: retro, visible: Number.isFinite(timeDegrees) && timeDegrees > kalamsa, longitudeSeparation: Math.abs(el), cross };
}
