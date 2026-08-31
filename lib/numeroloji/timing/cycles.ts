// FAZ 4 — Evre / Döngü (AŞAMA 2 §9, §10). Kaynak: kitap 2. seviye.
// "Döngüler pin kodunun rakamlarından oluşur." → Evre N enerjisi = PIN hane N.
// Boundary LOCKED: yaş 1–9→Evre1, 10–18→Evre2, ... 73–81→Evre9. Golden: yaş 45 → Evre5/Döngü9.
import { hesaplaPinKodu } from "../pinKodu";
import { EVRE_CATALOG, DONGU_CATALOG } from "./catalogs";
import { birthParts, calendarAge } from "./dateUtils";
import type { CalendarDate, CycleResult } from "./types";

export type EvreDongu = {
  evreIndex: number | null;
  donguIndex: number | null;
  status?: "SOURCE_BIRTH_YEAR_SPECIAL_CASE" | "SOURCE_RULE_UNDEFINED_AFTER_81";
};

/** Yaştan Evre/Döngü indexleri (PIN'den bağımsız saf matematik). */
export function evreDonguFromAge(age: number): EvreDongu {
  if (age <= 0) {
    // §10: kaynak ilk evreyi 0 yaşından başlatır; döngü tablosu 1'den başlar.
    return { evreIndex: 1, donguIndex: 1, status: "SOURCE_BIRTH_YEAR_SPECIAL_CASE" };
  }
  if (age > 81) {
    // §10: 81 üstü kaynak kuralı yok — yeni döngü UYDURULMAZ.
    return { evreIndex: null, donguIndex: null, status: "SOURCE_RULE_UNDEFINED_AFTER_81" };
  }
  const evreIndex = Math.floor((age - 1) / 9) + 1;
  const donguIndex = ((age - 1) % 9) + 1;
  return { evreIndex, donguIndex };
}

const pinToArray = (b: ReturnType<typeof hesaplaPinKodu>): number[] => [
  b.k1, b.k2, b.k3, b.k4, b.k5, b.k6, b.k7, b.k8, b.k9,
];

/** Tam Evre/Döngü sonucu: PIN evre enerjisi + yorumlar + 9 yıllık timeline. */
export function computeCycle(birthDate: string, ref: CalendarDate): CycleResult {
  const p = birthParts(birthDate);
  if (!p) {
    return { age: -1, evre: null, dongu: null, timeline: [] };
  }
  const age = calendarAge(p.year, p.month, p.day, ref);
  const pin = pinToArray(hesaplaPinKodu(birthDate));
  const ed = evreDonguFromAge(age);

  const timeline = pin.map((energy, i) => ({
    evreIndex: i + 1,
    ageStart: i * 9 + 1,
    ageEnd: (i + 1) * 9,
    energy,
  }));

  if (ed.evreIndex == null) {
    return { age, evre: null, dongu: null, timeline, status: ed.status };
  }

  const energy = pin[ed.evreIndex - 1];
  return {
    age,
    evre: {
      index: ed.evreIndex,
      energy,
      interpretation: EVRE_CATALOG[ed.evreIndex],
    },
    dongu: {
      index: ed.donguIndex as number,
      interpretation: DONGU_CATALOG[ed.donguIndex as number],
    },
    timeline,
    ...(ed.status ? { status: ed.status } : {}),
  };
}
