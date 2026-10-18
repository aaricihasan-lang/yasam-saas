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
 * Birden fazla özel sayı varken 10. çakra desteği politikası — OWNER KARARI BEKLİYOR (Karar C).
 *
 *   "tek-destek"   : 03.10.2026 nihai kararının LAFZI ("Özel Ana Kulvar: YALNIZ 10. çakraya BİR
 *                    destek + sadeleşmiş hâlin çakrasına bir destek"; eğitim notu s.2). VARSAYILAN.
 *   "her-ozel-sayi": her özel sayı (11/19/22/33) için ayrı 10. çakra desteği. Hiçbir kaynakta
 *                    tanımlı değil; owner onaylarsa yalnız bu sabit değiştirilir.
 */
export type OzelSayi10Politikasi = "tek-destek" | "her-ozel-sayi";
export const OZEL_SAYI_10_POLITIKASI: OzelSayi10Politikasi = "tek-destek";

/**
 * Ana Kulvar'ın YAPISAL özel sayı oluşumları (gösterim metni PARSE EDİLMEZ). calcAnaKulvar'ın
 * karar dallarının yapısal karşılığı:
 *   - parça-özel(ler) (değeri 11/19/22/33 olan isim/soyisim parçası) + özel kalan (kalanların
 *     sadeleşmişi özelse, ör. "11/19"),
 *   - parça-özel yoksa: calcAnaKulvar'ın seçtiği ikili özel oluşum (en büyük özel; ilk bulunan çift)
 *     + ana hane özelse o da ("11/11": [2,9,2,9]).
 * Boş dizi → özel Ana Kulvar DEĞİL (özel parça ve özel çift yok; toplam 11/19/22/33 olsa bile —
 * bu durum Karar A kapsamında owner'a bırakıldı, mevcut "isim sadeleşmeleri + Ana Kulvar" dalı).
 */
export function kulvarOzelSayilari(values: readonly number[]): number[] {
  const nonZero = values.filter((v) => v > 0);
  const specials = nonZero.filter((v) => SPECIAL_NUMBERS.has(v));
  const rest = nonZero.filter((v) => !SPECIAL_NUMBERS.has(v));
  if (specials.length > 0) {
    const out = [...specials];
    if (rest.length > 0) {
      const kalan = reduceNumber(rest.reduce((a, b) => a + b, 0), true);
      if (SPECIAL_NUMBERS.has(kalan)) out.push(kalan);
    }
    return out;
  }
  let best: { specialNum: number; i: number; j: number } | null = null;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] === 0 || values[j] === 0) continue;
      const sRed = reduceNumber(values[i] + values[j], true);
      if (SPECIAL_NUMBERS.has(sRed) && (!best || sRed > best.specialNum)) best = { specialNum: sRed, i, j };
    }
  }
  if (!best) return [];
  const { i, j } = best;
  const base = values.filter((v, k) => v > 0 && k !== i && k !== j);
  const out = [best.specialNum];
  if (base.length > 0) {
    const ana = reduceNumber(base.reduce((a, b) => a + b, 0), true);
    if (SPECIAL_NUMBERS.has(ana)) out.push(ana);
  }
  return out;
}

/**
 * Özel kulvarın çakra destekleri: 10. çakra (politikaya göre tek ya da özel sayı başına) +
 * sadeleşmiş hâl 1–9 ise onun çakrası. Sadeleşmiş hâl yoksa / özelse ek destek YOK (sahte "/0" yok).
 */
export function ozelKulvarCakraDestekleri(
  ozelSayilar: readonly number[],
  sadelesmis: number | null,
  politika: OzelSayi10Politikasi = OZEL_SAYI_10_POLITIKASI,
): number[] {
  if (ozelSayilar.length === 0) return [];
  const onlar = politika === "tek-destek" ? 1 : ozelSayilar.length;
  const out: number[] = Array.from({ length: onlar }, () => 10);
  if (sadelesmis !== null && Number.isInteger(sadelesmis) && sadelesmis >= 1 && sadelesmis <= 9) out.push(sadelesmis);
  return out;
}

/**
 * Çakra sütunu — Ana Kulvar destekleri.
 *
 * NİHAİ KULLANICI KARARI (2026-10-03) — kullanıcı notu s.2 "Çakra Sütunu" ana metodolojidir:
 *   - Özel Ana Kulvar (11/19/22/33): YALNIZ 10. çakraya bir destek + sadeleşmiş halin çakrasına
 *     bir destek. Örnek "19/2" → [10, 2] ("19 için 10. sütuna bir destek, 19/2'nin 2'si için 2.
 *     sütuna bir destek attık"). İsim/soyisim sadeleşmeleri bu durumda EKLENMEZ
 *     (eski davranış [2, 1, 10, 2] idi).
 *   - Diğer durumlar (değişmedi): her isim/soyisim sadeleşmesi + Ana Kulvar
 *     (ör. isimler 1, 6, soyisim 8 → 1-6-8-6).
 *
 * 2026-10-18 DÜZELTMESİ (sayı kaybı): "özel" tespiti ve "sadeleşmiş hâl" artık gösterim metninden
 * değil YAPISAL veriden gelir — özel oluşum = `kulvarOzelSayilari(componentValues)`, sadeleşmiş
 * hâl = calcAnaKulvar `key` (yorum sayısı). Önceki `split("/", 2)` okuması "11/11/4" ve
 * "22/11/4"te sadeleşmiş 4'ü düşürüyor ([10]), tek parçalı "19"a hiç 10. çakra vermiyordu ([1,1]).
 */
export function anaKulvarCakraDestekleri(firstName: string, lastName: string): number[] {
  const info = calcAnaKulvar(firstName, lastName);
  const ozel = kulvarOzelSayilari(info.componentValues ?? []);
  if (ozel.length > 0) return ozelKulvarCakraDestekleri(ozel, Number(info.key));

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
 * `anaKulvarCakraDestekleri` ile aynı kural: özelse 10 + sadeleşmiş hâl (key), değilse parça
 * değerleri + toplamın tek hanesi (özel olmayan parçada parça değeri = kelimenin sadeleşmiş değeri).
 */
export function anaKulvarCakraDesteklerindenBilesen(values: readonly number[], key: string | number | null | undefined): number[] {
  const ozel = kulvarOzelSayilari(values);
  if (ozel.length > 0) return ozelKulvarCakraDestekleri(ozel, Number(key));
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
