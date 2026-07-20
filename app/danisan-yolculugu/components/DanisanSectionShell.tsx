import type { ElementType, ReactNode } from "react";

/**
 * Varsayılan masaüstü (sm+) kart görünümü: beyaz cam kart.
 * Farklı ton isteyen çağıranlar `desktopClassName` ile TAM string geçer
 * (Tailwind aynı-breakpoint çakışmasını önlemek için birleştirme yapılmaz).
 */
export const DANISAN_SECTION_DESKTOP_CARD =
  "sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/80 sm:p-6 sm:shadow-lg sm:backdrop-blur-sm lg:p-8";

export type DanisanSectionShellProps = {
  children: ReactNode;
  /**
   * sm ve üstünde uygulanacak kart görünümü (kenarlık + zemin + yuvarlatma +
   * gölge + iç padding). Verilmezse varsayılan beyaz cam kart kullanılır.
   */
  desktopClassName?: string;
  /**
   * Her boyutta geçerli yerleşim sınıfları (dış margin, flex, min-w-0 vb.).
   * Görsel kart tonu için değil, konumlandırma için.
   */
  className?: string;
  /** Render edilecek element (varsayılan: section). */
  as?: ElementType;
};

/**
 * Danışan Yolculuğu modülüne özel mobil-öncelikli bölüm kabı.
 *
 * Mobil (varsayılan): tam genişlik, dış beyaz kutu YOK — kenarlık/gölge/
 * yuvarlatma/iç padding/zemin sıfırlanır. İçerik doğrudan sayfa main'inin
 * güvenli 12px yatay boşluğuna oturur; "kutu içinde kutu" görünümü kalkar.
 *
 * sm ve üstü: masaüstündeki mevcut cam kart görünümü geri gelir.
 *
 * Biyoenerji/Doğaltaş SectionShell kalıbının Danışan Yolculuğu karşılığıdır;
 * o dosyalara dokunulmaz, aralarında bağımlılık kurulmaz.
 */
export function DanisanSectionShell({
  children,
  desktopClassName = DANISAN_SECTION_DESKTOP_CARD,
  className = "",
  as,
}: DanisanSectionShellProps) {
  const Tag = as ?? "section";
  return (
    <Tag
      className={`w-full rounded-none border-0 bg-transparent p-0 shadow-none ${desktopClassName} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
