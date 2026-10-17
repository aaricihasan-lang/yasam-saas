// Astroloji raporu — Vedik (D1 / Varga) ve KP harita GÖRSELLERİ (SAF kısım; Word ve PDF aynı PNG'yi kullanır).
//
// 2026-10-15 (owner onayı): ekranda çizilen Vedik/KP haritaları rapora da girer. YENİ HARİTA MOTORU YOK:
//   • Kundli / Varga: uygulamadaki Roxy bileşeninin (`<roxy-vedic-kundli>` / `<roxy-divisional-chart>`, @roxyapi/ui
//     0.49.0) KENDİ render() çıktısı (Lit şablonu) sunucuda dizgiye çevrilir (figurePng.ts); bu dosya o SVG'yi
//     ayrıştırır, ekrandaki Türkçeleştirmeyi (localizeKundliDom — AYNI fonksiyon) küçük bir DOM üzerinde çalıştırır
//     ve bileşenin gölge-DOM CSS'ini (kundli-styles, varsayılan belirteçler) öznitelik olarak satır içine yazar.
//   • KP: ekrandaki KpSouthChart bir HTML ızgarasıdır (SVG değil) → AYNI kpChartItems verisi, AYNI 4×4 burç
//     yerleşimi, AYNI etiket ve renklerle SVG olarak çizilir (yalnız görsel çıktı; hesap yok).
// Girdi YALNIZ kayıtlı analizin teknik katmanıdır (rapor modeli); sağlayıcı çağrısı ve yeni hesap YOKTUR.

import type { KpCusp, KpPoint } from "../model/kp";
import type { VedicGrahaId } from "../model/vedic";
import { SIGN_IDS, type SignId } from "../model/western";
import { GRAHA_LABELS } from "../topics/vedic";
import type { AcgMapFigure, LocalSpaceMapFigure } from "./mapFigures";
import { SIGN_GLYPHS } from "../labels/tr";
import { localizeKundliDom, type ChartStyle } from "@/app/admin/astroloji/_lib/kundliData";
import { SIGN_TR_ABBR } from "@/app/admin/astroloji/_lib/kundliLocalize";
import { SOUTH_CELLS, kpChartItems } from "@/app/admin/astroloji/_lib/kpChart";

/** Rapor modelindeki Vedik/KP harita tanımı (SAF veri; çizim sunucuda). */
export type ReportFigure =
  | {
      type: "kundli";
      /** Hangi Roxy bileşeni: D1 = vedic-kundli, Varga = divisional-chart. */
      component: "kundli" | "divisional";
      style: ChartStyle;
      /** Ekrandaki bileşene verilen veriyle AYNI nesne (toKundliData / toVargaChartData). */
      data: unknown;
      /** Ekrandaki ipucu metinleri (kundliTitles) — Türkçeleştirme yalnız bunlarla eşleşir. */
      titles: Record<string, string>;
      /** Doğrulama: haritada görünmesi gereken graha sayısı (Lagna hariç). */
      grahaCount: number;
      /** Merkez etiketi (bileşenin kendi yazdığı: "D1 Rashi", "D9 Navamsa"…). */
      centreLabel: string;
    }
  | {
      type: "kp";
      cusps: KpCusp[];
      bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[];
      /** Ortadaki başlık + satırlar (ekrandaki Center ile aynı metin). */
      center: { title: string; lines: string[] };
    }
  | {
      /** 2026-10-15: ekrandaki Vimshottari / KP Dasha zaman çizelgesinin (DashaTimeline) statik karşılığı. */
      type: "dashaTimeline";
      periods: { lord: VedicGrahaId; start: string; end: string; durationYears: number }[];
    }
  | {
      /** TRANSİT-02 (2026-10-17): ekrandaki Gochara ev şeridinin (Janma Rashi'den 12 ev) statik karşılığı. */
      type: "gocharaStrip";
      cells: { house: number; rashi: SignId; grahas: { id: VedicGrahaId; slow: boolean }[] }[];
    }
  | {
      /** 2026-10-15: ekrandaki Shadbala güç çubuklarının statik karşılığı (oran = rupa / BPHS asgari). */
      type: "shadbalaBars";
      planets: { id: VedicGrahaId; rank: number; ratio: number }[];
    }
  /** 2026-10-15: Astrocartography / Local Space dünya haritası (ekrandaki WorldMap ile aynı altlık ve hatlar; mapFigures.ts). */
  | AcgMapFigure
  | LocalSpaceMapFigure;

/** Geniş (yatay) figür: Word/PDF'te kare harita boyutu yerine sayfa genişliğinde yerleşir. */
export function isWideFigure(fig: ReportFigure): boolean {
  return fig.type === "dashaTimeline" || fig.type === "shadbalaBars" || fig.type === "gocharaStrip" || fig.type === "acgMap" || fig.type === "localSpaceMap";
}

// ─── Lit şablonu → dizgi (yalnız statik çıktı; olay/özellik bağları atılır) ────────────────────────────

type LitTemplate = { _$litType$: number; strings: readonly string[]; values: readonly unknown[] };
type LitDirective = { _$litDirective$: unknown; values: readonly unknown[] };
const isTemplate = (v: unknown): v is LitTemplate => !!v && typeof v === "object" && "_$litType$" in v && "strings" in v;
const isDirective = (v: unknown): v is LitDirective => !!v && typeof v === "object" && "_$litDirective$" in v;

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");

/** Bağ değerinin metin karşılığı (Lit kuralı: null/undefined/nothing → boş). */
function textOf(v: unknown, out: string[]): void {
  if (v === null || v === undefined || typeof v === "symbol" || v === false) return;
  if (isTemplate(v)) return renderTemplate(v, out);
  if (isDirective(v)) return textOf(v.values[0], out);
  if (typeof v === "object" && Symbol.iterator in (v as object)) {
    for (const x of v as Iterable<unknown>) textOf(x, out);
    return;
  }
  out.push(escText(String(v)));
}

function renderTemplate(t: LitTemplate, out: string[]): void {
  let skipQuote = false;
  for (let i = 0; i < t.strings.length; i++) {
    let s = t.strings[i];
    if (skipQuote && s.startsWith('"')) s = s.slice(1);
    skipQuote = false;
    if (i === t.values.length) {
      out.push(s);
      break;
    }
    const v = t.values[i];
    const so = out.join("") + s;
    const inTag = so.lastIndexOf("<") > so.lastIndexOf(">");
    const m = inTag ? /\s([@.?]?)([^\s"'>/=]+)=("?)$/.exec(s) : null;
    if (m) {
      const [whole, prefix, name, quote] = m;
      const head = s.slice(0, s.length - whole.length);
      const val = isDirective(v) ? v.values[0] : v;
      out.push(head);
      const drop = prefix === "@" || prefix === "." || val === undefined || val === null || typeof val === "symbol";
      if (prefix === "?" || drop) {
        // olay / özellik bağı, ifDefined(undefined) / nothing → statik çıktıda öznitelik yok (tek değerli bağlar)
        skipQuote = quote === '"';
        if (prefix === "?" && val) out.push(` ${name}=""`);
        continue;
      }
      // Tırnaklı öznitelik AÇIK bırakılır: aynı öznitelikte birden çok bağ olabilir (ör. points="${x},${y} …"); kapanış
      // tırnağı şablonun sonraki parçasından gelir.
      out.push(quote === '"' ? ` ${name}="${escAttr(String(val))}` : ` ${name}="${escAttr(String(val))}"`);
      continue;
    }
    out.push(s);
    if (inTag) out.push(escAttr(String(isDirective(v) ? v.values[0] : v))); // tırnaklı özniteliğin ortasındaki parça (ör. points)
    else textOf(v, out);
  }
}

/** Lit TemplateResult'ı HTML/SVG dizgisine çevirir (SAF; yalnız sunucu raporu için). */
export function litToString(t: unknown): string {
  if (!isTemplate(t)) throw new Error("Lit şablonu değil");
  const out: string[] = [];
  renderTemplate(t, out);
  return out.join("");
}

/** Bileşen çıktısından harita SVG'sini (viewBox 0 0 400 400) çıkarır; yoksa null. */
export function extractChartSvg(markup: string): string | null {
  const i = markup.indexOf('<svg viewBox="0 0 400 400"');
  if (i < 0) return null;
  const j = markup.indexOf("</svg>", i);
  return j < 0 ? null : markup.slice(i, j + 6);
}

// ─── Küçük SVG DOM'u (localizeKundliDom'un kullandığı yüzey kadar) ──────────────────────────────────

type MiniStyle = { fontSize: string; transform: string; textTransform: string; letterSpacing: string };
export type MiniText = { nodeType: 3; data: string };
export type MiniEl = {
  nodeType: 1;
  tag: string;
  attrs: Record<string, string>;
  childNodes: (MiniEl | MiniText)[];
  style: MiniStyle;
  querySelectorAll: (sel: string) => MiniEl[];
  querySelector: (sel: string) => MiniEl | null;
  getBBox: () => { x: number; y: number; width: number; height: number };
};

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Bileşenin kundli-styles.ts varsayılan değerleri (uygulama --roxy-* belirteci tanımlamaz; ekranla aynı). */
const CLASS_STYLE: Record<string, { fill?: string; stroke?: string; fontSize?: number; fontWeight?: number; letterSpacingEm?: number; upper?: boolean; opacity?: number; fillOpacity?: number; linecap?: string }> = {
  line: { fill: "none", stroke: "#d4d4d8" },
  "sign-text": { fill: "#71717a", fontSize: 11, fontWeight: 500, letterSpacingEm: 0.04, upper: true },
  "rashi-num": { fill: "#71717a", fontSize: 12, fontWeight: 500 },
  "house-num": { fill: "#b45309", fontSize: 11, fontWeight: 600, opacity: 0.85 },
  "planet-text": { fill: "#0a0a0a", fontSize: 13, fontWeight: 600 },
  "centre-label": { fill: "#71717a", fontSize: 14, fontWeight: 600, letterSpacingEm: 0.02 },
  "lagna-marker": { fill: "#b45309", fontSize: 10, fontWeight: 700, letterSpacingEm: 0.08, upper: true },
  "lagna-bg": { fill: "#f59e0b", fillOpacity: 0.14 },
  "lagna-slash": { stroke: "#f59e0b", opacity: 0.7, linecap: "round" },
};
const classesOf = (el: MiniEl) => (el.attrs.class ?? "").split(/\s+/).filter(Boolean);
const classStyle = (el: MiniEl) => Object.assign({}, ...classesOf(el).map((c) => CLASS_STYLE[c] ?? {})) as (typeof CLASS_STYLE)[string];
const pxOf = (v: string) => (v.endsWith("px") ? Number(v.slice(0, -2)) : NaN);
const fontSizeOf = (el: MiniEl) => (Number.isFinite(pxOf(el.style.fontSize)) ? pxOf(el.style.fontSize) : classStyle(el).fontSize ?? 12);

function matches(el: MiniEl, sel: string): boolean {
  const [tag, cls] = sel.trim().split(".");
  return (!tag || el.tag === tag) && (!cls || classesOf(el).includes(cls));
}

function makeEl(tag: string, attrs: Record<string, string>): MiniEl {
  const el: MiniEl = {
    nodeType: 1,
    tag,
    attrs,
    childNodes: [],
    style: { fontSize: "", transform: "", textTransform: "", letterSpacing: "" },
    querySelectorAll(sel) {
      const sels = sel.split(",");
      const out: MiniEl[] = [];
      const walk = (n: MiniEl) => {
        for (const c of n.childNodes) {
          if (c.nodeType !== 1) continue;
          if (sels.some((s) => matches(c, s))) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] ?? null;
    },
    // Tarayıcı getBBox karşılığı (yalnız <text>): Chrome'da Geist + dominant-baseline=central → kutu yüksekliği
    // round(1.3 × yazı boyutu), y'nin çevresinde ortalı (2026-10-15 tarayıcıda ölçüldü: 10/11/12/13/14 px → 13/14/16/17/18).
    // localizeKundliDom bunu YALNIZ kalabalık hücrede yığını etiketin altına itmek için kullanır.
    getBBox() {
      const fs = fontSizeOf(el);
      const h = Math.round(fs * 1.3);
      const len = el.childNodes.filter((c): c is MiniText => c.nodeType === 3).map((c) => c.data).join("").trim().length;
      return { x: Number(el.attrs.x ?? 0), y: Number(el.attrs.y ?? 0) - h / 2, width: len * fs * 0.6, height: h };
    },
  };
  return el;
}

/** Bileşen çıktısındaki SVG'yi ayrıştırır (iyi biçimli, yorumsuz Lit çıktısı). */
export function parseSvg(svg: string): MiniEl {
  const root = makeEl("#root", {});
  const stack: MiniEl[] = [root];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      top.childNodes.push({ nodeType: 3, data: decode(m[5]) });
      continue;
    }
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) {
      if (top.tag !== tag) throw new Error(`SVG ayrıştırma: </${tag}> beklenmedik`);
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rawAttrs.matchAll(/([^\s=/>]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const el = makeEl(tag, attrs);
    top.childNodes.push(el);
    if (!selfClose) stack.push(el);
  }
  if (stack.length !== 1) throw new Error("SVG ayrıştırma: kapanmamış öğe");
  const svgEl = root.childNodes.find((c): c is MiniEl => c.nodeType === 1 && c.tag === "svg");
  if (!svgEl) throw new Error("SVG kökü yok");
  return svgEl;
}

/** Ekrandaki Türkçeleştirme (AYNI fonksiyon) → küçük DOM üzerinde. */
export function localizeMiniSvg(root: MiniEl, titles: Record<string, string>, style: ChartStyle): void {
  localizeKundliDom(root as unknown as ParentNode, titles, style);
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Küçük DOM → bağımsız SVG dizgisi; sınıf CSS'i ve localizeKundliDom'un satır içi stilleri öznitelik olur. */
export function serializeStyledSvg(root: MiniEl, fontFamily: string): string {
  const ser = (n: MiniEl | MiniText, upper: boolean): string => {
    if (n.nodeType === 3) return escText(upper ? n.data.toLocaleUpperCase("tr-TR") : n.data);
    if (n.tag === "title") return ""; // ipucu metni statik görselde gösterilmez
    const cs = classStyle(n);
    const a: Record<string, string> = { ...n.attrs };
    delete a.class;
    delete a.part;
    delete a.role;
    delete a["aria-label"];
    if (cs.fill && a.fill === undefined) a.fill = cs.fill;
    if (cs.stroke) a.stroke = cs.stroke;
    if (cs.fillOpacity !== undefined) a["fill-opacity"] = String(cs.fillOpacity);
    if (cs.opacity !== undefined) a.opacity = String(cs.opacity);
    if (cs.linecap) a["stroke-linecap"] = cs.linecap;
    let up = upper;
    if (n.tag === "text") {
      const fs = fontSizeOf(n);
      a["font-size"] = fmt(fs);
      if (cs.fontWeight) a["font-weight"] = String(cs.fontWeight);
      const ls = n.style.letterSpacing ? pxOf(n.style.letterSpacing) : (cs.letterSpacingEm ?? 0) * fs;
      if (Number.isFinite(ls) && ls !== 0) a["letter-spacing"] = fmt(ls);
      up = n.style.textTransform === "none" ? false : !!cs.upper;
      const ty = /^translateY\((-?[\d.]+)px\)$/.exec(n.style.transform);
      if (ty) a.transform = `translate(0 ${ty[1]})`;
    }
    if (n.tag === "svg") {
      a.xmlns = "http://www.w3.org/2000/svg";
      a.width = "400";
      a.height = "400";
      a["font-family"] = fontFamily;
    }
    const attrs = Object.entries(a)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join("");
    const kids = n.childNodes.map((c) => ser(c, up)).join("");
    return `<${n.tag}${attrs}>${kids}</${n.tag}>`;
  };
  return ser(root, false);
}

/** Bileşen çıktısı → doğrulanmış + ekrandaki gibi Türkçeleştirilmiş küçük DOM (SAF; testler ekranla bunu karşılaştırır). */
export function kundliLocalizedTree(markup: string, fig: Extract<ReportFigure, { type: "kundli" }>): MiniEl {
  const raw = extractChartSvg(markup);
  if (!raw) throw new Error("Bileşen harita SVG'si üretmedi");
  const root = parseSvg(raw);
  const planets = root.querySelectorAll("text.planet-text").length;
  if (planets !== fig.grahaCount) throw new Error(`Haritada ${planets} graha var, kayıtta ${fig.grahaCount}`);
  if (root.querySelectorAll("text.lagna-marker").length !== 1) throw new Error("Lagna işareti yok");
  // Doğru harita: bileşenin merkez etiketi kayıttaki bölümle aynı olmalı (D1 raporuna D9 çizilemez).
  const centre = root.querySelector("text.centre-label");
  const centreText = centre ? centre.childNodes.map((c) => (c.nodeType === 3 ? c.data : "")).join("").trim() : "";
  if (centreText !== fig.centreLabel) throw new Error(`Merkez etiketi "${centreText}" ≠ "${fig.centreLabel}"`);
  localizeMiniSvg(root, fig.titles, fig.style);
  return root;
}

/** Bileşen çıktısı → rapor için bağımsız, Türkçeleştirilmiş SVG (SAF). */
export function kundliReportSvg(markup: string, fig: Extract<ReportFigure, { type: "kundli" }>, fontFamily: string): string {
  return serializeStyledSvg(kundliLocalizedTree(markup, fig), fontFamily);
}

// ─── KP Güney Hindistan haritası (ekrandaki KpSouthChart'ın SVG karşılığı) ─────────────────────────────

const KP = { cell: 150, pad: 6, header: 20 } as const;
const KP_SIZE = KP.cell * 4;
/** Geist ortalama karakter genişliği (em) — yalnız kutu genişliği/sığma kestirimi. */
const CHAR_EM = 0.6;

export function kpReportSvg(fig: Extract<ReportFigure, { type: "kp" }>, fontFamily: string): string {
  const items = kpChartItems(fig.cusps, fig.bodies);
  const parts: string[] = [];
  const text = (x: number, y: number, s: string, at: Record<string, string | number>) =>
    `<text x="${fmt(x)}" y="${fmt(y)}" dominant-baseline="central"${Object.entries(at)
      .map(([k, v]) => ` ${k}="${escAttr(String(v))}"`)
      .join("")}>${escText(s)}</text>`;
  parts.push(`<rect x="0.75" y="0.75" width="${KP_SIZE - 1.5}" height="${KP_SIZE - 1.5}" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>`);
  for (const s of SIGN_IDS as readonly SignId[]) {
    const [r, c] = SOUTH_CELLS[s];
    const x0 = (c - 1) * KP.cell;
    const y0 = (r - 1) * KP.cell;
    const list = items[s];
    const hasAsc = list.some((it) => it.key === "c1");
    parts.push(`<rect x="${x0}" y="${y0}" width="${KP.cell}" height="${KP.cell}" fill="${hasAsc ? "#fffbeb" : "none"}" stroke="#e2e8f0" stroke-width="1"/>`);
    parts.push(text(x0 + KP.pad, y0 + 11, SIGN_TR_ABBR[s].toLocaleUpperCase("tr-TR"), { fill: "#64748b", "font-size": 11, "font-weight": 600, "letter-spacing": 0.5, "data-kp-sign": s }));
    // Görünüm seçicisi (U+FE0E/F) yazı tipinde glif değildir → atılır (rapor metin akışıyla aynı kural).
    parts.push(text(x0 + KP.cell - KP.pad, y0 + 11, SIGN_GLYPHS[s].replace(/[︎️]/g, ""), { fill: "#64748b", "font-size": 12, "text-anchor": "end" }));
    if (!list.length) continue;
    // Etiketler alt alta; sığmazsa iki sütun + küçük yazı (ekrandaki sarma ızgarasının statik karşılığı).
    const avail = KP.cell - KP.header - KP.pad;
    let cols = 1;
    let fs = 12;
    let lh = 17;
    if (list.length * lh > avail) {
      fs = 10.5;
      lh = 15;
      if (list.length * lh > avail) cols = 2;
    }
    const maxChars = Math.max(...list.map((it) => it.label.length));
    const colW = (KP.cell - 2 * KP.pad - (cols - 1) * 4) / cols;
    while (fs > 8 && maxChars * fs * CHAR_EM + 6 > colW) fs -= 0.5;
    if (cols === 2) lh = Math.min(lh, fs + 5);
    const rows = Math.ceil(list.length / cols);
    if (rows * lh > avail) throw new Error(`KP hücresi ${s} sığmıyor (${list.length} etiket)`);
    list.forEach((it, i) => {
      const col = cols === 1 ? 0 : Math.floor(i / rows);
      const row = cols === 1 ? i : i % rows;
      const x = x0 + KP.pad + col * (colW + 4);
      const y = y0 + KP.header + row * lh;
      const w = Math.min(colW, it.label.length * fs * CHAR_EM + 6);
      const fill = it.cusp ? "#ffffff" : "#f1f5f9";
      const stroke = it.cusp ? (it.strong ? "#f59e0b" : "#fcd34d") : "none";
      const ink = it.cusp ? (it.strong ? "#78350f" : "#92400e") : "#0f172a";
      parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(lh - 2)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1" data-kp-item="${escAttr(it.key)}"/>`);
      parts.push(text(x + 3, y + (lh - 2) / 2, it.label, { fill: ink, "font-size": fmt(fs), "font-weight": it.cusp && !it.strong ? 400 : 600 }));
    });
  }
  // Ortadaki 2×2 başlık
  const cx = KP_SIZE / 2;
  parts.push(`<rect x="${KP.cell}" y="${KP.cell}" width="${KP.cell * 2}" height="${KP.cell * 2}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>`);
  const lines = [fig.center.title, ...fig.center.lines];
  const y0 = cx - ((lines.length - 1) * 20) / 2;
  lines.forEach((l, i) => parts.push(text(cx, y0 + i * 20, l, { fill: i === 0 ? "#334155" : "#475569", "font-size": i === 0 ? 15 : 13, "font-weight": i === 0 ? 600 : 400, "text-anchor": "middle" })));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${KP_SIZE} ${KP_SIZE}" width="${KP_SIZE}" height="${KP_SIZE}" font-family="${escAttr(fontFamily)}">${parts.join("")}</svg>`;
}

// ─── Dasha zaman çizelgesi + Shadbala çubukları (2026-10-15) ──────────────────────────────────────────────
// Ekrandaki çizimlerin (VedicPanels DashaTimeline, VedicExtraPanels Shadbala) AYNI veri, ölçek, renk ve etiket kuralıyla
// statik SVG karşılığı. Ekrandaki "bugün" çizgisi ve seçim vurgusu etkileşimli/tarihe bağlıdır → raporda YOK (rapor
// değişmez kayıttan üretilir; oluşturma tarihine göre değişen işaret basılmaz).

/** Ekrandaki LORD_TONE (Tailwind 3.4) renklerinin hex karşılığı. */
const DASHA_TONE: Record<VedicGrahaId, string> = {
  sun: "#fcd34d",
  moon: "#e2e8f0",
  mars: "#fda4af",
  mercury: "#6ee7b7",
  jupiter: "#fef08a",
  venus: "#fbcfe8",
  saturn: "#a5b4fc",
  rahu: "#a1a1aa",
  ketu: "#d6d3d1",
};
const svgText = (x: number, y: number, s: string, at: Record<string, string | number>) =>
  `<text x="${fmt(x)}" y="${fmt(y)}" dominant-baseline="central"${Object.entries(at)
    .map(([k, v]) => ` ${k}="${escAttr(String(v))}"`)
    .join("")}>${escText(s)}</text>`;
const dmy = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;

export function dashaTimelineSvg(fig: Extract<ReportFigure, { type: "dashaTimeline" }>, fontFamily: string): string {
  const ps = fig.periods;
  if (!ps.length) throw new Error("Dasha dönemi yok");
  const W = 1000;
  const barY = 6;
  const barH = 56;
  const H = barY + barH + 30;
  const total = ps.reduce((a, p) => a + p.durationYears, 0) || 1;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<clipPath id="dasha-bar"><rect x="1" y="${barY}" width="${W - 2}" height="${barH}" rx="8"/></clipPath>`);
  parts.push(`<g clip-path="url(#dasha-bar)">`);
  let x = 1;
  const inner = W - 2;
  ps.forEach((p, i) => {
    const share = p.durationYears / total;
    const w = share * inner;
    const tone = DASHA_TONE[p.lord];
    if (!tone) throw new Error(`Bilinmeyen dasha lordu: ${String(p.lord)}`);
    parts.push(`<rect x="${fmt(x)}" y="${barY}" width="${fmt(w)}" height="${barH}" fill="${tone}" fill-opacity="0.9" data-dasha-seg="${escAttr(p.lord)}"/>`);
    if (i < ps.length - 1) parts.push(`<rect x="${fmt(x + w - 1)}" y="${barY}" width="1" height="${barH}" fill="#ffffff" fill-opacity="0.7"/>`);
    // Ekran kuralı: pay > %5 ise kısa ad; ayrıca raporda sığmayan ad basılmaz (kırpma yerine).
    const name = (GRAHA_LABELS[p.lord] ?? p.lord).split(" ")[0];
    const fs = 15;
    if (share * 100 > 5 && name.length * fs * CHAR_EM + 6 <= w) parts.push(svgText(x + w / 2, barY + barH / 2, name, { fill: "#1e293b", "font-size": fs, "font-weight": 600, "text-anchor": "middle" }));
    x += w;
  });
  parts.push(`</g>`);
  parts.push(`<rect x="1" y="${barY}" width="${W - 2}" height="${barH}" rx="8" fill="none" stroke="#e2e8f0" stroke-width="1.5"/>`);
  parts.push(svgText(2, barY + barH + 16, dmy(ps[0].start), { fill: "#64748b", "font-size": 14 }));
  parts.push(svgText(W - 2, barY + barH + 16, dmy(ps[ps.length - 1].end), { fill: "#64748b", "font-size": 14, "text-anchor": "end" }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${escAttr(fontFamily)}">${parts.join("")}</svg>`;
}

export function shadbalaBarsSvg(fig: Extract<ReportFigure, { type: "shadbalaBars" }>, fontFamily: string): string {
  const ps = [...fig.planets].sort((a, b) => a.rank - b.rank);
  if (!ps.length) throw new Error("Shadbala gezegeni yok");
  const W = 1000;
  const rowH = 40;
  const pad = 8;
  const H = pad * 2 + ps.length * rowH;
  const labelW = 250;
  const valueW = 80;
  const x0 = labelW + 12;
  const barW = W - x0 - valueW - 12;
  const barH = 18;
  const maxRatio = Math.max(...ps.map((p) => p.ratio), 1.2);
  const parts: string[] = [`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`];
  ps.forEach((p, i) => {
    const cy = pad + i * rowH + rowH / 2;
    parts.push(svgText(4, cy, `${p.rank}. ${GRAHA_LABELS[p.id] ?? p.id}`, { fill: "#0f172a", "font-size": 18, "font-weight": 500 }));
    parts.push(`<rect x="${x0}" y="${fmt(cy - barH / 2)}" width="${barW}" height="${barH}" rx="5" fill="#f1f5f9"/>`);
    const w = (Math.max(0, p.ratio) / maxRatio) * barW;
    if (w > 0) parts.push(`<rect x="${x0}" y="${fmt(cy - barH / 2)}" width="${fmt(w)}" height="${barH}" rx="5" fill="${p.ratio >= 1 ? "#34d399" : "#fda4af"}" data-shadbala="${escAttr(p.id)}"/>`);
    parts.push(`<rect x="${fmt(x0 + (1 / maxRatio) * barW - 1.5)}" y="${fmt(cy - barH / 2)}" width="3" height="${barH}" fill="#334155"/>`);
    parts.push(svgText(W - 4, cy, p.ratio.toFixed(2).replace(".", ","), { fill: "#0f172a", "font-size": 18, "text-anchor": "end" }));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${escAttr(fontFamily)}">${parts.join("")}</svg>`;
}

/** TRANSİT-02: Gochara ev şeridi — 12 kutu (Janma Rashi = 1, vurgulu), her kutuda o burçtaki transit grahalar. */
export function gocharaStripSvg(fig: Extract<ReportFigure, { type: "gocharaStrip" }>, fontFamily: string): string {
  if (fig.cells.length !== 12) throw new Error("Gochara şeridi 12 kutu değil");
  // Raporda okunurluk: 2 satır × 6 kutu (ekrandaki tek satırlık şeridin aynı sırası: 1–6 üstte, 7–12 altta).
  const W = 1200;
  const cols = 6;
  const gap = 10;
  const boxW = (W - gap * (cols - 1)) / cols;
  const maxN = Math.max(1, ...fig.cells.map((c) => c.grahas.length));
  const head = 70;
  const lineH = 30;
  const boxH = head + maxN * lineH + 12;
  const H = boxH * 2 + gap + 2;
  const parts: string[] = [`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`];
  fig.cells.forEach((c, i) => {
    const x = (i % cols) * (boxW + gap);
    const y0 = Math.floor(i / cols) * (boxH + gap) + 1;
    const janma = c.house === 1;
    parts.push(`<rect x="${fmt(x + 1)}" y="${y0}" width="${fmt(boxW - 2)}" height="${boxH - 1}" rx="10" fill="${janma ? "#fffbeb" : "#ffffff"}" stroke="${janma ? "#f59e0b" : "#cbd5e1"}" stroke-width="${janma ? 3 : 1.5}" data-gochara-house="${c.house}"/>`);
    parts.push(svgText(x + 16, y0 + 24, `${c.house}. ev`, { fill: "#64748b", "font-size": 20, "font-weight": 700 }));
    parts.push(svgText(x + boxW - 14, y0 + 24, `${noVsG(SIGN_GLYPHS[c.rashi])} ${SIGN_TR_ABBR[c.rashi]}`, { fill: "#475569", "font-size": 20, "text-anchor": "end" }));
    if (janma) parts.push(svgText(x + 16, y0 + 50, "Janma Rashi", { fill: "#b45309", "font-size": 17, "font-weight": 600 }));
    c.grahas.forEach((g, j) => {
      const name = (GRAHA_LABELS[g.id] ?? g.id).split(" ")[0];
      parts.push(svgText(x + boxW / 2, y0 + head + 12 + j * lineH, name, { fill: "#312e81", "font-size": 22, "font-weight": 600, "text-anchor": "middle", ...(g.slow ? { "text-decoration": "underline" } : {}) }));
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${escAttr(fontFamily)}">${parts.join("")}</svg>`;
}
const noVsG = (x: string) => x.replace(/[︎️]/g, "");

/** Rapor metni için harita türü adı (yanlış adlandırma YOK: bölüm numarası + kayıttaki ad). */
export function figureTitle(technique: string, division?: { number: number; name: string }): string {
  if (technique === "vedic.d1") return "Vedik D1 (Rashi) haritası";
  if (technique === "vedic.varga" && division) return `Vedik D${division.number} (${division.name}) haritası`;
  if (technique === "kp.chart") return "KP haritası";
  if (technique === "kp.horary") return "KP horary haritası";
  if (technique === "kp.transit") return "KP transit haritası";
  if (technique === "vedic.dasha") return "Vimshottari Dasha zaman çizelgesi";
  if (technique === "kp.dasha") return "KP Dasha zaman çizelgesi";
  if (technique === "vedic.shadbala") return "Shadbala güç grafiği";
  if (technique === "vedic.transit") return "Gochara ev şeridi (Janma Rashi'den)";
  if (technique === "western.astrocartography") return "Astrocartography dünya haritası";
  if (technique === "western.local_space") return "Local space haritası";
  return "Harita";
}

