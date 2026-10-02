/**
 * P3 — Word (.docx) indirme hatalarının kullanıcıya açıkça gösterilmesi.
 * Önceden detay ekranlarında `if (!res.ok) return;` / `catch {}` ile 429/500 SESSİZCE
 * yutuluyordu. Bu yardımcı sunucunun güvenli hata metnini (varsa) okur.
 */
export const BIO_REPORT_NETWORK_ERROR =
  "Word raporu indirilemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.";

export async function bioReportErrorMessage(res: Response): Promise<string> {
  let msg = "";
  try {
    const j = (await res.clone().json()) as { error?: unknown };
    if (typeof j?.error === "string") msg = j.error.trim();
  } catch {
    /* gövde JSON değil */
  }
  if (res.status === 429) return msg || "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.";
  return msg ? `Word raporu oluşturulamadı: ${msg}` : `Word raporu oluşturulamadı (HTTP ${res.status}).`;
}
