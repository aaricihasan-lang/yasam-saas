import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import CompareClient from "./CompareClient";

export const metadata: Metadata = {
  title: "Karşılaştırmalı İnceleme · Numeroloji Merkezi",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <CompareClient />;
}
