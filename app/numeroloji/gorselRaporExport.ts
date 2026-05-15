/**
 * Numeroloji Görsel Rapor PNG export yardımcısı.
 * PDF export bilinçli olarak kaldırıldı; ana çıktı yalnızca PNG.
 */

async function gorselRaporuHtml2Canvas(
  hedef: HTMLElement | null,
  scale: number,
): Promise<HTMLCanvasElement | null> {
  if (!hedef || typeof window === "undefined") return null;

  const { default: html2canvas } = await import("html2canvas");

  const sw = Math.max(1, Math.ceil(Math.max(hedef.scrollWidth, hedef.offsetWidth, hedef.clientWidth)));
  const shRaw = Math.max(hedef.scrollHeight, hedef.offsetHeight, hedef.clientHeight);
  const sh = Math.max(1, Math.ceil(shRaw + 16));

  const canvas = await html2canvas(hedef, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
    width: sw,
    height: sh,
    windowWidth: sw,
    windowHeight: sh,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    onclone: (_doc, cloned) => {
      if (!(cloned instanceof HTMLElement)) return;

      cloned.style.overflow = "visible";
      cloned.style.maxHeight = "none";
      cloned.style.height = "auto";

      const cw = Math.max(cloned.scrollWidth, cloned.offsetWidth, sw);
      const ch = Math.max(cloned.scrollHeight, cloned.offsetHeight, sh);

      cloned.style.width = `${cw}px`;
      cloned.style.minHeight = `${ch}px`;
    },
  });

  return canvas;
}

/** Yüksek çözünürlüklü tam rapor PNG’si. */
export async function gorselRaporuPngYakalaVeIndir(hedef: HTMLElement | null): Promise<void> {
  if (!hedef || typeof window === "undefined") return;

  let canvas: HTMLCanvasElement;

  try {
    console.log("PNG başladı");

    const canvasResult = await gorselRaporuHtml2Canvas(hedef, 4);

    console.log("Canvas:", canvasResult);

    if (!canvasResult) {
      throw new Error("Canvas oluşmadı");
    }

    console.log("Canvas size:", canvasResult.width, canvasResult.height);

    canvas = canvasResult;
  } catch (err) {
    console.error("PNG HATASI:", err);
    alert("PNG HATASI: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PNG oluşturulamadı."));
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "numeroloji-raporu.png";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/png",
      1,
    );
  });
}
