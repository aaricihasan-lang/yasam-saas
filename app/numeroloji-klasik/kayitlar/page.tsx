import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import RecordsClient from "./RecordsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("numerology.classic.meta");
  return { title: t("recordsTitle"), robots: { index: false, follow: false } };
}

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <RecordsClient />;
}
