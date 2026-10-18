import { CHAKRA_LETTER_MAP, SPECIAL_NUMBERS, VOWELS, reduceNumber, reduceToDigit, repeatX, splitNameParts, turkishUpper } from "./ortak";
import { calcHayatYolu } from "./hayatYolu";
import { calcAnaKulvar } from "./anaKulvar";
import { hesaplaPinKodu } from "./pinKodu";

export type ChakraCounts = Record<number, number>;

function emptyCounts(): ChakraCounts {
  const counts: ChakraCounts = {};
  for (let i = 1; i <= 10; i += 1) counts[i] = 0;
  return counts;
}

export function hesaplaCakraHarfSag(firstName: string, lastName: string): ChakraCounts {
  const counts = emptyCounts();
  const text = `${firstName} ${lastName}`.trim();

  for (const ch of Array.from(turkishUpper(text))) {
    const val = CHAKRA_LETTER_MAP[ch];
    if (val && val >= 1 && val <= 9) counts[val] += 1;
  }

  return counts;
}

export function formatlaCakraHarfSag(firstName: string, lastName: string): string {
  const counts = hesaplaCakraHarfSag(firstName, lastName);
  const lines: string[] = [];
  for (let c = 10; c >= 1; c -= 1) lines.push(`${String(c).padStart(2, " ")}  ${repeatX(counts[c] || 0)}`);
  return lines.join("\n");
}

function vowelValueOfWord(word: string): number {
  let total = 0;
  for (const ch of Array.from(turkishUpper(word))) {
    if (VOWELS.has(ch)) total += CHAKRA_LETTER_MAP[ch] || 0;
  }
  if (total === 0) return 0;
  if ([11, 22, 33].includes(total)) return 10;
  return reduceToDigit(total);
}

/**
 * YALNIZ Hayat Yolu gösterimi için ("37/10", "22/4", "10/1", "7"): HY her zaman en fazla iki
 * parçalıdır. Ana Kulvar için KULLANILMAZ — Ana Kulvar gösterimi 3+ parça içerebilir
 * ("11/11/4") ve gösterim metni hesap kaynağı olamaz (bkz. kulvarCakraDestekleri).
 */
function splitDmDisplay(display: string): [number | null, number | null] {
  // Parantez içi bilgi amaçlıdır; ana değeri parse etmek için önce soy.
  const text = (display || "").trim().replace(/\s*\([^)]*\)\s*$/, "");
  if (!text) return [null, null];

  if (!text.includes("/")) {
    const n = Number(text);
    return Number.isFinite(n) ? [n, null] : [null, null];
  }

  const [leftText, rightText] = text.split("/", 2);
  const left = Number(leftText);
  const right = Number(rightText);
  return [Number.isFinite(left) ? left : null, Number.isFinite(right) ? right : null];
}

export function hayatYoluCakraDestekleri(birthDate: string): number[] {
  return hayatYoluCakraDesteklerindenGosterim(calcHayatYolu(birthDate).display);
}

/** Hayat Yolu destekleri — hazır HY gösteriminden (kayıtlı snapshot için; yeniden hesap YOK). */
export function hayatYoluCakraDesteklerindenGosterim(display: string): number[] {
  const [left, right] = splitDmDisplay(display);
  const destekler: number[] = [];

  if (left !== null) {
    for (const ch of String(left)) {
      const d = Number(ch);
      if (d >= 1 && d <= 9) destekler.push(d);
    }
  }

  if (right !== null) {
    if (right >= 10) destekler.push(10);
    else if (right >= 1 && right <= 9) destekler.push(right);
  }

  return destekler;
}

export function pinKoduCakraDestekleri(birthDate: string): number[] {
  return pinKoduCakraDesteklerindenKutular(hesaplaPinKodu(birthDate));
}

/** PİN destekleri — hazır PİN kutularından (kayıtlı snapshot için; yeniden hesap YOK). */
export function pinKoduCakraDesteklerindenKutular(b: Partial<Record<"k1" | "k2" | "k3" | "k4" | "k5" | "k6" | "k7" | "k8", unknown>>): number[] {
  return [b.k1, b.k2, b.k3, b.k4, b.k5, b.k6, b.k7, b.k8]
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 10);
}

/** Tek bir yapısal kulvar sayısının çakra karşılığı: özel (11/19/22/33) → 10. sütun; 1–9 → kendisi. */
export function kulvarSayisiCakraDestegi(n: number): number | null {
  if (SPECIAL_NUMBERS.has(n)) return 10;
  if (Number.isInteger(n) && n >= 1 && n <= 9) return n;
  return null;
}

/**
 * Özel Ana Kulvar'ın YAPISI (gösterim metni PARSE EDİLMEZ). calcAnaKulvar karar dallarının yapısal
 * karşılığı:
 *   - `ozelSayilar`: özel sayı oluşumları (özel parçalar; parça-özel yoksa seçilen özel çift; özel
 *     çift de yoksa TÜM parçaların toplamı 11/19/22/33 ise o toplam; özel olmayan parçalardan
 *     oluşan kalan da özelse o kalan).
 *   - `gercekKalan`: özel oluşuma GİRMEYEN, özel olmayan GERÇEK parçaların sadeleşmiş değeri (1–9).
 *     Kalan yoksa veya kalan kendisi özel sayı oluşturuyorsa null.
 * Hiç özel oluşum yoksa null (özel olmayan Ana Kulvar).
 */
export type KulvarOzelYapisi = { ozelSayilar: number[]; gercekKalan: number | null };

export function kulvarOzelYapisi(values: readonly number[]): KulvarOzelYapisi | null {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return null;
  const tekHane = (n: number) => (Number.isInteger(n) && n >= 1 && n <= 9 ? n : null);
  const specials = nonZero.filter((v) => SPECIAL_NUMBERS.has(v));
  const rest = nonZero.filter((v) => !SPECIAL_NUMBERS.has(v));

  if (specials.length > 0) {
    const ozelSayilar = [...specials];
    let gercekKalan: number | null = null;
    if (rest.length > 0) {
      const kalan = reduceNumber(rest.reduce((a, b) => a + b, 0), true);
      if (SPECIAL_NUMBERS.has(kalan)) ozelSayilar.push(kalan);
      else gercekKalan = tekHane(kalan);
    }
    return { ozelSayilar, gercekKalan };
  }

  let best: { specialNum: number; i: number; j: number } | null = null;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] === 0 || values[j] === 0) continue;
      const sRed = reduceNumber(values[i] + values[j], true);
      if (SPECIAL_NUMBERS.has(sRed) && (!best || sRed > best.specialNum)) best = { specialNum: sRed, i, j };
    }
  }
  if (best) {
    const { i, j } = best;
    const base = values.filter((v, k) => v > 0 && k !== i && k !== j);
    if (base.length === 0) return { ozelSayilar: [best.specialNum], gercekKalan: null };
    const kalan = reduceNumber(base.reduce((a, b) => a + b, 0), true);
    return SPECIAL_NUMBERS.has(kalan)
      ? { ozelSayilar: [best.specialNum, kalan], gercekKalan: null }
      : { ozelSayilar: [best.specialNum], gercekKalan: tekHane(kalan) };
  }

  // Özel parça ve özel çift yok: tüm parçaların toplamı özel ise parçalar o özel sayıyı oluşturur.
  const toplam = reduceNumber(nonZero.reduce((a, b) => a + b, 0), true);
  return SPECIAL_NUMBERS.has(toplam) ? { ozelSayilar: [toplam], gercekKalan: null } : null;
}

/**
 * Özel kulvarın çakra destekleri — OWNER NİHAİ KARARI (2026-10-18):
 *   - 11/19/22/33 → 10. çakraya TEK destek; birden fazla özel sayı olsa bile tek destek.
 *   - Özel sayı sadeleştirilerek ikinci destek ÜRETİLMEZ (19 → [10], 11/11 (22) → [10]).
 *   - Özel oluşuma girmeyen GERÇEK kalan bileşen varsa o da kendi çakrasına destek verir
 *     (19/5 → [10,5]; 11/11/4 → [10,4]; 5+6+5 → 11/5 → [10,5]); yoksa ek destek yok.
 */
export function ozelKulvarCakraDestekleri(yapi: KulvarOzelYapisi): number[] {
  return yapi.gercekKalan !== null ? [10, yapi.gercekKalan] : [10];
}

/**
 * Çakra sütunu — Ana Kulvar destekleri.
 *
 * Kaynak: kullanıcı notu s.2 "Çakra Sütunu" + 03.10.2026 kararı + OWNER NİHAİ KARARI 2026-10-18:
 *   - Özel Ana Kulvar → `ozelKulvarCakraDestekleri` (10 + yalnız gerçek kalan). İsim/soyisim
 *     sadeleşmeleri EKLENMEZ; özel sayıyı oluşturan parçalar ayrıca sayılmaz ([9,1,9] → 19 → [10]).
 *   - Özel olmayan Ana Kulvar (değişmedi): her isim/soyisim sadeleşmesi + Ana Kulvar
 *     (ör. isimler 1, 6, soyisim 8 → 1-6-8-6).
 *
 * 2026-10-18 DÜZELTMESİ (sayı kaybı): eski sürüm display'i `split("/", 2)` ile okuyordu →
 * "11/11/4" ve "22/11/4"te gerçek kalan 4 düşüyordu ([10]), tek parçalı "19"a 10. çakra
 * verilmiyordu ([1,1]). Artık yapısal bileşenler (`componentValues`) esas alınır.
 */
export function anaKulvarCakraDestekleri(firstName: string, lastName: string): number[] {
  const info = calcAnaKulvar(firstName, lastName);
  const yapi = kulvarOzelYapisi(info.componentValues ?? []);
  if (yapi) return ozelKulvarCakraDestekleri(yapi);

  const destekler: number[] = [];
  const nameVals: number[] = [];
  for (const part of splitNameParts(firstName, lastName)) {
    const v = vowelValueOfWord(part);
    if (v) nameVals.push(v);
  }
  if (nameVals.length > 0) {
    destekler.push(...nameVals);
    const akVal = reduceToDigit(nameVals.reduce((a, b) => a + b, 0));
    if (akVal >= 1 && akVal <= 9) destekler.push(akVal);
  }
  return destekler;
}

/**
 * Ana Kulvar destekleri — kayıtlı snapshot bileşenlerinden (isim metni olmadan; yeniden hesap YOK).
 * `anaKulvarCakraDestekleri` ile aynı kural (özel olmayan parçada parça değeri = kelimenin
 * sadeleşmiş değeri).
 */
export function anaKulvarCakraDesteklerindenBilesen(values: readonly number[]): number[] {
  const yapi = kulvarOzelYapisi(values);
  if (yapi) return ozelKulvarCakraDestekleri(yapi);
  const nameVals = values.filter((v) => v > 0);
  if (nameVals.length === 0) return [];
  const akVal = reduceToDigit(nameVals.reduce((a, b) => a + b, 0));
  return akVal >= 1 && akVal <= 9 ? [...nameVals, akVal] : [...nameVals];
}

export function hesaplaCakraSayiSol(firstName: string, lastName: string, birthDate: string): ChakraCounts {
  const counts = emptyCounts();
  const all = [
    ...hayatYoluCakraDestekleri(birthDate),
    ...pinKoduCakraDestekleri(birthDate),
    ...anaKulvarCakraDestekleri(firstName, lastName),
  ];

  for (const v of all) {
    if (v >= 1 && v <= 10) counts[v] += 1;
  }

  return counts;
}

export function formatlaCakraSayiSol(firstName: string, lastName: string, birthDate: string): string {
  const counts = hesaplaCakraSayiSol(firstName, lastName, birthDate);
  const lines: string[] = [];
  for (let c = 10; c >= 1; c -= 1) lines.push(`${String(c).padStart(2, " ")}  ${repeatX(counts[c] || 0)}`);
  return lines.join("\n");
}

export function hesaplaCakraSutunu(firstName: string, lastName: string, birthDate: string): { harfler: ChakraCounts; sayilar: ChakraCounts } {
  return {
    harfler: hesaplaCakraHarfSag(firstName, lastName),
    sayilar: hesaplaCakraSayiSol(firstName, lastName, birthDate),
  };
}

export function formatlaCakraSutunu(firstName: string, lastName: string, birthDate: string): string {
  const data = hesaplaCakraSutunu(firstName, lastName, birthDate);
  const lines: string[] = [];
  for (let c = 10; c >= 1; c -= 1) {
    const left = repeatX(data.sayilar[c] || 0);
    const right = repeatX(data.harfler[c] || 0);
    lines.push(`${left.padEnd(5, " ")} ${String(c).padStart(2, " ")} ${right}`);
  }
  return lines.join("\n");
}
