// R5 ROXY — TR/EN yanıt karşılaştırma yardımcıları (SAF).
export type Leaf = { path: string; value: unknown };

export function leaves(v: unknown, p = "", out: Leaf[] = []): Leaf[] {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${p}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) leaves(x, p ? `${p}.${k}` : k, out);
  else out.push({ path: p, value: v });
  return out;
}

export const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
export const TR_WORDS = /\b(ve|bir|ile|için|olarak|kişi|enerji|güçlü|yaşam|burç|gezegen|evi|evinde|merkez|kanal|kapı|sayı|bu|da|de|çok|daha|sizin|senin)\b/i;
export const EN_WORDS = /\b(the|and|of|your|you|with|is|are|this|that|for|to|in|energy|life)\b/i;

export const isNarrative = (s: string) => s.length >= 12 && /\s/.test(s);

/** Yalnız sayı/bool/null alanlar (dil bağımsız olmalı) + kısa kod dizgeleri (boşluksuz, ≤ 40). */
export function compareRaw(trRaw: unknown, enRaw: unknown) {
  const a = new Map(leaves(trRaw).map((l) => [l.path, l.value]));
  const b = new Map(leaves(enRaw).map((l) => [l.path, l.value]));
  let numSame = 0, numDiff = 0;
  const numDiffs: string[] = [];
  let codeSame = 0, codeDiff = 0;
  const codeDiffs: string[] = [];
  let enNarr = 0, enTurkish = 0, sameNarr = 0, enEnglish = 0, trNarr = 0, trEnglish = 0;
  const enTurkishSamples: string[] = [], sameSamples: string[] = [], trEnglishSamples: string[] = [], enSamples: string[] = [];
  const onlyTr = [...a.keys()].filter((k) => !b.has(k));
  const onlyEn = [...b.keys()].filter((k) => !a.has(k));
  for (const [path, tv] of a) {
    if (!b.has(path)) continue;
    const ev = b.get(path);
    if (typeof tv === "number" || typeof tv === "boolean" || tv === null) {
      if (Object.is(tv, ev)) numSame++;
      else {
        numDiff++;
        if (numDiffs.length < 12) numDiffs.push(`${path}: tr=${String(tv)} en=${String(ev)}`);
      }
      continue;
    }
    if (typeof tv !== "string" || typeof ev !== "string") continue;
    if (!isNarrative(tv) && !isNarrative(ev)) {
      // kısa dizge: kod/etiket
      if (tv === ev) codeSame++;
      else {
        codeDiff++;
        if (codeDiffs.length < 25) codeDiffs.push(`${path}: tr=${tv} | en=${ev}`);
      }
      continue;
    }
    trNarr++;
    if (!TR_CHARS.test(tv) && EN_WORDS.test(tv) && !TR_WORDS.test(tv)) {
      trEnglish++;
      if (trEnglishSamples.length < 8) trEnglishSamples.push(`${path}: ${tv.slice(0, 110)}`);
    }
    enNarr++;
    if (TR_CHARS.test(ev) || TR_WORDS.test(ev)) {
      enTurkish++;
      if (enTurkishSamples.length < 8) enTurkishSamples.push(`${path}: ${ev.slice(0, 110)}`);
    } else if (ev === tv) {
      sameNarr++;
      if (sameSamples.length < 8) sameSamples.push(`${path}: ${ev.slice(0, 110)}`);
    } else {
      enEnglish++;
      if (enSamples.length < 2) enSamples.push(`${path}: ${ev.slice(0, 110)}`);
    }
  }
  return {
    numSame, numDiff, numDiffs, codeSame, codeDiff, codeDiffs,
    onlyTrCount: onlyTr.length, onlyEnCount: onlyEn.length, onlyTr: onlyTr.slice(0, 8), onlyEn: onlyEn.slice(0, 8),
    trNarr, trEnglish, trEnglishSamples, enNarr, enEnglish, enTurkish, enTurkishSamples, sameNarr, sameSamples, enSamples,
  };
}

/** Kararlı JSON (anahtar sıralı) — kanonik eşitlik için. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** İki kanonik nesnenin farklı yaprakları (en fazla n). */
export function diffLeaves(a: unknown, b: unknown, n = 15): string[] {
  const A = new Map(leaves(a).map((l) => [l.path, l.value]));
  const B = new Map(leaves(b).map((l) => [l.path, l.value]));
  const out: string[] = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    if (!Object.is(A.get(k), B.get(k))) {
      out.push(`${k}: tr=${String(A.get(k)).slice(0, 60)} | en=${String(B.get(k)).slice(0, 60)}`);
      if (out.length >= n) break;
    }
  }
  return out;
}

/** Bir nesnedeki tüm anlatı dizgeleri için dil sayımı. */
export function textLang(v: unknown) {
  let n = 0, tr = 0, en = 0, other = 0;
  const trS: string[] = [], enS: string[] = [];
  for (const l of leaves(v)) {
    if (typeof l.value !== "string" || !isNarrative(l.value)) continue;
    n++;
    if (TR_CHARS.test(l.value) || TR_WORDS.test(l.value)) {
      tr++;
      if (trS.length < 5) trS.push(`${l.path}: ${l.value.slice(0, 100)}`);
    } else if (EN_WORDS.test(l.value)) {
      en++;
      if (enS.length < 5) enS.push(`${l.path}: ${l.value.slice(0, 100)}`);
    } else other++;
  }
  return { n, tr, en, other, trS, enS };
}
