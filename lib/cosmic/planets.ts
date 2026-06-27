/**
 * lib/cosmic/planets.ts
 * Güncel gezegen burç pozisyonları.
 *
 * Güneş    : astronomy-engine GeoVector+Ecliptic (FAZ 5B) — dakika hassasiyeti
 * Ay       : moon.ts → getMoonSign() kullanılır (sidereal hesaplama)
 * Diğerleri: astronomy-engine GeoVector+Ecliptic — tarih sınırı YOK, hardcoded tablo YOK.
 * getPlanetSignPeriod: AE ingress (FAZ 1D) — kesin bitişik kalış aralığı, tarih sınırı yok.
 *
 * FAZ 1E: Tüm hardcoded period/fallback tabloları (MERCURY..PLUTO_PERIODS) ve
 * lookupSign/lookupSignSafe kaldırıldı. AE başarısız olursa YANLIŞ tabloya sessiz
 * dönüş yapılmaz; gezegen outOfRange:true (sign boş) döner — güvenli davranış.
 * (Güneş için takvim-tarihi yedeği _legacySunSign korunur; bu bir period tablosu
 *  değildir, deterministik ±1 gün cusp yaklaşımıdır ve ana sayfada kullanılır.)
 */

import * as AE from "astronomy-engine";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetKey =
  | "Güneş" | "Merkür" | "Venüs" | "Mars"
  | "Jüpiter" | "Satürn" | "Uranüs" | "Neptün" | "Plüton";

export type PlanetInfo = {
  key:        PlanetKey;
  symbol:     string;
  sign:       string;      // boş string → outOfRange true
  signSymbol: string;
  outOfRange: boolean;     // AE hesaplanamadı; sign güvenilmez
};

const ZODIAC_SYMBOL: Record<string, string> = {
  "Koç":     "♈", "Boğa":    "♉", "İkizler": "♊",
  "Yengeç":  "♋", "Aslan":   "♌", "Başak":   "♍",
  "Terazi":  "♎", "Akrep":   "♏", "Yay":     "♐",
  "Oğlak":   "♑", "Kova":    "♒", "Balık":   "♓",
};

// Tropikal zodyak: 0°=Koç, 30°=Boğa, … 330°=Balık
const SUN_ZODIAC_NAMES = [
  "Koç","Boğa","İkizler","Yengeç","Aslan","Başak",
  "Terazi","Akrep","Yay","Oğlak","Kova","Balık",
] as const;

// ─── Güneş burcu ─────────────────────────────────────────────────────────────

/**
 * Güneş burcu — takvim ay/gün yedeği (period tablosu DEĞİL).
 * Hata: cusp günlerde ±1 gün (saat dikkate alınmaz). Sadece AE başarısız olursa.
 */
function _legacySunSign(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 1)  return d >= 20 ? "Kova"     : "Oğlak";
  if (m === 2)  return d >= 19 ? "Balık"    : "Kova";
  if (m === 3)  return d >= 20 ? "Koç"      : "Balık";
  if (m === 4)  return d >= 20 ? "Boğa"     : "Koç";
  if (m === 5)  return d >= 21 ? "İkizler"  : "Boğa";
  if (m === 6)  return d >= 21 ? "Yengeç"   : "İkizler";
  if (m === 7)  return d >= 23 ? "Aslan"    : "Yengeç";
  if (m === 8)  return d >= 23 ? "Başak"    : "Aslan";
  if (m === 9)  return d >= 23 ? "Terazi"   : "Başak";
  if (m === 10) return d >= 23 ? "Akrep"    : "Terazi";
  if (m === 11) return d >= 22 ? "Yay"      : "Akrep";
  if (m === 12) return d >= 22 ? "Oğlak"    : "Yay";
  return "Oğlak";
}

/**
 * Güneş burcu — astronomy-engine ekliptik boylam (FAZ 5B).
 * GeoVector(Sun) → Ecliptic() → elon (0-360°) → 30°'lik dilimler.
 * Fallback: takvim ay/gün yaklaşımı (yalnız AE başarısız olursa).
 */
function getSunSign(date: Date): string {
  try {
    const vec = AE.GeoVector(AE.Body.Sun, date, true);
    const ecl = AE.Ecliptic(vec);
    const idx  = Math.floor(ecl.elon / 30) % 12;
    return SUN_ZODIAC_NAMES[idx] ?? _legacySunSign(date);
  } catch {
    return _legacySunSign(date);
  }
}

/** Güneş burcu + emoji — dış bileşenler için (app/page.tsx, audit). */
export function getSunSignInfo(date: Date): { name: string; emoji: string } {
  const name = getSunSign(date);
  return { name, emoji: ZODIAC_SYMBOL[name] ?? "☉" };
}

/** Legacy Güneş burcu — audit/karşılaştırma için. */
export function getSunSignLegacy(date: Date): string {
  return _legacySunSign(date);
}

// ─── AE ekliptik burç (tablosuz; FAZ 1E) ─────────────────────────────────────

/**
 * Herhangi bir gezegen için AE ekliptik boylam → tropikal burç adı.
 * AE başarısız olursa "" döner (yanlış tabloya dönülmez → çağıran outOfRange yapar).
 */
function aeSignName(body: AE.Body, date: Date): string {
  try {
    const ecl = AE.Ecliptic(AE.GeoVector(body, date, true));
    const idx = Math.floor((((ecl.elon % 360) + 360) % 360) / 30);
    return SUN_ZODIAC_NAMES[idx] ?? "";
  } catch {
    return "";
  }
}

// ─── AE ingress dönem motoru (FAZ 1D) ────────────────────────────────────────
// getPlanetSignPeriod için: gezegenin SEÇİLİ TARİHTEKİ burcunda KESİN BİTİŞİK kalış
// aralığı (from = bu burca son giriş, to = sonraki çıkış; Türkiye saati). Retro
// kaynaklı kısa wobble'lar bitişik kalışı doğal olarak böler. AE → tarih sınırı yok.

const SIGN_PERIOD_BODY: Record<PlanetKey, AE.Body> = {
  "Güneş":   AE.Body.Sun,     "Merkür": AE.Body.Mercury, "Venüs":  AE.Body.Venus,
  "Mars":    AE.Body.Mars,    "Jüpiter": AE.Body.Jupiter, "Satürn": AE.Body.Saturn,
  "Uranüs":  AE.Body.Uranus,  "Neptün": AE.Body.Neptune,  "Plüton": AE.Body.Pluto,
};
// Adım, en kısa olası bitişik kalıştan küçük olmalı (hızlı gezegen 1g, yavaş 3g güvenli).
const SIGN_PERIOD_STEP_DAYS: Record<PlanetKey, number> = {
  "Güneş": 1, "Merkür": 1, "Venüs": 1, "Mars": 1,
  "Jüpiter": 3, "Satürn": 3, "Uranüs": 3, "Neptün": 3, "Plüton": 3,
};
const SIGN_PERIOD_TR_OFFSET = 3 * 3_600_000;          // Türkiye UTC+3 sabit
const SIGN_PERIOD_CAP_MS = 40 * 365 * 86_400_000;     // arama tavanı (Plüton ~20y/burç)

function aeSignIndexAt(body: AE.Body, ms: number): number {
  const elon = AE.Ecliptic(AE.GeoVector(body, new Date(ms), true)).elon;
  return Math.floor((((elon % 360) + 360) % 360) / 30);
}
function aeSignPeriodTrDate(ms: number): string {
  const d = new Date(ms + SIGN_PERIOD_TR_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
/** inT s0 burcunda, outT farklı burçta → sınır anını ikili aramayla bulur (~dakika). */
function aeSignBoundary(body: AE.Body, inT: number, outT: number, s0: number): number {
  let i = inT, o = outT;
  for (let k = 0; k < 44; k++) {
    const mid = (i + o) / 2;
    if (aeSignIndexAt(body, mid) === s0) i = mid; else o = mid;
  }
  return i;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

const PLANET_DEFS: ReadonlyArray<{ key: PlanetKey; symbol: string; body: AE.Body | null }> = [
  { key: "Güneş",   symbol: "☉", body: null },          // null → getSunSign (AE + takvim yedeği)
  { key: "Merkür",  symbol: "☿", body: AE.Body.Mercury },
  { key: "Venüs",   symbol: "♀", body: AE.Body.Venus   },
  { key: "Mars",    symbol: "♂", body: AE.Body.Mars    },
  { key: "Jüpiter", symbol: "♃", body: AE.Body.Jupiter },
  { key: "Satürn",  symbol: "♄", body: AE.Body.Saturn  },
  { key: "Uranüs",  symbol: "♅", body: AE.Body.Uranus  },
  { key: "Neptün",  symbol: "♆", body: AE.Body.Neptune },
  { key: "Plüton",  symbol: "♇", body: AE.Body.Pluto   },
];

/**
 * Verilen tarih için Güneş + 8 gezegen burç konumlarını döner.
 * Ay bu listede yer almaz; çağıran kod moon.ts → getMoonSign() kullanmalıdır.
 * Tüm gezegenler AE GeoVector+Ecliptic ile — tarih sınırı yok, tablo yok.
 * AE hesaplanamazsa (yalnız Güneş dışı) sign="" + outOfRange:true (yanlış tabloya dönülmez).
 */
export function getPlanetSigns(date: Date): PlanetInfo[] {
  return PLANET_DEFS.map(({ key, symbol, body }) => {
    const sign = body === null ? getSunSign(date) : aeSignName(body, date);
    return {
      key,
      symbol,
      sign,
      signSymbol: ZODIAC_SYMBOL[sign] ?? "",
      outOfRange: sign === "",
    };
  });
}

/**
 * Verilen gezegen ve tarih için, gezegenin o tarihte bulunduğu burçta KESİN BİTİŞİK
 * kalış aralığını döner (from = bu burca son giriş, to = sonraki çıkış; Türkiye saati).
 * astronomy-engine ingress hesabı (FAZ 1D) — tarih sınırı yok; retro wobble'lar
 * bitişik kalışı doğal olarak böler. AE başarısız olursa null.
 */
export function getPlanetSignPeriod(
  key: PlanetKey,
  date: Date,
): { from: string; to: string } | null {
  try {
    const body = SIGN_PERIOD_BODY[key];
    const step = SIGN_PERIOD_STEP_DAYS[key] * 86_400_000;
    const t0   = date.getTime();
    const s0   = aeSignIndexAt(body, t0);

    // from: geriye doğru bu burca giriş anı
    let prev = t0, cur = t0 - step;
    const backCap = t0 - SIGN_PERIOD_CAP_MS;
    while (cur > backCap && aeSignIndexAt(body, cur) === s0) { prev = cur; cur -= step; }
    const fromMs = aeSignIndexAt(body, cur) === s0 ? cur : aeSignBoundary(body, prev, cur, s0);

    // to: ileriye doğru bu burçtan çıkış anı
    prev = t0; cur = t0 + step;
    const fwdCap = t0 + SIGN_PERIOD_CAP_MS;
    while (cur < fwdCap && aeSignIndexAt(body, cur) === s0) { prev = cur; cur += step; }
    const toMs = aeSignIndexAt(body, cur) === s0 ? cur : aeSignBoundary(body, prev, cur, s0);

    return { from: aeSignPeriodTrDate(fromMs), to: aeSignPeriodTrDate(toMs) };
  } catch {
    return null;
  }
}
