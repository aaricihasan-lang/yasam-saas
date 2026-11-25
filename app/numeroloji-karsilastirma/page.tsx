import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import CompareClient from "./CompareClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("numerology.compare");
  return {
    title: t("meta.title"),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <CompareClient />;
}
