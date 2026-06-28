import type { ReactNode } from "react";

/**
 * Doğaltaş bölüm layout'u.
 *
 * Görsel kabuk (zemin + hero + breadcrumb) sayfa bazında
 * `DogaltasSectionShell` ile sağlanır (Biyoenerji V3 kalıbı); bu yüzden burada
 * görsel chrome eklenmez — yalnızca tüm /dogaltas/* sayfaları için tutarlı
 * sekme başlığı şablonu tanımlanır.
 */
export const metadata = {
  title: {
    default: "Doğaltaş · Yaşam Sistemi",
    template: "%s · Doğaltaş · Yaşam Sistemi",
  },
};

export default function DogaltasLayout({ children }: { children: ReactNode }) {
  return children;
}
