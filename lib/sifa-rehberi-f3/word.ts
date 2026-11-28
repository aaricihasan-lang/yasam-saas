/**
 * Şifa Rehberi F3 — Word (.docx) raporu. İÇERİK = onaylı F2 "Word raporu indir" ile aynı sıra ve kapsam:
 *   konu adı → konunun genel notları → başlıklar (kendi başlıkları sırasıyla, ardından hazır başlıklar şablon sırasıyla;
 *   yalnız altında not bulunan başlıklar) → her notta: başlık, metin, görseller (+ açıklama), kaynaklar, bağlantılar,
 *   içerik kutuları (aynı parçalar) ve "Oluşturuldu · Son güncelleme" satırı.
 * KAYNAK = yalnız KAYDEDİLMİŞ veri (sunucu çalışma alanı). Görseller yalnız gömülebilir PNG/JPEG; çözülemeyen görselin
 * yerine "[görsel eklenemedi]" notu yazılır ve report.skippedImages ile bildirilir (sessiz kayıp yok).
 */
import { Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, TextRun, type ParagraphChild } from "docx";
import type { JSONContent } from "@tiptap/core";
import { sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import { decodeImage } from "@/lib/sifa-rehberi-v2/word";
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";
import type { Block, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export type F3WordReport = { headings: number; notes: number; boxes: number; images: number; skippedImages: string[]; links: number };

const MAX_IMG_W = 420;
const DISCLAIMER =
  "Bu rapordaki içerikler uzmanın kişisel araştırma notlarıdır; tıbbi tanı veya tedavi önerisi değildir. Not türü etiketleri yalnızca düzen içindir, kanıt düzeyi belirtmez.";
const TZ = "Europe/Istanbul";
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
/** Hazır başlık şablonu (25 başlık; F2 ile aynı anahtar ve sıra). */
const TEMPLATE = TEMPLATE_ENTRIES.filter((e) => /^(grup|konu):/.test(e.key)).map((e) => ({ key: e.key, label: e.label, parent: e.parentKey }));
const TPL_INDEX = new Map(TEMPLATE.map((t, i) => [t.key, i]));

type Ctx = { report: F3WordReport; images: Map<string, string> };

function runs(nodes: JSONContent[] | undefined, ctx: Ctx): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text") {
      out.push(...runs(n.content, ctx));
      continue;
    }
    const marks = (n.marks ?? []) as { type: string; attrs?: Record<string, unknown> }[];
    const has = (t: string) => marks.some((m) => m.type === t);
    const run = new TextRun({ text: String(n.text ?? ""), bold: has("bold"), italics: has("italic"), underline: has("underline") ? {} : undefined, strike: has("strike") });
    const link = marks.find((m) => m.type === "link");
    if (link && typeof link.attrs?.href === "string") {
      ctx.report.links++;
      out.push(new ExternalHyperlink({ link: link.attrs.href, children: [new TextRun({ text: String(n.text ?? ""), color: "0F766E", underline: {} })] }));
    } else out.push(run);
  }
  return out;
}

function textOf(n: JSONContent): string {
  return n.type === "text" ? String(n.text ?? "") : (n.content ?? []).map(textOf).join(" ");
}

function blocks(content: JSONContent[] | undefined, ctx: Ctx, level = 0): Paragraph[] {
  const out: Paragraph[] = [];
  for (const n of content ?? []) {
    if (n.type === "paragraph" || n.type === "heading") out.push(new Paragraph({ children: runs(n.content, ctx), spacing: { after: 80 } }));
    else if (n.type === "bulletList" || n.type === "orderedList") {
      (n.content ?? []).forEach((li, i) => {
        const [first, ...rest] = li.content ?? [];
        const lead = n.type === "orderedList" ? [new TextRun({ text: `${i + 1}. ` })] : [];
        out.push(new Paragraph({ ...(n.type === "bulletList" ? { bullet: { level: Math.min(level, 8) } } : { indent: { left: 360 * (level + 1) } }), children: [...lead, ...runs(first?.content, ctx)] }));
        out.push(...blocks(rest, ctx, level + 1));
      });
    } else if (n.type === "blockquote") out.push(...blocks(n.content, ctx, level));
    else if (n.type === "table") for (const row of n.content ?? []) out.push(new Paragraph({ text: textOf(row) }));
  }
  return out;
}

function imageParas(b: Block, ctx: Ctx): Paragraph[] {
  const out: Paragraph[] = [];
  for (const a of b.assets ?? []) {
    const src = ctx.images.get(a.id);
    const img = src ? decodeImage(src) : null;
    if (!img) {
      ctx.report.skippedImages.push(a.caption || a.id);
      out.push(new Paragraph({ children: [new TextRun({ text: `[görsel eklenemedi${a.caption ? `: ${a.caption}` : ""}]`, italics: true, color: "B45309" })] }));
      continue;
    }
    const scale = Math.min(1, MAX_IMG_W / Math.max(1, img.w));
    ctx.report.images++;
    out.push(new Paragraph({ children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.w * scale), height: Math.round(img.h * scale) } })], spacing: { before: 80 } }));
    if (a.caption) out.push(new Paragraph({ children: [new TextRun({ text: a.caption, italics: true, size: 20, color: "4A5661" })], spacing: { after: 80 } }));
  }
  return out;
}

function partParas(b: Block, ctx: Ctx): Paragraph[] {
  const out: Paragraph[] = [...blocks(sanitizeContent(b.contentJson)?.content, ctx), ...imageParas(b, ctx)];
  const sources = b.sources.filter((s) => s.kind !== "baglanti");
  const links = b.sources.filter((s) => s.kind === "baglanti" && s.url);
  if (sources.length) {
    const kids: ParagraphChild[] = [new TextRun({ text: "Kaynaklar: ", bold: true })];
    sources.forEach((s, i) => {
      if (i) kids.push(new TextRun({ text: "; " }));
      kids.push(new TextRun({ text: s.title }));
      if (s.doi) {
        ctx.report.links++;
        kids.push(new TextRun({ text: " (" }), new ExternalHyperlink({ link: `https://doi.org/${s.doi}`, children: [new TextRun({ text: `DOI: ${s.doi}`, color: "0F766E", underline: {} })] }), new TextRun({ text: ")" }));
      } else if (s.url) {
        ctx.report.links++;
        kids.push(new TextRun({ text: " (" }), new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, color: "0F766E", underline: {} })] }), new TextRun({ text: ")" }));
      }
    });
    out.push(new Paragraph({ children: kids, spacing: { before: 60 } }));
  }
  if (links.length) {
    const kids: ParagraphChild[] = [new TextRun({ text: "Bağlantılar: ", bold: true })];
    links.forEach((l, i) => {
      ctx.report.links++;
      if (i) kids.push(new TextRun({ text: "; " }));
      const label = l.title && l.title !== l.url ? l.title : (l.url as string);
      kids.push(new TextRun({ text: `${label} (` }), new ExternalHyperlink({ link: l.url as string, children: [new TextRun({ text: l.url as string, color: "0F766E", underline: {} })] }), new TextRun({ text: ")" }));
    });
    out.push(new Paragraph({ children: kids, spacing: { before: 40 } }));
  }
  return out;
}

const live = <T extends { deletedAt: string | null }>(x: T) => !x.deletedAt;
const bySort = (a: { sortKey: string; id: string }, b: { sortKey: string; id: string }) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1);

/** Tek ana konunun Word belgesi (yalnız verilen — çağıranın kendi — çalışma alanından). images: varlık kimliği → data:image. */
export async function buildF3Word(
  ws: Workspace,
  rootId: string,
  images: Map<string, string> = new Map(),
  opts: { generatedAt?: Date } = {},
): Promise<{ buffer: Buffer; report: F3WordReport; fileName: string } | null> {
  const root = ws.nodes.find((n) => n.id === rootId && n.parentId === null && !n.deletedAt);
  if (!root) return null;
  const ctx: Ctx = { report: { headings: 0, notes: 0, boxes: 0, images: 0, skippedImages: [], links: 0 }, images };
  const nodes = ws.nodes.filter(live);
  const allNodes = ws.nodes;
  const notesOf = (hid: string) => ws.blocks.filter((b) => b.nodeId === hid && !b.parentBlockId && !b.deletedAt).sort(bySort);
  const boxesOf = (nid: string) => ws.blocks.filter((b) => b.parentBlockId === nid && !b.deletedAt).sort(bySort);
  // F2 ağaç kuralı: kendi başlıkları (sıralı) + o üstün şablon çocukları (şablon sırasıyla; bu konuda silinmişler hariç).
  const findTpl = (key: string) => nodes.find((n) => n.templateKey === key && rootOf(n) === rootId);
  const tplDeleted = (key: string) => !findTpl(key) && allNodes.some((n) => n.templateKey === key && n.deletedAt && rootOf(n) === rootId);
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  function rootOf(n: TopicNode): string {
    let cur: TopicNode | undefined = n;
    for (let i = 0; cur?.parentId && i < 40; i++) cur = byId.get(cur.parentId);
    return cur?.id ?? n.id;
  }
  const children = (parent: TopicNode): TopicNode[] => {
    const own = nodes.filter((n) => n.parentId === parent.id && !n.templateKey).sort(bySort);
    const parentKey = parent.id === rootId ? null : (parent.templateKey ?? undefined);
    const tpl =
      parentKey === undefined
        ? []
        : TEMPLATE.filter((t) => t.parent === parentKey && !tplDeleted(t.key))
            .map((t) => findTpl(t.key))
            .filter((x): x is TopicNode => !!x && x.parentId === parent.id)
            .sort((a, b) => (TPL_INDEX.get(a.templateKey ?? "") ?? 0) - (TPL_INDEX.get(b.templateKey ?? "") ?? 0));
    return [...own, ...tpl];
  };
  const filled = (n: TopicNode): boolean => notesOf(n.id).length > 0 || children(n).some(filled);

  const noteParas = (hid: string): Paragraph[] =>
    notesOf(hid).flatMap((n) => {
      ctx.report.notes++;
      const out: Paragraph[] = [new Paragraph({ heading: HeadingLevel.HEADING_4, text: n.title || "Adsız not" }), ...partParas(n, ctx)];
      for (const b of boxesOf(n.id)) {
        ctx.report.boxes++;
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_5, text: b.title || "Adsız kutu" }), ...partParas(b, ctx));
      }
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `Oluşturuldu ${fmtDate(n.createdAt)} · Son güncelleme ${fmtDate(n.contentUpdatedAt ?? n.updatedAt)}`, size: 16, color: "6F7A84" })],
          spacing: { after: 160 },
        }),
      );
      return out;
    });

  const body: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: root.title })] }),
    new Paragraph({
      children: [new TextRun({ text: `Şifa Rehberi · ${(opts.generatedAt ?? new Date()).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ })}`, color: "047857" })],
      spacing: { after: 240 },
    }),
    ...noteParas(rootId),
  ];
  const walk = (parent: TopicNode, depth: number) => {
    for (const k of children(parent)) {
      if (!filled(k)) continue;
      ctx.report.headings++;
      body.push(new Paragraph({ heading: depth === 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, text: k.title }));
      body.push(...noteParas(k.id));
      walk(k, depth + 1);
    }
  };
  walk(root, 1);
  body.push(new Paragraph({ children: [new TextRun({ text: DISCLAIMER, italics: true, size: 16, color: "64748B" })], spacing: { before: 360 } }));
  const doc = new Document({
    creator: "Yaşam Sistemi — Şifa Rehberi",
    title: root.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: body }],
  });
  const buffer = await Packer.toBuffer(doc);
  const safeName = root.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Sifa-Rehberi";
  return { buffer, report: ctx.report, fileName: `${safeName}.docx` };
}
