"use client";

/**
 * İçerik kutusu editörü (Tiptap 3, MIT). OTOMATİK KAYIT YOK: her değişiklik yalnız sayfa
 * taslağına yazılır; kalıcı kayıt üstteki "Kaydet" ile yapılır.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { buildExtensions, TEXT_COLORS } from "@/components/sifa-rehberi-v2/editorExtensions";
import { PromptDialog } from "@/components/sifa-rehberi-v2/Modal";
import { isSafeHref } from "@/lib/sifa-rehberi-v2/contentSafety";

const MAX_IMAGE_EDGE = 1400;

async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function TBtn({
  label,
  onClick,
  active,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-[13px] font-bold transition disabled:opacity-35 ${
        active ? "bg-emerald-600 text-white shadow-sm" : "text-slate-700 hover:bg-emerald-50"
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" aria-hidden />;

const EMPTY_STATE = {
  bold: false, italic: false, underline: false, h2: false, h3: false, bullet: false, ordered: false,
  link: false, inTable: false, figure: false, canUndo: false, canRedo: false, color: null as string | null,
};

function readState(ed: Editor) {
  const sel = ed.state.selection;
  return {
    bold: ed.isActive("bold"),
    italic: ed.isActive("italic"),
    underline: ed.isActive("underline"),
    h2: ed.isActive("heading", { level: 2 }),
    h3: ed.isActive("heading", { level: 3 }),
    bullet: ed.isActive("bulletList"),
    ordered: ed.isActive("orderedList"),
    link: ed.isActive("link"),
    inTable: ed.isActive("table"),
    figure: sel instanceof NodeSelection && sel.node.type.name === "figure",
    canUndo: ed.can().undo(),
    canRedo: ed.can().redo(),
    color: (ed.getAttributes("textStyle").color as string | undefined) ?? null,
  };
}

type Dialog = null | { kind: "link"; initial: string } | { kind: "caption"; initial: string } | { kind: "newImage"; src: string; alt: string };

export function RichEditor({
  initial,
  onChange,
  testId,
  simple = false,
}: {
  initial: JSONContent | null;
  onChange: (json: JSONContent, text: string) => void;
  testId?: string;
  /** Basit Görünüm: renk ve başlık biçimleri gizli; görsel/tablo/bağlantı düğmeleri yazılı. Şema AYNI. */
  simple?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: initial ?? { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "sifa-v2-rich sifa-v2-editable min-h-[160px] px-4 py-3 outline-none",
        "aria-label": "İçerik editörü",
        "data-testid": testId ?? "rich-editor",
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current(ed.getJSON(), ed.getText({ blockSeparator: "\n" })),
  });

  // Araç çubuğu durumu her işlemde doğrudan editörden okunur (shouldRerenderOnTransaction).
  const live = editor ? readState(editor) : null;

  const s = live ?? EMPTY_STATE;
  if (!editor) {
    return <div className="min-h-[160px] animate-pulse rounded-2xl bg-slate-50" />;
  }
  const ed: Editor = editor;
  const chain = () => ed.chain().focus();

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return;
    const src = await fileToDataUrl(file);
    setDialog({ kind: "newImage", src, alt: file.name.replace(/\.[a-z0-9]+$/i, "") });
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm" data-testid="rich-editor-wrap">
      <div
        role="toolbar"
        aria-label="Biçimlendirme"
        className={`sticky top-[64px] z-[5] flex items-center gap-0.5 rounded-t-2xl border-b border-emerald-50 bg-white/95 px-1.5 py-1 backdrop-blur max-lg:top-[56px] ${
          simple ? "flex-wrap" : "overflow-x-auto"
        }`}
      >
        <TBtn label="Kalın" active={s.bold} onClick={() => chain().toggleBold().run()} testId="tb-bold"><b>K</b></TBtn>
        <TBtn label="İtalik" active={s.italic} onClick={() => chain().toggleItalic().run()} testId="tb-italic"><i className="font-serif">İ</i></TBtn>
        <TBtn label="Altı çizili" active={s.underline} onClick={() => chain().toggleUnderline().run()} testId="tb-underline"><u>A</u></TBtn>
        {simple ? null : (
        <div className="relative shrink-0">
          <TBtn label="Yazı rengi" active={!!s.color} onClick={() => setColorOpen((v) => !v)} testId="tb-color">
            <span className="flex flex-col items-center leading-none">
              <span>A</span>
              <span className="mt-0.5 h-1 w-4 rounded" style={{ background: s.color ?? "#0f172a" }} />
            </span>
          </TBtn>
        </div>
        )}
        {simple ? null : (
          <>
            <Sep />
            <TBtn label="Büyük başlık" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} testId="tb-h2">B1</TBtn>
            <TBtn label="Küçük başlık" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} testId="tb-h3">B2</TBtn>
            <TBtn label="Paragraf" onClick={() => chain().setParagraph().run()}>¶</TBtn>
          </>
        )}
        <Sep />
        <TBtn label="Madde işaretli liste" active={s.bullet} onClick={() => chain().toggleBulletList().run()} testId="tb-bullet">•≡</TBtn>
        <TBtn label="Numaralı liste" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} testId="tb-ordered">1≡</TBtn>
        <Sep />
        <TBtn
          label="Bağlantı"
          active={s.link}
          testId="tb-link"
          onClick={() => setDialog({ kind: "link", initial: (ed.getAttributes("link").href as string | undefined) ?? "https://" })}
        >
          {simple ? "🔗 Bağlantı" : "🔗"}
        </TBtn>
        <TBtn label="Tablo ekle" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} testId="tb-table">
          {simple ? "▦ Tablo" : "▦"}
        </TBtn>
        <TBtn label="Görsel ekle" onClick={() => fileRef.current?.click()} testId="tb-image">
          {simple ? "🖼 Görsel" : "🖼"}
        </TBtn>
        {s.figure ? (
          <TBtn
            label="Görsel açıklaması"
            testId="tb-caption"
            onClick={() => {
              const sel = ed.state.selection as NodeSelection;
              setDialog({ kind: "caption", initial: String(sel.node.attrs.caption ?? "") });
            }}
          >
            ✎ Açıklama
          </TBtn>
        ) : null}
        {s.inTable ? (
          <>
            <Sep />
            <TBtn label="Alta satır ekle" onClick={() => chain().addRowAfter().run()} testId="tb-row">+Satır</TBtn>
            <TBtn label="Sağa sütun ekle" onClick={() => chain().addColumnAfter().run()}>+Sütun</TBtn>
            <TBtn label="Satırı sil" onClick={() => chain().deleteRow().run()}>−Satır</TBtn>
            <TBtn label="Sütunu sil" onClick={() => chain().deleteColumn().run()}>−Sütun</TBtn>
            <TBtn label="Tabloyu sil" onClick={() => chain().deleteTable().run()}>✕Tablo</TBtn>
          </>
        ) : null}
        <Sep />
        <TBtn label="Geri al" disabled={!s.canUndo} onClick={() => chain().undo().run()}>↶</TBtn>
        <TBtn label="Yinele" disabled={!s.canRedo} onClick={() => chain().redo().run()}>↷</TBtn>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          data-testid="tb-image-input"
          onChange={(e) => {
            void onPickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {colorOpen ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-emerald-50 bg-emerald-50/40 px-3 py-2" data-testid="color-palette">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                chain().setColor(c.value).run();
                setColorOpen(false);
              }}
              className="h-7 w-7 rounded-full ring-2 ring-white shadow"
              style={{ background: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              chain().unsetColor().run();
              setColorOpen(false);
            }}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600"
          >
            Varsayılan
          </button>
        </div>
      ) : null}
      <EditorContent editor={ed} />

      {dialog?.kind === "link" ? (
        <PromptDialog
          title="Bağlantı ekle"
          subtitle="Seçili metne bağlantı verilir. Metin seçili değilse adres metin olarak eklenir. Boş bırakılırsa bağlantı kaldırılır."
          label="Adres (https://…)"
          initial={dialog.initial}
          allowEmpty
          confirmText="Uygula"
          onCancel={() => setDialog(null)}
          onSubmit={(raw) => {
            const v = raw.trim();
            if (!v || v === "https://") {
              chain().extendMarkRange("link").unsetLink().run();
              setDialog(null);
              return null;
            }
            const href = /^[a-z]+:/i.test(v) ? v : `https://${v}`;
            if (!isSafeHref(href)) return "Yalnız http, https veya e-posta (mailto) bağlantıları eklenebilir.";
            if (ed.state.selection.empty && !ed.isActive("link")) {
              chain().insertContent({ type: "text", text: v, marks: [{ type: "link", attrs: { href } }] }).run();
            } else {
              chain().extendMarkRange("link").setLink({ href }).run();
            }
            setDialog(null);
            return null;
          }}
        />
      ) : null}
      {dialog?.kind === "caption" ? (
        <PromptDialog
          title="Görsel açıklaması"
          label="Açıklama"
          initial={dialog.initial}
          allowEmpty
          confirmText="Uygula"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            chain().updateAttributes("figure", { caption: v.trim() }).run();
            setDialog(null);
            return null;
          }}
        />
      ) : null}
      {dialog?.kind === "newImage" ? (
        <PromptDialog
          title="Görsel ekle"
          subtitle="Görselin altında görünecek açıklamayı yazın (isteğe bağlı)."
          label="Görsel açıklaması"
          placeholder="Ör. Şekil 1 — sentetik örnek görsel"
          allowEmpty
          confirmText="Görseli ekle"
          testId="image-caption-dialog"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            chain().insertContent({ type: "figure", attrs: { src: dialog.src, alt: dialog.alt, caption: v.trim() } }).run();
            setDialog(null);
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
