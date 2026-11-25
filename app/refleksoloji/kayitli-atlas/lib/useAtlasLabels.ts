"use client";

import { useTranslations } from "next-intl";
import type { FootSide, FootView, Region } from "@/app/refleksoloji/bolge-haritasi/types";
import type { OrganSummary } from "./organSummary";

/**
 * I18N — Kayıtlı Atlas GÖSTERİM etiketleri (organSummary.ts'deki Türkçe yardımcıların dile göre karşılığı).
 * TR metinleri organSummary.ts ile BİREBİR (reflexology.savedAtlas.labels). Kanonik veri (view/footSide/shape
 * kimlikleri, organ adı) DEĞİŞMEZ; organ adı kullanıcı içeriğidir ve çevrilmez.
 */
export function useAtlasLabels() {
  const t = useTranslations("reflexology.savedAtlas.labels");
  const isHand = (view?: FootView) => view === "el_avuc" || view === "el_sirt";
  const pair = (left: boolean, right: boolean, both: string, l: string, r: string) =>
    left && right ? t(both) : left ? t(l) : right ? t(r) : null;
  const fmt = (v: number | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(3));

  return {
    footLabel: (s: OrganSummary) => pair(s.hasLeft, s.hasRight, "bothFeet", "leftFoot", "rightFoot") ?? "—",
    handLabel: (s: OrganSummary) =>
      s.handLabel === null ? null : pair(!!s.hasHandLeft, !!s.hasHandRight, "bothHands", "leftHand", "rightHand"),
    viewLabel: (s: OrganSummary) => {
      const parts: string[] = [];
      if (s.hasTaban) parts.push(t("viewTaban"));
      if (s.hasYan) parts.push(t("viewYan"));
      if (s.handLabel !== null) parts.push(t("viewEl"));
      return parts.length ? parts.join(" · ") : "—";
    },
    sideLabel: (side: FootSide, view?: FootView) =>
      isHand(view) ? t(side === "left" ? "leftHand" : "rightHand") : t(side === "left" ? "leftFoot" : "rightFoot"),
    regionViewLabel: (view: FootView) =>
      view === "el_avuc"
        ? t("handPalm")
        : view === "el_sirt"
          ? t("handBack")
          : view === "taban"
            ? t("viewTaban")
            : t("viewYan"),
    shapeLabel: (shape: Region["shape"]) => (t.has(`shapes.${shape}`) ? t(`shapes.${shape}`) : shape),
    coordSummary: (region: Region) => {
      if (region.shape === "thick_line") {
        return t("coordLine", { x1: fmt(region.x1), y1: fmt(region.y1), x2: fmt(region.x2), y2: fmt(region.y2) });
      }
      if (region.shape === "free_draw" && region.points?.length) {
        return t("coordFree", { count: String(region.points.length), x: fmt(region.points[0]?.x), y: fmt(region.points[0]?.y) });
      }
      if (region.cx != null && region.cy != null) {
        return t("coordCenter", { cx: fmt(region.cx), cy: fmt(region.cy), rx: fmt(region.rx), ry: fmt(region.ry) });
      }
      return t("coordNone");
    },
  };
}
