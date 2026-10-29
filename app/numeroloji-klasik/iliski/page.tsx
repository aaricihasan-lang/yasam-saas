import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { RelationshipForm } from "../_ui/forms";

export const metadata: Metadata = {
  title: "İlişki Analizi · Klasik Numeroloji",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!isClassicEnabled(process.env)) notFound();
  return <RelationshipForm />;
}
