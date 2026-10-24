// ΔT bilgi notu (owner kararı 24.10.2026): 1800 öncesi ve 2100 sonrası tarihlerde Yerküre'nin dönüşüne bağlı zaman düzeltmesi
// (ΔT) tarihsel tahmin ya da gelecek öngörüsüdür. YALNIZ bilgilendirme: hesap, önbellek anahtarı, şema ve kayıt DEĞİŞMEZ.
// Ölçüm (QA 10-tur1, bağımsız DE440): Ay boylamı farkı 1850–2150 ≤1,9″; 1617–1790 ≤7,3″; 2161 ≈20″; 2545 ≈201″ (≈3,4′).
// Gösterim kuralı:
//  • doğum anı → profil hazırlık alanı (ekran) + raporun "Doğum verileri" bölümü; kayıtlı analizde 2. kişi için de.
//  • hedef analiz anı (transit anı, dönüş yılı/ayı, progresyon hedefi, takvim penceresi …) → teknik sonuç alanı (ekran) +
//    raporun "Yöntem" bölümü. Hedef yıllar YALNIZ normalize seçeneklerden okunur (yeni hesap yok).
// Ekran ve Word/PDF metni bu dosyadan gelir (tek kaynak).

export const DELTA_T_PAST_BEFORE_YEAR = 1800;
export const DELTA_T_FUTURE_AFTER_YEAR = 2100;

export type DeltaTNote = { code: "delta_t_past" | "delta_t_future"; subject: "birth" | "target"; years: number[]; text: string };

const BODY = {
  past: "Bu dönem için Yerküre'nin dönüşüne bağlı zaman düzeltmesi (ΔT) tarihsel gözlem kayıtlarından tahmin edilir ve belirsizlik taşır; bu belirsizlik en çok Ay'ın konumuna yansıyabilir.",
  future:
    "Bu dönem için Yerküre'nin dönüşüne bağlı zaman düzeltmesi (ΔT) gözleme değil öngörüye dayanır; farklı öngörü modelleri özellikle Ay'ın konumunda yay saniyelerinden yay dakikalarına varabilen farklar verebilir.",
} as const;
const TAIL = "Hesap kayıtlı verilerle yapılır; bu not yalnız bilgilendirme amaçlıdır.";

export function deltaTClass(year: number): "past" | "future" | null {
  if (!Number.isInteger(year)) return null;
  if (year < DELTA_T_PAST_BEFORE_YEAR) return "past";
  if (year > DELTA_T_FUTURE_AFTER_YEAR) return "future";
  return null;
}

const yearOfDateString = (v: unknown): number | null => (typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? Number(v.slice(0, 4)) : null);

function noteFor(subject: "birth" | "target", years: number[], who: string | null): DeltaTNote[] {
  const out: DeltaTNote[] = [];
  for (const cls of ["past", "future"] as const) {
    const ys = [...new Set(years.filter((y) => deltaTClass(y) === cls))].sort((a, b) => a - b);
    if (!ys.length) continue;
    const span = ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
    const what = subject === "birth" ? `${who ? `${who} ` : ""}doğum tarihi` : "analiz hedef tarihi";
    const edge = cls === "past" ? "1800 öncesi" : "2100 sonrası";
    out.push({ code: cls === "past" ? "delta_t_past" : "delta_t_future", subject, years: ys, text: `Uzak tarih notu — ${what} (${span}, ${edge}): ${BODY[cls]} ${TAIL}` });
  }
  return out;
}

/** Doğum anı notu. `who` yalnız birden çok kişi aynı alanda gösterilirken verilir (ör. "2. kişinin"). */
export function deltaTBirthNotes(birthDate: unknown, who: string | null = null): DeltaTNote[] {
  const y = yearOfDateString(birthDate);
  return y === null ? [] : noteFor("birth", [y], who);
}

// Normalize seçeneklerdeki hedef an alanları (bkz. engine/techniques.ts parseOptions): tek an, hedef gün, takvim/aralık başlangıcı,
// yaklaşık dönüş günü, panchanga/nokta günü, ay (YYYY-MM) ve yıl. Pencere (startDate + days) bitiş yılı da sayılır.
const DATE_KEYS = new Set(["atUtc", "targetDate", "startDate", "approxDate", "date", "detailDate", "month"]);
const YEAR_KEYS = new Set(["returnYear", "year"]);

export function deltaTTargetYears(options: unknown): number[] {
  const years: number[] = [];
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || Array.isArray(v) || depth > 2) return;
    const r = v as Record<string, unknown>;
    for (const [k, x] of Object.entries(r)) {
      if (DATE_KEYS.has(k)) {
        const y = yearOfDateString(x);
        if (y !== null) years.push(y);
      } else if (YEAR_KEYS.has(k) && typeof x === "number" && Number.isInteger(x) && x >= 1000 && x <= 3000) years.push(x);
      else if (x && typeof x === "object") walk(x, depth + 1);
    }
    if (typeof r.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate) && typeof r.days === "number" && Number.isInteger(r.days) && r.days > 0) {
      const end = new Date(Date.parse(`${r.startDate}T00:00:00Z`) + (r.days - 1) * 86_400_000);
      if (Number.isFinite(end.getTime())) years.push(end.getUTCFullYear());
    }
  };
  walk(options, 0);
  return years;
}

/** Hedef analiz anı notu (normalize seçeneklerden). */
export function deltaTTargetNotes(options: unknown): DeltaTNote[] {
  return noteFor("target", deltaTTargetYears(options), null);
}
