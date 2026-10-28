import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "../_shared/flag";
import StoneDetailClient from "./StoneDetailClient";

export const metadata: Metadata = { title: "Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

/** Taş ayrıntısı. Hazırlık kapısı kapalıysa sunucuda 404; içerik istemcide oturumlu API'den gelir. */
export default async function StoneLibraryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireStoneLibraryFlag();
  const { slug } = await params;
  return <StoneDetailClient slug={slug} />;
}
