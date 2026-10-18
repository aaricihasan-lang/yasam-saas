import {
  findKulvarSpecialCombinationsDetailed,
  type AlternativeCombination,
  type AlternativeVariant,
} from "./alternativeCombinations";
import {
  OZEL_SAYI_10_POLITIKASI,
  anaKulvarCakraDesteklerindenBilesen,
  hayatYoluCakraDesteklerindenGosterim,
  ozelKulvarCakraDestekleri,
  pinKoduCakraDesteklerindenKutular,
  type ChakraCounts,
  type OzelSayi10Politikasi,
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
 *   - resmî omurgadaki kuralın AYNISI (`ozelKulvarCakraDestekleri`): 10. çakraya destek (politika:
 *     varsayılan TEK destek — 03.10.2026 kararı lafzı; "her özel sayıya ayrı 10" owner Karar C'si)
 *     + kalan varsa ve 1–9 ise sadeleşmiş değerinin çakrası; kalan yoksa ek destek YOK (sahte "/0"
 *     yok). Yeni numeroloji yöntemi DEĞİL.
 *   - Aynı sayısal yol birden fazla gerçek gruplayışla oluşuyorsa (variants) katkı TEK KEZ
 *     sayılır: aynı yol = aynı özel sayılar + aynı kalan → aynı destekler (harness kanıtlar).
 *
 * ANA KULVAR alternatifi: kaydın SABİT katkıları (Hayat Yolu + PİN; kayıttaki değerlerden) korunur,
 *   yalnız Ana Kulvar katkısı alternatif yolla değiştirilir. Harf sütunu kayıttaki haliyle.
 * YAN KULVAR alternatifi: resmî omurgada Yan Kulvar yoktur → yalnız bu kombinasyonun BAĞIMSIZ
 *   katkı sütunu gösterilir; Hayat Yolu/PİN/Ana Kulvar/harf sütunu DAHİL EDİLMEZ ve resmî
 *   omurgaya hiçbir destek aktarılmaz.
 */

export type AlternativeChakraKind = "ana" | "yan";

export type AlternativeChakraColumn = {
  kind: AlternativeChakraKind;
  /** Alternatif yol, ör. "22/11/8". */
  path: string;
  /** Bu kombinasyonun kendi katkıları (ör. 22/11/8 → [10, 8] tek-destek politikasında). */
  altSupports: number[];
  /** Yoldaki özel sayılar (ör. [22, 11]); ≥2 ise 10. çakra sayımı Karar C'ye bağlıdır. */
  ozelSayilar: number[];
  /** Bu yolun kaç farklı gerçek gruplayışla oluştuğu (katkı yine tek kez sayılır). */
  variantCount: number;
  /** Ana Kulvar: sabit katkılar (kayıttaki HY + PİN). Yan Kulvar: null. */
  fixed: { hayatYolu: number[]; pin: number[] } | null;
  /** Ana Kulvar: kaydın resmî Ana Kulvar katkısı (bu görünümde alternatifle değiştirilir). */
  officialAnaSupports: number[] | null;
  /** Sayı tarafı sütunu (1–10). */
  sayilar: ChakraCounts;
  /** Harf tarafı (yalnız Ana Kulvar; kayıttaki haliyle). Yan Kulvar: null. */
  harfler: ChakraCounts | null;
};

type ResultLike = { display?: unknown; key?: unknown; componentValues?: unknown } | null | undefined;

export type AlternativeChakraSource = {
  anaKulvar?: ResultLike;
  yanKulvar?: ResultLike;
  hayatYolu?: { display?: unknown } | null;
  pinKodu?: Record<string, unknown> | null;
  cakraOmurgasi?: { harfler?: unknown } | null;
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

/** Tek bir oluşum yolunun (variant) çakra katkıları — resmî omurga kuralıyla aynı. */
export function alternativeVariantSupports(v: AlternativeVariant, politika: OzelSayi10Politikasi = OZEL_SAYI_10_POLITIKASI): number[] {
  const sadelesmis = v.remainderParts.length > 0 ? v.remainderValue : null;
  return ozelKulvarCakraDestekleri(alternativeVariantSpecials(v), sadelesmis, politika);
}

/** Bir yolun katkıları — varyantlar aynı sayısal yolu ürettiği için tek katkı kümesi. */
export function alternativePathSupports(combo: AlternativeCombination, politika: OzelSayi10Politikasi = OZEL_SAYI_10_POLITIKASI): number[] {
  return combo.variants.length > 0 ? alternativeVariantSupports(combo.variants[0], politika) : [];
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

  if (kind === "yan") {
    return combos.map((combo) => {
      const altSupports = alternativePathSupports(combo);
      return {
        kind,
        path: combo.path,
        altSupports,
        ozelSayilar: combo.variants.length > 0 ? alternativeVariantSpecials(combo.variants[0]) : [],
        variantCount: combo.variants.length,
        fixed: null,
        officialAnaSupports: null,
        sayilar: countsOf(altSupports),
        harfler: null,
      };
    });
  }

  const hyDisplay = typeof motor.hayatYolu?.display === "string" ? motor.hayatYolu.display : "";
  const hayatYolu = hyDisplay && hyDisplay !== "-" ? hayatYoluCakraDesteklerindenGosterim(hyDisplay) : [];
  const pin = motor.pinKodu && typeof motor.pinKodu === "object" ? pinKoduCakraDesteklerindenKutular(motor.pinKodu) : [];
  const officialAnaSupports = anaKulvarCakraDesteklerindenBilesen(comps, motor.anaKulvar?.key as string | undefined);
  const harfler = harflerOf(motor.cakraOmurgasi?.harfler);

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
      harfler,
    };
  });
}

/** Hangi katkıların bu alternatif sütuna DAHİL EDİLMEDİĞİ (UI açıklaması; tek kaynak). */
export function alternativeChakraExclusionNote(kind: AlternativeChakraKind): string {
  return kind === "ana"
    ? "Hayat Yolu ve PİN katkıları kayıttaki değerlerden alınmıştır; yalnız Ana Kulvar katkısı bu kombinasyonla değiştirilmiştir. Resmî Çakra Omurgası değişmez."
    : "Yalnız bu Yan Kulvar kombinasyonunun kendi katkıları gösterilir. Hayat Yolu, PİN, Ana Kulvar ve harf sütunu dâhil değildir; resmî Çakra Omurgası'na destek aktarılmaz.";
}
