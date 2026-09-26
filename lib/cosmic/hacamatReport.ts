/**
 * lib/cosmic/hacamatReport.ts
 *
 * Hacamat PDF/Word rapor payload doğrulaması (§7 sertleştirme).
 * pdf-report ve word-report route'ları AYNI kuralları kullanır (tek kaynak) →
 * malformed/oversized girdi 500 yerine güvenli 400 döner; ham cast riski ortadan kalkar.
 */
import { SUPPORT_START_YEAR, SUPPORT_END_YEAR } from "./dateRange";

export const MAX_REPORT_RULES = 300;   // rapora aktarılabilecek maksimum kural
export const MAX_RULE_TEXT_LEN = 2000; // tek kural metni
export const MAX_NOTES_LEN = 8000;     // uzman notu
export const MAX_TITLE_LEN = 200;
export const MAX_NAME_LEN = 200;

const CATEGORIES = new Set(["before", "after", "general"]);

export type ReportRule = { rule_text: string; category: string };
export type HacamatReportInput = {
  year: number;
  month: number;
  rules: ReportRule[];
  expertNotes: string;
  title: string;
  expertName: string;
  includeSections: Record<string, unknown> | undefined;
};

export type ValidateResult =
  | { ok: true; value: HacamatReportInput }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Ham request body'sini güvenli bir HacamatReportInput'a doğrular.
 * Tüm hata yolları açık 400 mesajı döner (throw YOK → çağıran 500 üretmez).
 */
export function validateHacamatReportPayload(body: unknown): ValidateResult {
  if (!isPlainObject(body)) return { ok: false, error: "Geçersiz istek gövdesi." };

  // year / month — desteklenen aralıkla sınırlı (kapsam-dışı yıl reddedilir).
  const { year, month } = body as { year?: unknown; month?: unknown };
  if (typeof year !== "number" || !Number.isInteger(year) || year < SUPPORT_START_YEAR || year > SUPPORT_END_YEAR)
    return { ok: false, error: `Yıl ${SUPPORT_START_YEAR}-${SUPPORT_END_YEAR} aralığında olmalıdır.` };
  if (typeof month !== "number" || !Number.isInteger(month) || month < 0 || month > 11)
    return { ok: false, error: "Geçersiz ay." };

  // rules — dizi, adet tavanı, her eleman {rule_text, category} şekil kontrolü.
  const rawRules = (body as { rules?: unknown }).rules ?? [];
  if (!Array.isArray(rawRules)) return { ok: false, error: "rules bir dizi olmalıdır." };
  if (rawRules.length > MAX_REPORT_RULES)
    return { ok: false, error: `En fazla ${MAX_REPORT_RULES} kural raporlanabilir.` };
  const rules: ReportRule[] = [];
  for (const r of rawRules) {
    if (!isPlainObject(r)) return { ok: false, error: "Geçersiz kural biçimi." };
    const rt = (r as { rule_text?: unknown }).rule_text;
    const cat = (r as { category?: unknown }).category;
    if (typeof rt !== "string" || rt.trim() === "") return { ok: false, error: "Kural metni geçersiz." };
    if (rt.length > MAX_RULE_TEXT_LEN) return { ok: false, error: "Kural metni çok uzun." };
    if (typeof cat !== "string" || !CATEGORIES.has(cat)) return { ok: false, error: "Kural kategorisi geçersiz." };
    rules.push({ rule_text: rt, category: cat });
  }

  // Serbest metin alanları — tip + uzunluk sınırı.
  const rawNotes = (body as { expertNotes?: unknown }).expertNotes ?? "";
  if (typeof rawNotes !== "string") return { ok: false, error: "expertNotes metin olmalıdır." };
  if (rawNotes.length > MAX_NOTES_LEN) return { ok: false, error: "Uzman notu çok uzun." };

  const rawTitle = (body as { title?: unknown }).title;
  if (rawTitle !== undefined && (typeof rawTitle !== "string" || rawTitle.length > MAX_TITLE_LEN))
    return { ok: false, error: "Başlık geçersiz." };

  const rawName = (body as { expertName?: unknown }).expertName;
  if (rawName !== undefined && (typeof rawName !== "string" || rawName.length > MAX_NAME_LEN))
    return { ok: false, error: "Uzman adı geçersiz." };

  const rawInclude = (body as { includeSections?: unknown }).includeSections;
  if (rawInclude !== undefined && !isPlainObject(rawInclude))
    return { ok: false, error: "includeSections geçersiz." };

  return {
    ok: true,
    value: {
      year,
      month,
      rules,
      expertNotes: rawNotes,
      title: typeof rawTitle === "string" ? rawTitle : "HACAMAT TAKVİMİ",
      expertName: typeof rawName === "string" ? rawName : "",
      includeSections: isPlainObject(rawInclude) ? rawInclude : undefined,
    },
  };
}
