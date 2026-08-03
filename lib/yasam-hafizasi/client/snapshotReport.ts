/**
 * BF-14 Paket 2 — Word teslim katmanı: "Yaşam Hafızası Seçimleri" bölümü (server).
 *
 * ÜÇ teslim rotası (danışan genel Word · refleksoloji protokol · şifa rehberi) AYNI
 * bölümü kullanır (kopya YOK). Yalnız SERVER tarafından okunmuş + ownership doğrulanmış
 * snapshot öğeleri render edilir. Teknik tablo/UUID Word'e YAZILMAZ (§7, §8).
 *
 * Regresyon güvenliği: öğe yoksa [] döner → çağıran rota mevcut çıktısını KORUR.
 */
import {
  arraySection,
  bodyText,
  divider,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import type { SnapshotReportItem } from "./snapshotDto";

const C_YH = "6d28d9"; // Yaşam Hafızası moru
const SECTION_HEADING = "Yaşam Hafızası Seçimleri";

function formatDateTR(value: string | null): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Seçilmiş snapshot öğelerinden Word bölümü üretir. `items` boşsa [] → çağıran
 * rota mevcut belgeyi değiştirmez. Öğeler ÇAĞIRAN tarafından kararlı sırada verilir.
 *
 * @param items  Server-derived, ownership-doğrulanmış öğeler (kararlı sıralı).
 * @param opts.headingNumber  "9. Yaşam Hafızası…" gibi numaralı başlık için (opsiyonel).
 */
export function buildSnapshotSection(
  items: readonly SnapshotReportItem[],
  opts?: { headingNumber?: number; pageBreak?: boolean },
): ReportChild[] {
  if (!items || items.length === 0) return [];

  const headingText = opts?.headingNumber
    ? `${opts.headingNumber}. ${SECTION_HEADING}`
    : SECTION_HEADING;

  const out: ReportChild[] = [
    h1Colored(headingText, C_YH, opts?.pageBreak !== false),
    muted(
      `Uzmanın Yaşam Hafızası'ndan bu teslime eklediği ${items.length} kayıt. ` +
        `Her biri seçim anında korunan bağımsız bir kopyadır.`,
    ),
    spacer(),
  ];

  items.forEach((item, i) => {
    if (i > 0) out.push(divider());

    out.push(profileLabel(`SEÇİM #${String(i + 1).padStart(3, "0")}`, C_YH));
    out.push(h2(item.title?.trim() || "Kayıt"));

    out.push(
      twoColTable([
        ["Kaynak Modül", item.moduleLabel],
        ["Kaynak Tarihi", formatDateTR(item.sourceUpdatedAt)],
      ]),
    );

    if (item.selectedText?.trim()) {
      out.push(h3("Seçilen İçerik"));
      out.push(bodyText(item.selectedText.trim()));
    }

    if (item.evidence.length > 0) {
      out.push(...arraySection("Kanıt / Bağlam", item.evidence.map((e) => e.text)));
    }

    if (item.expertNote?.trim()) {
      out.push(h3("Uzman Notu"));
      out.push(bodyText(item.expertNote.trim()));
    }

    if (!item.sourceAvailable) {
      out.push(
        muted("Kaynak kaydı artık mevcut değil — bu, teslim anında korunan snapshot kopyasıdır."),
      );
    }
  });

  return out;
}

export const SNAPSHOT_SECTION_HEADING = SECTION_HEADING;
