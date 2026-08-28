import { notFound } from "next/navigation";

/**
 * PRIVATE OWNER PREVIEW LOCK — public ürün detayı kapalı (generic 404; ürün/mağaza
 * varlığı public'e sızmaz, DB sorgusu ÇALIŞMAZ). Sahip önizlemesi:
 * /admin/magaza/onizleme/[slug].
 */
export const dynamic = "force-dynamic";

export default function ProductPage(): never {
  notFound();
}
