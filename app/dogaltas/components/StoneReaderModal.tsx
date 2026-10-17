"use client";

import { useTranslations } from "next-intl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { dogaltasModalFontStore } from "@/lib/dogaltas/dogaltasModalFontSize";
import { ReaderModal } from "@/components/common/reader/ReaderModal";
import { useRef, type ReactNode } from "react";
import { sourceDisplayName } from "@/lib/dogaltas/stoneSources";

/** Bilgi kaydı modeli: okuyucuda gösterilen tek kayıt (metin + KENDİ kaynağı). */
export type StoneReaderEntry = { id: string; content: string; sourceName: string | null };
import { useSearchHighlight } from "@/lib/search/useSearchHighlight";

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
  /**
   * Bilgi kaydı modeli: verilirse alanın TÜM kayıtları tek pencerede, sırayla, her biri kendi kutusunda
   * ve kaynağı aynı kutuda metnin altında gösterilir (`text` yalnız eşleşme/anahtar için kullanılır).
   */
  entries?: readonly StoneReaderEntry[];
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
  entries,
  highlightQuery,
  renderHighlight,
  matchBadge,
  contentBlurred = false,
  onClose,
}: StoneReaderModalProps) {
  const t = useTranslations("stones.reader");
  // WT8: okuyucu açılınca ilk arama eşleşmesine kaydır (vurgu <mark> ile zaten var; tüm geçişler).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useSearchHighlight(bodyRef, [highlightQuery ?? ""], {
    enabled: open && !contentBlurred && Boolean(highlightQuery?.trim()),
    resetKey: `${title}${text.length}`,
  });
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
      floatingOnMobile
      renderBody={(fontSizePx) => (
        <div ref={bodyRef}>
          {entries && entries.length > 0 ? (
            <ol data-testid="reader-entries" className="space-y-3 rounded-[22px] bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 sm:p-4">
              {entries.map((e) => (
                <li
                  key={e.id}
                  data-testid="reader-entry"
                  className="rounded-2xl border border-slate-200 border-l-4 border-l-cyan-400 bg-white px-4 py-3 shadow-sm"
                >
                  {/* bare: biçimleyici kendi kartını çizmez → bilgi + kaynak TEK kutu. */}
                  <div>{formatStoneContent(e.content, { renderSegment, fontSizePx, bare: true })}</div>
                  <p
                    data-testid="reader-entry-source"
                    data-no-search-highlight
                    className="mt-2 flex flex-wrap items-baseline gap-1 border-t border-slate-100 pt-2 font-bold leading-snug text-cyan-800"
                    style={{ fontSize: `${Math.max(12, Math.round(fontSizePx * 0.8))}px` }}
                  >
                    <span aria-hidden>📖</span>
                    <span className="font-black">Kaynak:</span>
                    <span className={e.sourceName ? "" : "italic text-slate-500"}>{sourceDisplayName(e.sourceName)}</span>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            formatStoneContent(text, { renderSegment, fontSizePx })
          )}
        </div>
      )}
      onClose={onClose}
    />
  );
}
