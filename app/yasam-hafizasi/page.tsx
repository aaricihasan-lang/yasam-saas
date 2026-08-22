import type { Metadata } from "next";
import { YasamHafizasiSectionShell } from "./components/YasamHafizasiSectionShell";
import { YasamHafizasiWorkspace } from "./components/YasamHafizasiWorkspace";

export const metadata: Metadata = {
  title: "Yaşam Hafızası",
  description:
    "Mesleki bilgi ve danışan geçmişinizi güvenli biçimde tek noktadan arayın.",
};

/**
 * Yaşam Hafızası kullanıcı çalışma alanı — TEK ürün, İKİ alan:
 *   • Mesleki Hafıza  (professional bilgi havuzu; danışan-scoped DEĞİL)
 *   • Danışan Hafızası (tenant-wide özel danışan geçmişi; ayrı PRIVATE index/RPC)
 * Admin ve aktif gerçek uzman AYNI sayfayı ve aynı yetenekleri kullanır; TEK fark
 * data-scope'tur (uzman yalnız kendi tenant verisini/danışanlarını görür).
 */
export default function YasamHafizasiPage() {
  return (
    <YasamHafizasiSectionShell
      title="Yaşam Hafızası"
      subtitle="Mesleki bilgi ve danışan geçmişinizi güvenli biçimde tek noktadan arayın."
    >
      <YasamHafizasiWorkspace />
    </YasamHafizasiSectionShell>
  );
}
