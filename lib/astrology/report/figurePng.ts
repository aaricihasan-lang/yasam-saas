// Astroloji raporu — Vedik (D1 / Varga) ve KP harita PNG'si (YALNIZ SUNUCU). Bkz. figures.ts.
//
// Kundli / Varga: uygulamada çizen Roxy web bileşeni (@roxyapi/ui 0.49.0, MIT) sunucuda Lit'in DOM shim'iyle yüklenir;
// bileşenin KENDİ render() şablonu dizgiye çevrilir → aynı geometri, aynı hücre yerleşimi, aynı etiketler (ekranla bire bir).
// Çizim çatısı: mevcut @resvg/resvg-js + depo içi Geist ve sembol yazı tipleri (batı çarkıyla aynı; sistem fontu yok).

import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { REPORT_FONT_PATH, SYMBOL_FONT_PATHS } from "./chartPng";
import { kpReportSvg, kundliReportSvg, litToString, type ReportFigure } from "./figures";
import { WHEEL_FONT_STACK } from "./wheelSvg";

assertServerOnly("lib/astrology/report/figurePng");

type RoxyChartEl = { lang: string; chartStyle: string; data: unknown; render: () => unknown };

async function roxyComponent(component: "kundli" | "divisional"): Promise<new () => RoxyChartEl> {
  const [mod] = await Promise.all([component === "divisional" ? import("@roxyapi/ui/components/divisional-chart") : import("@roxyapi/ui/components/vedic-kundli"), import("@roxyapi/ui/locales/tr")]);
  const El = (component === "divisional" ? (mod as Record<string, unknown>).RoxyDivisionalChart : (mod as Record<string, unknown>).RoxyVedicKundli) as (new () => RoxyChartEl) | undefined;
  if (typeof El !== "function") throw new Error("Roxy harita bileşeni yüklenemedi");
  return El;
}

/** Roxy bileşeninin KENDİ render() çıktısı (ekrandaki bileşenle aynı sınıf, aynı veri, lang="tr", aynı düzen). */
export async function kundliMarkup(fig: Extract<ReportFigure, { type: "kundli" }>): Promise<string> {
  const El = await roxyComponent(fig.component);
  const el = new El();
  el.lang = "tr";
  el.chartStyle = fig.style;
  el.data = fig.data;
  return litToString(el.render());
}

/** Figürün bağımsız SVG'si (testler ve PNG için). Hata → fırlatır (çağıran yakalar ve kaydeder). */
export async function renderFigureSvg(fig: ReportFigure): Promise<string> {
  if (fig.type === "kp") return kpReportSvg(fig, WHEEL_FONT_STACK);
  return kundliReportSvg(await kundliMarkup(fig), fig, WHEEL_FONT_STACK);
}

export type FigurePng = { png: Buffer; width: number; height: number };

/** Kare harita PNG'si (oran 1:1). Hata → { error } (rapor açık notla devam eder; asla başka haritayla değil). */
export async function renderFigurePng(fig: ReportFigure, widthPx = 1200): Promise<FigurePng | { error: string }> {
  try {
    const r = new Resvg(await renderFigureSvg(fig), {
      background: "white",
      fitTo: { mode: "width", value: widthPx },
      font: { loadSystemFonts: false, fontFiles: [REPORT_FONT_PATH, ...SYMBOL_FONT_PATHS], defaultFontFamily: "Geist" },
    }).render();
    return { png: Buffer.from(r.asPng()), width: r.width, height: r.height };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
