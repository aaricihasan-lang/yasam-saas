/**
 * KAMPANYA MERKEZİ — ziyaretçi rapor dosyaları ortak katmanı (YALNIZ SUNUCU).
 *
 * İlke: rapor, ziyaretçinin analiziyle AYNI istekte, AYNI hesap sonucundan üretilir ve yanıtla birlikte döner (base64).
 * Sunucuda dosya / kayıt / bağlantı TUTULMAZ → başka bir ziyaretçinin raporuna erişim yapısal olarak yoktur; rapor ayrı bir
 * uçtan indirilmediği için kontenjan / kredi / yetki politikasının dışına çıkamaz (rezervasyon başına tek üretim).
 *
 * Uzman rapor kurucuları DEĞİŞTİRİLMEZ. Kurucuların uzman kaydı için yazılmış sabit metinleri ("kayıtlı analizden",
 * "Danışan") yalnız bu katmanda, üretilmiş .docx içindeki TAM metin düğümleri değiştirilerek kampanya diline uyarlanır.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import JSZip from "jszip";

assertServerOnly("lib/campaign/visitor/reports/files");

export type ReportKind = "docx" | "png";
export type ReportFile = { kind: ReportKind; filename: string; base64: string; label: string };

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PNG_MIME = "image/png";

/**
 * Yanıttaki tüm rapor dosyalarının base64 toplamı için üst sınır. Platform yanıt sınırı 4,5 MB; JSON + sonuç blokları için
 * pay bırakılır. Sınırı aşan (öncelik sırasında sonraki) dosya eklenmez ve ziyaretçiye not düşülür — kırık yanıt üretilmez.
 */
export const REPORT_BUDGET_BASE64 = 3_400_000;

export function toReportFile(kind: ReportKind, filename: string, bytes: Uint8Array, label: string): ReportFile {
  return { kind, filename, base64: Buffer.from(bytes).toString("base64"), label };
}

/** Öncelik sırasına göre bütçeye sığanları alır; sığmayanların etiketlerini döner. */
export function fitReports(files: readonly ReportFile[], budget = REPORT_BUDGET_BASE64): { files: ReportFile[]; dropped: string[] } {
  const out: ReportFile[] = [];
  const dropped: string[] = [];
  let used = 0;
  for (const f of files) {
    if (used + f.base64.length > budget) {
      dropped.push(f.label);
      continue;
    }
    used += f.base64.length;
    out.push(f);
  }
  return { files: out, dropped };
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * .docx içindeki TAM metin düğümlerini (`<w:t …>METİN</w:t>`) değiştirir. Kısmi eşleşme yapılmaz (kişi adı / değer gibi
 * içerik metinleri etkilenmez). Dönüş: yeni buffer + her kural için değiştirilen düğüm sayısı (testler doğrular).
 */
export async function rewriteDocxText(buf: Buffer | Uint8Array, rules: readonly (readonly [string, string])[]): Promise<{ buffer: Buffer; counts: number[] }> {
  const zip = await JSZip.loadAsync(buf);
  const counts = rules.map(() => 0);
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  for (const name of parts) {
    let xml = await zip.file(name)!.async("string");
    rules.forEach(([from, to], i) => {
      const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)${xmlEsc(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(</w:t>)`, "g");
      xml = xml.replace(re, (_m, a: string, b: string) => {
        counts[i]++;
        return `${a}${xmlEsc(to)}${b}`;
      });
    });
    zip.file(name, xml);
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: out, counts };
}

/** .docx'teki tüm görünür metin (testler + sızıntı denetimi için). */
export async function docxPlainText(buf: Buffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  let all = "";
  for (const n of parts) {
    const xml = await zip.file(n)!.async("string");
    all += ` ${xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")}`;
  }
  return all.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Dosya adı: ASCII güvenli, kişi adı İÇERMEZ (indirilen dosyalar paylaşılabilir; ad yalnız belgenin içinde). */
export function campaignFilename(stem: string, day: string, ext: "docx" | "png"): string {
  const safe = stem.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "rapor";
  return `yasam-sistemi-${safe}-${day.replace(/[^0-9-]/g, "")}.${ext}`;
}
