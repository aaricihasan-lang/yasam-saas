import { hesaplaPinKodu } from "./pinKodu";

export const ELEMENT_ORDER = ["Hava", "Su", "Ateş", "Toprak"] as const;
export type ElementName = (typeof ELEMENT_ORDER)[number];

const DIGIT_ELEMENT_MAP: Record<number, ElementName | undefined> = {
  1: "Hava",
  5: "Hava",
  2: "Su",
  7: "Su",
  3: "Ateş",
  6: "Ateş",
  4: "Toprak",
  8: "Toprak",
};

export type ElementResult = {
  counts: Record<ElementName, number>;
  neutralCount: number;
  display: string;
  key: string;
  steps: string[];
};

export function pinIlkSekizRakam(birthDate: string): number[] {
  const b = hesaplaPinKodu(birthDate);
  return [b.k1, b.k2, b.k3, b.k4, b.k5, b.k6, b.k7, b.k8];
}

export function calcElementleri(birthDate: string): ElementResult {
  const digits = pinIlkSekizRakam(birthDate);
  const steps: string[] = [];
  const counts: Record<ElementName, number> = { Hava: 0, Su: 0, Ateş: 0, Toprak: 0 };
  let neutralCount = 0;

  if (digits.length === 0) {
    return { counts, neutralCount, display: "", key: "", steps: ["PİN Kodu üretilemedi; geçerli bir doğum tarihi girilmedi."] };
  }

  steps.push(`PİN Kodu (piramitten alınan ilk 8 rakam): ${digits.join(" ")}`);
  steps.push("");

  for (const d of digits) {
    const elem = DIGIT_ELEMENT_MAP[d];
    if (!elem) {
      steps.push(`${d} → (Nötr / element yok, atlandı)`);
      neutralCount += 1;
      continue;
    }
    counts[elem] += 1;
    steps.push(`${d} → ${elem}`);
  }

  steps.push("");
  steps.push("Element sayıları (X ile gösterim):");

  const partsForDisplay: string[] = [];
  for (const name of ELEMENT_ORDER) {
    const cnt = counts[name];
    const xs = cnt > 0 ? "X".repeat(cnt) : "-";
    steps.push(`  ${name.padEnd(7, " ")}: ${xs}`);
    partsForDisplay.push(`${name}:${cnt}`);
  }

  if (neutralCount > 0) steps.push(`  ${"Nötr".padEnd(7, " ")}: ${"X".repeat(neutralCount)}`);

  const maxCount = Math.max(...Object.values(counts));
  const key = maxCount <= 0 ? "" : ELEMENT_ORDER.filter((name) => counts[name] === maxCount).join("/");
  const display = partsForDisplay.join(", ");
  return { counts, neutralCount, display, key, steps };
}

export function formatlaElementler(birthDate: string): string {
  const info = calcElementleri(birthDate);
  const lines = ["=== ELEMENTLERİ ===", `Doğum Tarihi: ${birthDate}`, "", ...info.steps, ""];
  if (info.display) {
    lines.push(info.key ? `SONUÇ → Elementleri: ${info.display}  (Baskın element: '${info.key}')` : `SONUÇ → Elementleri: ${info.display}`);
  } else {
    lines.push("Elementler hesaplanamadı.");
  }
  return lines.join("\n");
}
