/**
 * İstemci tarafı dosya indirme yardımcısı.
 *
 * Kural: dosya adını istemci `new Date().toISOString().slice(0,10)` ile ÜRETMEZ
 * (UTC → 00:00–03:00 arası "dün"). Sunucunun Content-Disposition başlığındaki
 * ad (yerel tarih damgalı) kullanılır; başlık yoksa verilen fallback kullanılır.
 */

/** Content-Disposition başlığından dosya adını çıkarır (RFC 5987 filename* öncelikli). */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      const v = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
      if (v) return v;
    } catch {
      /* düz filename'e düş */
    }
  }
  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header);
  const v = plain?.[2]?.trim();
  return v ? v : null;
}

/** Blob'u tarayıcıda indirir. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * fetch Response'unu indirir; ad sunucudan gelir, yoksa fallback.
 * Dönen değer kullanılan dosya adıdır.
 */
export async function downloadFileResponse(res: Response, fallbackName: string): Promise<string> {
  const name = filenameFromContentDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;
  const blob = await res.blob();
  triggerBlobDownload(blob, name);
  return name;
}

/** Geriye dönük ad: Word indirmeleri için. */
export const downloadDocxResponse = downloadFileResponse;
