"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/app/refleksoloji/components/useModalA11y";
import { useIsAndroid } from "@/hooks/useIsAndroid";

type PdfPreviewModalProps = {
  src: string;
  title: string;
  onClose: () => void;
};

export function PdfPreviewModal({ src, title, onClose }: PdfPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  // Android (uygulama WebView + Chrome) <iframe> içinde PDF gösteremez (boş/gri alan) ve data:
  // adresini yeni sekmede açamaz → önizleme yerine "İndir" sunulur; dosya cihazın PDF
  // görüntüleyicisiyle açılır. Diğer ortamlarda davranış aynen korunur.
  const isAndroid = useIsAndroid();
  const downloadName = /\.pdf$/i.test(title) ? title : `${title || "belge"}.pdf`;

  useEffect(() => {
    setMounted(true);
  }, []);

  // REF-012: bu modal render edildiğinde daima açıktır → open: true.
  const panelRef = useModalA11y<HTMLDivElement>({ open: true, onClose });

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="pdf-preview-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex h-[min(92vh,900px)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="pdf-preview-title" className="truncate text-lg font-black text-slate-900">
            {title}
          </h2>
          <div className="flex gap-2">
            {isAndroid ? (
              <a
                href={src}
                download={downloadName}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-100"
              >
                İndir
              </a>
            ) : (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-100"
              >
                Yeni Sekmede Aç
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            >
              Kapat
            </button>
          </div>
        </header>
        {isAndroid ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
            <p className="text-4xl" aria-hidden>📄</p>
            <p className="max-w-sm text-sm font-semibold text-slate-600">
              Bu cihaz PDF önizlemesini sayfa içinde gösteremiyor. Dosyayı indirip cihazınızın PDF
              görüntüleyicisiyle açabilirsiniz.
            </p>
            <a
              href={src}
              download={downloadName}
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
            >
              PDF dosyasını indir
            </a>
          </div>
        ) : (
          <iframe title={title} src={src} className="min-h-0 flex-1 w-full bg-slate-100" />
        )}
      </div>
    </div>,
    document.body,
  );
}
