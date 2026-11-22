"use client";

/**
 * Salt-okunur içerik görünümü: editörle AYNI şema → generateHTML. İçerik önce
 * sanitizeContent'ten geçer (izinli düğüm/işaret, güvenli bağlantı/görsel).
 * Uzun içerik varsayılan olarak kısaltılır; "Tamamını göster" ile açılır.
 * `full`: Bütüncül Okuma için — hiçbir zaman kısaltılmaz (metnin tamamı görünür).
 */
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { generateHTML, type JSONContent } from "@tiptap/core";
import { buildExtensions } from "@/components/sifa-rehberi-v2/editorExtensions";
import { sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";

const EXTENSIONS = typeof window === "undefined" ? [] : buildExtensions();
const COLLAPSED_PX = 560;

export const RichView = memo(function RichView({ content, testId, full = false }: { content: JSONContent | null; testId?: string; full?: boolean }) {
  const html = useMemo(() => {
    const safe = sanitizeContent(content);
    if (!safe || typeof window === "undefined") return "";
    try {
      return generateHTML(safe, EXTENSIONS);
    } catch {
      return "";
    }
  }, [content]);
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    setTall(!full && (ref.current?.scrollHeight ?? 0) > COLLAPSED_PX + 80);
  }, [html, full]);

  if (!html) return null;
  return (
    <div>
      <div
        ref={ref}
        className="sifa-v2-rich relative overflow-hidden"
        style={tall && !open ? { maxHeight: COLLAPSED_PX } : undefined}
        data-testid={testId}
        // İçerik şema-serileştiricisinden geçer (generateHTML) ve önce sanitizeContent ile süzülür.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {tall ? (
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
