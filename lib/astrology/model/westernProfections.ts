// Astroloji — YILLIK PROFEKSİYONLAR (Batı, tropikal) PROVIDER-BAĞIMSIZ model (SAF; istemci de import edebilir).
//
// Yöntem (owner kararı 2026-10-20): temel ASC profeksiyonu, BÜTÜN-BURÇ (whole sign). Her tamamlanmış yaş Yükselen
// burçtan bir burç ilerler; etkin ev = yaş mod 12 + 1; yılın yöneticisi = etkin burcun KLASİK yöneticisi (yedi gezegen,
// dış gezegenler yönetici değildir). Hesabı sağlayıcı yapar (Roxy POST /astrology/profections); bu dosyada astronomik
// hesap YOKTUR. Yalnız seçilen profeksiyon yaşının tarih aralığı (doğum günü takvim aritmetiği) burada üretilir.
//
// FAZ 0 gerçek doğrulama (2026-10-19, 15 çağrı, kanıt C:\YasamSistemi-Denetim-2026-10-19\profeksiyon-faz0): sağlayıcı
// yaşı doğum gününün KENDİSİNDE artırır; 29 Şubat doğumlularda artık olmayan yılda 28 Şubat hâlâ önceki yaştır, yeni
// yaş 1 Mart'ta başlar; artık yılda 29 Şubat'ta başlar. Aşağıdaki tarih aralığı bu davranışın birebir aynısıdır.
// 2026-10-20 owner kararı: sağlayıcının KISA otomatik açıklaması (interpretation + summary) ayrı yorum katmanında "Sistem Yorumu"
// olarak gösterilir; metin değiştirilmez/üretilmez. Kapsamlı profesyonel yorum motoru satış sonrasına ertelendi.

import type { SignId } from "./western";

export const PROFECTIONS_TECHNICAL_SCHEMA = "astro.western.profections.v1" as const;
export const PROFECTIONS_INTERP_SCHEMA = "astro.western.profections.interp.v1" as const;

/** Sistem Yorumu katmanı: sağlayıcının kısa açıklaması ve özeti AYNEN (geçersiz/boş → null; uydurulmaz). */
export type ProfectionsInterpretation = {
  schema: typeof PROFECTIONS_INTERP_SCHEMA;
  text: string | null;
  summary: string | null;
};
export const PROFECTIONS_INTERP_NOTE = "Otomatik oluşturulan kısa astrolojik açıklama. Kapsamlı uzman değerlendirmesi değildir.";
export const PROFECTIONS_INTERP_MISSING = "Bu hesaplama için otomatik açıklama sağlanamadı.";

/** Bu teknikte sağlayıcıdan her zaman istenen ev sistemi (natal modülün ev tercihi DEĞİŞMEZ). */
export const PROFECTIONS_HOUSE_SYSTEM = "whole-sign" as const;
/** Seçilebilir en büyük tamamlanmış yaş. */
export const PROFECTION_AGE_MAX = 120;

/** Klasik yedi gezegen (yılın yöneticisi yalnız bunlardan biri olabilir). */
export const PROFECTION_LORDS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
export type ProfectionLord = (typeof PROFECTION_LORDS)[number];

export type ProfectionsTechnical = {
  schema: typeof PROFECTIONS_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  method: "annual_asc_whole_sign";
  houseSystem: typeof PROFECTIONS_HOUSE_SYSTEM;
  rulership: "traditional_seven";
  /** Tamamlanmış yaş (sağlayıcı yanıtı; istenen yaşla aynı olduğu doğrulanır). */
  age: number;
  /** Sağlayıcıya gönderilen hedef tarih = profeksiyon yılının ilk günü. */
  targetDate: string;
  /** Profeksiyon yılının ilk ve son günü (doğum yeri takvimi; ikisi dahil). */
  yearStart: string;
  yearEnd: string;
  /** Doğum 29 Şubat ise true (ekranda açıklama gösterilir). */
  leapDayBirth: boolean;
  profectedHouse: number;
  profectedSign: SignId;
  lordOfYear: ProfectionLord;
  /** Yöneticinin doğum haritasındaki burcu ve BÜTÜN-BURÇ evi. */
  lordNatal: { sign: SignId; house: number };
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Geçerli bir takvim günü mü (YYYY-MM-DD)? */
function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const x = ISO_DATE.exec(iso);
  if (!x) return null;
  const y = Number(x[1]);
  const m = Number(x[2]);
  const d = Number(x[3]);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y, m, d } : null;
}

/** Bir yaşın başladığı gün (sınır denetimi yok). 29 Şubat doğumu artık olmayan yılda 1 Mart'ta başlar. */
function startOf(b: { y: number; m: number; d: number }, age: number): string {
  const y = b.y + age;
  if (b.m === 2 && b.d === 29 && !isLeap(y)) return `${pad(y, 4)}-03-01`;
  return `${pad(y, 4)}-${pad(b.m)}-${pad(b.d)}`;
}

/** Tamsayı yaş (sayı veya rakam dizgesi) 0…PROFECTION_AGE_MAX, değilse null. */
export function profectionAgeOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= PROFECTION_AGE_MAX ? n : null;
}

/** Seçilen tamamlanmış yaşın profeksiyon yılı: ilk gün (= sağlayıcı hedef tarihi) ve son gün. Geçersizse null. */
export function profectionYearRange(birthDate: string, age: number): { start: string; end: string } | null {
  const b = parseIso(birthDate);
  if (!b || profectionAgeOf(age) === null) return null;
  const start = startOf(b, age);
  const next = parseIso(startOf(b, age + 1))!;
  const end = new Date(Date.UTC(next.y, next.m - 1, next.d) - 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

/** Verilen takvim gününde tamamlanmış yaş (aynı doğum günü kuralı). Doğumdan önceyse veya geçersizse null. */
export function profectionAgeOn(birthDate: string, onDate: string): number | null {
  const b = parseIso(birthDate);
  const t = parseIso(onDate);
  if (!b || !t || onDate < birthDate) return null;
  let age = t.y - b.y;
  if (onDate < startOf(b, age)) age -= 1;
  return age >= 0 && age <= PROFECTION_AGE_MAX ? age : null;
}

export const isLeapDayBirth = (birthDate: string) => birthDate.slice(5) === "02-29";
