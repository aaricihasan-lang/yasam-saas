import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import GateClient from "./GateClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("numerology.app.gate");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Yöntem seçim ekranı. Sunucu bayrağı kapalıysa Klasik Numeroloji yoktur → Bütüncül Numeroloji'ye (/numeroloji)
 * yönlendirilir: menü bağlantısı bayrak durumundan bağımsız olarak hiçbir zaman kırık kalmaz (geri dönüş G2 güvenli).
 */
export default function NumerolojiMerkeziPage() {
  if (!isClassicEnabled(process.env)) redirect("/numeroloji");
  return <GateClient />;
}
