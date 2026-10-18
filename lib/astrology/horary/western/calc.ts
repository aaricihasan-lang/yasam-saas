// Gökyüzü Atlası — Klasik Batı Horary: doğrulanabilir teknik hesap katmanı (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// DURUM: "GELİŞTİRİLDİ — TEST BEKLİYOR / EĞİTMEN ONAYI GEREKİYOR". Girdi = soru anında Roxy /astrology/natal-chart
// (tropikal) yanıtından gelen boylam + günlük hız + ASC. Burada YALNIZ açık tanımlı matematik vardır; hüküm (evet/hayır,
// "olur/olmaz") ÜRETİLMEZ. Ekole bağlı her eşik `HoraryProfile` içinde adlandırılmış parametredir ve kaynağı yazılıdır.
//
// Bilinçli olarak YAPILMAYANLAR (bkz. docs/astrology/horary/): Regiomontanus / Alcabitius evleri (Roxy'de yok; yerel ev
// hesabı yapılmaz), ışık aktarımı / toplanması / engelleme / refranation hükmü (gelecekteki kesinleşme sırası gerekir →
// Roxy aylık açı olayları + ekol tanımı), olay zamanlaması.

import { CLASSICAL_PLANETS, DOMICILE, EXALTATION, LILLY_POINTS, TRIPLICITY, degInSign, detrimentSigns, elementOf, faceRuler, fallSign, signOf, termRuler, type ClassicalPlanet, type TermsVariant, type TriplicityVariant } from "./tables";

export const n360 = (x: number) => ((x % 360) + 360) % 360;
/** −180…+180 aralığına sarılmış fark. */
export const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

// ─── Ekol profilleri ────────────────────────────────────────────────────────────────────────────
export type HoraryProfile = {
  id: string;
  label: string;
  triplicity: TriplicityVariant;
  terms: TermsVariant;
  /** Yanma (combust) sınırı, derece. Lilly CA s. 113: 8°30′. */
  combust: number;
  /** Güneş ışınları altında, derece. Lilly: 17°. Bazı modern kaynaklar 15°. */
  underBeams: number;
  /** Cazimi (Güneş'in kalbinde), derece. Lilly: 17′ (= 0.2833°); bazı kaynaklar 16′. */
  cazimi: number;
  /** Via Combusta. Lilly: Terazi 15° – Akrep 15° (tropikal 195°–225°). Bazı kaynaklar Terazi 19° – Akrep 3°. */
  viaCombusta: [number, number];
  /** Şans Noktası (Pars Fortunae): Lilly gündüz/gece AYNI formül (ASC + Ay − Güneş); Helenistik/Roxy: gece ters. */
  fortune: "lilly_same" | "sect_reversed";
  /** Ay boşlukta: hangi açılar ve hangi gezegenler sayılır. */
  voc: { aspects: number[]; bodies: string[] };
  /** Erken / geç ASC uyarısı (Lilly "considerations before judgement": 3° altı, 27° üstü). */
  ascEarly: number;
  ascLate: number;
  sources: string[];
  /** Bağımsız olarak DOĞRULANAMAYAN tablo/eşik kimlikleri (kaynak tıpkıbasımından satır satır teyit gerekir). */
  unverified: string[];
};

export const PROFILE_LILLY_1647: HoraryProfile = {
  id: "lilly-1647",
  label: "William Lilly, Christian Astrology (1647) — yalnız tablo ve eşikler",
  triplicity: "lilly",
  terms: "ptolemaic",
  combust: 8.5,
  underBeams: 17,
  cazimi: 17 / 60,
  viaCombusta: [195, 225],
  fortune: "lilly_same",
  voc: { aspects: [0, 60, 90, 120, 180], bodies: ["saturn", "jupiter", "mars", "sun", "venus", "mercury"] },
  ascEarly: 3,
  ascLate: 27,
  sources: ["W. Lilly, Christian Astrology (1647), I: s. 104 (asalet tablosu), s. 113 (yanma), s. 115 (puanlar), s. 121–123 (considerations); II–III (horary)"],
  // Ptolemaik terim tablosu bellekteki yayımlanmış tablodan girildi; çevrimiçi metin kaynağında yalnız Koç satırı teyit
  // edilebildi (Jüpiter 0–6, Venüs 6–14). Mısır terimlerinin aksine bağımsız sağlama toplamı YOK → DOĞRULANAMADI.
  unverified: ["terms:ptolemaic"],
};
export const PROFILE_DOROTHEAN_EGYPTIAN: HoraryProfile = {
  ...PROFILE_LILLY_1647,
  id: "dorothean-egyptian",
  label: "Dorothean üçlüler + Mısır terimleri (Helenistik/ortaçağ tablo seti)",
  triplicity: "dorothean",
  terms: "egyptian",
  fortune: "sect_reversed",
  sources: ["Dorotheus, Carmen Astrologicum I.1 (üçlüler)", "Ptolemy, Tetrabiblos I.20–21 (Mısır terimleri)", "Vettius Valens, Anthology II.2–3 (Şans noktası gece ters)"],
  // Dorothean ortak (participating) üçlü yöneticinin puanlamaya katılıp katılmadığı kaynaklar arasında değişir.
  unverified: ["triplicity:participating-scoring"],
};

// ─── Asalet ───────────────────────────────────────────────────────────────────────────────────
export type EssentialDignity = {
  planet: ClassicalPlanet;
  sign: string;
  domicile: boolean;
  exaltation: boolean;
  triplicity: boolean;
  term: boolean;
  face: boolean;
  detriment: boolean;
  fall: boolean;
  /** Lilly: hiçbir asalet (ev/yücelme/üçlü/terim/yüz) yoksa peregrine. */
  peregrine: boolean;
  score: number;
  /** Bu burç-derecede her asaletin sahibi (karşılıklı kabul vb. için). */
  rulers: { domicile: ClassicalPlanet; exaltation: ClassicalPlanet | null; triplicity: ClassicalPlanet; term: ClassicalPlanet; face: ClassicalPlanet };
};

export function triplicityRuler(lon: number, isDay: boolean, variant: TriplicityVariant): ClassicalPlanet {
  const [d, n] = TRIPLICITY[variant][elementOf(signOf(lon))];
  return isDay ? d : n;
}
export function rulersAt(lon: number, isDay: boolean, p: HoraryProfile): EssentialDignity["rulers"] {
  const s = signOf(lon);
  const ex = (CLASSICAL_PLANETS as readonly ClassicalPlanet[]).find((x) => EXALTATION[x].sign === s) ?? null;
  return { domicile: DOMICILE[s], exaltation: ex, triplicity: triplicityRuler(lon, isDay, p.triplicity), term: termRuler(lon, p.terms), face: faceRuler(lon) };
}
export function essentialDignity(planet: ClassicalPlanet, lon: number, isDay: boolean, p: HoraryProfile): EssentialDignity {
  const s = signOf(lon);
  const r = rulersAt(lon, isDay, p);
  // Lilly'nin tablosunda ortak üçlü yöneticisi yoktur; Dorothean'da ortak yönetici de üçlü asaleti sayılır.
  const trip = TRIPLICITY[p.triplicity][elementOf(s)];
  const d = {
    domicile: r.domicile === planet,
    exaltation: r.exaltation === planet,
    triplicity: (isDay ? trip[0] : trip[1]) === planet || trip[2] === planet,
    term: r.term === planet,
    face: r.face === planet,
    detriment: detrimentSigns(planet).includes(s),
    fall: fallSign(planet) === s,
  };
  const peregrine = !d.domicile && !d.exaltation && !d.triplicity && !d.term && !d.face;
  const L = LILLY_POINTS;
  const score =
    (d.domicile ? L.domicile : 0) + (d.exaltation ? L.exaltation : 0) + (d.triplicity ? L.triplicity : 0) + (d.term ? L.term : 0) + (d.face ? L.face : 0) + (d.detriment ? L.detriment : 0) + (d.fall ? L.fall : 0) + (peregrine ? L.peregrine : 0);
  return { planet, sign: s, ...d, peregrine, score, rulers: r };
}

/** Roxy'nin `dignity` alanıyla (yalnız burç bazlı) karşılaştırılabilir sınıf. */
export function signOnlyDignity(planet: ClassicalPlanet, lon: number): "domicile" | "exaltation" | "detriment" | "fall" | "peregrine" {
  const s = signOf(lon);
  if (DOMICILE[s] === planet) return "domicile";
  if (EXALTATION[planet].sign === s) return "exaltation";
  if (detrimentSigns(planet).includes(s)) return "detriment";
  if (fallSign(planet) === s) return "fall";
  return "peregrine";
}

/** A'nın bulunduğu yerde B'nin sahip olduğu asaletler (B, A'yı "kabul eder"). */
export function receptionsOf(aLon: number, b: ClassicalPlanet, isDay: boolean, p: HoraryProfile): (keyof EssentialDignity["rulers"])[] {
  const r = rulersAt(aLon, isDay, p);
  return (Object.keys(r) as (keyof typeof r)[]).filter((k) => r[k] === b);
}
export type Reception = { a: ClassicalPlanet; b: ClassicalPlanet; aReceivedBy: string[]; bReceivedBy: string[]; mutual: boolean };
export function reception(a: { id: ClassicalPlanet; lon: number }, b: { id: ClassicalPlanet; lon: number }, isDay: boolean, p: HoraryProfile): Reception {
  const aBy = receptionsOf(a.lon, b.id, isDay, p);
  const bBy = receptionsOf(b.lon, a.id, isDay, p);
  return { a: a.id, b: b.id, aReceivedBy: aBy, bReceivedBy: bBy, mutual: aBy.length > 0 && bBy.length > 0 };
}

// ─── Sect / Şans noktası ─────────────────────────────────────────────────────────────────────
/** Güneş ufkun üstünde mi? Güneş ekliptik üzerindedir → ASC'den geriye (MC yönü) 0–180° içindeyse üstte. */
export const isDayChart = (sunLon: number, ascLon: number) => {
  const d = n360(ascLon - sunLon);
  return d > 0 && d < 180;
};
export function partOfFortune(asc: number, sun: number, moon: number, isDay: boolean, mode: HoraryProfile["fortune"]): number {
  return mode === "lilly_same" || isDay ? n360(asc + moon - sun) : n360(asc + sun - moon);
}

// ─── Açılar: yaklaşan / ayrılan (anlık, hızlardan) ───────────────────────────────────────────────
export type Mover = { id: string; lon: number; speed: number };
export type AspectState = {
  a: string;
  b: string;
  angle: number;
  /** İşaretli sapma: (b − a) ile hedef açı arasındaki en yakın fark. */
  orb: number;
  applying: boolean;
  /** DOĞRUSAL tahmin (gün); sabit hız varsayar → kesinleşme anı DEĞİLDİR. İstasyon yakınında anlamsız (null). */
  linearDaysToExact: number | null;
};
export function aspectState(a: Mover, b: Mover, angle: number): AspectState {
  const sep = n360(b.lon - a.lon);
  const cands = angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle];
  const errs = cands.map((c) => wrap180(sep - c));
  const e = errs.reduce((m, x) => (Math.abs(x) < Math.abs(m) ? x : m));
  const rel = b.speed - a.speed; // ayrılığın değişim hızı
  const applying = e * rel < 0;
  const days = Math.abs(rel) < 1e-6 ? null : -e / rel;
  return { a: a.id, b: b.id, angle, orb: e, applying, linearDaysToExact: days !== null && days >= 0 ? days : null };
}

// ─── Güneş'e yakınlık ──────────────────────────────────────────────────────────────────────────
export type SolarPhase = "cazimi" | "combust" | "under_beams" | "free";
export function solarPhase(planetLon: number, sunLon: number, p: HoraryProfile): { phase: SolarPhase; distance: number } {
  const d = Math.abs(wrap180(planetLon - sunLon));
  return { distance: d, phase: d <= p.cazimi ? "cazimi" : d <= p.combust ? "combust" : d <= p.underBeams ? "under_beams" : "free" };
}

export const inViaCombusta = (lon: number, p: HoraryProfile) => n360(lon) >= p.viaCombusta[0] && n360(lon) < p.viaCombusta[1];

// ─── Ay: son / sonraki açı, boşlukta Ay (OLAY listesinden) ─────────────────────────────────────────
/**
 * Girdi: kesinleşme olayları (ör. Roxy /vedic-astrology/aspects/lunar coordinateSystem=tropical) + Ay'ın burç girişi
 * (Roxy /astrology/transits/monthly). Açı mesafesi iki gövdenin AYNI andaki boylam farkıdır → ayanamsa iki tarafa eşit
 * uygulandığından açı olayı zodyak çerçevesinden bağımsızdır; burç girişi ise çerçeveye bağlıdır (tropikal kullanılmalı).
 * NOT: Bu olay uçlarından henüz gerçek golden alınmadı (owner onayıyla ≤4 çağrı) → fonksiyon sentetik/bağımsız veriyle test edilir.
 */
export type MoonEvent = { atUtc: string; body: string; angle: number };
export function moonContext(events: MoonEvent[], atUtc: string, nextIngressUtc: string, p: HoraryProfile) {
  const t = Date.parse(atUtc);
  const end = Date.parse(nextIngressUtc);
  const usable = events.filter((e) => p.voc.aspects.includes(e.angle) && p.voc.bodies.includes(e.body)).sort((x, y) => Date.parse(x.atUtc) - Date.parse(y.atUtc));
  const last = [...usable].reverse().find((e) => Date.parse(e.atUtc) <= t) ?? null;
  const nextInSign = usable.filter((e) => Date.parse(e.atUtc) > t && Date.parse(e.atUtc) < end);
  return { last, next: nextInSign[0] ?? null, nextInSign, voidOfCourse: nextInSign.length === 0, ingressUtc: nextIngressUtc };
}

// ─── Yorum öncesi dikkat noktaları (yalnız konumsal; HÜKÜM DEĞİL) ─────────────────────────────────
export function considerations(x: { asc: number; moon: number; saturnHouse: number | null }, p: HoraryProfile): string[] {
  const out: string[] = [];
  const a = degInSign(x.asc);
  if (a < p.ascEarly) out.push("asc_early");
  if (a >= p.ascLate) out.push("asc_late");
  if (inViaCombusta(x.moon, p)) out.push("moon_via_combusta");
  if (degInSign(x.moon) >= 29) out.push("moon_last_degree");
  if (x.saturnHouse === 1) out.push("saturn_in_1");
  if (x.saturnHouse === 7) out.push("saturn_in_7");
  return out;
}
