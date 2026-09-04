import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Doğaltaş bölüm layout'u.
 *
 * Görsel kabuk (zemin + hero + breadcrumb) sayfa bazında
 * `DogaltasSectionShell` ile sağlanır (Biyoenerji V3 kalıbı); bu yüzden burada
 * görsel chrome eklenmez — yalnızca tüm /dogaltas/* sayfaları için tutarlı
 * sekme başlığı şablonu tanımlanır.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stones.hub");
  return {
    title: {
      default: t("meta.titleDefault"),
      template: t("meta.titleTemplate"),
    },
  };
}

export default function DogaltasLayout({ children }: { children: ReactNode }) {
  return children;
}
