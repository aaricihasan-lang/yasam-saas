// İlişki / Grup rapor görselleri — sahne → SVG → PNG (YALNIZ SUNUCU; resvg). Ekrandaki çizimle AYNI sahne.
import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildCompositeModel } from "./compositeModel";
import { buildCompositeScene, sceneToSvg } from "./compositeScene";
import { COMPOSITE_VIEW } from "./compositeLayout";
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

/** Analiz görünümünden rapor görseli. Kaynak veri yoksa / tutarsızsa null (uydurma çizim yok). */
export function renderRelationImage(a: RelationAnalysisView, widthPx = 1100): RelationPng | null {
  if (a.kind === "connection") {
    const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, a.result as HdConnectionResult);
    if (!m.ok) return null;
    return render(sceneToSvg(buildCompositeScene(m.model), "Geist", COMPOSITE_VIEW), widthPx);
  }
  return render(sceneToSvg(buildPentaScene(a.result as HdPentaResult), "Geist", PENTA_VIEW), widthPx);
}
