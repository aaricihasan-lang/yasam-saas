import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "./_shared/flag";
import LibraryClient from "./LibraryClient";

export const metadata: Metadata = { title: "Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

/** Doğaltaş Kütüphanesi (uzman + owner önizleme). Hazırlık kapısı kapalıysa sunucuda 404; veri istemcide, oturumlu API'den. */
export default async function StoneLibraryPage() {
  await requireStoneLibraryFlag();
  return <LibraryClient />;
}
