import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import RecordsClient from "./RecordsClient";

export const metadata: Metadata = {
  title: "Kayıtlı Analizler · Klasik Numeroloji",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <RecordsClient />;
}
