/**
 * Not eki "Yeni Sekme" / "Aç" yardımcısı (plan §4.6 / kategori B).
 *
 * SORUN: Ekler `data:` URL olarak saklanır. Chrome/Edge (ve Firefox) renderer kaynaklı
 * üst-çerçeve `data:` navigasyonunu ENGELLER → `<a href="data:..." target="_blank">`
 * masaüstünde de boş sekme açar. ÇÖZÜM: data: → Blob → `blob:` URL → window.open.
 *
 * GÜVENLİK: `blob:` URL sayfanın ORIGIN'ini taşır; bu yüzden yalnız aktif içerik
 * çalıştıramayan türler (PDF + raster görsel) açılır. SVG/HTML vb. REDDEDİLİR (XSS).
 * Dönüşüm SENKRON yapılır → window.open tıklama jesti içinde kalır (popup engeli yok).
 */

const SAFE_OPEN_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

/** Yeni sekmede güvenle açılabilir tür mü? (PDF + raster görsel; SVG/HTML hayır). */
export function isSafeOpenMime(mime: string | null | undefined): boolean {
  return SAFE_OPEN_MIME.has(String(mime ?? "").trim().toLowerCase());
}

/**
 * data: URL → Blob (saf, senkron). Tür `mimeOverride` (kayıttaki doğrulanmış MIME)
 * ya da data URL başlığından alınır; güvenli değilse veya biçim bozuksa null.
 */
export function dataUrlToSafeBlob(dataUrl: string, mimeOverride?: string | null): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const parts = header.split(";");
  const isBase64 = parts.slice(1).some((p) => p.trim().toLowerCase() === "base64");
  const mime = String(mimeOverride || parts[0] || "").trim().toLowerCase();
  if (!isSafeOpenMime(mime)) return null;
  try {
    if (isBase64) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Eki yeni sekmede açar (blob: URL). Başarısızsa (güvensiz tür / bozuk veri) false.
 * Object URL bir süre sonra serbest bırakılır (yeni sekme o sürede yüklemiş olur).
 */
export function openDataUrlInNewTab(dataUrl: string, mimeOverride?: string | null): boolean {
  if (typeof window === "undefined") return false;
  const blob = dataUrlToSafeBlob(dataUrl, mimeOverride);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  // "noopener" bazı tarayıcılarda blob: URL yüklemesini bozar → opener elle kesilir
  // (içerik zaten script çalıştıramayan PDF/raster görsel).
  const win = window.open(url, "_blank");
  if (win) win.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
