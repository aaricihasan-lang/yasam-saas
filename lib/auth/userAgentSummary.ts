/**
 * GİRİŞ GÜVENLİĞİ F2-C — telefonda gösterilecek kısa tarayıcı özeti ("Windows · Chrome").
 * Ham User-Agent telefona GÖNDERİLMEZ (gereksiz parmak izi verisi). Saf; IO yok.
 * I18N-F1-R1: tanınmayan sistem / tarayıcı etiketleri çağıran tarafından ekran dilinde verilebilir
 * (auth.server.userAgent.*); verilmezse bugünkü Türkçe etiketler aynen kullanılır.
 */
export type UserAgentLabels = { unknownOs: string; browser: string };

export function summarizeUserAgent(ua: string, labels?: UserAgentLabels): string {
  const s = String(ua ?? "");
  const os = /Windows/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
      : /iPhone|iPad|iOS/i.test(s) ? "iOS"
        : /Mac OS X|Macintosh/i.test(s) ? "macOS"
          : /Linux/i.test(s) ? "Linux"
            : labels?.unknownOs ?? "Bilinmeyen sistem"; // i18n-ignore: Türkçe varsayılan; ekran dili çağıranın verdiği labels ile (auth.server.userAgent)
  const browser = /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
      : /Firefox\//.test(s) ? "Firefox"
        : /Chrome\//.test(s) ? "Chrome"
          : /Safari\//.test(s) ? "Safari"
            : labels?.browser ?? "Tarayıcı"; // i18n-ignore: Türkçe varsayılan; ekran dili çağıranın verdiği labels ile (auth.server.userAgent)
  return `${os} · ${browser}`;
}
