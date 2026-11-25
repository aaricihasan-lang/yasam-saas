import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { YasamHafizasiSectionShell } from "./components/YasamHafizasiSectionShell";
import { YasamHafizasiWorkspace } from "./components/YasamHafizasiWorkspace";

// I18N: başlık/açıklama memory.workspace.page (TR metinleri birebir).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memory.workspace.page");
  return { title: t("title"), description: t("subtitle") };
}

/**
 * Yaşam Hafızası kullanıcı çalışma alanı — TEK ürün, İKİ alan:
 *   • Mesleki Hafıza  (professional bilgi havuzu; danışan-scoped DEĞİL)
 *   • Danışan Hafızası (tenant-wide özel danışan geçmişi; ayrı PRIVATE index/RPC)
 * Admin ve aktif gerçek uzman AYNI sayfayı ve aynı yetenekleri kullanır; TEK fark
 * data-scope'tur (uzman yalnız kendi tenant verisini/danışanlarını görür).
 */
export default function YasamHafizasiPage() {
  const t = useTranslations("memory.workspace.page");
  return (
    <YasamHafizasiSectionShell title={t("title")} subtitle={t("subtitle")}>
      <YasamHafizasiWorkspace />
    </YasamHafizasiSectionShell>
  );
}
