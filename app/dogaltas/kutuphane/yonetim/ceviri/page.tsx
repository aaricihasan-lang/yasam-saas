import type { Metadata } from "next";
import TranslationsClient from "@/app/admin/dogaltas-kutuphane/ceviri/TranslationsClient";

export const metadata: Metadata = { title: "Çeviri Yönetimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default function WorkspaceTranslationsClientPage() {
  return <TranslationsClient />;
}
