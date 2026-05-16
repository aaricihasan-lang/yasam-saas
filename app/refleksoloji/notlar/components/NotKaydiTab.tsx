"use client";

import type { ClinicalNoteFormDraft } from "../types";
import { AttachmentsPanel } from "./AttachmentsPanel";

const toolBtn =
  "rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45";

type NotKaydiTabProps = {
  draft: ClinicalNoteFormDraft;
  editingId: string | null;
  selectedAttachmentId: string | null;
  validationMessage: string | null;
  onDraftChange: (patch: Partial<ClinicalNoteFormDraft>) => void;
  onSelectAttachment: (id: string | null) => void;
  onNew: () => void;
  onSave: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onAddFileClick: () => void;
  onRenameAttachment: () => void;
  onWordImportClick: () => void;
  onRemoveAttachment: (id: string) => void;
  onOpenEditor: () => void;
};

export function NotKaydiTab({
  draft,
  editingId,
  selectedAttachmentId,
  validationMessage,
  onDraftChange,
  onSelectAttachment,
  onNew,
  onSave,
  onUpdate,
  onDelete,
  onAddFileClick,
  onRenameAttachment,
  onWordImportClick,
  onRemoveAttachment,
  onOpenEditor,
}: NotKaydiTabProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 rounded-[28px] border border-purple-100 bg-white/85 p-4 shadow-sm ring-1 ring-violet-100/60">
        <button
          type="button"
          onClick={onNew}
          className={`${toolBtn} border-emerald-300/80 bg-emerald-100 text-emerald-950 hover:bg-emerald-200/90`}
        >
          + Yeni Not
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={Boolean(editingId)}
          className={`${toolBtn} border-sky-300/80 bg-sky-500 text-white hover:bg-sky-600`}
        >
          Kaydet
        </button>
        <button
          type="button"
          onClick={onUpdate}
          disabled={!editingId}
          className={`${toolBtn} border-violet-300/80 bg-violet-500 text-white hover:bg-violet-600`}
        >
          Güncelle
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!editingId}
          className={`${toolBtn} border-red-300/80 bg-red-50 text-red-700 hover:bg-red-100`}
        >
          Sil
        </button>
        <button
          type="button"
          onClick={onAddFileClick}
          className={`${toolBtn} border-amber-300/80 bg-amber-100 text-amber-950 hover:bg-amber-200/90`}
        >
          Dosya Ekle
        </button>
        <button
          type="button"
          onClick={onRenameAttachment}
          disabled={!selectedAttachmentId}
          className={`${toolBtn} border-fuchsia-300/80 bg-fuchsia-100 text-fuchsia-950 hover:bg-fuchsia-200/90`}
        >
          Ek Adı Değiştir
        </button>
        <button
          type="button"
          onClick={onWordImportClick}
          className={`${toolBtn} border-indigo-300/80 bg-indigo-100 text-indigo-950 hover:bg-indigo-200/90`}
        >
          Word&apos;den Aktar
        </button>
      </div>

      {validationMessage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
          {validationMessage}
        </p>
      ) : null}

      <section className="rounded-[28px] border border-purple-100 bg-white/80 p-5 shadow-sm ring-1 ring-violet-100/60 md:p-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-base font-bold text-slate-800">Not Başlığı</span>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onDraftChange({ title: e.target.value })}
              placeholder="Örn: Migren protokolü"
              className="w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-base font-bold text-slate-800">Tarih</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => onDraftChange({ date: e.target.value })}
              className="w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
            />
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-bold text-slate-800">Not İçeriği</span>
            <button
              type="button"
              onClick={onOpenEditor}
              className="rounded-xl border border-violet-300/80 bg-violet-100 px-4 py-2 text-sm font-bold text-violet-950 transition hover:bg-violet-200/90"
            >
              Büyük Editör Aç
            </button>
          </div>

          <textarea
            value={draft.content}
            onChange={(e) => onDraftChange({ content: e.target.value })}
            placeholder="Seans notu, dikkat, gözlem, ek bilgi..."
            rows={12}
            className="w-full resize-y rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium leading-relaxed text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
          />
        </div>
      </section>

      <AttachmentsPanel
        attachments={draft.attachments}
        selectedId={selectedAttachmentId}
        onSelect={onSelectAttachment}
        onRemove={onRemoveAttachment}
        onAddClick={onAddFileClick}
      />

    </div>
  );
}
