import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "./_shared/flag";
import LibraryEntry from "./LibraryEntry";

export const metadata: Metadata = { title: "Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

/**
 * Doğaltaş Kütüphanesi — Doğaltaş modülü içi tek çalışma alanı (owner yönetimi + uzman ekranı).
 * Hazırlık kapısı kapalıysa sunucuda 404; veri istemcide, oturumlu API'den (owner kararı sunucuda).
 */
export default async function StoneLibraryPage({ searchParams }: { searchParams: Promise<{ gorunum?: string | string[] }> }) {
  await requireStoneLibraryFlag();
  const { gorunum } = await searchParams;
  return <LibraryEntry preview={gorunum === "onizleme"} />;
}
