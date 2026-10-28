// Gökyüzü Atlası — Klasik Batı Horary: soru anı çerçevesi + REGIOMONTANUS evleri (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Neden yerel hesap: sağlayıcı (Roxy) OpenAPI 2.0.0 ev sistemleri yalnız placidus / whole-sign / equal / koch'tur;
// Regiomontanus YOKTUR (docs/astrology/horary/01). Lilly'nin Christian Astrology haritaları ve Frawley Regiomontanus kullanır
// (sayfa atfı bu çalışmada teyit edilmedi).
// Placidus ya da başka bir sistem SESSİZCE yerine konmaz: bu dosya yalnız Regiomontanus üretir; hesap kurulamıyorsa
// (kutup bölgesi, eksik girdi) `HouseError` döner.
//
// Kaynak/lisans: yalnız küresel trigonometri (Regiomontanus, Tabulae directionum 1467 tanımı: ev daireleri ufkun kuzey ve
// güney noktalarından geçer ve GÖK EKVATORUNU meridyenden başlayarak 30°'lik eşit yaylara böler). Yıldız zamanı ve gerçek
// eğiklik `astronomy-engine` 2.1.19 (MIT; depoda zaten üretim bağımlılığı) ile alınır. Swiss Ephemeris / AGPL kod YOK.
//
// İki BAĞIMSIZ uygulama vardır ve testte birbirine karşı sınanır:
//   (1) Kapalı formül: kutup yüksekliği tan φₖ = tan φ · sin(Hₖ), Hₖ = 30° / 60°; cusp = "kutup φₖ'de doğan ekliptik noktası".
//   (2) Vektör geometrisi: ev dairesi = (ufuk kuzey noktası, ekvator noktası) düzlemi; ekliptik düzlemiyle kesişimi.

import * as Astronomy from "astronomy-engine";

const R = Math.PI / 180;
export const n360 = (x: number) => ((x % 360) + 360) % 360;

/** Soru anının yerel gök çerçevesi. RAMC = yerel görünür yıldız zamanı × 15 (GAST + boylam). */
export type SkyFrame = {
  utcMs: number;
  latitude: number;
  longitude: number;
  /** Gerçek eğiklik (nütasyonlu), derece. */
  obliquity: number;
  /** Meridyenin sağ açıklığı (ARMC), derece. */
  ramc: number;
  asc: number;
  mc: number;
};

export type HouseError = { error: "polar_latitude" | "invalid_input"; detail: string };

/** 90° − ε'dan büyük enlemde ekliptiğin bir kısmı hiç doğmaz/batmaz: ASC/MC sıçrar, Regiomontanus kutup yüksekliği tanımsızlaşır. */
export const polarLimit = (obliquity: number) => 90 - obliquity;

/** Kutup yüksekliği `pole` (derece) olan bir ev dairesinde, ekvator referansı θ = RAMC + kaydırma iken doğan ekliptik boylamı. */
export function risingLongitude(theta: number, pole: number, obliquity: number): number {
  const t = theta * R;
  const e = obliquity * R;
  return n360(Math.atan2(Math.cos(t), -(Math.sin(t) * Math.cos(e) + Math.tan(pole * R) * Math.sin(e))) / R);
}
export const ascendantOf = (ramc: number, latitude: number, obliquity: number) => risingLongitude(ramc, latitude, obliquity);
export function midheavenOf(ramc: number, obliquity: number): number {
  const t = ramc * R;
  return n360(Math.atan2(Math.sin(t), Math.cos(t) * Math.cos(obliquity * R)) / R);
}
/** MC'den RAMC (ters dönüşüm; sağlayıcı MC'si ile çerçevenin tutarlılık denetimi için). */
export function ramcFromMc(mc: number, obliquity: number): number {
  const m = mc * R;
  return n360(Math.atan2(Math.sin(m) * Math.cos(obliquity * R), Math.cos(m)) / R);
}

/** astronomy-engine ile çerçeve: GAST (görünür, nütasyonlu) + doğu boylamı; gerçek eğiklik `e_tilt().tobl`. */
export function skyFrameAt(utcMs: number, latitude: number, longitude: number): SkyFrame | HouseError {
  if (![utcMs, latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "invalid_input", detail: "an/enlem/boylam geçersiz" };
  }
  const time = Astronomy.MakeTime(new Date(utcMs));
  const obliquity = Astronomy.e_tilt(time).tobl;
  const ramc = n360(Astronomy.SiderealTime(time) * 15 + longitude);
  return { utcMs, latitude, longitude, obliquity, ramc, asc: ascendantOf(ramc, latitude, obliquity), mc: midheavenOf(ramc, obliquity) };
}

/** Ev başlangıcının ekvator kaydırması (meridyenden doğuya) ve kutup yüksekliği oranı (sin Hₖ). 10. ev = 0 (meridyen). */
const REGIO: Readonly<Record<number, { offset: number; sinH: number }>> = {
  11: { offset: 30, sinH: Math.sin(30 * R) },
  12: { offset: 60, sinH: Math.sin(60 * R) },
  1: { offset: 90, sinH: 1 },
  2: { offset: 120, sinH: Math.sin(60 * R) },
  3: { offset: 150, sinH: Math.sin(30 * R) },
};

/** (1) Kapalı formül. Dönüş: 12 elemanlı dizi, indeks 0 = 1. ev. Karşı evler +180°. */
export function regiomontanusCusps(ramc: number, latitude: number, obliquity: number): number[] | HouseError {
  if (Math.abs(latitude) >= polarLimit(obliquity)) {
    return { error: "polar_latitude", detail: `|enlem| ${Math.abs(latitude).toFixed(2)}° ≥ ${polarLimit(obliquity).toFixed(2)}° (90° − ε)` };
  }
  const c: number[] = new Array(12);
  c[9] = midheavenOf(ramc, obliquity);
  for (const h of [11, 12, 1, 2, 3]) {
    const { offset, sinH } = REGIO[h];
    const pole = Math.atan(Math.tan(latitude * R) * sinH) / R;
    c[h - 1] = risingLongitude(ramc + offset - 90, pole, obliquity);
  }
  for (const h of [4, 5, 6, 7, 8, 9]) c[h - 1] = n360(c[((h + 6 - 1) % 12)] + 180);
  return c;
}

// ─── (2) Vektör geometrisi (bağımsız uygulama; formül (1) ile kod paylaşmaz) ─────────────────────────────────
type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fromRaDec = (ra: number, dec: number): V3 => [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)];

/** Ekvator koordinatlarında: ufkun kuzey noktası (RA = RAMC + 180°, dek = 90° − φ) ve gök ekvatorunda RAMC + kaydırma noktası. */
export function regiomontanusCuspsGeometric(ramc: number, latitude: number, obliquity: number): number[] | HouseError {
  if (Math.abs(latitude) >= polarLimit(obliquity)) return { error: "polar_latitude", detail: "kutup bölgesi" };
  const e = obliquity * R;
  const eclNormal: V3 = [0, -Math.sin(e), Math.cos(e)];
  const north = fromRaDec(ramc + 180, 90 - latitude);
  const lonOf = (v: V3) => n360(Math.atan2(v[1] * Math.cos(e) + v[2] * Math.sin(e), v[0]) / R);
  const out: number[] = new Array(12);
  for (let h = 1; h <= 12; h++) {
    // Ev h'nin ekvator noktası: 10. ev meridyen (kaydırma 0), saat yönünün tersine doğuya 30°'lik adımlar.
    const offset = (((h - 10) % 12) + 12) % 12 * 30;
    const eq = fromRaDec(ramc + offset, 0);
    if (h === 10 || h === 4) {
      // Meridyen dairesi: kuzey noktası meridyen üzerindedir, düzlem (kutup, meridyen noktası) ile aynı.
      const d = cross(cross([0, 0, 1], eq), eclNormal);
      const s = dot(d, eq) >= 0 ? 1 : -1;
      out[h - 1] = lonOf([d[0] * s, d[1] * s, d[2] * s]);
      continue;
    }
    // Ev yarım dairesi = kuzey → ekvator noktası → güney; kesişim noktası, düzlemde kuzeye dik ve ekvator noktası yönündeki yarıda.
    const d = cross(cross(north, eq), eclNormal);
    const k = dot(eq, north);
    const eqPerp: V3 = [eq[0] - k * north[0], eq[1] - k * north[1], eq[2] - k * north[2]];
    const s = dot(d, eqPerp) >= 0 ? 1 : -1;
    out[h - 1] = lonOf([d[0] * s, d[1] * s, d[2] * s]);
  }
  return out;
}

export type HouseSystemCusps = { system: "regiomontanus"; cusps: number[]; frame: SkyFrame };

/** Gezegenin ev numarası (cusp'tan cusp'a, saat yönünün tersine; cusp'ın kendisi o eve dahil). */
export function houseOf(lon: number, cusps: readonly number[]): number {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i];
    const b = cusps[(i + 1) % 12];
    const span = n360(b - a);
    if (n360(lon - a) < span) return i + 1;
  }
  return 12;
}
/** Bir sonraki cusp'a kalan derece (Lilly'nin "cusp'a 5° kala sonraki eve sayılır" uygulaması eğitmen kararıdır; yalnız ölçü). */
export function degreesToNextCusp(lon: number, cusps: readonly number[]): number {
  const h = houseOf(lon, cusps);
  return n360(cusps[h % 12] - lon);
}
