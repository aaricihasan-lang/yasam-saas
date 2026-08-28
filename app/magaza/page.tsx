import { notFound } from "next/navigation";

/**
 * PRIVATE OWNER PREVIEW LOCK — Doğal Pazar public launch kilitli.
 * Public /magaza erişimi geçici olarak kapalı (generic 404; mağazanın varlığı
 * public'e sızmaz, DB sorgusu ÇALIŞMAZ). Sahip önizlemesi: /admin/magaza/onizleme.
 * Public açılış ileride ayrı release ile yapılacak.
 */
export const dynamic = "force-dynamic";

export default function MagazaPage(): never {
  notFound();
}
