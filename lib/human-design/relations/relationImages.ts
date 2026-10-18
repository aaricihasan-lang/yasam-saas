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

/**
 * Analiz görünümünden rapor görseli. Connection: kayıtlı bireysel kapılar sonuçla birebir doğrulanırsa tam çizim
 * (yarım kanallar dahil); değilse yalnız kayıtlı sonuçtaki tanımlı kanallar. Logo verilirse grafiğe gömülür.
 */
export function renderRelationImage(a: RelationAnalysisView, widthPx = 1100, logo: Buffer | null = null): RelationPng | null {
  if (a.kind === "connection") {
    const r = a.result as HdConnectionResult;
    const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r);
    // PASİF eski Word görseli (rendererConfig): ilk Yaşam Sistemi şematik çizimi (kaynak bireysel veri gerekir).
    if (HD_CONNECTION_BODYGRAPH !== "premium") return m.ok ? render(sceneToSvg(buildCompositeScene(m.model), "Geist", COMPOSITE_VIEW), widthPx) : null;
    // AKTİF: premium BodyGraph.
    const state = m.ok ? cbgStateFromModel(m.model) : cbgStateFromResult(r);
    const logoHref = logo ? `data:image/png;base64,${logo.toString("base64")}` : null;
    return render(connectionBodygraphSvg(buildConnectionBodygraphScene(state), { logoHref, fontFamily: "Geist" }), widthPx);
  }
  return render(sceneToSvg(buildPentaScene(a.result as HdPentaResult), "Geist", PENTA_VIEW), widthPx);
}
