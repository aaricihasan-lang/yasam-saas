import type { Metadata } from "next";
import BulkPublishClient from "@/app/admin/dogaltas-kutuphane/toplu/BulkPublishClient";

export const metadata: Metadata = { title: "Kullanıma Açma · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default function WorkspaceBulkPublishPage() {
  return <BulkPublishClient />;
}
