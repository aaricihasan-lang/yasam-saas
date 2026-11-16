/**
 * GİRİŞ GÜVENLİĞİ F2-C — telefonda gösterilecek kısa tarayıcı özeti ("Windows · Chrome").
 * Ham User-Agent telefona GÖNDERİLMEZ (gereksiz parmak izi verisi). Saf; IO yok.
 */
export function summarizeUserAgent(ua: string): string {
  const s = String(ua ?? "");
  const os = /Windows/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
      : /iPhone|iPad|iOS/i.test(s) ? "iOS"
        : /Mac OS X|Macintosh/i.test(s) ? "macOS"
          : /Linux/i.test(s) ? "Linux"
            : "Bilinmeyen sistem";
  const browser = /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
      : /Firefox\//.test(s) ? "Firefox"
        : /Chrome\//.test(s) ? "Chrome"
          : /Safari\//.test(s) ? "Safari"
            : "Tarayıcı";
  return `${os} · ${browser}`;
}
