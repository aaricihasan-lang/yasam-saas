/**
 * lib/dogaltas/reportErrorKind.ts — Doğaltaş Word/rapor indirme hatalarını kullanıcıya
 * anlaşılır (i18n) mesaj türüne çevirir (P2-09A / P2-02).
 *
 * Ham sunucu/DB metni gösterilmez; yalnız HTTP durumu + sunucunun bilinçli `code`'u kullanılır.
 * Mesaj metinleri: messages/<locale>/stones.json → stones.reportErrors.<kind>.
 */
export type ReportErrorKind = "session" | "forbidden" | "notFound" | "empty" | "invalid" | "generic";

export async function reportErrorKind(res: Response): Promise<ReportErrorKind> {
  const body = (await res.json().catch(() => ({}))) as { code?: unknown };
  if (res.status === 401) return "session";
  if (res.status === 403) return "forbidden";
  if (res.status === 404) return body.code === "empty_report" ? "empty" : "notFound";
  if (res.status === 400 || res.status === 422) return "invalid";
  return "generic";
}
