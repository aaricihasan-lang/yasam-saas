// Bireysel BodyGraph (self-host @roxyapi/ui <roxy-bodygraph>) — YARIM KANAL okunabilirliği (yalnız görsel).
//
// Denetim (scripts/hd-relations/roxy-bodygraph-audit + analyze, 2026-10-17): topoloji DOĞRU — 36 kanal doğru
// kapı çiftlerini bağlar, renkli parçalar kendi kanal yönünde, tanımlı kanallar kayıtla birebir; 7-31 / 1-8 /
// 10-20 / 13-33 / 21-45 kesişmez. SORUN okunabilirlik: kısa kanallarda (Boğaz↔G, Baş↔Ajna, Ajna↔Boğaz, Sakral↔Kök)
// TANIMLI OLMAYAN kanalın tek renkli yarısı görünen boşluğu neredeyse doldurur ve TAM kanal sanılabilir.
//
// ÇÖZÜM (dar kapsam): çizim tamamlandıktan sonra yalnız TANIMLI OLMAYAN kanallara ait renkli yarım parçalara
// `hd-half-only` sınıfı eklenir; shadow kökte tek kural bunları KESİKLİ çizer. Tanımlı kanallar, renkler,
// geometri, boyutlar ve PR #420 düzeni DEĞİŞMEZ. Eşleştirme belirsizse (kapı/yön bulunamazsa) parça olduğu gibi
// bırakılır — yanlış işaretleme yerine dokunmama (fail-safe).
//
// markRoxyHalfOnlyChannels KENDİ İÇİNDE bağımsızdır (dış referans yok) → tarayıcı testinde gerçek bileşen üzerinde
// aynen (toString ile) çalıştırılabilir. Ekran (HdRoxyBodygraph) ve Word yakalama (bodygraphCapture) AYNI işlevi kullanır.

import { CHANNELS } from "@/lib/human-design/engine/channels";

export const HD_CHANNEL_PAIRS: ReadonlyArray<readonly [number, number]> = CHANNELS.map((c) => [c.gateA, c.gateB] as const);

export const HD_HALF_ONLY_CLASS = "hd-half-only";
export const HD_HALF_ONLY_STYLE_ID = "hd-half-only-style";

/**
 * @param root           <roxy-bodygraph> shadowRoot
 * @param definedIds     kayıtlı TANIMLI kanallar ("küçük-büyük", ör. "23-43")
 * @param channelPairs   resmî 36 kanal [kapıA, kapıB] (engine/channels)
 * @returns işaretlenen yarım parça sayısı; işlem yapılamazsa -1
 */
export function markRoxyHalfOnlyChannels(
  root: ShadowRoot | null,
  definedIds: readonly string[],
  channelPairs: ReadonlyArray<readonly [number, number]>,
): number {
  try {
    if (!root) return -1;
    const svg = root.querySelector("svg.chart") ?? root.querySelector("svg");
    if (!svg) return -1;
    const pos = new Map<number, { x: number; y: number }>();
    for (const t of Array.from(svg.querySelectorAll("text"))) {
      const n = Number((t.textContent || "").trim());
      if (!Number.isInteger(n) || n < 1 || n > 64 || pos.has(n)) continue;
      const b = (t as unknown as SVGGraphicsElement).getBBox();
      pos.set(n, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    if (pos.size !== 64) return -1;
    const defined = new Set(definedIds);
    const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    let marked = 0;
    // .stripe = Roxy'nin "Design + Personality aynı kapı" çizgili örtüsü (kendi 7px deseni) → DOKUNULMAZ; altındaki
    // düz parça kesikli olur, çizgili desen aynen kalır.
    for (const el of Array.from(svg.querySelectorAll(".bg-half:not(.stripe)"))) {
      const g = el as unknown as SVGGeometryElement;
      let len = 0;
      try { len = g.getTotalLength(); } catch { continue; }
      if (!(len > 3)) continue;
      const s = g.getPointAtLength(0);
      const e = g.getPointAtLength(len);
      // Kapıya yakın uç = çıkış kapısı; diğer uç = kanal yönü.
      let best: { gate: number; d: number; tip: { x: number; y: number } } | null = null;
      for (const [gate, p] of pos) {
        const ds = Math.hypot(s.x - p.x, s.y - p.y);
        const de = Math.hypot(e.x - p.x, e.y - p.y);
        if (ds <= 12 && (!best || ds < best.d)) best = { gate, d: ds, tip: { x: e.x, y: e.y } };
        if (de <= 12 && (!best || de < best.d)) best = { gate, d: de, tip: { x: s.x, y: s.y } };
      }
      if (!best) continue;
      const from = pos.get(best.gate)!;
      let pick: { id: string; cos: number } | null = null;
      for (const [a, b] of channelPairs) {
        if (a !== best.gate && b !== best.gate) continue;
        const other = pos.get(a === best.gate ? b : a)!;
        const v1x = best.tip.x - from.x, v1y = best.tip.y - from.y, v2x = other.x - from.x, v2y = other.y - from.y;
        const cos = (v1x * v2x + v1y * v2y) / ((Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)) || 1);
        if (!pick || cos > pick.cos) pick = { id: key(a, b), cos };
      }
      if (!pick || pick.cos < 0.95) continue; // belirsiz → dokunma
      if (defined.has(pick.id)) continue;
      el.classList.add("hd-half-only"); // = HD_HALF_ONLY_CLASS (bağımsızlık için sabit)
      el.setAttribute("data-hd-half-only", pick.id);
      marked++;
    }
    if (!root.getElementById("hd-half-only-style")) {
      const st = document.createElement("style");
      st.id = "hd-half-only-style"; // = HD_HALF_ONLY_STYLE_ID
      st.textContent = `.hd-half-only{stroke-dasharray:3 4 !important;stroke-linecap:butt !important;opacity:.9}`;
      root.appendChild(st);
    }
    return marked;
  } catch {
    return -1;
  }
}

/** Kayıtlı Roxy render yükünden ("channels[{gateA,gateB}]") tanımlı kanal kimlikleri. */
export function definedChannelIdsFromRender(data: Record<string, unknown>): string[] {
  const list = Array.isArray(data.channels) ? (data.channels as Array<Record<string, unknown>>) : [];
  const out: string[] = [];
  for (const c of list) {
    const a = Number(c.gateA), b = Number(c.gateB);
    if (Number.isInteger(a) && Number.isInteger(b)) out.push(`${Math.min(a, b)}-${Math.max(a, b)}`);
  }
  return out;
}
