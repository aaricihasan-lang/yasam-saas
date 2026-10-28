import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import TranslationsClient from "./TranslationsClient";

export const metadata: Metadata = { title: "Çeviri Yönetimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function TranslationsPage() {
  await requireStoneLibraryFlag();
  return <TranslationsClient />;
}
