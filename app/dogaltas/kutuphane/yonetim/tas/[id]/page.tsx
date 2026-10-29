import type { Metadata } from "next";
import StoneManageClient from "@/app/admin/dogaltas-kutuphane/tas/[id]/StoneManageClient";

export const metadata: Metadata = { title: "Taş Yönetimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function WorkspaceStonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoneManageClient id={id} />;
}
