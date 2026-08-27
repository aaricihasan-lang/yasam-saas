/**
 * HD Bilgi Bankası liste badge'i — TEK kaynaklı eşleme.
 *
 * Badge source-of-truth = hd_canonical_content.status (entity.status DEĞİL).
 * Hem ürün Bilgi Bankası (app/human-design/bilgi-bankasi/page.tsx) hem admin
 * Merkezî Bilgi Bankası (app/admin/human-design/page.tsx) AYNI eşlemeyi kullanır.
 *
 *   "published" → Yayınlandı  (tone: published)
 *   "draft"     → Taslak      (tone: draft)
 *   null        → İçerik Yok  (tone: neutral)  ← içerik kaydı yok
 *
 * DB write / migration YOK; yalnız sunum eşlemesidir.
 */
import type { HdContentStatus } from "./centralContentTypes";

export type HdContentBadge = {
  label: string;
  tone: "draft" | "published" | "neutral";
};

export function badgeForContentStatus(status: HdContentStatus | null): HdContentBadge {
  if (status === "published") return { label: "Yayınlandı", tone: "published" };
  if (status === "draft") return { label: "Taslak", tone: "draft" };
  return { label: "İçerik Yok", tone: "neutral" };
}
