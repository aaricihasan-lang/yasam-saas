import { parseBirthDate, reduceToDigit } from "./ortak";

export type PinKoduBoxes = {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  k6: number;
  k7: number;
  k8: number;
  k9: number;
};

export function hesaplaPinKodu(birthDate: string): PinKoduBoxes {
  const parts = parseBirthDate(birthDate);
  if (!parts) {
    return { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0, k7: 0, k8: 0, k9: 0 };
  }

  const digitSumFromText = (text: string) => Array.from(text).reduce((acc, ch) => acc + Number(ch), 0);

  const k1 = reduceToDigit(digitSumFromText(parts.dayText));
  const k2 = reduceToDigit(digitSumFromText(parts.monthText));
  const k3 = reduceToDigit(digitSumFromText(parts.yearText));
  const k4 = reduceToDigit(k1 + k2 + k3);
  const k5 = reduceToDigit(k1 + k4);
  const k6 = reduceToDigit(k1 + k2);
  const k7 = reduceToDigit(k2 + k3);
  const k8 = reduceToDigit(k6 + k7);
  const k9 = reduceToDigit(k1 + k2 + k3 + k4 + k5 + k6 + k7 + k8);

  return { k1, k2, k3, k4, k5, k6, k7, k8, k9 };
}

export function formatlaPinKutular(birthDate: string): string {
  const b = hesaplaPinKodu(birthDate);
  return [`[${b.k1}]  [${b.k2}]  [${b.k3}]  [${b.k4}]`, `   [${b.k5}]  [${b.k6}]  [${b.k7}]`, `      [${b.k8}]`, `      [${b.k9}]`].join("\n");
}
