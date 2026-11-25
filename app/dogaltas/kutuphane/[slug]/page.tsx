import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireStoneLibraryFlag } from "../_shared/flag";
import StoneDetailClient from "./StoneDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stones.library");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Taş ayrıntısı. Hazırlık kapısı kapalıysa sunucuda 404; içerik istemcide oturumlu API'den gelir. */
export default async function StoneLibraryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireStoneLibraryFlag();
  const { slug } = await params;
  return <StoneDetailClient slug={slug} />;
}
