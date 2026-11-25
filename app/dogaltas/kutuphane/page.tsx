import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireStoneLibraryFlag } from "./_shared/flag";
import LibraryEntry from "./LibraryEntry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stones.library");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Doğaltaş Kütüphanesi — herkese (owner dahil) uzman kütüphane görünümü; owner'a "Kütüphane Yönetimi" sekmesi.
 * Eski `?gorunum=onizleme` adresi aynı görünümü açar (adres korunur). Hazırlık kapısı kapalıysa sunucuda 404; veri istemcide,
 * oturumlu API'den (owner kararı sunucuda).
 */
export default async function StoneLibraryPage() {
  await requireStoneLibraryFlag();
  return <LibraryEntry />;
}
