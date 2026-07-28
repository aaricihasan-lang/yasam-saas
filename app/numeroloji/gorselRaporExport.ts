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

/** İki requestAnimationFrame bekler (layout + paint tamamlansın). */
function twoRaf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * PNG dataURL'yi çözüp örnek pikselleri kontrol eder: tek renk / siyaha yakın / boş görüntüleri reddeder.
 * Ortalama parlaklık ~0 veya benzersiz renk sayısı çok düşükse geçersiz sayar.
 */
async function pngGorunurMu(dataUrl: string): Promise<boolean> {
  try {
    const img = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    img.src = dataUrl;
    if (!(await loaded)) return false;
    if (!img.width || !img.height) return false;

    const SAMPLE = 64;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true; // ölçemiyorsak engelleme
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

    let sum = 0;
    const colors = new Set<number>();
    const n = SAMPLE * SAMPLE;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      sum += (r + g + b) / 3;
      colors.add((r >> 4 << 8) | (g >> 4 << 4) | (b >> 4));
    }
    const avgBrightness = sum / n;
    // Ortalama parlaklık çok düşük (siyah) VEYA renk çeşitliliği çok az → geçersiz.
    if (avgBrightness < 8) return false;
    if (colors.size < 6) return false;
    return true;
  } catch {
    return true; // doğrulanamıyorsa akışı engelleme
  }
}

/** Hedef elemandan yüksek çözünürlüklü PNG dataURL üretir (indirmez). Başarısızlıkta Error. */
export async function gorselRaporuPngYakala(hedef: HTMLElement | null): Promise<string> {
  if (!hedef || typeof window === "undefined") {
    throw new Error("Görsel rapor alanı bulunamadı.");
  }

  const { toPng } = await import("html-to-image");

  injectPngExportStyles();
  hedef.classList.add("png-export-mode");

  try {
    // Fontlar + layout/paint tamamlansın (siyah/boş yakalama hatasını önler).
    try { await document.fonts?.ready; } catch { /* fonts API yoksa geç */ }
    await twoRaf();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await twoRaf();

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
    if (!(await pngGorunurMu(dataUrl))) {
      throw new Error("Görsel rapor boş/siyah üretildi. Görsel Rapor sekmesini açıp tam yüklenince tekrar deneyin.");
    }
    return dataUrl;
  } finally {
    hedef.classList.remove("png-export-mode");
    removePngExportStyles();
  }
}

/** Yüksek çözünürlüklü tam rapor PNG'si — dosyaya indirir. Başarısızlıkta Error fırlatır. */
export async function gorselRaporuPngYakalaVeIndir(hedef: HTMLElement | null): Promise<void> {
  if (!hedef || typeof window === "undefined") return;
  const dataUrl = await gorselRaporuPngYakala(hedef);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "numeroloji-raporu.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
