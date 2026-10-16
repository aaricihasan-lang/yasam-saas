// Astroloji Aşama 8 — rapor çarkı SVG → PNG (YALNIZ SUNUCU). Mevcut @resvg/resvg-js altyapısı
// (Refleksoloji atlas görseli ile aynı kütüphane). Sistem fontu YÜKLENMEZ: yalnız depo içindeki
// Geist TTF kullanılır → Vercel ve yerelde aynı çıktı. Font dosyası route'lar için
// next.config.ts outputFileTracingIncludes listesindedir.

import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { WheelInput } from "./model";
import { buildWheelSvg, WHEEL_FONT_STACK } from "./wheelSvg";
import { SYMBOL_FONT_FILES } from "./symbolFonts";

assertServerOnly("lib/astrology/report/chartPng");

export const REPORT_FONT_PATH = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");
/** Sembol yedek yazı tipleri (2026-10-14): çarkta gerçek astroloji glifleri. next.config outputFileTracingIncludes listesinde. */
export const SYMBOL_FONT_PATHS = [SYMBOL_FONT_FILES.A, SYMBOL_FONT_FILES.B].map((f) => path.join(process.cwd(), "public", "fonts", f));

/** Kare çark PNG'si (oran 1:1 korunur). Hata → null (rapor görselsiz devam eder). */
export function renderWheelPng(chart: WheelInput, widthPx = 1200): { png: Buffer; width: number; height: number } | null {
  try {
    const r = new Resvg(buildWheelSvg(chart, WHEEL_FONT_STACK), {
      background: "white",
      fitTo: { mode: "width", value: widthPx },
      font: { loadSystemFonts: false, fontFiles: [REPORT_FONT_PATH, ...SYMBOL_FONT_PATHS], defaultFontFamily: "Geist" },
    }).render();
    return { png: Buffer.from(r.asPng()), width: r.width, height: r.height };
  } catch {
    return null;
  }
}
