"use client";

/**
 * Salt-okunur içerik görünümü: editörle AYNI şema → generateHTML. İçerik önce
 * sanitizeContent'ten geçer (izinli düğüm/işaret, güvenli bağlantı/görsel).
 * Uzun içerik varsayılan olarak kısaltılır; "Tamamını göster" ile açılır.
 * `full`: Bütüncül Okuma için — hiçbir zaman kısaltılmaz (metnin tamamı görünür).
 *
 * Görsel: `sifa-asset:<uuid>` kaynakları ekrana basılmadan önce kısa ömürlü imzalı bağlantıya çevrilir
 * (yalnız bellekte; içerik değişmez). Eski base64 görseller olduğu gibi gösterilir.
 * Arama: etkin aramanın eşleşmeleri yalnız ekranda <mark> ile işaretlenir; eşleşme varsa kutu kısaltılmaz.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { generateHTML, type JSONContent } from "@tiptap/core";
import { buildExtensions } from "@/components/sifa-rehberi-v2/editorExtensions";
import { highlightHtml, useHighlightQuery } from "@/components/sifa-rehberi-v2/highlight";
import { sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import { assetIdOf, assetsVersion, BLANK_IMG, invalidateAsset, resolveAssetSrc, subscribeAssets } from "@/lib/sifa-rehberi-v2/assetClient";

const EXTENSIONS = typeof window === "undefined" ? [] : buildExtensions();
const COLLAPSED_PX = 560;
const ASSET_IMG_RE = /<img([^>]*?)\ssrc="(sifa-asset:[0-9a-f-]{36})"([^>]*)>/g;

/** sifa-asset kaynaklarını çözülmüş bağlantıyla değiştirir (çözülmediyse yer tutucu + durum işareti). */
function withAssetUrls(html: string): string {
  if (!html.includes("sifa-asset:")) return html;
  return html.replace(ASSET_IMG_RE, (_m, a: string, src: string, b: string) => {
    const id = assetIdOf(src) ?? "";
    const r = resolveAssetSrc(src);
    const state = r.url ? "ok" : r.failed ? "yok" : "yukleniyor";
    const url = (r.url ?? BLANK_IMG).replace(/"/g, "&quot;");
    return `<img${a} src="${url}" data-sifa-asset="${id}" data-asset-state="${state}"${b}>`;
  });
}

export const RichView = memo(function RichView({ content, testId, full = false }: { content: JSONContent | null; testId?: string; full?: boolean }) {
  const fq = useHighlightQuery();
  const assetsVer = useSyncExternalStore(subscribeAssets, assetsVersion, () => 0);
  const base = useMemo(() => {
    const safe = sanitizeContent(content);
    if (!safe || typeof window === "undefined") return "";
    try {
      return generateHTML(safe, EXTENSIONS);
    } catch {
      return "";
    }
  }, [content]);
  const marked = useMemo(() => highlightHtml(base, fq), [base, fq]);
  // assetsVer: imzalı bağlantı geldiğinde/yenilendiğinde yeniden çöz.
  const html = useMemo(() => (assetsVer >= 0 ? withAssetUrls(marked.html) : marked.html), [marked.html, assetsVer]);
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    setTall(!full && (ref.current?.scrollHeight ?? 0) > COLLAPSED_PX + 80);
  }, [html, full]);
  // Süresi dolmuş/geçersiz imzalı bağlantı: görsel yüklenemezse yenisi istenir (olay kabarcıklanmaz → yakalama).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onErr = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const id = t?.getAttribute?.("data-sifa-asset");
      if (id && t?.getAttribute("data-asset-state") === "ok") invalidateAsset(id);
    };
    el.addEventListener("error", onErr, true);
    return () => el.removeEventListener("error", onErr, true);
  }, []);

  if (!html) return null;
  // Etkin aramanın eşleşmesi varsa kutu kısaltılmaz (sarı işaretler gizli kalmasın).
  const collapsed = tall && !open && marked.hits === 0;
  return (
    <div>
      <div
        ref={ref}
        className="sifa-v2-rich relative overflow-hidden"
        style={collapsed ? { maxHeight: COLLAPSED_PX } : undefined}
        data-testid={testId}
        data-hits={marked.hits || undefined}
        // İçerik şema-serileştiricisinden geçer (generateHTML) ve önce sanitizeContent ile süzülür;
        // vurgulama yalnız <mark> ekler, görsel kaynağı yalnız sunucunun imzaladığı bağlantıyla değişir.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {tall && marked.hits === 0 ? (
        <div className={`relative ${open ? "" : "-mt-16 pt-12 bg-gradient-to-t from-white via-white/95 to-transparent"}`}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mx-auto flex min-h-[40px] items-center rounded-full border border-emerald-200 bg-white px-4 text-[13px] font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
            data-testid="toggle-long"
          >
            {open ? "Kısalt ▲" : "Tamamını göster ▼"}
          </button>
        </div>
      ) : null}
    </div>
  );
});
