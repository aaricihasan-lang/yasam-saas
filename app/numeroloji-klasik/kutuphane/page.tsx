import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import LibraryClient from "./LibraryClient";

export const metadata: Metadata = {
  title: "Sayı Bilgi Kütüphanesi · Klasik Numeroloji",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <LibraryClient />;
}
