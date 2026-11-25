import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import HubClient from "./HubClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("numerology.classic.meta");
  return { title: t("hubTitle"), robots: { index: false, follow: false } };
}

export default function KlasikNumerolojiPage() {
  if (!isClassicEnabled(process.env)) notFound();
  return <HubClient />;
}
