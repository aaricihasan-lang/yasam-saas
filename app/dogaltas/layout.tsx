import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { stoneLibraryAccessForRender } from "@/lib/stone-library/renderAccess";
import { StoneLibraryAccessProvider } from "./StoneLibraryAccess";

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

/**
 * Doğaltaş Kütüphanesi kartı (owner kararı 31.10.2026): erişim İLK SUNUCU ÇİZİMİNDE, istek çerezindeki oturumdan ve mevcut
 * kütüphane kapısıyla belirlenir (lib/stone-library/renderAccess) → ana ekran kart listesini ilk anda doğru sayıda çizer.
 */
export default async function DogaltasLayout({ children }: { children: ReactNode }) {
  const stoneLibraryAllowed = await stoneLibraryAccessForRender();
  return <StoneLibraryAccessProvider allowed={stoneLibraryAllowed}>{children}</StoneLibraryAccessProvider>;
}
