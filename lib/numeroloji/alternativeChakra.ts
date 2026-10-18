import {
  findKulvarSpecialCombinationsDetailed,
  type AlternativeCombination,
  type AlternativeVariant,
} from "./alternativeCombinations";
import {
  hayatYoluCakraDesteklerindenGosterim,
  kulvarCakraDestekleri,
  kulvarSayisiCakraDestegi,
  pinKoduCakraDesteklerindenKutular,
  type ChakraCounts,
} from "./cakraOmurgasi";

/**
 * FARKLI ÖZEL SAYI KOMBİNASYONLARI — ALTERNATİF ÇAKRA SÜTUNU (yalnız ekran içi uzman incelemesi).
 *
 * PURE, presentation/analysis-assist. RESMÎ Çakra Omurgası'nı, kayıtlı snapshot'ı, Word'ü,
 * key/display/lookup'ı DEĞİŞTİRMEZ; hiçbir şey kaydetmez, motoru yeniden çalıştırmaz.
 *
 * Kaynak = YAPISAL veri (gösterim metni parse edilmez):
 *   - alternatif yol + varyantları: `findKulvarSpecialCombinationsDetailed(componentValues)`,
 *   - her özel grup (11/19/22/33) → 10. sütun; kalan varsa sadeleşmiş değeri → kendi sütunu
 *     (özel kalan → 10); kalan yoksa ek destek YOK (sahte "/0" yok). Resmî omurgadaki
 *     `kulvarCakraDestekleri` kuralının aynısı — yeni numeroloji yöntemi DEĞİL.
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
  /** Bu kombinasyonun kendi katkıları (ör. [10, 10, 8]). */
  altSupports: number[];
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

type ResultLike = { display?: unknown; componentValues?: unknown } | null | undefined;

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

/** Tek bir oluşum yolunun (variant) çakra katkıları. */
export function alternativeVariantSupports(v: AlternativeVariant): number[] {
  const out: number[] = v.groups.map(() => 10);
  if (v.remainderParts.length > 0) {
    const s = kulvarSayisiCakraDestegi(v.remainderValue);
    if (s !== null) out.push(s);
  }
  return out.sort((a, b) => b - a);
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

  if (kind === "yan") {
    return combos.map((combo) => {
      const altSupports = alternativePathSupports(combo);
      return {
        kind,
        path: combo.path,
        altSupports,
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
  const officialAnaSupports = kulvarCakraDestekleri(comps);
  const harfler = harflerOf(motor.cakraOmurgasi?.harfler);

  return combos.map((combo) => {
    const altSupports = alternativePathSupports(combo);
    return {
      kind,
      path: combo.path,
      altSupports,
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
