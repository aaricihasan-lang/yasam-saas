// Gökyüzü Atlası — Batı Horary (William Lilly) ekran etiketleri (SAF; yalnız sunum). Hüküm metni YOK: her etiket motorun
// ürettiği kaydın adını Türkçeleştirir. Ev konuları seçim kolaylığı içindir (klasik ev anlamları), yorum değildir.
import { BODY_GLYPHS, BODY_LABELS, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import type { BodyId, SignId } from "@/lib/astrology/model/western";

export const HOUSE_TOPICS: Readonly<Record<number, string>> = {
  2: "Para, mal, kayıp eşya",
  3: "Kardeşler, kısa yolculuk, haber",
  4: "Baba, ev, mülk, toprak",
  5: "Çocuk, hamilelik, eğlence",
  6: "Hastalık, çalışan, küçük hayvan",
  7: "Evlilik, ortak, karşı taraf",
  8: "Ölüm, ortağın parası, miras",
  9: "Uzun yolculuk, eğitim, inanç",
  10: "Meslek, makam, anne",
  11: "Dostlar, umutlar",
  12: "Gizli düşman, kapanma, büyük hayvan",
};

export const body = (id: string) => BODY_LABELS[id as BodyId] ?? id;
export const glyph = (id: string) => BODY_GLYPHS[id as BodyId] ?? "";
export const sign = (id: string) => SIGN_LABELS[id as SignId] ?? id;
export const signGlyph = (id: string) => SIGN_GLYPHS[id as SignId] ?? "";

export const ASPECT_LABEL: Readonly<Record<number, string>> = { 0: "kavuşum", 60: "altmışlık", 90: "kare", 120: "üçgen", 180: "karşıt" };
export const ASPECT_GLYPH: Readonly<Record<number, string>> = { 0: "☌", 60: "⚹", 90: "□", 120: "△", 180: "☍" };

/** 12°34′ biçimi (burç içi derece). */
export function dm(deg: number): string {
  const d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  let dd = d;
  if (m === 60) {
    m = 0;
    dd += 1;
  }
  return `${dd}°${String(m).padStart(2, "0")}′`;
}
export function lonLabel(lon: number): string {
  const n = ((lon % 360) + 360) % 360;
  const s = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][Math.floor(n / 30)];
  return `${dm(n % 30)} ${signGlyph(s)} ${sign(s)}`;
}

export const INTERPOSITION_LABEL: Readonly<Record<string, string>> = {
  prohibition: "Engelleme adayı (CA s. 110–111)",
  frustration: "Hüsran adayı (CA s. 112)",
  faster_significator_elsewhere: "Hızlı gösterge önce başka gezegene ulaşıyor",
  unresolved: "Sınıflandırılamadı — kaynak bu durumu çözmüyor",
};
export const UNRESOLVED_REASON: Readonly<Record<string, string>> = {
  event_mutual: "iki gezegen birbirine doğru hareket ediyor",
  event_station: "gezegenlerden biri istasyonda",
  event_superior_overtakes_inferior: "üst gezegen alt gezegeni yakalıyor (CA s. 108 ile çelişir)",
  ab_perfection_not_one_sided: "göstergelerin kesinleşmesi tek taraflı değil",
};
export const TRANSLATION_STATUS: Readonly<Record<string, string>> = {
  valid: "Kesintisiz",
  interrupted: "Kesintili — aktarım değil",
  order_uncertain: "Olay sırası belirsiz — kesin aktarım sayılmaz",
  motion_uncertain: "Aktaran yaklaşmıyor / istasyonda — kesin aktarım sayılmaz",
};
export const SOLAR_PHASE: Readonly<Record<string, string>> = { cazimi: "Cazimi", combust: "Yanık", under_beams: "Işın altında", free: "Serbest" };

export const CONSIDERATION_LABEL: Readonly<Record<string, string>> = {
  asc_early: "Yükselen çok erken derecede",
  asc_late: "Yükselen geç derecede",
  moon_via_combusta: "Ay Yanık Yol'da (Via Combusta)",
  moon_late_degree: "Ay burcun son derecelerinde",
  moon_void_of_course: "Ay boşlukta",
  saturn_in_1: "Satürn 1. evde",
  saturn_in_7: "Satürn 7. evde",
  lord1_combust: "1. ev yöneticisi yanık",
  lord7_afflicted: "7. ev yöneticisi zarar görmüş",
};

export const TIMELINE_TAG: Readonly<Record<string, string>> = {
  perfection: "Göstergeler kesinleşir",
  interposition: "Araya giren temas",
  translation_join: "Işık aktarımı birleşmesi",
  moon_aspect: "Ay açısı",
  moon_ingress: "Ay burç değiştirir",
  station: "İstasyon",
  ingress: "Burç girişi",
};

const ACC_BASE: Readonly<Record<string, string>> = {
  retrograde: "Geri",
  direct: "Doğrudan",
  swift: "Hızlı",
  slow: "Yavaş",
  moon_increasing: "Ay ışık artırıyor",
  moon_decreasing: "Ay ışık azaltıyor",
  oriental: "Doğulu",
  occidental: "Batılı",
  cazimi: "Cazimi",
  combust: "Yanık",
  under_beams: "Işın altında",
  free_from_combustion: "Yanıklıktan serbest",
  besieged_saturn_mars: "Satürn ile Mars arasında kuşatılmış",
  partile_conj_north_node: "Kuzey Ay Düğümü ile tam kavuşum",
  partile_conj_south_node: "Güney Ay Düğümü ile tam kavuşum",
  regulus_1647: "Regulus ile",
  spica_1647: "Spika ile",
  algol_1647: "Algol ile",
};
const PARTILE: Readonly<Record<string, string>> = { conj: "tam kavuşum", sextile: "tam altmışlık", square: "tam kare", trine: "tam üçgen", opposition: "tam karşıt" };
export function accidentalLabel(key: string): string {
  if (ACC_BASE[key]) return ACC_BASE[key];
  const h = /^house_(\d+)$/.exec(key);
  if (h) return `${h[1]}. ev`;
  const p = /^partile_(conj|sextile|square|trine|opposition)_([a-z]+)$/.exec(key);
  if (p) return `${body(p[2])} ile ${PARTILE[p[1]]}`;
  return key;
}

export const RECEPTION_LABEL: Readonly<Record<string, string>> = { domicile: "ev", exaltation: "yücelme", triplicity: "üçlü", participating: "ortak üçlü", term: "terim", face: "yüz" };

/** "29 Ekim 2026 14:30 — Europe/Istanbul (GMT+3)". */
export function offsetLabel(sec: number): string {
  const sgn = sec < 0 ? "−" : "+";
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.round((a % 3600) / 60);
  return `GMT${sgn}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
/** UTC ISO → sorunun yerel saatinde kısa tarih-saat (Intl; tarayıcı saat dilimi kullanılmaz). */
export function localAt(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
export function uncertaintyLabel(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec)) return null;
  if (sec < 90) return `±${Math.max(1, Math.round(sec))} sn`;
  if (sec < 5400) return `±${Math.round(sec / 60)} dk`;
  return `±${(sec / 3600).toFixed(1)} sa`;
}
