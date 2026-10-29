import type { Metadata } from "next";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";
import StoneManageClient from "./StoneManageClient";

export const metadata: Metadata = { title: "Taş Yönetimi · Doğaltaş Kütüphanesi", robots: { index: false, follow: false } };

export default async function StoneManagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoneLibraryFlag();
  const { id } = await params;
  return <StoneManageClient id={id} />;
}
