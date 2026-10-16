// Astroloji — Vedik kundli/varga haritası VERİ ve YERELLEŞTİRME yardımcıları (SAF; istemci + sunucu ortak).
//
// 2026-10-15: VedicPanels.tsx ("use client") içinden taşındı → Word/PDF raporu (sunucu) ekrandaki haritayla
// BİREBİR aynı veri sözleşmesini ve aynı Türkçeleştirmeyi kullanır (ikinci veri/etiket yolu yok). Davranış değişmedi.

import type { NakshatraPlacement, VedicD1Technical, VedicGraha, VedicGrahaId, VedicVargaTechnical } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import { CROWDED_AT, GRAHA_TR, LIB_GRAHA_NAME, grahaTrName, localizeGrahaLabel, localizeSignLabel } from "./kundliLocalize";

export const TITLE = (s: string) => s[0].toUpperCase() + s.slice(1);
export const ROXY_NAME: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };
export const nakName = (id: string) => NAKSHATRA_LABELS[id] ?? id;

/**
 * Kanonik D1 teknik verisi → `<roxy-vedic-kundli>` veri sözleşmesi (yalnız TEKNİK alanlar). SAF; test edilir.
 * Bileşen `meta` (graha → rashi, longitude, nakshatra, isRetrograde, awastha, deeptadi), `combustion`,
 * `planetaryWar`, `frame` okur.
 */
export function toKundliData(t: VedicD1Technical) {
  const point = (g: Pick<VedicGraha, "rashi" | "longitude" | "nakshatra">, name: string) => ({
    graha: name,
    rashi: TITLE(g.rashi),
    longitude: g.longitude,
    nakshatra: { name: nakName(g.nakshatra.id), pada: g.nakshatra.pada, lord: ROXY_NAME[g.nakshatra.lord] },
  });
  const meta: Record<string, unknown> = {};
  for (const g of t.grahas) {
    meta[ROXY_NAME[g.id]] = {
      ...point(g, ROXY_NAME[g.id]),
      isRetrograde: g.retrograde,
      house: g.house,
      ...(g.avastha.baladi ? { awastha: TITLE(g.avastha.baladi) } : {}),
      ...(g.avastha.deeptadi ? { deeptadi: TITLE(g.avastha.deeptadi) } : {}),
    };
  }
  meta.Lagna = { ...point(t.lagna, "Lagna"), isRetrograde: false, house: 1 };
  return {
    frame: { ayanamsa: t.frame.ayanamsa, ayanamsaDegrees: t.frame.ayanamsaDegrees },
    meta,
    combustion: t.combustion.map((c) => ({ planet: ROXY_NAME[c.id] })),
    planetaryWar: t.planetaryWar.map((w) => ({ planet1: ROXY_NAME[w.a], planet2: ROXY_NAME[w.b], ...(w.winner ? { winner: ROXY_NAME[w.winner] } : {}) })),
  };
}

/**
 * Kanonik varga teknik verisi → `<roxy-divisional-chart>` sözleşmesi (yalnız TEKNİK alanlar; division.significance
 * ANLATIDIR → verilmez). SAF; test edilir. Bileşen `chart.meta`, `division`, `frame`, `vargottama` okur.
 */
export function toVargaChartData(t: VedicVargaTechnical) {
  const meta: Record<string, unknown> = {};
  const point = (g: VedicVargaTechnical["lagna"] | VedicVargaTechnical["grahas"][number], name: string, retro: boolean) => ({
    graha: name,
    rashi: TITLE(g.rashi),
    longitude: g.longitude,
    nakshatra: { name: nakName(g.nakshatra.id), pada: g.nakshatra.pada, lord: ROXY_NAME[g.nakshatra.lord] },
    isRetrograde: retro,
    house: g.house,
  });
  for (const g of t.grahas) meta[ROXY_NAME[g.id]] = point(g, ROXY_NAME[g.id], g.retrograde);
  meta.Lagna = point(t.lagna, "Lagna", false);
  return {
    division: { number: t.division.number, name: t.division.name, sanskritName: t.division.sanskritName, degreesPerDivision: t.division.degreesPerDivision },
    frame: { ayanamsa: t.frame.ayanamsa, ayanamsaDegrees: t.frame.ayanamsaDegrees },
    chart: { meta },
    vargottama: t.vargottama.map((v) => ROXY_NAME[v]),
  };
}

export type ChartStyle = "north" | "south" | "east";

/** 5.1D: haritadaki graha ipucu (SVG title) — Türkçe tam ad / Sanskritçe + konum. Anahtar = kütüphanenin İngilizce adı. */
export function kundliTitles(points: { id: VedicGrahaId; rashi: (typeof SIGN_IDS)[number]; longitude: number; nakshatra: NakshatraPlacement; retrograde: boolean; d1Rashi?: (typeof SIGN_IDS)[number] }[], division?: number, combust: VedicGrahaId[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of points) {
    const d1 = p.d1Rashi ?? SIGN_IDS[Math.floor(p.longitude / 30)];
    const pos = division ? `D${division} ${SIGN_LABELS[p.rashi]} · D1 ${SIGN_LABELS[d1]} ${formatDegree(p.longitude % 30)}` : `${SIGN_LABELS[p.rashi]} ${formatDegree(p.longitude % 30)}`;
    out[ROXY_NAME[p.id]] = [grahaTrName(p.id), pos, `${nakName(p.nakshatra.id)} ${p.nakshatra.pada}. pada`, `nakshatra yöneticisi ${GRAHA_TR[p.nakshatra.lord].tr}`, p.retrograde ? "vakri (retro)" : "", combust.includes(p.id) ? "yanık (asta)" : ""].filter(Boolean).join(" · ");
  }
  return out;
}

/**
 * 5.1C/5.1D: kütüphane kısaltmalarını Türkçeleştirir, kalabalık hücrede (≥3 graha) dereceyi düşürüp yazıyı küçültür
 * (Doğu düzeninde burç etiketinden uzaklaştırır). YALNIZ Lit'in metin düğümlerinin `data`'sı ve öğe `style`'ı değişir
 * (Lit işaretçileri korunur); geometri/yerleşim kütüphanenindir. İdempotent → MutationObserver döngüye girmez.
 */
export function localizeKundliDom(root: ParentNode, titles: Record<string, string>, style: ChartStyle) {
  // Güney düzeninin dikdörtgen hücreleri 4 satırı dereceyle taşır; Kuzey/Doğu üçgenleri 3 grahada sıkışır.
  const crowdedAt = style === "south" ? CROWDED_AT + 2 : CROWDED_AT;
  const textOf = (el: Element) => [...el.childNodes].find((n): n is Text => n.nodeType === 3 && (n as Text).data.trim() !== "");
  const set = (n: Text | undefined, v: string) => {
    if (n && n.data !== v) n.data = v;
  };
  for (const cell of root.querySelectorAll("g.cell")) {
    const ps = [...cell.querySelectorAll("text.planet-text")] as SVGTextElement[];
    const crowded = ps.length >= crowdedAt;
    for (const p of ps) {
      const title = p.querySelector("title");
      const tn = title ? textOf(title) : undefined;
      const first = tn?.data.split(" · ")[0] ?? "";
      if (tn && LIB_GRAHA_NAME[first] && titles[first]) set(tn, titles[first]);
      const label = textOf(p);
      if (label) set(label, localizeGrahaLabel(label.data, crowded));
      const fs = crowded ? "11px" : "";
      if (p.style.fontSize !== fs) p.style.fontSize = fs;
    }
    // Yığın, hücrenin burç/rashi/ev/Lagna etiketinin üstüne binmesin: gerçek SVG ölçümü (getBBox; CSS transform'u
    // içermez → idempotent). Ölçüm yoksa (test/eski tarayıcı) kalabalık hücrede sabit 3px.
    const labels = [...cell.querySelectorAll("text.sign-text, text.rashi-num, text.house-num, text.lagna-marker")] as SVGTextElement[];
    let shift = crowded ? 3 : 0;
    if (ps.length > 0 && labels.length > 0 && typeof ps[0].getBBox === "function") {
      const bottom = Math.max(...labels.map((l) => l.getBBox().y + l.getBBox().height));
      const top = Math.min(...ps.map((p) => p.getBBox().y));
      shift = Math.max(0, Math.ceil(bottom + 1 - top));
    }
    for (const p of ps) {
      const tr = shift > 0 ? `translateY(${shift}px)` : "";
      if (p.style.transform !== tr) p.style.transform = tr;
    }
  }
  for (const s of root.querySelectorAll("text.sign-text, text.rashi-num")) {
    const n = textOf(s);
    if (n) set(n, localizeSignLabel(n.data));
  }
  for (const s of root.querySelectorAll("text.lagna-marker")) {
    set(textOf(s), "Lagna");
    // "LAGNA" (büyük harf + aralık) Güney düzeninde Lagna çizgisine değer → normal yazım, aralıksız.
    const el = s as SVGTextElement;
    if (el.style.textTransform !== "none") el.style.textTransform = "none";
    if (el.style.letterSpacing !== "0px") el.style.letterSpacing = "0px";
  }
}
