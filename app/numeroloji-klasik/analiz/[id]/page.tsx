import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import ResultClient from "./ResultClient";

export const metadata: Metadata = {
  title: "Analiz Sonucu · Klasik Numeroloji",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!isClassicEnabled(process.env)) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <ResultClient id={id.toLowerCase()} />;
}
