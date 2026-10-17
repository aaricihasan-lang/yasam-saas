// Connection — Roxy'nin resmî, silüetli birleşik BodyGraph bileşeni (<roxy-hd-connection>, @roxyapi/ui 0.49.0,
// MIT) için SAF yardımcılar. Bileşen kendi origin'imizden (public/vendor/roxy-ui/0.49.0) yüklenir ve
// KONTROLLÜ modda çalışır: veri `data` property'si ile verilir, bileşen istek ATMAZ, anahtar tarayıcıda YOK.
//
// Veri kaynağı YALNIZ kayıtlı + doğrulanmış Connection sonucu (normalize). Roxy'nin çizdiği tek şey bu
// sonuçtaki kanallar (kişi kapıları) ve birleşik merkezlerdir; çizim sonrası işaretli kapılar beklenen
// kümeyle karşılaştırılır (connectionDrawingMatches) — uyuşmazsa ekran güvenli yedeğe düşer.
//
// Bu dosya istemci + sunucu güvenlidir (DOM erişimi yalnız parametre olarak verilen kök üzerinden).

import type { HdCenterCode } from "../types";
import type { HdConnectionResult } from "./connection";

export const ROXY_UI_CONNECTION_VERSION = "0.49.0";
export const ROXY_CONNECTION_SCRIPT = `/vendor/roxy-ui/${ROXY_UI_CONNECTION_VERSION}/hd-connection.js`;
export const ROXY_CONNECTION_TAG = "roxy-hd-connection";

const ROXY_CENTER_ID: Readonly<Record<HdCenterCode, string>> = {
  head: "head",
  ajna: "ajna",
  throat: "throat",
  g_identity: "g",
  heart_ego: "heart",
  sacral: "sacral",
  solar_plexus: "solar-plexus",
  spleen: "spleen",
  root: "root",
};

/** Grafikteki merkez yazıları (Türkçe, büyük harf Türkçe kuralıyla önceden yazılmış: CSS uppercase "i"yi bozmasın). */
export const CONNECTION_CENTER_LABEL_TR: Readonly<Record<HdCenterCode, string>> = {
  head: "BAŞ",
  ajna: "AJNA",
  throat: "BOĞAZ",
  g_identity: "G MERKEZİ",
  heart_ego: "KALP",
  sacral: "SAKRAL",
  solar_plexus: "SOLAR PLEKSUS",
  spleen: "DALAK",
  root: "KÖK",
};

/** Kayıtlı sonuç → Roxy bileşeninin `data` biçimi (yalnız çizimin okuduğu alanlar; metinler Türkçe). */
export function toRoxyConnectionData(r: HdConnectionResult): Record<string, unknown> {
  return {
    totalChannels: r.totalChannels,
    combinedDefinition: r.combinedDefinition,
    summary: r.summary,
    channels: r.channels.map((c) => ({
      gateA: c.gateA,
      gateB: c.gateB,
      name: c.id,
      circuit: c.circuit,
      dynamic: c.dynamic,
      personAGates: [...c.personAGates],
      personBGates: [...c.personBGates],
    })),
    centers: r.centers.map((c) => ({ id: ROXY_CENTER_ID[c.code], name: CONNECTION_CENTER_LABEL_TR[c.code], defined: c.defined, definedBy: [...c.definedBy] })),
  };
}

/** Çizimde işaretlenmesi gereken kapılar: kayıtlı kanallardaki kapılar, kim taşıyorsa. */
export function expectedConnectionGates(r: HdConnectionResult): Map<number, { a: boolean; b: boolean }> {
  const m = new Map<number, { a: boolean; b: boolean }>();
  for (const c of r.channels) {
    for (const g of [c.gateA, c.gateB]) {
      const cur = m.get(g) ?? { a: false, b: false };
      cur.a ||= c.personAGates.includes(g);
      cur.b ||= c.personBGates.includes(g);
      m.set(g, cur);
    }
  }
  return m;
}

/** Rapor görseli bağlama parmak izi: analiz + kanal/kişi kapıları (sıra bağımsız). */
export function connectionFingerprint(r: HdConnectionResult): string {
  const parts = r.channels
    .map((c) => `${c.id}:${[...c.personAGates].sort((x, y) => x - y).join(".")}/${[...c.personBGates].sort((x, y) => x - y).join(".")}`)
    .sort();
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${r.channels.length}-${h.toString(16)}`;
}
export const HD_RELATION_BIND_KEYWORD = "yasam-hd-relation";
export const relationBindingText = (analysisId: string, fingerprint: string) => `${analysisId}:${fingerprint}`;

/**
 * Çizim doğrulaması: shadow kökteki grafikte A/B kaynaklı işaretli kapılar = beklenen küme ve tanımlı merkez
 * sayısı = kayıtlı sonuç. Bileşen sürümü/geometrisi beklenmedik davranırsa false → yedek çizim.
 */
export function connectionDrawingMatches(svg: Element, r: HdConnectionResult): boolean {
  const exp = expectedConnectionGates(r);
  const drawn = new Map<number, { a: boolean; b: boolean }>();
  // Her kapı bir <g class="bg-gate-node">: numara metni + kaynak dairesi (A = src-left, B = src-right; ikisi → iki yarım).
  for (const node of Array.from(svg.querySelectorAll("g.bg-gate-node"))) {
    const t = node.querySelector("text.bg-gate");
    if (!t || !/\bon\b/.test(t.getAttribute("class") ?? "")) continue;
    const n = Number((t.textContent ?? "").trim());
    if (!Number.isInteger(n)) continue;
    const dots = Array.from(node.querySelectorAll(".bg-gate-dot.on")).map((d) => d.getAttribute("class") ?? "");
    drawn.set(n, { a: dots.some((c) => /\bsrc-left\b/.test(c)), b: dots.some((c) => /\bsrc-right\b/.test(c)) });
  }
  if (drawn.size !== exp.size) return false;
  for (const [g, w] of exp) {
    const d = drawn.get(g);
    if (!d || d.a !== w.a || d.b !== w.b) return false;
  }
  const definedCenters = r.centers.filter((c) => c.defined).length;
  return svg.querySelectorAll("polygon.bg-center.defined").length === definedCenters;
}

/** Shadow köke eklenen stil: kartın yalnız grafiği kalır (Roxy'nin İngilizce metin bölümleri ve atıf gizli). */
export const ROXY_CONNECTION_SHADOW_STYLE =
  // Kişi renkleri ekrandaki Türkçe lejantla AYNI (A mavi, B turuncu).
  ".wrap{--src-left:#2563eb!important;--src-right:#ea580c!important}" +
  ".wrap>*:not(svg.chart){display:none!important}.wrap{border:0!important;padding:0!important;margin:0!important;background:transparent!important;box-shadow:none!important}svg.chart{width:100%!important;max-width:none!important;height:auto!important;margin:0!important}";

/** Grafikteki erişilebilirlik başlıklarını Türkçeleştirir (kapı: "Kapı 1 · 1-8 · A + B"; merkez: "Tanımlı/Açık"). */
export function localizeConnectionTitles(svg: Element, nameA: string, nameB: string): void {
  for (const t of Array.from(svg.querySelectorAll("title"))) {
    const s = t.textContent ?? "";
    const gate = /^Gate (\d+)(?: · ([^·]+))?(?: · (.+))?$/.exec(s);
    if (gate) {
      const who = (gate[3] ?? "").split("+").map((x) => x.trim()).filter(Boolean).map((x) => (x === "A" ? `A (${nameA})` : x === "B" ? `B (${nameB})` : x));
      t.textContent = [`Kapı ${gate[1]}`, gate[2] ? `${gate[2].trim()} kanalı` : null, who.length ? who.join(" + ") : null].filter(Boolean).join(" · ");
      continue;
    }
    if (/: Defined$/.test(s)) t.textContent = s.replace(/: Defined$/, ": Birleşik haritada tanımlı");
    else if (/: Open$/.test(s)) t.textContent = s.replace(/: Open$/, ": Açık");
    else if (s === "Combined bodygraph") t.textContent = "Birleşik ilişki BodyGraph'ı";
  }
}
