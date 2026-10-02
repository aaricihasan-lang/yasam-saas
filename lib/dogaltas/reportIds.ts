/**
 * lib/dogaltas/reportIds.ts — Doğaltaş rapor/export uçlarında "seçili kayıt" listesinin
 * sunucu doğrulaması (P2-02).
 *
 * Kural:
 *   - Alan hiç gönderilmemiş / null / boş dizi → `ids: null` ("tümü" anlamı; mevcut sözleşme).
 *   - Dizi değil, string olmayan öğe, UUID olmayan öğe → 400 (DB'ye gitmeden; 22P02/boş rapor yok).
 *   - Tekrarlar ayıklanır; üst sınır aşılırsa 400 (dev istek yok).
 *   - Varlık/sahiplik kontrolü çağıranda: tenant-scoped sorgu, istenen id sayısından AZ satır
 *     döndürürse rapor ÜRETİLMEZ (`missingSelectionResponse`). Hangi id'nin eksik olduğu
 *     söylenmez (IDOR'da var/yok bilgisi sızmaz).
 */
import { isUuid } from "@/lib/dogaltas/validation";

export const REPORT_MAX_IDS = 5000;

export type ReportIdsParse =
  | { ok: true; ids: string[] | null }
  | { ok: false; error: string };

export function parseReportIds(raw: unknown, max = REPORT_MAX_IDS): ReportIdsParse {
  if (raw === undefined || raw === null) return { ok: true, ids: null };
  if (!Array.isArray(raw)) return { ok: false, error: "Seçili kayıt listesi geçersiz." };
  if (raw.length === 0) return { ok: true, ids: null };
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !isUuid(item)) {
      return { ok: false, error: "Seçili kayıtlardan biri geçersiz. Listeyi yenileyip tekrar deneyin." };
    }
    seen.add(item.trim().toLowerCase());
  }
  if (seen.size > max) return { ok: false, error: `Tek raporda en fazla ${max} kayıt seçilebilir.` };
  return { ok: true, ids: [...seen] };
}

export function badSelectionResponse(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export function missingSelectionResponse(): Response {
  return Response.json(
    {
      ok: false,
      code: "selection_missing",
      error: "Seçilen kayıtlardan bazıları bulunamadı veya artık mevcut değil. Listeyi yenileyip tekrar deneyin.",
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** Ad alanına göre TR-duyarlı kararlı sıralama (parçalı `.in()` sonuçlarını birleştirirken). */
export function sortByTrField<T>(rows: T[], field: keyof T): T[] {
  return [...rows].sort((a, b) =>
    String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "tr-TR", { sensitivity: "base" }),
  );
}
