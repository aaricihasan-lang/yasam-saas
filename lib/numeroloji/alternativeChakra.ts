import {
  findKulvarSpecialCombinationsDetailed,
  type AlternativeCombination,
  type AlternativeVariant,
} from "./alternativeCombinations";
import {
  anaKulvarCakraDesteklerindenBilesen,
  hayatYoluCakraDesteklerindenGosterim,
  ozelKulvarCakraDestekleri,
  pinKoduCakraDesteklerindenKutular,
  type ChakraCounts,
} from "./cakraOmurgasi";
import { SPECIAL_NUMBERS } from "./ortak";

/**
 * FARKLI ÖZEL SAYI KOMBİNASYONLARI — ALTERNATİF ÇAKRA SÜTUNU (yalnız ekran içi uzman incelemesi).
 *
 * PURE, presentation/analysis-assist. RESMÎ Çakra Omurgası'nı, kayıtlı snapshot'ı, Word'ü,
 * key/display/lookup'ı DEĞİŞTİRMEZ; hiçbir şey kaydetmez, motoru yeniden çalıştırmaz.
 *
 * Kaynak = YAPISAL veri (gösterim metni parse edilmez):
 *   - alternatif yol + varyantları: `findKulvarSpecialCombinationsDetailed(componentValues)`,
 *   - resmî omurgadaki kuralın AYNISI (`ozelKulvarCakraDestekleri`, owner nihai kararı 2026-10-18):
 *     10. çakraya TEK destek (birden fazla özel sayıda da) + özel olmayan GERÇEK kalan 1–9 ise onun
 *     çakrası; kalan yoksa ek destek YOK (sahte "/0" yok). Yeni numeroloji yöntemi DEĞİL.
 *   - Aynı sayısal yol birden fazla gerçek gruplayışla oluşuyorsa (variants) katkı TEK KEZ
 *     sayılır: aynı yol = aynı özel sayılar + aynı kalan → aynı destekler (harness kanıtlar).
 *
 * ANA KULVAR alternatifi: kaydın SABİT katkıları (Hayat Yolu + PİN; kayıttaki değerlerden) korunur,
 *   yalnız Ana Kulvar katkısı alternatif yolla değiştirilir. Harf sütunu kayıttaki haliyle.
 * YAN KULVAR alternatifi (OWNER KARARI 2026-10-18 — karşılaştırmalı tam sütun): kaydın RESMÎ Çakra
 *   Omurgası (kayıttaki sayılar sütunu = Hayat Yolu + PİN + resmî Ana Kulvar) SABİT katkı olarak
 *   aynen gösterilir; alternatif Yan Kulvar katkısı ayrıca işaretlenir. Toplam yalnız uzman
 *   incelemesine yönelik VARSAYIMSAL toplamdır; resmî omurgaya hiçbir destek aktarılmaz.
 *   Harf sütunu kayıttaki haliyle.
 */

export type AlternativeChakraKind = "ana" | "yan";

export type AlternativeChakraColumn = {
  kind: AlternativeChakraKind;
  /** Alternatif yol, ör. "22/11/8". */
  path: string;
  /** Bu kombinasyonun kendi katkıları (ör. 22/11/8 → [10, 8]). */
  altSupports: number[];
  /** Yoldaki özel sayılar (ör. [22, 11]); kaç tane olursa olsun 10. çakraya tek destek. */
  ozelSayilar: number[];
  /** Bu yolun kaç farklı gerçek gruplayışla oluştuğu (katkı yine tek kez sayılır). */
  variantCount: number;
  /**
   * Sabit katkıların kaynağı. Ana: kayıttaki HY + PİN (Ana Kulvar katkısı alternatifle değişir).
   * Yan: kayıttaki resmî omurga = HY + PİN + resmî Ana Kulvar (`anaKulvar`).
   */
  fixed: { hayatYolu: number[]; pin: number[]; anaKulvar?: number[] } | null;
  /** Ana Kulvar: kaydın resmî Ana Kulvar katkısı (bu görünümde alternatifle değiştirilir). */
  officialAnaSupports: number[] | null;
  /** Sayı tarafı — sabit + alternatif (1–10). Yan Kulvar'da varsayımsal toplam (resmî DEĞİL). */
  sayilar: ChakraCounts;
  /** Sayı tarafının sabit (resmî/kayıttaki) kısmı. */
  sabitSayilar: ChakraCounts;
  /** Sayı tarafının alternatif kombinasyondan gelen kısmı. */
  alternatifSayilar: ChakraCounts;
  /** Harf tarafı (kayıttaki haliyle). */
  harfler: ChakraCounts | null;
};

type ResultLike = { display?: unknown; key?: unknown; componentValues?: unknown } | null | undefined;

export type AlternativeChakraSource = {
  anaKulvar?: ResultLike;
  yanKulvar?: ResultLike;
  hayatYolu?: { display?: unknown } | null;
  pinKodu?: Record<string, unknown> | null;
  cakraOmurgasi?: { harfler?: unknown; sayilar?: unknown } | null;
};

function emptyCounts(): ChakraCounts {
  const c: ChakraCounts = {};
  for (let i = 1; i <= 10; i += 1) c[i] = 0;
  return c;
}

function countsOf(supports: readonly number[]): ChakraCounts {
  const c = emptyCounts();
  for (const v of supports) if (v >= 1 && v <= 10) c[v] += 1;
  return c;
}

function sumCounts(a: ChakraCounts, b: ChakraCounts): ChakraCounts {
  const c = emptyCounts();
  for (let i = 1; i <= 10; i += 1) c[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return c;
}

function componentsOf(r: ResultLike): number[] {
  const raw = r && Array.isArray(r.componentValues) ? r.componentValues : [];
  return raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function harflerOf(raw: unknown): ChakraCounts | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const c = emptyCounts();
  for (let i = 1; i <= 10; i += 1) {
    const n = Number(src[i] ?? src[String(i)] ?? 0);
    c[i] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return c;
}

/** Bir oluşum yolunun (variant) özel sayıları: özel gruplar + (varsa) özel kalan. */
export function alternativeVariantSpecials(v: AlternativeVariant): number[] {
  const out = v.groups.map((g) => g.sum);
  if (v.remainderParts.length > 0 && SPECIAL_NUMBERS.has(v.remainderValue)) out.push(v.remainderValue);
  return out;
}

/**
 * Tek bir oluşum yolunun (variant) çakra katkıları — resmî omurga kuralıyla aynı: 10. çakraya tek
 * destek + özel olmayan GERÇEK kalan (1–9) varsa onun çakrası. Özel kalan ek destek üretmez.
 */
export function alternativeVariantSupports(v: AlternativeVariant): number[] {
  const kalan = v.remainderParts.length > 0 && v.remainderValue >= 1 && v.remainderValue <= 9 ? v.remainderValue : null;
  return ozelKulvarCakraDestekleri({ ozelSayilar: alternativeVariantSpecials(v), gercekKalan: kalan });
}

/** Bir yolun katkıları — varyantlar aynı sayısal yolu ürettiği için tek katkı kümesi. */
export function alternativePathSupports(combo: AlternativeCombination): number[] {
  return combo.variants.length > 0 ? alternativeVariantSupports(combo.variants[0]) : [];
}

/**
 * Bir kaydın (snapshot) Ana/Yan Kulvar alternatiflerinin çakra sütunları. Kayıt YENİDEN
 * HESAPLANMAZ; yalnız snapshot alanları (componentValues, HY display, PİN kutuları, harf sütunu)
 * okunur. componentValues olmayan eski kayıtlarda alternatif yoktur → [].
 */
export function alternativeChakraColumns(
  motor: AlternativeChakraSource | null | undefined,
  kind: AlternativeChakraKind,
): AlternativeChakraColumn[] {
  if (!motor) return [];
  const kulvar = kind === "ana" ? motor.anaKulvar : motor.yanKulvar;
  const comps = componentsOf(kulvar);
  const combos = findKulvarSpecialCombinationsDetailed(comps);
  if (combos.length === 0) return [];

  const hyDisplay = typeof motor.hayatYolu?.display === "string" ? motor.hayatYolu.display : "";
  const hayatYolu = hyDisplay && hyDisplay !== "-" ? hayatYoluCakraDesteklerindenGosterim(hyDisplay) : [];
  const pin = motor.pinKodu && typeof motor.pinKodu === "object" ? pinKoduCakraDesteklerindenKutular(motor.pinKodu) : [];
  const harfler = harflerOf(motor.cakraOmurgasi?.harfler);

  if (kind === "yan") {
    // Sabit = kayıttaki RESMÎ omurga (yeniden hesap yok). Resmî Ana Kulvar katkısı açıklama için
    // kayıttaki omurgadan HY + PİN çıkarılarak okunur; okunamazsa (eksik/bozuk snapshot) yapısal kural.
    const kayitli = harflerOf(motor.cakraOmurgasi?.sayilar);
    const hyPin = countsOf([...hayatYolu, ...pin]);
    let anaKulvar: number[] | null = null;
    if (kayitli) {
      const fark: number[] = [];
      let gecerli = true;
      for (let c = 10; c >= 1; c -= 1) {
        const n = kayitli[c] - hyPin[c];
        if (n < 0) gecerli = false;
        for (let k = 0; k < n; k += 1) fark.push(c);
      }
      if (gecerli) anaKulvar = fark;
    }
    const resmiAna = anaKulvar ?? anaKulvarCakraDesteklerindenBilesen(componentsOf(motor.anaKulvar));
    const sabitSayilar = kayitli && anaKulvar ? kayitli : countsOf([...hayatYolu, ...pin, ...resmiAna]);
    return combos.map((combo) => {
      const altSupports = alternativePathSupports(combo);
      const alternatifSayilar = countsOf(altSupports);
      return {
        kind,
        path: combo.path,
        altSupports,
        ozelSayilar: combo.variants.length > 0 ? alternativeVariantSpecials(combo.variants[0]) : [],
        variantCount: combo.variants.length,
        fixed: { hayatYolu, pin, anaKulvar: resmiAna },
        officialAnaSupports: resmiAna,
        sayilar: sumCounts(sabitSayilar, alternatifSayilar),
        sabitSayilar,
        alternatifSayilar,
        harfler,
      };
    });
  }

  const officialAnaSupports = anaKulvarCakraDesteklerindenBilesen(comps);

  return combos.map((combo) => {
    const altSupports = alternativePathSupports(combo);
    return {
      kind,
      path: combo.path,
      altSupports,
      ozelSayilar: combo.variants.length > 0 ? alternativeVariantSpecials(combo.variants[0]) : [],
      variantCount: combo.variants.length,
      fixed: { hayatYolu, pin },
      officialAnaSupports,
      sayilar: countsOf([...hayatYolu, ...pin, ...altSupports]),
      sabitSayilar: countsOf([...hayatYolu, ...pin]),
      alternatifSayilar: countsOf(altSupports),
      harfler,
    };
  });
}

/** Hangi katkıların bu alternatif sütuna DAHİL EDİLMEDİĞİ (UI açıklaması; tek kaynak). */
export function alternativeChakraExclusionNote(kind: AlternativeChakraKind): string {
  return kind === "ana"
    ? "Hayat Yolu ve PİN katkıları kayıttaki değerlerden alınmıştır; yalnız Ana Kulvar katkısı bu kombinasyonla değiştirilmiştir. Resmî Çakra Omurgası değişmez."
    : "Sabit resmî katkılar + alternatif Yan Kulvar katkısı = yalnız uzman incelemesine yönelik varsayımsal toplam. Bu toplam resmî Çakra Omurgası sonucu değildir; resmî omurgaya Yan Kulvar desteği eklenmez.";
}
