/**
 * Şifa Rehberi F3 — not / içerik kutusu metni: EKRAN (contenteditable HTML) ↔ KAYIT (güvenli Tiptap JSON).
 *
 * Onaylı F2 tasarımının yazı araçları yalnız Kalın, İtalik, Madde listesi ve Numaralı liste'dir. Kayıtta yalnız
 * bu yapı (+ satır sonu; eski kayıtlarda varsa altı çizili / üstü çizili / güvenli bağlantı) tutulur. Sunucu ayrıca
 * lib/sifa-rehberi-v2/contentSafety.ts süzgecini uygular (izinli düğüm/işaret, yalnız http/https/mailto bağlantı).
 *
 *  - jsonToHtml : SAF (DOM gerektirmez) — her metin kaçışlıdır; yalnız sabit etiketler üretilir.
 *  - htmlToJson : tarayıcıdaki DOMParser ile; bilinmeyen etiketler düşer, METNİ korunur.
 */
import type { JSONContent } from "@tiptap/core";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const SAFE_HREF = /^(https?:\/\/\S+|mailto:\S+)$/i;
type Mark = { type: string; attrs?: Record<string, unknown> };

function inlineHtml(nodes: JSONContent[] | undefined): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out += "<br>";
      continue;
    }
    if (n.type !== "text") {
      out += inlineHtml(n.content);
      continue;
    }
    let t = esc(String(n.text ?? ""));
    const marks = (n.marks ?? []) as Mark[];
    for (const m of marks) {
      if (m.type === "bold") t = `<b>${t}</b>`;
      else if (m.type === "italic") t = `<i>${t}</i>`;
      else if (m.type === "underline") t = `<u>${t}</u>`;
      else if (m.type === "strike") t = `<s>${t}</s>`;
      else if (m.type === "link") {
        const href = String(m.attrs?.href ?? "");
        if (SAFE_HREF.test(href)) t = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${t}</a>`;
      }
    }
    out += t;
  }
  return out;
}

function textOfNode(n: JSONContent): string {
  if (n.type === "text") return String(n.text ?? "");
  return (n.content ?? []).map(textOfNode).join(n.type === "tableRow" ? " " : "");
}

function blockHtml(n: JSONContent): string {
  switch (n.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return n.type === "blockquote" ? (n.content ?? []).map(blockHtml).join("") : `<p>${inlineHtml(n.content)}</p>`;
    case "bulletList":
    case "orderedList": {
      const tag = n.type === "bulletList" ? "ul" : "ol";
      return `<${tag}>${(n.content ?? []).map((li) => `<li>${(li.content ?? []).map(blockHtml).join("")}</li>`).join("")}</${tag}>`;
    }
    case "table":
      // Eski kayıt: tablo satırları düz paragraf olarak korunur (metin kaybı yok).
      return (n.content ?? []).map((row) => `<p>${esc(textOfNode(row))}</p>`).join("");
    case "figure":
    case "horizontalRule":
      return "";
    default:
      return n.content ? (n.content ?? []).map(blockHtml).join("") : "";
  }
}

/** Kayıt → ekran. Boş içerik "" (yazma alanının yer tutucusu görünsün). */
export function jsonToHtml(doc: JSONContent | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  const html = doc.content.map(blockHtml).join("");
  return html.replace(/(<p><\/p>)+$/, "") === "" ? "" : html;
}

const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SECTION", "ARTICLE"]);

function inlineJson(el: Node, marks: Mark[], out: JSONContent[]): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      const text = (child.nodeValue ?? "").replace(/\r?\n/g, " ");
      if (text) out.push(marks.length ? { type: "text", text, marks: marks.map((m) => ({ ...m })) } : { type: "text", text });
      continue;
    }
    if (child.nodeType !== 1) continue;
    const e = child as Element;
    const tag = e.tagName;
    if (tag === "BR") {
      out.push({ type: "hardBreak" });
      continue;
    }
    const next = [...marks];
    if (tag === "B" || tag === "STRONG") next.push({ type: "bold" });
    else if (tag === "I" || tag === "EM") next.push({ type: "italic" });
    else if (tag === "U") next.push({ type: "underline" });
    else if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.push({ type: "strike" });
    else if (tag === "A") {
      const href = (e.getAttribute("href") ?? "").trim();
      if (SAFE_HREF.test(href)) next.push({ type: "link", attrs: { href } });
    }
    inlineJson(e, next, out);
  }
}

function trimBreaks(inl: JSONContent[]): JSONContent[] {
  const a = [...inl];
  while (a.length && a[a.length - 1].type === "hardBreak") a.pop();
  return a;
}

function blocksJson(el: Node): JSONContent[] {
  const out: JSONContent[] = [];
  let pending: Node[] = [];
  const flush = () => {
    if (!pending.length) return;
    const frag = { childNodes: pending } as unknown as Node;
    const inl: JSONContent[] = [];
    inlineJson(frag, [], inl);
    const t = trimBreaks(inl);
    if (t.length) out.push({ type: "paragraph", content: t });
    pending = [];
  };
  for (const child of Array.from(el.childNodes)) {
    const tag = child.nodeType === 1 ? (child as Element).tagName : "";
    if (!BLOCK_TAGS.has(tag)) {
      pending.push(child);
      continue;
    }
    flush();
    if (tag === "UL" || tag === "OL") {
      const items = Array.from((child as Element).children)
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const inner = blocksJson(li);
          return { type: "listItem", content: inner.length ? inner : [{ type: "paragraph", content: [] }] };
        });
      if (items.length) out.push({ type: tag === "UL" ? "bulletList" : "orderedList", content: items });
      continue;
    }
    const hasBlockChild = Array.from((child as Element).childNodes).some((x) => x.nodeType === 1 && BLOCK_TAGS.has((x as Element).tagName));
    if (hasBlockChild) {
      out.push(...blocksJson(child));
      continue;
    }
    const inl: JSONContent[] = [];
    inlineJson(child, [], inl);
    out.push({ type: "paragraph", content: trimBreaks(inl) });
  }
  flush();
  return out;
}

/** Ekran → kayıt (tarayıcıda). Yalnız izinli yapı; her şeyden önce metin korunur. */
export function htmlToJson(html: string, parser: { parseFromString(s: string, t: "text/html"): Document }): JSONContent {
  const body = parser.parseFromString(`<!doctype html><body>${html ?? ""}</body>`, "text/html").body;
  const content = blocksJson(body).filter((b, i, arr) => !(b.type === "paragraph" && !(b.content ?? []).length && i === arr.length - 1));
  return { type: "doc", content };
}

/** Arama / Word / YH için düz metin (paragraflar satırla ayrılır). */
export function jsonToText(doc: JSONContent | null | undefined): string {
  const lines: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "paragraph" || n.type === "heading") {
      lines.push(textOfNode(n));
      return;
    }
    for (const c of n.content ?? []) walk(c);
  };
  if (doc) walk(doc);
  return lines.join("\n").trim();
}
