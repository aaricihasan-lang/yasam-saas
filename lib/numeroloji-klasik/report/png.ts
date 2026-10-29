/**
 * Klasik Numeroloji — görsel (PNG) rapor üretimi (YALNIZ SUNUCU; YALNIZ KAYITLI VERİ; 0 sağlayıcı çağrısı).
 *
 * SVG `pngSvg.ts`'te kurulur; burada @resvg/resvg-js ile 2× ölçekte (2400 px genişlik) PNG'ye çevrilir.
 * Sistem fontu YÜKLENMEZ: yalnız depo içindeki Geist TTF (Astroloji raporuyla aynı dosya) → yerel ve Vercel'de
 * aynı çıktı. Font dosyası next.config.ts outputFileTracingIncludes listesine bu route için eklidir.
 */
import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildClassicPngSvg, PNG_FONT_FAMILY, PNG_REPORT_WIDTH, type PngReportOptions } from "./pngSvg";
import type { ClassicReportRecord } from "./types";

assertServerOnly("lib/numeroloji-klasik/report/png");

export const CLASSIC_PNG_FONT_PATH = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");
/** Çıktı ölçeği: 1200 px tasarım → 2400 px PNG (yüksek çözünürlük; baskı ve retina ekran). */
export const CLASSIC_PNG_SCALE = 2;

export type ClassicPngOutcome =
  | { ok: true; png: Buffer; width: number; height: number; sections: string[] }
  | { ok: false; reason: "not_person" | "no_data" | "render_failed" };

export function renderClassicPng(record: ClassicReportRecord, opts: PngReportOptions, fontPath: string = CLASSIC_PNG_FONT_PATH): ClassicPngOutcome {
  if (record.kind !== "person") return { ok: false, reason: "not_person" };
  const built = buildClassicPngSvg(record, opts);
  if (!built) return { ok: false, reason: "no_data" };
  try {
    const r = new Resvg(built.svg, {
      background: "white",
      fitTo: { mode: "width", value: PNG_REPORT_WIDTH * CLASSIC_PNG_SCALE },
      font: { loadSystemFonts: false, fontFiles: [fontPath], defaultFontFamily: PNG_FONT_FAMILY },
    }).render();
    return { ok: true, png: Buffer.from(r.asPng()), width: r.width, height: r.height, sections: built.sections };
  } catch {
    return { ok: false, reason: "render_failed" };
  }
}
