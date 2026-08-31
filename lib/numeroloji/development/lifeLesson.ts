// FAZ 4 — Hayat Dersi (AŞAMA 2 §16). Kaynak: kitap 2. seviye.
// Hayat Dersi = Kişilik Enerjisi + Hayat Yolu (canonical reduced) → 1–9 / 11 / 22. 33 KORUNMAZ.
// Golden: Kişilik 6 + Hayat Yolu 5 = 11 (korunur).
// DİKKAT: "Hayat Dersi" != PIN 5. Hane "Yaşam Dersi". İki ad karıştırılmaz.
import { sumDigits, reduceKeepMaster } from "../ortak";
import { birthParts } from "../timing/dateUtils";
import { reduce1To9, reduceKeepMaster11or22 } from "../timing/reduce";
import type { ReducedResult } from "../timing/types";

export function lifeLesson(birthDate: string): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };

  const personality = reduce1To9(p.day);
  // Hayat Yolu canonical: doğum tarihi tüm rakamları, master 11/22/33 kendi kuralıyla korunur.
  const hayatYolu = reduceKeepMaster(sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year));

  const value = reduceKeepMaster11or22(personality + hayatYolu);
  return {
    value,
    display: String(value),
    steps: [`Hayat Dersi: Kişilik(${personality}) + HayatYolu(${hayatYolu}) = ${
      personality + hayatYolu
    } → ${value}`],
  };
}
