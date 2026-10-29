import type { Metadata } from "next";
import ExpertsClient from "@/app/admin/dogaltas-kutuphane/uzmanlar/ExpertsClient";

export const metadata: Metadata = { title: "Uzman Erişimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default function WorkspaceExpertsClientPage() {
  return <ExpertsClient />;
}
