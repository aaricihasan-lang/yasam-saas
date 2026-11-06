import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "./_shared/flag";
import LibraryEntry from "./LibraryEntry";

export const metadata: Metadata = { title: "Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

/**
 * Doğaltaş Kütüphanesi — herkese (owner dahil) uzman kütüphane görünümü; owner'a "Kütüphane Yönetimi" sekmesi.
 * Eski `?gorunum=onizleme` adresi aynı görünümü açar (adres korunur). Hazırlık kapısı kapalıysa sunucuda 404; veri istemcide,
 * oturumlu API'den (owner kararı sunucuda).
 */
export default async function StoneLibraryPage() {
  await requireStoneLibraryFlag();
  return <LibraryEntry />;
}
