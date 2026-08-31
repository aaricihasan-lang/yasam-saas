// FAZ 4 — Güncel Yıl Çakrası (AŞAMA 2 §12). Kaynak: kitap 1. seviye ("çakra tesiri / yılındaki müfredat").
// doğum günü + doğum ayı + referans takvim yılı → 1–9. Master preservation YOK.
// DİKKAT: matematik nominal Kişisel Yıl ile AYNI sonucu verebilir; identity ve katalog AYRIDIR.
// Birthday-transition UYGULANMAZ.
import { sumDigits } from "../ortak";
import { reduce1To9 } from "../timing/reduce";
import { birthParts } from "../timing/dateUtils";
import { YEAR_CHAKRA_CATALOG } from "./catalogs";
import type { CalendarDate, ReducedResult } from "../timing/types";

export function yearChakra(birthDate: string, ref: CalendarDate): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };
  const total = sumDigits(p.day) + sumDigits(p.month) + sumDigits(ref.year);
  const value = reduce1To9(total);
  return {
    value,
    display: String(value),
    steps: [
      `Güncel Yıl Çakrası (${ref.year}): gün(${sumDigits(p.day)}) + ay(${sumDigits(
        p.month,
      )}) + yıl(${sumDigits(ref.year)}) = ${total} → ${value}`,
    ],
    interpretation: YEAR_CHAKRA_CATALOG[value],
  };
}
