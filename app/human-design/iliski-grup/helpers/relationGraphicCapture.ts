"use client";

// Connection raporu — Roxy birleşik BodyGraph'ının PNG'si (YALNIZ TARAYICI). Bireysel BodyGraph Word akışıyla
// aynı yöntem (lib/human-design/reporting/bodygraphCapture): ekran dışı ama görünür kapta KAYITLI sonuçla
// çizilir → çizim kayıtlı sonuçla doğrulanır → hesaplanmış stiller satır içine yazılır → PNG.
// PNG'ye analiz kimliği + sonuç parmak izi `tEXt` olarak gömülür; sunucu birebir eşleşme ister.
// Roxy çağrısı YOK (bileşen kontrollü modda); ağ isteği yok.

import type { HdConnectionResult } from "@/lib/human-design/relations/connection";
import {
  connectionFingerprint,
  HD_RELATION_BIND_KEYWORD,
  relationBindingText,
  ROXY_CONNECTION_TAG,
  toRoxyConnectionData,
} from "@/lib/human-design/relations/roxyConnectionChart";
import { insertPngTextChunk } from "@/lib/human-design/reporting/bodygraphBinding";
import { bytesToPngDataUrl, inlineComputedStyles, nextFrame, rasterize } from "@/lib/human-design/reporting/bodygraphCapture";
import { loadRoxyConnection, prepareRoxyConnection } from "../components/RoxyConnectionChart";

const TARGET_HEIGHTS = [1800, 1500, 1200] as const;
export const RELATION_GRAPHIC_MAX_BYTES = 1_000_000;
const RENDER_TIMEOUT_MS = 8000;

export type RelationGraphicCapture = { ok: true; dataUrl: string; bytes: number } | { ok: false; error: string };

export async function captureConnectionGraphic(analysisId: string, r: HdConnectionResult, nameA: string, nameB: string): Promise<RelationGraphicCapture> {
  if (typeof window === "undefined" || typeof document === "undefined") return { ok: false, error: "Tarayıcı ortamı gerekli." };
  try {
    await loadRoxyConnection();
  } catch {
    return { ok: false, error: "BodyGraph çizim bileşeni yüklenemedi." };
  }
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-hd-relation-capture", "");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:864px;pointer-events:none;";
  const el = document.createElement(ROXY_CONNECTION_TAG) as HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };
  el.setAttribute("hide-readings", "");
  el.setAttribute("lang", "tr");
  host.appendChild(el);
  document.body.appendChild(host);
  try {
    el.data = toRoxyConnectionData(r);
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    let svg: SVGSVGElement | null = null;
    while (Date.now() < deadline) {
      if (el.updateComplete) await el.updateComplete.catch(() => undefined);
      await nextFrame();
      svg = (el.shadowRoot?.querySelector("svg.chart") as SVGSVGElement | null) ?? null;
      if (svg && svg.querySelector(".bg-center")) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    if (!svg) return { ok: false, error: "Birleşik BodyGraph çizilemedi." };
    if (!prepareRoxyConnection(el, r, nameA, nameB)) return { ok: false, error: "Birleşik BodyGraph çizimi kayıtlı sonuçla doğrulanamadı." };
    const vb = svg.viewBox?.baseVal;
    if (!vb || !(vb.width > 0) || !(vb.height > 0)) return { ok: false, error: "BodyGraph ölçüsü okunamadı." };
    const clone = svg.cloneNode(true) as SVGSVGElement;
    inlineComputedStyles(svg, clone);
    clone.querySelectorAll("title,desc").forEach((n) => n.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-label");
    const markup = new XMLSerializer().serializeToString(clone);
    const binding = relationBindingText(analysisId, connectionFingerprint(r));
    for (const h of TARGET_HEIGHTS) {
      const out = await rasterize(markup, vb.width, vb.height, h);
      if (!out) continue;
      const bound = insertPngTextChunk(new Uint8Array(await out.blob.arrayBuffer()), HD_RELATION_BIND_KEYWORD, binding);
      if (bound.length > RELATION_GRAPHIC_MAX_BYTES) continue;
      return { ok: true, dataUrl: bytesToPngDataUrl(bound), bytes: bound.length };
    }
    return { ok: false, error: "Birleşik BodyGraph görseli üretilemedi." };
  } catch {
    return { ok: false, error: "Birleşik BodyGraph görseli üretilemedi." };
  } finally {
    host.remove();
  }
}
