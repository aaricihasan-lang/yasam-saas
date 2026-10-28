import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import CatalogClient from "./CatalogClient";

export const metadata: Metadata = { title: "Taş Yönetimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function StoneLibraryOwnerPage() {
  await requireStoneLibraryFlag();
  return <CatalogClient />;
}
