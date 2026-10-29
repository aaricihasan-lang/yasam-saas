import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import HubClient from "./HubClient";

export const metadata: Metadata = {
  title: "Klasik Numeroloji · Yaşam Sistemi",
  robots: { index: false, follow: false },
};

export default function KlasikNumerolojiPage() {
  if (!isClassicEnabled(process.env)) notFound();
  return <HubClient />;
}
