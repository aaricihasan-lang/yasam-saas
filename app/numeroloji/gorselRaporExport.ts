/**
 * Numeroloji Görsel Rapor PNG export yardımcısı.
 * PDF export bilinçli olarak kaldırıldı; ana çıktı yalnızca PNG.
 */

/** Yüksek çözünürlüklü tam rapor PNG'si. */
export async function gorselRaporuPngYakalaVeIndir(hedef: HTMLElement | null): Promise<void> {
  if (!hedef || typeof window === "undefined") return;

  const { toPng } = await import("html-to-image");

  await new Promise((resolve) => setTimeout(resolve, 500));

  const rect = hedef.getBoundingClientRect();

  if (!rect.width || !rect.height || rect.width < 50 || rect.height < 50) {
    throw new Error("Rapor alanı henüz oluşmadı.");
  }

  const dataUrl = await toPng(hedef, {
    cacheBust: true,
    pixelRatio: 3,
    backgroundColor: "transparent",
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "numeroloji-raporu.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
