import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { NamesForm } from "../_ui/forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("numerology.classic.meta");
  return { title: t("namesTitle"), robots: { index: false, follow: false } };
}

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <NamesForm />;
}
