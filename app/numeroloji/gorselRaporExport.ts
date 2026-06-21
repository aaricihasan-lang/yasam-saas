/**
 * Numeroloji Görsel Rapor PNG export yardımcısı.
 * PDF export bilinçli olarak kaldırıldı; ana çıktı yalnızca PNG.
 */

const PNG_EXPORT_STYLE_ID = "numeroloji-png-export-styles";

/** PNG sırasında blur / blend / ağır gölge sadeleştirmesi (ekranda görünmez). */
function injectPngExportStyles(): void {
  if (document.getElementById(PNG_EXPORT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PNG_EXPORT_STYLE_ID;
  style.textContent = `
    .png-export-mode,
    .png-export-mode * {
      transform: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      mix-blend-mode: normal !important;
      -webkit-font-smoothing: antialiased !important;
      text-rendering: geometricPrecision !important;
    }
    .png-export-mode [class*="blur"],
    .png-export-mode [class*="backdrop-blur"],
    .png-export-mode [class*="mix-blend"] {
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      mix-blend-mode: normal !important;
    }
    .png-export-mode * {
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removePngExportStyles(): void {
  document.getElementById(PNG_EXPORT_STYLE_ID)?.remove();
}

/** Mobil/büyük canvas için güvenli piksel oranı hesaplar (max ~12MP). */
function safePixelRatio(width: number, height: number): number {
  const MAX_PIXELS = 12_000_000;
  if (width * height * 9 <= MAX_PIXELS) return 3;
  if (width * height * 4 <= MAX_PIXELS) return 2;
  return 1;
}

/** Yüksek çözünürlüklü tam rapor PNG'si. Başarısızlıkta Error fırlatır. */
export async function gorselRaporuPngYakalaVeIndir(hedef: HTMLElement | null): Promise<void> {
  if (!hedef || typeof window === "undefined") return;

  const { toPng } = await import("html-to-image");

  injectPngExportStyles();
  hedef.classList.add("png-export-mode");

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rect = hedef.getBoundingClientRect();
    const exportWidth = Math.max(hedef.offsetWidth, hedef.scrollWidth, Math.ceil(rect.width));
    const exportHeight = Math.max(hedef.offsetHeight, hedef.scrollHeight, Math.ceil(rect.height));

    if (!exportWidth || !exportHeight || exportWidth < 50 || exportHeight < 50) {
      throw new Error("Rapor alanı henüz oluşmadı. Lütfen görsel raporu tam yüklenince tekrar deneyin.");
    }

    const pixelRatio = safePixelRatio(exportWidth, exportHeight);

    const dataUrl = await toPng(hedef, {
      cacheBust: true,
      skipFonts: false,
      pixelRatio,
      backgroundColor: "#12051f",
      width: exportWidth,
      height: exportHeight,
      style: {
        transform: "none",
        filter: "none",
        backdropFilter: "none",
        webkitBackdropFilter: "none",
      } as Partial<CSSStyleDeclaration>,
      filter: (node) => {
        if (node instanceof HTMLCanvasElement && (node.width === 0 || node.height === 0)) {
          return false;
        }
        return true;
      },
    });

    if (!dataUrl || dataUrl === "data:,") {
      throw new Error("PNG oluşturulamadı. Tarayıcınız canvas boyutunu desteklemeyebilir.");
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "numeroloji-raporu.png";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    hedef.classList.remove("png-export-mode");
    removePngExportStyles();
  }
}
