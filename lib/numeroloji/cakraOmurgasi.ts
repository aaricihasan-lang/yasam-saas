import { CHAKRA_LETTER_MAP, VOWELS, reduceToDigit, repeatX, splitNameParts, turkishUpper } from "./ortak";
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

function splitDmDisplay(display: string): [number | null, number | null] {
  const text = (display || "").trim();
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
  const info = calcHayatYolu(birthDate);
  const [left, right] = splitDmDisplay(info.display);
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
  const b = hesaplaPinKodu(birthDate);
  return [b.k1, b.k2, b.k3, b.k4, b.k5, b.k6, b.k7, b.k8].filter((v) => v >= 1 && v <= 10);
}

export function anaKulvarCakraDestekleri(firstName: string, lastName: string): number[] {
  const destekler: number[] = [];
  const parts = splitNameParts(firstName, lastName);
  const nameVals: number[] = [];

  for (const part of parts) {
    const v = vowelValueOfWord(part);
    if (v) {
      nameVals.push(v);
      destekler.push(v);
    }
  }

  const info = calcAnaKulvar(firstName, lastName);
  const [left, right] = splitDmDisplay(info.display);
  const specialSet = new Set([11, 19, 22, 33]);

  if (left !== null && specialSet.has(left) && right !== null) {
    destekler.push(10);
    if (right >= 1 && right <= 9) destekler.push(right);
  } else if (nameVals.length > 0) {
    const akVal = reduceToDigit(nameVals.reduce((a, b) => a + b, 0));
    if (akVal >= 1 && akVal <= 9) destekler.push(akVal);
  }

  return destekler;
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
