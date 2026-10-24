import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import ExpertsClient from "./ExpertsClient";

export const metadata: Metadata = { title: "Uzman Erişimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function ExpertsPage() {
  await requireStoneLibraryFlag();
  return <ExpertsClient />;
}
