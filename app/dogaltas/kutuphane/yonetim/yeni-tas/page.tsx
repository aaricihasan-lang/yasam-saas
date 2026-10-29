import type { Metadata } from "next";
import NewStoneClient from "@/app/admin/dogaltas-kutuphane/yeni-tas/NewStoneClient";

export const metadata: Metadata = { title: "Yeni Taş · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default function WorkspaceNewStoneClientPage() {
  return <NewStoneClient />;
}
