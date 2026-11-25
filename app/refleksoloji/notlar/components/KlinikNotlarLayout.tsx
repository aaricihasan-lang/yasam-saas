"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useCallback, useRef, useState } from "react";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { useClinicalNotes } from "../hooks/useClinicalNotes";
import { importTextFromWordFile } from "../lib/wordImport";
import {
  EMPTY_NOTE_DRAFT,
  newAttachmentId,
  savedToDraft,
  todayDateInputValue,
} from "../lib/noteStorage";
import { ATTACHMENT_ACCEPT, readNoteAttachments } from "../lib/readAttachmentFile";
import type { ClinicalNoteFormDraft, ClinicalNotesTab, SavedClinicalNote } from "../types";
import { KayitliNotlarTab } from "./KayitliNotlarTab";
import { NotKaydiTab } from "./NotKaydiTab";
import { NoteContentModal } from "./NoteContentModal";
import { NoteSaveToast } from "./NoteSaveToast";
import { SyncStatusBadge } from "@/app/refleksoloji/components/SyncStatusBadge";
import { RefleksolojiListLoading } from "@/app/refleksoloji/components/RefleksolojiSkeleton";
import { LegacyQuarantineBanner } from "@/app/refleksoloji/components/LegacyQuarantineBanner";
import type { DeleteNoteOutcome } from "../lib/notesSync";

export function KlinikNotlarLayout() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { confirm } = useConfirm();
  const tc = useTranslations("reflexology.common");
  const t = useTranslations("reflexology.notes");
  // Kaynak dilde (tr) yardımcı/senkron katmanının Türkçe mesajları aynen; diğer dillerde çevrilmiş genel metin.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const { showToast } = useToast();
  const {
    notes,
    hydrated,
    serverState,
    saveNote,
    deleteNote,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
  } = useClinicalNotes();
  const [deleting, setDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState<ClinicalNotesTab>("kayit");
  const [draft, setDraft] = useState<ClinicalNoteFormDraft>(EMPTY_NOTE_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  // RF-10: düzenleme başlarken görülen sürüm (bayat sekme sessiz ezme koruması).
  const [editingSince, setEditingSince] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setDraft({ ...EMPTY_NOTE_DRAFT, date: todayDateInputValue() });
    setEditingId(null);
    setEditingSince(null);
    setSelectedAttachmentId(null);
    setValidationMessage(null);
  }, []);

  const loadNoteIntoForm = useCallback((note: SavedClinicalNote) => {
    setDraft(savedToDraft(note));
    setEditingId(note.id);
    setEditingSince(note.updatedAt);
    setSelectedAttachmentId(null);
    setValidationMessage(null);
    setActiveTab("kayit");
  }, []);

  const patchDraft = useCallback((patch: Partial<ClinicalNoteFormDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const validateTitle = (): boolean => {
    if (!draft.title.trim()) {
      setValidationMessage(t("form.titleRequired"));
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
      setValidationMessage(t("form.useUpdate"));
      return;
    }
    if (!validateTitle()) return;

    const result = saveNote(draft, null);
    if (!result.saved) {
      setValidationMessage(t("form.saveFailed"));
      return;
    }
    if (!result.storageOk) {
      showToast({ type: "error", title: tc("storageErrorTitle"), message: isSourceLocale ? STORAGE_QUOTA_ERROR_MESSAGE : tc("storageQuota") });
      return;
    }

    showSavedToast();
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingId) {
      setValidationMessage(t("form.noSelection"));
      return;
    }
    if (!validateTitle()) return;

    let result = saveNote(draft, editingId, { expectedUpdatedAt: editingSince });
    if (result.conflict) {
      // RF-10: başka sekme/cihaz bu notu siz düzenlerken değiştirdi → sessiz ezme YOK.
      const overwrite = await confirm({
        title: t("conflict.title"),
        message: t("conflict.message"),
        confirmText: t("conflict.overwrite"),
        cancelText: tc("cancel"),
        tone: "warning",
      });
      if (!overwrite) return;
      result = saveNote(draft, editingId, { force: true });
    }
    if (!result.saved) {
      setValidationMessage(t("form.updateFailed"));
      return;
    }
    if (!result.storageOk) {
      showToast({ type: "error", title: tc("storageErrorTitle"), message: isSourceLocale ? STORAGE_QUOTA_ERROR_MESSAGE : tc("storageQuota") });
      return;
    }

    showToast({
      type: "success",
      message: t("form.updated"),
      duration: 2500,
    });
    setEditingId(result.saved.id);
    setEditingSince(result.saved.updatedAt);
  };

  // FA-25: silme sunucu-önce; sonuç kullanıcıya açıkça bildirilir.
  const reportDeleteOutcome = (outcome: DeleteNoteOutcome) => {
    if (outcome.ok && outcome.state === "queued") {
      showToast({ type: "warning", title: t("delete.pendingTitle"), message: isSourceLocale ? outcome.message ?? "" : t("delete.pendingBody") });
    } else if (outcome.ok) {
      showToast({ type: "success", message: t("delete.done"), duration: 2500 });
    } else {
      showToast({ type: "error", title: t("delete.failedTitle"), message: isSourceLocale ? outcome.message : t("delete.failedBody") });
    }
  };

  const runDelete = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const outcome = await deleteNote(id);
      reportDeleteOutcome(outcome);
      if ((outcome.ok || outcome.state === "missing") && editingId === id) resetForm();
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId || deleting) return;

    const ok = await confirm({
      message: t("delete.confirm"),
      confirmText: tc("delete"),
      cancelText: tc("cancel"),
      tone: "danger",
    });
    if (!ok) return;

    await runDelete(editingId);
  };

  const handleDeleteFromList = (id: string) => {
    void runDelete(id);
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addAttachmentFiles(files);
  };

  // Galeri/dosya ve kamera aynı yoldan eklenir (görseller önce kalite korunarak optimize edilir).
  const addAttachmentFiles = async (files: File[]) => {
    if (!files.length) return;

    // FA-03: izinli tür (görsel/PDF) + boyut ön kontrolü; uygunsuz dosya eklenmez.
    const existingBytes = draft.attachments.reduce((sum, a) => sum + (a.size || 0), 0);
    const { added, errors } = await readNoteAttachments(files, newAttachmentId, existingBytes);
    for (const message of errors) {
      showToast({ type: "warning", message: isSourceLocale ? message : t("attachments.rejected") });
    }

    if (added.length > 0) {
      setDraft((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...added],
      }));
    }
  };

  const handleWordSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = await importTextFromWordFile(file);

    if (!result.ok) {
      const messages: Record<string, string> = {
        UNSUPPORTED: t("word.unsupported"),
        EMPTY: t("word.empty"),
        FAILED: t("word.failed"),
        DEFLATE_UNSUPPORTED: t("word.deflate"),
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
      message: t("word.inserted"),
      duration: 2500,
    });
  };

  const handleRenameAttachment = () => {
    if (!selectedAttachmentId) {
      setValidationMessage(t("attachments.selectFirst"));
      return;
    }

    const target = draft.attachments.find((a) => a.id === selectedAttachmentId);
    if (!target) return;

    const nextName = window.prompt(t("attachments.renamePrompt"), target.displayName);
    if (nextName == null) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      setValidationMessage(t("attachments.nameEmpty"));
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
    // REF-021: düz "Yükleniyor…" yerine route skeleton'ıyla tutarlı iskelet.
    return <RefleksolojiListLoading badge={t("loadingBadge")} title={t("title")} />;
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-4 py-4 xl:px-7">
        {isDemo && (
          <DemoModuleBanner message={t("demoBanner")} />
        )}
        <div className="flex flex-wrap items-start gap-3">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-300/70 bg-white px-2.5 py-1 text-xs font-semibold text-violet-950 shadow-sm transition hover:border-violet-400"
          >
            <span aria-hidden>←</span>
            {t("mainMenu")}
          </Link>

          <header className="min-w-0 flex-1">
            <nav className="text-sm font-bold text-violet-700/90" aria-label={t("breadcrumbAria")}>
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link href="/refleksoloji" className="hover:text-violet-900">
                    {t("mainMenu")}
                  </Link>
                </li>
                <li aria-hidden className="text-violet-400">
                  &gt;
                </li>
                <li className="text-slate-700">{t("crumb")}</li>
              </ol>
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                {t("title")}
              </h1>
              {!isDemo ? <SyncStatusBadge /> : null}
            </div>
          </header>
        </div>

        {!isDemo && quarantineCount > 0 ? (
          <LegacyQuarantineBanner
            className="mt-4"
            count={quarantineCount}
            noun={tc("quarantine.nounNote")}
            onImport={() => {
              const r = importQuarantine();
              showToast(
                r.ok
                  ? { type: "success", message: t("imported", { count: String(r.imported) }) }
                  : { type: "error", title: tc("storageErrorTitle"), message: isSourceLocale ? STORAGE_QUOTA_ERROR_MESSAGE : tc("storageQuota") },
              );
            }}
            onDiscard={() => {
              discardQuarantine();
              showToast({ type: "success", message: t("quarantineRemoved") });
            }}
          />
        ) : null}

        <div
          className="mt-4 inline-flex rounded-2xl border border-violet-200/80 bg-white/80 p-1 shadow-sm ring-1 ring-violet-100/60"
          role="tablist"
          aria-label={t("tabsAria")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "kayit"}
            onClick={() => setActiveTab("kayit")}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === "kayit"
                ? "bg-violet-600 text-white shadow-md"
                : "text-violet-900 hover:bg-violet-50"
            }`}
          >
            {t("tabNew")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "liste"}
            onClick={() => setActiveTab("liste")}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === "liste"
                ? "bg-violet-600 text-white shadow-md"
                : "text-violet-900 hover:bg-violet-50"
            }`}
          >
            {t("tabSaved")}
          </button>
        </div>

        <div className="mt-4">
          {activeTab === "kayit" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
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
                onCameraFiles={(files) => void addAttachmentFiles(files)}
                onRenameAttachment={handleRenameAttachment}
                onWordImportClick={() => wordInputRef.current?.click()}
                onRemoveAttachment={handleRemoveAttachment}
                onOpenEditor={() => setEditorOpen(true)}
              />
            </>
          ) : (
            <KayitliNotlarTab
              notes={notes}
              loading={serverState === "pending" && notes.length === 0}
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
