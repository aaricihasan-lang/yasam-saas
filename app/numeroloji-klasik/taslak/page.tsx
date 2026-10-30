import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import DraftClient from "./DraftClient";

export const metadata: Metadata = {
  title: "Analiz Sonucu · Klasik Numeroloji",
  robots: { index: false, follow: false },
};

/** Kaydedilmemiş hesap sonucu. URL'de yalnız rastgele taslak anahtarı (?t=) — kişisel bilgi YOK. */
export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <DraftClient />;
}
