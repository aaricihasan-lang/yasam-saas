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

/** Yüksek çözünürlüklü tam rapor PNG'si. */
export async function gorselRaporuPngYakalaVeIndir(hedef: HTMLElement | null): Promise<void> {
  if (!hedef || typeof window === "undefined") return;

  const { toPng } = await import("html-to-image");

  injectPngExportStyles();
  hedef.classList.add("png-export-mode");

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rect = hedef.getBoundingClientRect();

    if (!rect.width || !rect.height || rect.width < 50 || rect.height < 50) {
      throw new Error("Rapor alanı henüz oluşmadı.");
    }

    const dataUrl = await toPng(hedef, {
      cacheBust: true,
      skipFonts: false,
      pixelRatio: 2,
      backgroundColor: "#12051f",
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
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
