"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useClinicalNotes } from "../hooks/useClinicalNotes";
import { importTextFromWordFile } from "../lib/wordImport";
import {
  EMPTY_NOTE_DRAFT,
  newAttachmentId,
  savedToDraft,
  todayDateInputValue,
} from "../lib/noteStorage";
import { MAX_ATTACHMENT_BYTES, readFileAsDataUrl } from "../lib/readAttachmentFile";
import type { ClinicalNoteFormDraft, ClinicalNotesTab, NoteAttachment, SavedClinicalNote } from "../types";
import { KayitliNotlarTab } from "./KayitliNotlarTab";
import { NotKaydiTab } from "./NotKaydiTab";
import { NoteContentModal } from "./NoteContentModal";
import { NoteSaveToast } from "./NoteSaveToast";

export function KlinikNotlarLayout() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { notes, hydrated, saveNote, deleteNote } = useClinicalNotes();

  const [activeTab, setActiveTab] = useState<ClinicalNotesTab>("kayit");
  const [draft, setDraft] = useState<ClinicalNoteFormDraft>(EMPTY_NOTE_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setDraft({ ...EMPTY_NOTE_DRAFT, date: todayDateInputValue() });
    setEditingId(null);
    setSelectedAttachmentId(null);
    setValidationMessage(null);
  }, []);

  const loadNoteIntoForm = useCallback((note: SavedClinicalNote) => {
    setDraft(savedToDraft(note));
    setEditingId(note.id);
    setSelectedAttachmentId(null);
    setValidationMessage(null);
    setActiveTab("kayit");
  }, []);

  const patchDraft = useCallback((patch: Partial<ClinicalNoteFormDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const validateTitle = (): boolean => {
    if (!draft.title.trim()) {
      setValidationMessage("Not başlığı zorunludur.");
      return false;
    }
    setValidationMessage(null);
    return true;
  };

  const showSavedToast = () => {
    setSaveToastVisible(true);
  };

  const dismissSaveToast = useCallback(() => {
    setSaveToastVisible(false);
  }, []);

  const handleSave = () => {
    if (editingId) {
      setValidationMessage("Güncelleme için Güncelle butonunu kullanın.");
      return;
    }
    if (!validateTitle()) return;

    const saved = saveNote(draft, null);
    if (!saved) {
      setValidationMessage("Kayıt yapılamadı.");
      return;
    }

    showSavedToast();
    resetForm();
  };

  const handleUpdate = () => {
    if (!editingId) {
      setValidationMessage("Güncellenecek not seçili değil.");
      return;
    }
    if (!validateTitle()) return;

    const saved = saveNote(draft, editingId);
    if (!saved) {
      setValidationMessage("Güncelleme yapılamadı.");
      return;
    }

    showToast({
      type: "success",
      message: "Not güncellendi.",
      duration: 2500,
    });
    setEditingId(saved.id);
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    const ok = await confirm({
      message: "Bu not silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;

    deleteNote(editingId);
    resetForm();
  };

  const handleDeleteFromList = (id: string) => {
    deleteNote(id);
    if (editingId === id) resetForm();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

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
        showToast({
          type: "error",
          message: `${file.name} okunamadı.`,
        });
      }
    }

    if (added.length > 0) {
      setDraft((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...added],
      }));
    }

    event.target.value = "";
  };

  const handleWordSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = await importTextFromWordFile(file);

    if (!result.ok) {
      const messages: Record<string, string> = {
        UNSUPPORTED:
          "Eski .doc formatı desteklenmiyor. .txt veya .docx kullanın ya da metni kopyalayıp yapıştırın.",
        EMPTY: "Dosyada aktarılacak metin bulunamadı.",
        FAILED: "Word dosyası okunamadı.",
        DEFLATE_UNSUPPORTED: "Tarayıcı .docx açmayı desteklemiyor. .txt dosyası deneyin.",
      };
      showToast({ type: "warning", message: messages[result.code] });
      return;
    }

    setDraft((prev) => ({
      ...prev,
      content: prev.content.trim()
        ? `${prev.content.trim()}\n\n${result.text}`
        : result.text,
    }));

    showToast({
      type: "success",
      message: "Metin not içeriğine eklendi.",
      duration: 2500,
    });
  };

  const handleRenameAttachment = () => {
    if (!selectedAttachmentId) {
      setValidationMessage("Önce listeden bir ek dosya seçin.");
      return;
    }

    const target = draft.attachments.find((a) => a.id === selectedAttachmentId);
    if (!target) return;

    const nextName = window.prompt("Yeni ek adı:", target.displayName);
    if (nextName == null) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      setValidationMessage("Ek adı boş olamaz.");
      return;
    }

    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.map((a) =>
        a.id === selectedAttachmentId ? { ...a, displayName: trimmed } : a,
      ),
    }));
    setValidationMessage(null);
  };

  const handleRemoveAttachment = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
    }));
    if (selectedAttachmentId === id) setSelectedAttachmentId(null);
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-6 py-6 xl:px-10">
        <div className="flex flex-wrap items-start gap-4">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-violet-300/95 bg-white/90 px-4 py-2.5 text-base font-extrabold text-violet-950 shadow-md ring-1 ring-violet-200/80 backdrop-blur-sm transition hover:border-violet-400 hover:bg-white"
          >
            <span aria-hidden>←</span>
            Ana Menü
          </Link>

          <header className="min-w-0 flex-1">
            <nav className="text-sm font-bold text-violet-700/90" aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link href="/refleksoloji" className="hover:text-violet-900">
                    Ana Menü
                  </Link>
                </li>
                <li aria-hidden className="text-violet-400">
                  &gt;
                </li>
                <li className="text-slate-700">Notlar</li>
              </ol>
            </nav>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Klinik Notlar
            </h1>
          </header>
        </div>

        <div
          className="mt-6 inline-flex rounded-2xl border border-violet-200/80 bg-white/80 p-1 shadow-sm ring-1 ring-violet-100/60"
          role="tablist"
          aria-label="Not sekmeleri"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "kayit"}
            onClick={() => setActiveTab("kayit")}
            className={`rounded-xl px-6 py-2.5 text-base font-bold transition ${
              activeTab === "kayit"
                ? "bg-violet-600 text-white shadow-md"
                : "text-violet-900 hover:bg-violet-50"
            }`}
          >
            Not Kaydı
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "liste"}
            onClick={() => setActiveTab("liste")}
            className={`rounded-xl px-6 py-2.5 text-base font-bold transition ${
              activeTab === "liste"
                ? "bg-violet-600 text-white shadow-md"
                : "text-violet-900 hover:bg-violet-50"
            }`}
          >
            Kayıtlı Notlar
          </button>
        </div>

        <div className="mt-6">
          {activeTab === "kayit" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void handleFilesSelected(e)}
              />
              <input
                ref={wordInputRef}
                type="file"
                accept=".txt,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => void handleWordSelected(e)}
              />
              <NotKaydiTab
                draft={draft}
                editingId={editingId}
                selectedAttachmentId={selectedAttachmentId}
                validationMessage={validationMessage}
                onDraftChange={patchDraft}
                onSelectAttachment={setSelectedAttachmentId}
                onNew={resetForm}
                onSave={handleSave}
                onUpdate={handleUpdate}
                onDelete={() => void handleDeleteCurrent()}
                onAddFileClick={() => fileInputRef.current?.click()}
                onRenameAttachment={handleRenameAttachment}
                onWordImportClick={() => wordInputRef.current?.click()}
                onRemoveAttachment={handleRemoveAttachment}
                onOpenEditor={() => setEditorOpen(true)}
              />
            </>
          ) : (
            <KayitliNotlarTab
              notes={notes}
              onEdit={loadNoteIntoForm}
              onDelete={handleDeleteFromList}
            />
          )}
        </div>
      </div>

      <NoteContentModal
        open={editorOpen}
        value={draft.content}
        onClose={() => setEditorOpen(false)}
        onSave={(content) => patchDraft({ content })}
      />

      <NoteSaveToast visible={saveToastVisible} onDismiss={dismissSaveToast} />
    </main>
  );
}
