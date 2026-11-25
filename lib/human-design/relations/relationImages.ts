// İlişki / Grup rapor görselleri — sahne → SVG → PNG (YALNIZ SUNUCU; resvg). Ekrandaki çizimle AYNI sahne.
// Connection: mühürlü V9 geometrili, silüetli birleşik BodyGraph (connectionBodygraphScene) — ekrandaki grafikle
// aynı ilkeller; kaynak kayıtlı sonuç (+ varsa kayıtlı bireysel kapılar).
import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildCompositeModel } from "./compositeModel";
import { buildCompositeScene, sceneToSvg } from "./compositeScene";
import { COMPOSITE_VIEW } from "./compositeLayout";
import { HD_CONNECTION_BODYGRAPH } from "../bodygraph/rendererConfig";
import { buildConnectionBodygraphScene, cbgStateFromModel, cbgStateFromResult, connectionBodygraphSvg } from "./connectionBodygraphScene";
import { buildPentaScene, PENTA_VIEW } from "./pentaScene";
import type { HdConnectionResult } from "./connection";
import type { HdPentaResult } from "./penta";
import type { RelationAnalysisView } from "./relationService";
import type { CbgPrim } from "./connectionBodygraphScene";
import type { PentaSceneLabels } from "./pentaScene";
import { getOutputTranslator, type OutputLocale } from "@/lib/i18n/output";

assertServerOnly("lib/human-design/relations/relationImages");

const FONT = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");

export type RelationPng = { png: Buffer; width: number; height: number };

function render(svg: string, widthPx: number): RelationPng | null {
  try {
    const r = new Resvg(svg, { background: "white", fitTo: { mode: "width", value: widthPx }, font: { loadSystemFonts: false, fontFiles: [FONT], defaultFontFamily: "Geist" } }).render();
    return { png: Buffer.from(r.asPng()), width: r.width, height: r.height };
  } catch {
    return null;
  }
}

// ─── Çıktı dili (I18N-F1-R5 HD-B, P34) ─────────────────────────────────────────────────────────────────
// output yok / tr → sahne AYNEN (TR PNG bayt-eşit; golden). Diğer dillerde yalnız GÖRÜNEN metin primitifleri değişir:
// Connection BodyGraph merkez başlıkları `hd.chart.svgCenter` (ekrandaki useLocalizedCenterText ile aynı eşleme; satır
// sayısı korunur → yerleşim aynı), Penta bant / kanal adı / sonekler `reports.hdRelations.scene` + `hd.terms`.
// Geometri, renk, kapı numarası, kanal / kapı kümesi DEĞİŞMEZ.
const CENTER_TEXT_KEY: Readonly<Record<string, string>> = {
  "BAŞ": "head", AJNA: "ajna", "BOĞAZ": "throat", G: "g", KALP: "heart", SAKRAL: "sacral", "KÖK": "root", DALAK: "spleen", SOLAR: "solar", PLEKSUS: "plexus", // i18n-ignore: geometrideki kanonik TR merkez satırı (eşleme anahtarı, görünen metin değil)
};
const isSource = (o: OutputLocale | null | undefined) => !o || o.locale === "tr";
type Tr = ((k: string, v?: Record<string, string | number>) => string) & { has: (k: string) => boolean };

function localizeCbg(prims: CbgPrim[], o: OutputLocale | null | undefined): CbgPrim[] {
  if (isSource(o)) return prims;
  const t = getOutputTranslator(o!, "hd.chart.svgCenter") as unknown as Tr;
  return prims.map((p) => (p.k === "text" && p.role === "center" && CENTER_TEXT_KEY[p.text] ? { ...p, text: t(CENTER_TEXT_KEY[p.text]!) } : p));
}

function pentaLabels(o: OutputLocale | null | undefined): PentaSceneLabels | undefined {
  if (isSource(o)) return undefined;
  const t = getOutputTranslator(o!, "reports.hdRelations.scene") as unknown as Tr;
  const terms = getOutputTranslator(o!, "hd.terms") as unknown as Tr;
  const band = { Throat: t("bandThroat"), G: t("bandG"), Sacral: t("bandSacral") } as const;
  return {
    band: (k) => band[k],
    channelName: (id, fallback) => {
      const l = terms.has(`channel.${id}`) ? terms(`channel.${id}`) : id;
      const name = l.replace(/^\s*\d+-\d+\s*/, "").replace(/^Channel of\s+/i, "").trim();
      return name && name !== id ? name : fallback;
    },
    coreSuffix: t("coreSuffix"),
    gapSuffix: t("gapSuffix"),
    gapWord: t("gapWord"),
  };
}

/** Rapor görselinin SVG'si (PNG'ye çevrilmeden; dil denetimi / test için). */
export function renderRelationImageSvg(a: RelationAnalysisView, logo: Buffer | null = null, output?: OutputLocale | null): string | null {
  if (a.kind === "connection") {
    const r = a.result as HdConnectionResult;
    const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r);
    // PASİF eski Word görseli (rendererConfig): ilk Yaşam Sistemi şematik çizimi (kaynak bireysel veri gerekir). Dil eşlemesi YOK (pasif).
    if (HD_CONNECTION_BODYGRAPH !== "premium") return m.ok ? sceneToSvg(buildCompositeScene(m.model), "Geist", COMPOSITE_VIEW) : null;
    // AKTİF: premium BodyGraph.
    const state = m.ok ? cbgStateFromModel(m.model) : cbgStateFromResult(r);
    const logoHref = logo ? `data:image/png;base64,${logo.toString("base64")}` : null;
    return connectionBodygraphSvg(localizeCbg(buildConnectionBodygraphScene(state), output), { logoHref, fontFamily: "Geist" });
  }
  const labels = pentaLabels(output);
  return sceneToSvg(labels ? buildPentaScene(a.result as HdPentaResult, labels) : buildPentaScene(a.result as HdPentaResult), "Geist", PENTA_VIEW);
}

/**
 * Analiz görünümünden rapor görseli. Connection: kayıtlı bireysel kapılar sonuçla birebir doğrulanırsa tam çizim
 * (yarım kanallar dahil); değilse yalnız kayıtlı sonuçtaki tanımlı kanallar. Logo verilirse grafiğe gömülür.
 * `output` yok / tr → bugünkü PNG bayt-eşit.
 */
export function renderRelationImage(a: RelationAnalysisView, widthPx = 1100, logo: Buffer | null = null, output?: OutputLocale | null): RelationPng | null {
  const svg = renderRelationImageSvg(a, logo, output);
  return svg ? render(svg, widthPx) : null;
}
