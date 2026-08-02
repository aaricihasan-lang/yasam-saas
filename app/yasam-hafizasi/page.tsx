import type { Metadata } from "next";
import { YasamHafizasiSectionShell } from "./components/YasamHafizasiSectionShell";
import { YasamHafizasiWorkspace } from "./components/YasamHafizasiWorkspace";

export const metadata: Metadata = {
  title: "Yaşam Hafızası",
  description:
    "Uzmanın farklı modüllerdeki mesleki bilgi ve içeriklerini tek noktadan aramasını sağlayan çalışma alanı.",
};

/**
 * BF-13 — Yaşam Hafızası kullanıcı çalışma alanı.
 * Admin ve uzman AYNI sayfayı ve aynı temel yetenekleri kullanır (fark yalnız
 * tenant sahipliği). Mevcut sürüm: uzmanın mesleki bilgi havuzunda arama
 * (danışan-scoped DEĞİL; danışan hafızası sonraki fazın kapsamıdır).
 */
export default function YasamHafizasiPage() {
  return (
    <YasamHafizasiSectionShell
      title="Yaşam Hafızası"
      subtitle="Farklı modüllerdeki mesleki bilgi ve içeriklerinizi tek yerden arayın."
    >
      <YasamHafizasiWorkspace />
    </YasamHafizasiSectionShell>
  );
}
