/**
 * Görsel + açıklama (figure/figcaption) düğümü. Tiptap çekirdeğinde hazır "figure" olmadığı için
 * küçük özel düğüm: atom (tek parça), seçilebilir; açıklama araç çubuğundaki
 * "Görsel açıklaması" ile düzenlenir. Kaydetmeden önce contentSafety.sanitizeContent süzer.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { assetIdOf, BLANK_IMG, invalidateAsset, resolveAssetSrc, subscribeAssets } from "@/lib/sifa-rehberi-v2/assetClient";

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

  /**
   * Editör içi görünüm: `sifa-asset:<uuid>` kaynağı kısa ömürlü imzalı bağlantıyla GÖSTERİLİR (yalnız
   * ekranda; düğümün `src` niteliği — kaydedilen değer — değişmez). generateHTML bu görünümü kullanmaz.
   */
  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement("figure");
      dom.setAttribute("data-sifa-figure", "");
      dom.className = "sifa-v2-figure";
      const img = document.createElement("img");
      img.loading = "lazy";
      const cap = document.createElement("figcaption");
      dom.append(img, cap);
      const paint = () => {
        const caption = String(current.attrs.caption ?? "");
        const src = String(current.attrs.src ?? "");
        const id = assetIdOf(src);
        const r = resolveAssetSrc(src);
        img.src = r.url ?? BLANK_IMG;
        img.alt = String(current.attrs.alt || caption || "Görsel");
        if (id) {
          img.setAttribute("data-sifa-asset", id);
          img.setAttribute("data-asset-state", r.url ? "ok" : r.failed ? "yok" : "yukleniyor");
        } else {
          img.removeAttribute("data-sifa-asset");
          img.removeAttribute("data-asset-state");
        }
        dom.setAttribute("data-has-caption", caption ? "1" : "0");
        cap.textContent = caption || "Açıklama eklenmemiş";
      };
      img.addEventListener("error", () => {
        const id = img.getAttribute("data-sifa-asset");
        if (id && img.getAttribute("data-asset-state") === "ok") invalidateAsset(id);
      });
      const unsubscribe = subscribeAssets(paint);
      paint();
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
        destroy: unsubscribe,
        ignoreMutation: () => true,
      };
    };
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
