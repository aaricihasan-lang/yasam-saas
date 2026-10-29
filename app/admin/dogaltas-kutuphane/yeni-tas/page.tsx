import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import NewStoneClient from "./NewStoneClient";

export const metadata: Metadata = { title: "Yeni Taş · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function NewStonePage() {
  await requireStoneLibraryFlag();
  return <NewStoneClient />;
}
