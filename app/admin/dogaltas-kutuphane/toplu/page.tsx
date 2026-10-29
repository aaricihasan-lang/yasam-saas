import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import BulkPublishClient from "./BulkPublishClient";

export const metadata: Metadata = { title: "Kullanıma Açma · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function BulkPublishPage() {
  await requireStoneLibraryFlag();
  return <BulkPublishClient />;
}
