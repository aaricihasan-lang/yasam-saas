/**
 * Klasik Numeroloji — "Gelecek Yılları Göster" (NK-R3) sunucu bağlantısı (YALNIZ SUNUCU).
 * Yetki: Mevcut Numeroloji ile AYNI karar fonksiyonu (canSeeNumerologyFutureYears, doğrulanmış profil);
 * yıl: Europe/Istanbul (currentIstanbulYear). İkisi de mevcut modülden YALNIZ çağrılır (mevcut kod değişmez).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";
import { redactClassicResultForFutureYears, type FutureYearsOpts } from "../futureYears";

assertServerOnly("lib/numeroloji-klasik/server/futureYearsView");

export function futureYearsOptsFor(profile: Record<string, unknown> | null | undefined, now: Date = new Date()): FutureYearsOpts {
  return { futureYears: canSeeNumerologyFutureYears(profile), currentYear: currentIstanbulYear(now) };
}

/** Uzman görünümü (toAnalysisView çıktısı) → yetkiye göre daraltılmış kopya. */
export function viewForViewer<T extends { input: unknown; result: unknown; meta: { referenceDate: string | null } }>(view: T, opts: FutureYearsOpts): T {
  if (opts.futureYears) return view;
  return { ...view, result: redactClassicResultForFutureYears(view.result, { input: view.input, referenceDate: view.meta.referenceDate }, opts) };
}

/** Repository satırı (provider_meta.reference_date) → daraltılmış `result`. */
export function rowResultForViewer(row: { input: unknown; result: unknown; provider_meta?: unknown }, opts: FutureYearsOpts): unknown {
  if (opts.futureYears) return row.result;
  const pm = row.provider_meta && typeof row.provider_meta === "object" ? (row.provider_meta as { reference_date?: unknown }) : {};
  return redactClassicResultForFutureYears(row.result, { input: row.input, referenceDate: typeof pm.reference_date === "string" ? pm.reference_date : null }, opts);
}
