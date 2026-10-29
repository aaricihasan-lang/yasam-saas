/**
 * Klasik Numeroloji — güvenli Word dosya adı (SAF).
 *
 * Yalnız uzmanın yazdığı başlık kullanılır (ad / doğum tarihi gibi ek kişisel veri EKLENMEZ).
 * Türkçe harfler ASCII'ye katlanır; yalnız [A-Za-z0-9-_] kalır; en çok 80 karakter (uzantı dahil).
 */

const TR_FOLD: Readonly<Record<string, string>> = Object.freeze({
  ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
  â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U", ß: "ss", æ: "ae", Æ: "AE", ø: "o", Ø: "O", đ: "d", Đ: "D", ł: "l", Ł: "L",
});

export const REPORT_FILENAME_MAX = 80;

export type ReportFileKind = "kisi" | "tas" | "iliski" | "isletme" | "isimler" | "karsilastirma";

const KIND_PREFIX: Readonly<Record<ReportFileKind, string>> = Object.freeze({
  kisi: "Klasik-Numeroloji",
  tas: "Klasik-Numeroloji-Dogaltas",
  iliski: "Klasik-Numeroloji-Iliski",
  isletme: "Klasik-Numeroloji-Isletme",
  isimler: "Klasik-Numeroloji-Isimler",
  karsilastirma: "Numeroloji-Karsilastirma",
});

/** ASCII katlama: Türkçe eşleme → NFKD + birleşik işaret silme. */
export function asciiFold(s: string): string {
  return Array.from(s.normalize("NFC"))
    .map((ch) => TR_FOLD[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/** Başlık → dosya adı parçası (boşsa ""). */
export function slugifyTitle(title: unknown, max = 60): string {
  if (typeof title !== "string") return "";
  const s = asciiFold(title)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, max).replace(/-$/g, "");
}

/** Tam dosya adı: `<önek>-<başlık>-<YYYY-AA-GG>.docx` (≤ 80 karakter; Windows ayrılmış adları güvenli). */
export function buildReportFilename(kind: ReportFileKind, title: unknown, date?: string | Date | null): string {
  const prefix = KIND_PREFIX[kind] ?? KIND_PREFIX.kisi;
  let day = "";
  if (date) {
    // NK-R14: Date → Europe/Istanbul takvim günü (TR 00:00–03:00 arası önceki gün yazılmaz); metin olduğu gibi.
    const d = typeof date === "string" ? date : Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) day = m[1];
  }
  const ext = ".docx";
  const fixed = prefix.length + (day ? day.length + 1 : 0) + ext.length;
  const room = Math.max(0, REPORT_FILENAME_MAX - fixed - 1);
  const slug = slugifyTitle(title, room);
  const parts = [prefix, slug, day].filter(Boolean);
  return `${parts.join("-")}${ext}`.slice(0, REPORT_FILENAME_MAX);
}

/** Content-Disposition başlığı (ASCII ad + RFC 5987 UTF-8 ad aynı güvenli değer). */
export function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, REPORT_FILENAME_MAX) || "rapor.docx";
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
