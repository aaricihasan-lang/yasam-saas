"use client";

import { useTranslations } from "next-intl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { dogaltasModalFontStore } from "@/lib/dogaltas/dogaltasModalFontSize";
import { ReaderModal } from "@/components/common/reader/ReaderModal";
import { type ReactNode } from "react";

/**
 * Doğaltaş büyük okuyucu — paylaşılan ReaderModal üzerinde İNCE SARMALAYICI.
 *
 * Genel amaçlı okuyucu implementasyonu components/common/reader/ReaderModal'dır
 * (tek reader implementasyonu). Bu sarmalayıcı Doğaltaş'ın public API'sini (props),
 * kendi font deposunu (dogaltasModalFontStore), scrollbar sınıfını (stone-reader-scroll)
 * ve demo-koruma metnini KORUR → mevcut Doğaltaş davranışı/görünümü değişmez.
 */
export type StoneReaderModalProps = {
  open: boolean;
  title: string;
  badge: string;
  subtitle?: string;
  text: string;
  highlightQuery?: string;
  renderHighlight?: (text: string, key: string) => ReactNode;
  matchBadge?: ReactNode;
  /** Demo hesapta içerik koruması: başlık/kontroller açık kalır, metin alanı blur olur */
  contentBlurred?: boolean;
  onClose: () => void;
};

export function StoneReaderModal({
  open,
  title,
  badge,
  subtitle,
  text,
  highlightQuery,
  renderHighlight,
  matchBadge,
  contentBlurred = false,
  onClose,
}: StoneReaderModalProps) {
  const t = useTranslations("stones.reader");
  const renderSegment = (segment: string, key: string): ReactNode => {
    const q = highlightQuery?.trim();
    if (q && renderHighlight) return renderHighlight(segment, key);
    return segment;
  };

  return (
    <ReaderModal
      open={open}
      title={title}
      badge={badge}
      subtitle={subtitle}
      headerExtra={matchBadge}
      contentBlurred={contentBlurred}
      blurredNote={<p className="mt-6 text-center text-sm font-black text-amber-600">{t("demoProtected")}</p>}
      fontStore={dogaltasModalFontStore}
      scrollClassName="stone-reader-scroll"
      renderBody={(fontSizePx) => formatStoneContent(text, { renderSegment, fontSizePx })}
      onClose={onClose}
    />
  );
}
