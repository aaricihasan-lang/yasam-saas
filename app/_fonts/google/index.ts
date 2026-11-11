/**
 * Uygulama geneli (root layout) yazı tipi aileleri: Geist, Geist Mono, Fraunces ve Jost — önceki next/font/google kurulumunun
 * global CSS'iyle aynı yapı: aynı aile adları, Google'ın sunduğu aynı alt küme dosyaları (bayt bayt), aynı unicode-range
 * ayrımı, aynı ön yükleme (latin; Fraunces / Jost için latin + latin-ext) ve aynı yedek font metrikleri
 * (yedek-metrikler.css). Alt küme ayrımı korunduğu için Türkçe harflerin harf aralığı / satır kırılması önceki gibidir.
 * Kaynak ve doğrulama: app/_fonts/FONTLAR.md.
 *
 * Sıra Google CSS'iyle aynıdır; aralıklar örtüşmediğinden seçim sıradan bağımsızdır.
 */
import geistCyrillicExt from "./geist-cyrillic-ext";
import geistCyrillic from "./geist-cyrillic";
import geistVietnamese from "./geist-vietnamese";
import geistLatinExt from "./geist-latin-ext";
import geistLatin from "./geist-latin";
import geistMonoCyrillicExt from "./geist-mono-cyrillic-ext";
import geistMonoCyrillic from "./geist-mono-cyrillic";
import geistMonoSymbols2 from "./geist-mono-symbols2";
import geistMonoVietnamese from "./geist-mono-vietnamese";
import geistMonoLatinExt from "./geist-mono-latin-ext";
import geistMonoLatin from "./geist-mono-latin";
import frauncesVietnamese from "./fraunces-vietnamese";
import frauncesLatinExt from "./fraunces-latin-ext";
import frauncesLatin from "./fraunces-latin";
import jostCyrillic from "./jost-cyrillic";
import jostLatinExt from "./jost-latin-ext";
import jostLatin from "./jost-latin";

const FONTLAR = [
  geistCyrillicExt,
  geistCyrillic,
  geistVietnamese,
  geistLatinExt,
  geistLatin,
  geistMonoCyrillicExt,
  geistMonoCyrillic,
  geistMonoSymbols2,
  geistMonoVietnamese,
  geistMonoLatinExt,
  geistMonoLatin,
  frauncesVietnamese,
  frauncesLatinExt,
  frauncesLatin,
  jostCyrillic,
  jostLatinExt,
  jostLatin,
];

/**
 * <html> öğesine eklenecek değişken sınıfları: --font-geist-sans (gövde), --font-geist-mono, --font-fraunces ve --font-jost
 * (modül değişkenleri bunlara bağlanır: degiskenler.css). Aynı değişkeni tanımlayan sınıfların değerleri birebir aynıdır.
 */
export const globalFontVars = FONTLAR.map((f) => f.variable).join(" ");
