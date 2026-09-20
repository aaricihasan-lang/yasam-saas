import { SPECIAL_NUMBERS, reduceNumber } from "./ortak";

/**
 * ANA/YAN KULVAR — FARKLI ÖZEL SAYI KOMBİNASYONLARI (OWNER FINAL MODEL + PROVENANCE COMPLETE).
 *
 * PURE, presentation/analysis-assist helper. CANONICAL DEĞİLDİR:
 *   - calcAnaKulvar/calcYanKulvar karar dallarını DEĞİŞTİRMEZ,
 *   - key/display/reducer/knowledge-lookup'ı ETKİLEMEZ,
 *   - yalnız GERÇEK per-token component değerlerinden (engine `componentValues[]`) türetilir.
 *
 * AMAÇ: Aynı isim/soyisim component değerleri FARKLI geçerli gruplamalarla ele
 * alındığında 11/19/22/33 gibi başka özel sayılar ortaya çıkıyorsa, bunları uzmana
 * HATIRLATMA olarak ayrıca göstermek. Ana sonuç (canonical) asla değişmez.
 *
 * MODEL (owner örneği: Yan components [5,3,3,22,8], canonical 22/19):
 *   • Bir "özel grup" = ayrık (disjoint) component alt-kümesi; RAW toplamı ∈ {11,19,22,33}.
 *     Alt-küme boyutu ≥ 2 olmalı; İSTİSNA: değeri zaten özel olan tek component kendi
 *     başına "korunan özel" bucket olabilir (boyut 1).
 *   • Her component bir yolda EN FAZLA BİR KEZ kullanılır (no double count).
 *   • KRİTİK: değeri özel olan HER component ya kendi bucket'ında ya da daha büyük bir özel
 *     grupta yer almak ZORUNDA — asla indirgenen remainder'a düşemez. (Bu yüzden owner
 *     örneğinde 22'yi remainder'a atan "11/3" GEÇERSİZDİR.)
 *   • Bucket'lara girmeyen (özel olmayan) component'ler = remainder; mevcut Ana/Yan remainder
 *     convention'ı ile reduceNumber(sum, keepSpecial) → tek değer.
 *   • Yol display = [bucket toplamları büyükten küçüğe] "/" + (remainder varsa "/"+remainderVal).
 *
 * PROVENANCE COMPLETENESS (owner patch):
 *   • NUMERIC PATH DEDUPE KALIR: aynı sayısal yol (ör. "22/11/8") result listesinde TEK KEZ.
 *   • PROVENANCE LOSS KALKAR: o path'i oluşturan TÜM UNIQUE (değer-bazlı) gruplayışlar,
 *     path'in `variants[]` listesinde KORUNUR. Owner örneğinde 22/11/8 iki varyant içerir:
 *       - 22 (mevcut özel) · 3+8 → 11 · kalan 5+3 → 8
 *       - 22 (mevcut özel) · 5+3+3 → 11 · kalan 8
 *   • VARIANT DEDUPE = DEĞER-BAZLI: aynı değer-gruplayışı (yalnız index permutation'ı farklı,
 *     ör. iki eşdeğer "3") TEK varyanttır — çünkü componentValues yalnız sayısaldır ve owner
 *     token-label olmadan permutation duplicate saklamak istemez. Farklı DEĞER gruplayışı
 *     (3+8→11 vs 5+3+3→11) ise ayrı varyant olarak korunur.
 *   • Canonical ana yol (her özel singleton + non-special remainder) alternatiflerden HARİÇ.
 *
 * Owner örneği çıktısı: [{path:"22/11/8", variants:[...2]}, {path:"33/8", variants:[...2]}].
 */

const MAX_COMPONENTS = 16; // pathological-uzun isim koruması
const MAX_BUCKETS = 4096;
const MAX_NODES = 2_000_000;

export type SpecialGroup = {
  /** Grup raw toplamı (∈ {11,19,22,33}). */
  sum: number;
  /** Gruptaki component değerleri (provenance için, ör. [3,8]). Boyut 1 = korunan özel. */
  parts: number[];
};

/** Bir path'in TEK gerçek (değer-bazlı) oluşum yolu. */
export type AlternativeVariant = {
  /** Özel gruplar (display'de "/" ile gösterilenler; sum büyükten küçüğe). */
  groups: SpecialGroup[];
  /** Remainder component değerleri (boşsa remainder yok). */
  remainderParts: number[];
  /** Remainder indirgenmiş değeri (remainderParts boşsa 0). */
  remainderValue: number;
};

export type AlternativeCombination = {
  /** Normalized display yolu, ör. "22/11/8". */
  path: string;
  /** Bu path'i oluşturan TÜM unique (değer-bazlı) varyantlar, deterministik sıralı. */
  variants: AlternativeVariant[];
};

function reduceRemainder(sum: number): number {
  return reduceNumber(sum, true);
}

function pathString(groupSums: number[], remainderCount: number, remainderVal: number): string {
  const specials = [...groupSums].sort((a, b) => b - a);
  const head = specials.join("/");
  if (remainderCount > 0) return head ? `${head}/${remainderVal}` : String(remainderVal);
  return head;
}

/** Deterministik path sıralaması: segmentleri sayısal olarak küçükten büyüğe kıyasla. */
function comparePaths(a: string, b: string): number {
  const pa = a.split("/").map(Number);
  const pb = b.split("/").map(Number);
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return pa.length - pb.length;
}

/**
 * Değer-bazlı varyant imzası: grup parça değerleri (sıralı) + remainder değerleri (sıralı).
 * Aynı imza = aynı gerçek gruplayış (yalnız index permutation'ı farklı) → dedupe.
 */
function variantSignature(groups: SpecialGroup[], remainderParts: number[]): string {
  const g = groups
    .map((x) => [...x.parts].sort((a, b) => a - b).join("+"))
    .sort();
  const r = [...remainderParts].sort((a, b) => a - b).join("+");
  return `${g.join("|")}#${r}`;
}

/**
 * Detaylı alternatif kombinasyonlar. NUMERIC path dedupe + her path altında TÜM unique
 * (değer-bazlı) provenance varyantları. Canonical HARİÇ, deterministik.
 * Guard aşılırsa `[]` döner (caller isterse raporlar).
 */
export function findKulvarSpecialCombinationsDetailed(components: number[]): AlternativeCombination[] {
  const comps = components.filter((v) => v > 0);
  const n = comps.length;
  if (n < 2 || n > MAX_COMPONENTS) return [];

  const isSpecial = (v: number) => SPECIAL_NUMBERS.has(v);
  const specialMaskRequired = comps.reduce((m, v, i) => (isSpecial(v) ? m | (1 << i) : m), 0);

  // ── Aday bucket'lar: rawSum ∈ SPECIAL, boyut ≥ 2 VEYA (boyut 1 ve değer özel) ──
  const buckets: { mask: number; sum: number; parts: number[] }[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    let size = 0;
    const parts: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += comps[i];
        size += 1;
        parts.push(comps[i]);
      }
    }
    if (!SPECIAL_NUMBERS.has(sum)) continue;
    if (size < 2) {
      if (size === 1 && isSpecial(sum)) buckets.push({ mask, sum, parts });
      continue;
    }
    buckets.push({ mask, sum, parts });
    if (buckets.length > MAX_BUCKETS) return [];
  }

  // ── Ayrık bucket seçimlerini backtracking ile üret; tüm özel index'ler kapsanmalı ──
  // byPath: path → { path, variants[], seenSig } (numeric dedupe + değer-bazlı variant dedupe).
  const byPath = new Map<string, { path: string; variants: AlternativeVariant[]; seen: Set<string> }>();
  let nodes = 0;
  let aborted = false;
  const chosen: { sum: number; parts: number[] }[] = [];

  function recurse(startIdx: number, usedMask: number) {
    if (aborted) return;
    if (++nodes > MAX_NODES) {
      aborted = true;
      return;
    }

    if ((usedMask & specialMaskRequired) === specialMaskRequired) {
      const remainderParts: number[] = [];
      for (let i = 0; i < n; i++) {
        if (!(usedMask & (1 << i))) remainderParts.push(comps[i]);
      }
      const remainderValue =
        remainderParts.length > 0 ? reduceRemainder(remainderParts.reduce((a, b) => a + b, 0)) : 0;
      const groups = chosen
        .map((c) => ({ sum: c.sum, parts: [...c.parts] }))
        .sort((a, b) => b.sum - a.sum);
      const path = pathString(chosen.map((c) => c.sum), remainderParts.length, remainderValue);

      let entry = byPath.get(path);
      if (!entry) {
        entry = { path, variants: [], seen: new Set() };
        byPath.set(path, entry);
      }
      const sig = variantSignature(groups, remainderParts);
      if (!entry.seen.has(sig)) {
        entry.seen.add(sig);
        entry.variants.push({ groups, remainderParts, remainderValue });
      }
    }

    for (let b = startIdx; b < buckets.length; b++) {
      const { mask, sum, parts } = buckets[b];
      if (usedMask & mask) continue;
      chosen.push({ sum, parts });
      recurse(b + 1, usedMask | mask);
      chosen.pop();
      if (aborted) return;
    }
  }

  recurse(0, 0);
  if (aborted) return [];

  // ── Canonical ana yol (her özel singleton + non-special remainder) → HARİÇ ──
  const canonicalSpecials: number[] = [];
  let canonNonSpecialSum = 0;
  let canonNonSpecialCount = 0;
  for (const v of comps) {
    if (isSpecial(v)) canonicalSpecials.push(v);
    else {
      canonNonSpecialSum += v;
      canonNonSpecialCount += 1;
    }
  }
  const canonicalPath = pathString(
    canonicalSpecials,
    canonNonSpecialCount,
    canonNonSpecialCount > 0 ? reduceRemainder(canonNonSpecialSum) : 0
  );
  byPath.delete(canonicalPath);

  // ── Deterministik: path'ler comparePaths; variant'lar değer-imzasına göre ──
  return [...byPath.values()]
    .map((e) => ({
      path: e.path,
      variants: e.variants
        .slice()
        .sort((a, b) =>
          variantSignature(a.groups, a.remainderParts).localeCompare(
            variantSignature(b.groups, b.remainderParts)
          )
        ),
    }))
    .sort((a, b) => comparePaths(a.path, b.path));
}

/**
 * `components`: gerçek per-token engine değerleri (ör. [5,3,3,22,8]).
 * Dönüş: benzersiz, deterministik sıralı alternatif özel-sayı YOLLARI (canonical HARİÇ).
 */
export function findKulvarSpecialCombinations(components: number[]): string[] {
  return findKulvarSpecialCombinationsDetailed(components).map((d) => d.path);
}
