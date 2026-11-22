/**
 * Şifa Rehberi V2 — Word (.docx) raporu. İÇERİK KAYNAĞI = Bütüncül Okuma modeli (buildReading):
 * aynı başlıklar, aynı numaralar (1 / 1.1 / 1.1.1), aynı sıra; boş başlıklar rapora alınmaz.
 *
 * Desteklenen içerik: paragraf, başlık, kalın/italik/altı çizili/üstü çizili/renk, madde ve
 * numaralı listeler, alıntı, tablo, görsel (+ açıklama), bağlantı, kaynak/DOI listesi,
 * sınıf etiketi, ilişkili rahatsızlıklar ve bağlantılı konular (yalnız ad + aslının yeri).
 * Görsel: yalnız gömülü PNG/JPEG (data:) desteklenir — V1 Word ile aynı sınır. Diğer biçim ya da
 * çözülemeyen görsel ATLANMAZ-SESSİZCE değil: yerine "[görsel eklenemedi: …]" notu yazılır ve
 * `report.skippedImages` ile bildirilir.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import type { JSONContent } from "@tiptap/core";
import { sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import { buildReading, type ReadingSection } from "@/lib/sifa-rehberi-v2/reading";
import { BLOCK_CLASSES, type Block, type Workspace } from "@/lib/sifa-rehberi-v2/types";

export type WordReport = { headings: number; blocks: number; images: number; skippedImages: string[]; tables: number; links: number };

const MAX_IMG_W = 520;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const DISCLAIMER =
  "Bu rapordaki içerikler uzmanın kişisel araştırma notlarıdır; tıbbi tanı veya tedavi önerisi değildir. Sınıf etiketleri (Bilimsel / Geleneksel / Dinî / Uzman Notu) yalnızca düzen içindir, kanıt düzeyi belirtmez.";

/** data:image/(png|jpeg) → bayt + boyut (başlıktan okunur; tahmin yok). */
export function decodeImage(src: string): { data: Uint8Array; type: "png" | "jpg"; w: number; h: number } | null {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/.exec(src);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (m[1] === "png") {
    if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
    return { data: new Uint8Array(buf), type: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { data: new Uint8Array(buf), type: "jpg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

type Ctx = { report: WordReport };

function runs(nodes: JSONContent[] | undefined, ctx: Ctx, base: { bold?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    const color = marks.find((m) => m.type === "textStyle")?.attrs?.color;
    const link = marks.find((m) => m.type === "link")?.attrs?.href;
    const run = new TextRun({
      text: n.text,
      bold: base.bold || has("bold"),
      italics: has("italic"),
      underline: has("underline") || link ? {} : undefined,
      strike: has("strike"),
      color: typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : link ? "0F766E" : undefined,
    });
    if (typeof link === "string") {
      ctx.report.links++;
      out.push(new ExternalHyperlink({ link, children: [run] }));
    } else out.push(run);
  }
  return out;
}

function blockNodes(nodes: JSONContent[] | undefined, ctx: Ctx, list?: { ordered: boolean; level: number; counter: { n: number } }): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "paragraph":
        out.push(new Paragraph({ children: runs(n.content, ctx), spacing: { after: 120 } }));
        break;
      case "heading":
        // Kutu içi başlık: numaralı rapor başlıklarıyla karışmasın diye kalın paragraf.
        out.push(new Paragraph({ children: runs(n.content, ctx, { bold: true }), spacing: { before: 160, after: 80 } }));
        break;
      case "blockquote":
        for (const p of blockNodes(n.content, ctx)) out.push(p);
        break;
      case "bulletList":
      case "orderedList": {
        const counter = { n: Number(n.attrs?.start ?? 1) };
        for (const item of n.content ?? []) {
          const [first, ...rest] = item.content ?? [];
          const prefix = n.type === "orderedList" ? `${counter.n++}. ` : "";
          const children = first?.type === "paragraph" ? runs(first.content, ctx) : [];
          out.push(
            new Paragraph({
              children: [new TextRun({ text: prefix }), ...children],
              ...(n.type === "bulletList" ? { bullet: { level: Math.min(list ? list.level + 1 : 0, 8) } } : { indent: { left: 360 * ((list?.level ?? -1) + 2) } }),
              spacing: { after: 60 },
            }),
          );
          out.push(...blockNodes(first?.type === "paragraph" ? rest : item.content, ctx, { ordered: n.type === "orderedList", level: (list?.level ?? -1) + 1, counter }));
        }
        break;
      }
      case "table": {
        ctx.report.tables++;
        const rows = (n.content ?? []).map(
          (r) =>
            new TableRow({
              children: (r.content ?? []).map(
                (c) =>
                  new TableCell({
                    children: (() => {
                      const inner = blockNodes(c.content, ctx).filter((x): x is Paragraph => x instanceof Paragraph);
                      return inner.length ? inner : [new Paragraph("")];
                    })(),
                    shading: c.type === "tableHeader" ? { fill: "ECFDF5" } : undefined,
                  }),
              ),
            }),
        );
        if (rows.length) {
          out.push(
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "A7F3D0" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "A7F3D0" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "A7F3D0" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "A7F3D0" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
                insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
              },
            }),
          );
          out.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        }
        break;
      }
      case "figure": {
        const src = String(n.attrs?.src ?? "");
        const caption = String(n.attrs?.caption ?? "").trim();
        const img = decodeImage(src);
        if (!img || !img.w || !img.h) {
          const why = src.startsWith("data:image/") ? src.slice(5, src.indexOf(";")) : "harici/çözülemeyen kaynak";
          ctx.report.skippedImages.push(why);
          out.push(new Paragraph({ children: [new TextRun({ text: `[görsel eklenemedi: ${why}]`, italics: true, color: "64748B" })] }));
        } else {
          ctx.report.images++;
          const scale = Math.min(1, MAX_IMG_W / img.w);
          out.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.w * scale), height: Math.round(img.h * scale) } })],
            }),
          );
        }
        if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: caption, italics: true, color: "475569" })], spacing: { after: 120 } }));
        break;
      }
      case "horizontalRule":
        out.push(new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 } } }));
        break;
      default:
        if (n.content) out.push(...blockNodes(n.content, ctx));
    }
  }
  return out;
}

function blockOut(b: Block, ctx: Ctx): (Paragraph | Table)[] {
  ctx.report.blocks++;
  const label = b.classification ? BLOCK_CLASSES.find((c) => c.id === b.classification)?.label : null;
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: b.title, bold: true, size: 24 }), ...(label ? [new TextRun({ text: `   [${label}]`, color: "0F766E", size: 18 })] : [])],
      spacing: { before: 120, after: 80 },
    }),
  ];
  const safe = sanitizeContent(b.contentJson);
  out.push(...blockNodes(safe?.content, ctx));
  if (b.sources.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Kaynaklar", bold: true, size: 18, color: "047857" })], spacing: { before: 80 } }));
    b.sources.forEach((s, i) => {
      const parts: ParagraphChild[] = [new TextRun({ text: `${i + 1}. ${s.authors ? `${s.authors} ` : ""}${s.year ? `(${s.year}). ` : ""}` }), new TextRun({ text: s.title, bold: true })];
      if (s.doi) {
        ctx.report.links++;
        parts.push(new TextRun({ text: " · " }), new ExternalHyperlink({ link: `https://doi.org/${s.doi}`, children: [new TextRun({ text: `DOI: ${s.doi}`, color: "0F766E", underline: {} })] }));
      }
      if (s.url) {
        ctx.report.links++;
        parts.push(new TextRun({ text: " · " }), new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, color: "0F766E", underline: {} })] }));
      }
      out.push(new Paragraph({ children: parts, spacing: { after: 40 } }));
    });
  }
  return out;
}

function sectionOut(s: ReadingSection, ctx: Ctx): (Paragraph | Table)[] {
  ctx.report.headings++;
  const out: (Paragraph | Table)[] = [new Paragraph({ heading: HEADINGS[Math.min(s.depth, 6) - 1], text: `${s.number}  ${s.depth === 1 ? s.node.title.toLocaleUpperCase("tr-TR") : s.node.title}` })];
  if (s.related?.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Bu konuyla ilişkili rahatsızlıklar: ", bold: true })], spacing: { after: 40 } }));
    for (const e of s.related) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: e.node.title }), ...(e.kind === "bagli" ? [new TextRun({ text: ` (bağlı kayıt · aslı: ${e.originPath.slice(0, -1).join(" › ")})`, italics: true, color: "0F766E" })] : [])] }));
    }
  }
  for (const b of s.blocks) out.push(...blockOut(b, ctx));
  if (s.links.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Bağlantılı: ", bold: true }), new TextRun({ text: s.links.map((l) => `${l.node.title} (aslı: ${l.originPath.slice(0, -1).join(" › ") || "ana konu"})`).join("; ") })] }));
  }
  for (const c of s.children) out.push(...sectionOut(c, ctx));
  return out;
}

/** Tek ana konunun Word belgesi. Yalnız verilen çalışma alanındaki (=uzmanın kendi) veriler. */
export async function buildTopicWord(ws: Workspace, rootId: string, opts: { generatedAt?: Date } = {}): Promise<{ buffer: Buffer; report: WordReport; fileName: string } | null> {
  const reading = buildReading(ws, rootId);
  if (!reading) return null;
  const ctx: Ctx = { report: { headings: 0, blocks: 0, images: 0, skippedImages: [], tables: 0, links: 0 } };
  const when = (opts.generatedAt ?? new Date()).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: reading.root.title.toLocaleUpperCase("tr-TR") })] }),
    new Paragraph({ children: [new TextRun({ text: `Şifa Rehberi — Bütüncül Okuma · ${when}`, color: "047857" })], spacing: { after: 240 } }),
  ];
  for (const b of reading.rootBlocks) children.push(...blockOut(b, ctx));
  for (const s of reading.sections) children.push(...sectionOut(s, ctx));
  if (reading.rootLinks.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Bağlantılı konular" }));
    for (const l of reading.rootLinks) children.push(new Paragraph({ bullet: { level: 0 }, text: `${l.node.title} (içerik kendi konusunda · aslı: ${l.originPath.slice(0, -1).join(" › ") || "ana konu"})` }));
  }
  children.push(new Paragraph({ children: [new TextRun({ text: DISCLAIMER, italics: true, size: 16, color: "64748B" })], spacing: { before: 360 } }));
  const doc = new Document({
    creator: "Yaşam Sistemi — Şifa Rehberi",
    title: `${reading.root.title} — Bütüncül Okuma`,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(doc);
  const safeName = reading.root.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Sifa-Rehberi";
  return { buffer, report: ctx.report, fileName: `${safeName} - Butuncul Okuma.docx` };
}
