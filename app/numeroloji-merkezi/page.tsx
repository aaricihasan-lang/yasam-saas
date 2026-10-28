import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import GateClient from "./GateClient";

export const metadata: Metadata = {
  title: "Numeroloji Merkezi · Yaşam Sistemi",
  robots: { index: false, follow: false },
};

/** Ekol seçim kapısı — sunucu bayrağı kapalıysa modül yoktur (404). */
export default function NumerolojiMerkeziPage() {
  if (!isClassicEnabled(process.env)) notFound();
  return <GateClient />;
}
