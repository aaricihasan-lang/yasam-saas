import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import GateClient from "./GateClient";

export const metadata: Metadata = {
  title: "Numeroloji Merkezi · Yaşam Sistemi",
  robots: { index: false, follow: false },
};

/**
 * Yöntem seçim ekranı. Sunucu bayrağı kapalıysa Klasik Numeroloji yoktur → Bütüncül Numeroloji'ye (/numeroloji)
 * yönlendirilir: menü bağlantısı bayrak durumundan bağımsız olarak hiçbir zaman kırık kalmaz (geri dönüş G2 güvenli).
 */
export default function NumerolojiMerkeziPage() {
  if (!isClassicEnabled(process.env)) redirect("/numeroloji");
  return <GateClient />;
}
