/**
 * Görsel + açıklama (figure/figcaption) düğümü. Tiptap çekirdeğinde hazır "figure" olmadığı için
 * küçük özel düğüm: atom (tek parça), seçilebilir; açıklama araç çubuğundaki
 * "Görsel açıklaması" ile düzenlenir. Kaydetmeden önce contentSafety.sanitizeContent süzer.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-sifa-figure]",
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector("img");
          const cap = (el as HTMLElement).querySelector("figcaption");
          return { src: img?.getAttribute("src") ?? null, alt: img?.getAttribute("alt") ?? "", caption: cap?.textContent ?? "" };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const caption = String(node.attrs.caption ?? "");
    const attrs = mergeAttributes({ "data-sifa-figure": "", class: "sifa-v2-figure" }, { "data-has-caption": caption ? "1" : "0" });
    void HTMLAttributes;
    return [
      "figure",
      attrs,
      ["img", { src: node.attrs.src, alt: node.attrs.alt || caption || "Görsel", loading: "lazy" }],
      ["figcaption", {}, caption || "Açıklama eklenmemiş"],
    ];
  },
});
