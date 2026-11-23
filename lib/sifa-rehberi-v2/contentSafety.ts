/**
 * Editör içeriği güvenlik süzgeci (prototip). Kayıttan ÖNCE çalışır; sunucuda da aynısı zorunlu.
 *  - Yalnız izinli düğüm/işaret tipleri kalır (bilinmeyen tip → düşürülür, metni korunur).
 *  - Bağlantı: yalnız http/https/mailto. javascript:, data: vb. → bağlantı kaldırılır, metin kalır.
 *  - Görsel: yalnız data:image/(png|jpeg|webp|gif) (prototip) veya https.
 *  - Renk: yalnız #rrggbb.
 * Gerçek üründe görseller özel bucket'a yüklenir; src yerine kalıcı dosya kimliği saklanır.
 */
import type { JSONContent } from "@tiptap/core";

const NODE_TYPES = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem",
  "blockquote", "hardBreak", "horizontalRule", "table", "tableRow", "tableCell", "tableHeader", "figure",
]);
const MARK_TYPES = new Set(["bold", "italic", "underline", "strike", "link", "textStyle"]);

export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const h = href.trim();
  return /^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h);
}

/** Kalıcı kayıtta görsel referansı: sifa-asset:<uuid> (nesneye erişim sunucuda yetkiyle imzalanır). */
export const ASSET_SRC_RE = /^sifa-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) || /^https:\/\/[^\s]+$/i.test(src) || ASSET_SRC_RE.test(src);
}

/** İçerikte başvurulan kalıcı görsel kimlikleri (sifa-asset:<uuid>). */
export function assetIdsIn(node: JSONContent | null | undefined, out: Set<string> = new Set()): Set<string> {
  if (!node) return out;
  if (node.type === "figure") {
    const m = ASSET_SRC_RE.exec(String(node.attrs?.src ?? ""));
    if (m) out.add(m[1]);
  }
  for (const c of node.content ?? []) assetIdsIn(c, out);
  return out;
}

/** DOI biçimi: 10.<kayıt kodu>/<sonek> */
export function normalizeDoi(raw: string): string | null {
  const t = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/\S+$/.test(t) ? t : null;
}

function cleanMarks(marks: JSONContent["marks"]): JSONContent["marks"] {
  if (!marks) return undefined;
  const out = [];
  for (const m of marks) {
    if (!MARK_TYPES.has(m.type)) continue;
    if (m.type === "link") {
      if (!isSafeHref(m.attrs?.href)) continue;
      out.push({ type: "link", attrs: { href: String(m.attrs!.href).trim(), target: "_blank", rel: "noopener noreferrer nofollow" } });
      continue;
    }
    if (m.type === "textStyle") {
      const color = m.attrs?.color;
      if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) out.push({ type: "textStyle", attrs: { color } });
      continue;
    }
    out.push({ type: m.type });
  }
  return out.length ? out : undefined;
}

export function sanitizeContent(node: JSONContent | null | undefined): JSONContent | null {
  if (!node || typeof node !== "object") return null;
  if (!node.type || !NODE_TYPES.has(node.type)) {
    // Bilinmeyen kapsayıcı → çocuklarını paragraf içinde koru.
    const kids = (node.content ?? []).map(sanitizeContent).filter(Boolean) as JSONContent[];
    return kids.length ? { type: "paragraph", content: kids.filter((k) => k.type === "text") } : null;
  }
  if (node.type === "text") {
    return { type: "text", text: String(node.text ?? ""), marks: cleanMarks(node.marks) };
  }
  if (node.type === "figure") {
    if (!isSafeImageSrc(node.attrs?.src)) return null;
    return {
      type: "figure",
      attrs: {
        src: node.attrs!.src,
        alt: String(node.attrs?.alt ?? "").slice(0, 300),
        caption: String(node.attrs?.caption ?? "").slice(0, 500),
      },
    };
  }
  const out: JSONContent = { type: node.type };
  if (node.type === "heading") {
    const level = Number(node.attrs?.level);
    out.attrs = { level: level === 2 || level === 3 || level === 4 ? level : 3 };
  } else if (node.type === "orderedList") {
    out.attrs = { start: Number(node.attrs?.start) > 0 ? Number(node.attrs?.start) : 1 };
  } else if (node.type === "tableCell" || node.type === "tableHeader") {
    out.attrs = {
      colspan: Math.max(1, Number(node.attrs?.colspan) || 1),
      rowspan: Math.max(1, Number(node.attrs?.rowspan) || 1),
      colwidth: Array.isArray(node.attrs?.colwidth) ? node.attrs!.colwidth : null,
    };
  }
  if (node.content) {
    out.content = node.content.map(sanitizeContent).filter(Boolean) as JSONContent[];
  }
  return out;
}
