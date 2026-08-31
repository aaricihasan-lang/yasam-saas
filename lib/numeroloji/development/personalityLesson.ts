// FAZ 4 — Kişilik Enerjisi (AŞAMA 2 §15). Kaynak: kitap 2. seviye.
// calendar birth day → FULL 1–9 reduction. Master preservation YOK (11→2, 22→4, 29→2).
// Matematik PIN 1. Hane ile aynı çıkabilir; identity "Kişilik Enerjisi" olarak AYRI tutulur.
import { reduce1To9 } from "../timing/reduce";
import { birthParts } from "../timing/dateUtils";
import type { ReducedResult } from "../timing/types";

export function personalityEnergy(birthDate: string): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };
  const value = reduce1To9(p.day);
  return {
    value,
    display: String(value),
    steps: [`Kişilik Enerjisi: doğum günü ${p.day} → ${value}`],
  };
}
