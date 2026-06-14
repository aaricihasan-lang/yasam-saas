"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { deleteNoteById, getNoteById } from "../lib/noteActions";
import { formatNoteDate } from "../lib/noteFormat";
import {
  draftToSavedNote,
  loadNotesFromStorage,
  newAttachmentId,
  saveNotesToStorage,
  savedToDraft,
} from "../lib/noteStorage";
import {
  MAX_ATTACHMENT_BYTES,
  readFileAsDataUrl,
} from "../lib/readAttachmentFile";
import type { ClinicalNoteFormDraft, NoteAttachment } from "../types";
import { ImageLightbox } from "./ImageLightbox";
import { NoteDetayAttachmentCard } from "./NoteDetayAttachmentCard";
import { PdfPreviewModal } from "./PdfPreviewModal";

type NotDetayLayoutProps = {
  noteId: string;
};

const panelClass =
  "rounded-xl border border-purple-100/80 bg-white/80 p-3 shadow-sm";

const headerBtnBase =
  "inline-flex h-9 items-center justify-center border px-3 text-sm font-semibold rounded-lg shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45";

export function NotDetayLayout({ noteId }: NotDetayLayoutProps) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClinicalNoteFormDraft | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ src: string; title: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    const note = getNoteById(noteId);
    if (note) {
      setDraft(savedToDraft(note));
    } else {
      setDraft(null);
    }
  }, [noteId]);

  useEffect(() => {
    reload();
    setHydrated(true);
  }, [reload]);

  const patchDraft = (patch: Partial<ClinicalNoteFormDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleStartEdit = () => {
    reload();
    setEditing(true);
    setValidationMessage(null);
  };

  const handleCancelEdit = () => {
    reload();
    setEditing(false);
    setValidationMessage(null);
  };

  const handleUpdate = () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setValidationMessage("Not başlığı zorunludur.");
      return;
    }

    const list = loadNotesFromStorage();
    const previous = list.find((n) => n.id === noteId);
    if (!previous) return;

    const saved = draftToSavedNote(draft, {
      id: noteId,
      previous,
      existingIds: new Set(list.map((n) => n.id)),
    });

    if (!saved) {
      setValidationMessage("Güncelleme yapılamadı.");
      return;
    }

    const next = [saved, ...list.filter((n) => n.id !== noteId)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    saveNotesToStorage(next);

    setDraft(savedToDraft(saved));
    setEditing(false);
    setValidationMessage(null);

    showToast({
      type: "success",
      message: "Not güncellendi.",
      duration: 2500,
    });
  };

  const handleDeleteNote = async () => {
    const ok = await confirm({
      message: "Bu not silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    deleteNoteById(noteId);
    router.push("/refleksoloji/notlar");
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length || !draft) return;

    const added: NoteAttachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast({
          type: "warning",
          message: `${file.name} çok büyük (en fazla 4 MB).`,
        });
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        added.push({
          id: newAttachmentId(),
          displayName: file.name,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
        });
      } catch {
        showToast({ type: "error", message: `${file.name} okunamadı.` });
      }
    }

    if (added.length > 0) {
      patchDraft({ attachments: [...draft.attachments, ...added] });
    }

    event.target.value = "";
  };

  const handleRenameAttachment = async (file: NoteAttachment) => {
    const nextName = window.prompt("Yeni ek adı:", file.displayName);
    if (nextName == null) return;
    const trimmed = nextName.trim();
    if (!trimmed) {
      setValidationMessage("Ek adı boş olamaz.");
      return;
    }

    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        attachments: prev.attachments.map((a) =>
          a.id === file.id ? { ...a, displayName: trimmed } : a,
        ),
      };
    });
    setValidationMessage(null);
  };

  const handleRemoveAttachment = async (id: string) => {
    const ok = await confirm({
      message: "Bu ek dosya kaldırılsın mı?",
      confirmText: "Kaldır",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok || !draft) return;

    patchDraft({
      attachments: draft.attachments.filter((a) => a.id !== id),
    });
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] px-6">
        <p className="text-sm font-bold text-violet-900">Not bulunamadı.</p>
        <Link
          href="/refleksoloji/notlar"
          className="rounded-lg border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-950"
        >
          Notlara Dön
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-4 py-3 xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link
              href="/refleksoloji/notlar"
              className={`${headerBtnBase} shrink-0 gap-1.5 border-purple-200 bg-white text-purple-800`}
            >
              <span aria-hidden>←</span>
              Notlara Dön
            </Link>
            <header>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-600">
                Klinik Notlar
              </p>
              <h1 className="text-base font-bold text-slate-900 sm:text-lg">Not Detayı</h1>
            </header>
          </div>

          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={handleStartEdit}
                className={`${headerBtnBase} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700`}
              >
                Düzenle
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={`${headerBtnBase} border-slate-200 bg-slate-100 text-slate-700`}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleUpdate}
                  className={`${headerBtnBase} border-emerald-300 bg-emerald-100 text-emerald-800`}
                >
                  Güncelle
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleDeleteNote()}
              className={`${headerBtnBase} border-red-200 bg-red-50 text-red-700`}
            >
              Sil
            </button>
          </div>
        </div>

        {validationMessage ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
            {validationMessage}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          <section className={panelClass}>
            {editing ? (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-800">Not Başlığı</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => patchDraft({ title: e.target.value })}
                    className="w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-base font-bold text-slate-800">Tarih</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => patchDraft({ date: e.target.value })}
                    className="w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
                  />
                </label>
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold text-slate-900 sm:text-lg">{draft.title}</h2>
                <p className="mt-1 text-sm font-medium text-violet-600">
                  {formatNoteDate(draft.date)}
                </p>
              </>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold text-violet-900">Not İçeriği</h3>
            {editing ? (
              <textarea
                value={draft.content}
                onChange={(e) => patchDraft({ content: e.target.value })}
                rows={16}
                className="mt-4 w-full resize-y rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium leading-relaxed text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
              />
            ) : (
              <p className="mt-4 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {draft.content.trim() || "İçerik eklenmemiş."}
              </p>
            )}
          </section>

          <section className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-violet-900">Ek Dosyalar</h3>
              {editing ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFilesSelected(e)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-sky-300/80 bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-sky-200/90"
                  >
                    Dosya Ekle
                  </button>
                </>
              ) : null}
            </div>

            {draft.attachments.length === 0 ? (
              <p className="mt-4 text-base font-medium text-slate-500">Ek dosya yok.</p>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {draft.attachments.map((file) => (
                  <NoteDetayAttachmentCard
                    key={file.id}
                    file={file}
                    editing={editing}
                    onOpenImage={() =>
                      setLightbox({ src: file.dataUrl, alt: file.displayName })
                    }
                    onOpenPdf={() =>
                      setPdfPreview({ src: file.dataUrl, title: file.displayName })
                    }
                    onRename={() => void handleRenameAttachment(file)}
                    onRemove={() => void handleRemoveAttachment(file.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {lightbox ? (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {pdfPreview ? (
        <PdfPreviewModal
          src={pdfPreview.src}
          title={pdfPreview.title}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
    </main>
  );
}
