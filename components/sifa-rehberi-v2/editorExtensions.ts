/**
 * Editör ve salt-okunur görünüm AYNI şemayı kullanır → kaydedilen içerik her yerde aynı görünür.
 * Tümü MIT lisanslı açık kaynak Tiptap paketleri (Pro/ücretli eklenti YOK).
 */
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Figure } from "@/components/sifa-rehberi-v2/figureExtension";
import { isSafeHref } from "@/lib/sifa-rehberi-v2/contentSafety";

export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: false,
      code: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
      },
    }),
    TextStyle,
    Color,
    TableKit.configure({ table: { resizable: false } }),
    Figure,
  ];
}

export const TEXT_COLORS: readonly { label: string; value: string }[] = [
  { label: "Koyu yeşil", value: "#047857" },
  { label: "Turkuaz", value: "#0e7490" },
  { label: "Lacivert", value: "#1e3a8a" },
  { label: "Mor", value: "#6d28d9" },
  { label: "Kırmızı", value: "#be123c" },
  { label: "Turuncu", value: "#c2410c" },
];
