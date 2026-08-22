"use client";

import { useCallback, type ReactNode } from "react";
import { useOverlay } from "@/lib/dogaltas/useOverlay";
import { useFontSizeStore } from "@/lib/dogaltas/useFontSizeStore";
import type { FontSizeStore } from "@/lib/dogaltas/createFontSizeStore";
import { ReaderFontSizeControl } from "./ReaderFontSizeControl";
import { hdReaderFontStore, READER_LINE_HEIGHT } from "./readerFontStore";

/**
 * Genel amaçlı PREMIUM büyük okuyucu (PREVIEW → LARGE READER).
 *
 * Tek reader implementasyonu: Doğaltaş (StoneReaderModal) ve Human Design bilgi
 * bankası bunu kullanır. useOverlay (scroll-lock + ESC + focus-trap + focus-restore)
 * ve paylaşılan font-size deposu reuse edilir. İçerik biçimlendirme çağırana aittir
 * (`renderBody(fontSizePx)`) → farklı modüller kendi güvenli formatter'ını geçer.
 * dangerouslySetInnerHTML KULLANILMAZ.
 */
export type ReaderModalProps = {
  open: boolean;
  title: string;
  badge: string;
  subtitle?: string;
  /** Aktif yazı boyutuna göre güvenli okunabilir node üretir. */
  renderBody: (fontSizePx: number) => ReactNode;
  /** Başlık yanında ek rozet (ör. arama eşleşmesi). */
  headerExtra?: ReactNode;
  /** Demo/koruma: başlık/kontroller açık kalır, gövde blur olur. */
  contentBlurred?: boolean;
  /** Blur durumunda gösterilecek not (varsayılan yok). */
  blurredNote?: ReactNode;
  /** Yazı boyutu deposu (modüle özel localStorage anahtarı). Varsayılan HD reader. */
  fontStore?: FontSizeStore;
  /** Scroll kabı className (scrollbar stili). Modüller kendi sınıfını geçebilir. */
  scrollClassName?: string;
  /**
   * TEK opak makale yüzeyi: gövde, dim overlay yerine kesintisiz açık (bg-white) bir
   * article surface üzerinde render edilir. Kendi kart/yüzeyini üreten modüller
   * (ör. Doğaltaş formatStoneContent) bunu KAPALI bırakır → mevcut görünümleri değişmez.
   */
  contentSurface?: boolean;
  onClose: () => void;
};

export function ReaderModal({
  open,
  title,
  badge,
  subtitle,
  renderBody,
  headerExtra,
  contentBlurred = false,
  blurredNote,
  fontStore = hdReaderFontStore,
  scrollClassName = "reader-modal-scroll",
  contentSurface = false,
  onClose,
}: ReaderModalProps) {
  const { fontSizePx, decrease, reset, increase, canDecrease, canIncrease, isDefault } =
    useFontSizeStore(fontStore, { open });

  const { containerRef } = useOverlay<HTMLDivElement>({ open, onClose });

  const body = useCallback(() => renderBody(fontSizePx), [renderBody, fontSizePx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4 md:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-modal-title"
        tabIndex={-1}
        className="flex h-[min(90vh,940px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-t-[28px] border border-violet-200/60 bg-gradient-to-b from-white via-violet-50/25 to-cyan-50/20 shadow-2xl ring-1 ring-white/90 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-violet-100/90 bg-white/95 px-4 py-4 backdrop-blur-md sm:px-7 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex rounded-full border border-cyan-200/80 bg-gradient-to-r from-cyan-50 to-violet-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800">
                {badge}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2
                  id="reader-modal-title"
                  className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl md:text-4xl"
                >
                  {title}
                </h2>
                {headerExtra}
              </div>
              {subtitle ? (
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500 sm:text-base">{subtitle}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2.5 sm:items-end">
              <ReaderFontSizeControl
                fontSizePx={fontSizePx}
                onDecrease={decrease}
                onReset={reset}
                onIncrease={increase}
                canDecrease={canDecrease}
                canIncrease={canIncrease}
                isDefault={isDefault}
                compact
              />
              <button type="button" onClick={onClose} className="btn-soft !px-5 !py-3">
                <span aria-hidden>×</span>
                Kapat
              </button>
            </div>
          </div>
        </header>

        <div className={`${scrollClassName} min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-8 sm:py-7`}>
          <div className="mx-auto w-full max-w-[58rem]" style={{ fontSize: fontSizePx, lineHeight: READER_LINE_HEIGHT }}>
            {contentBlurred ? (
              <>
                <div
                  className="pointer-events-none select-none overflow-hidden"
                  style={{ filter: "blur(6px)", userSelect: "none" }}
                  aria-hidden="true"
                >
                  {body()}
                </div>
                {blurredNote ?? (
                  <p className="mt-6 text-center text-sm font-black text-amber-600">🔒 Bu içerik korumalıdır</p>
                )}
              </>
            ) : contentSurface ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-6 shadow-sm sm:px-9 sm:py-8">
                {body()}
              </div>
            ) : (
              body()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
