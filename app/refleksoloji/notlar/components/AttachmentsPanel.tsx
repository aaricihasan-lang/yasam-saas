"use client";

import type { NoteAttachment } from "../types";

type AttachmentsPanelProps = {
  attachments: NoteAttachment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  attachments,
  selectedId,
  onSelect,
  onRemove,
  onAddClick,
}: AttachmentsPanelProps) {
  return (
    <section className="rounded-[28px] border border-purple-100 bg-white/80 p-5 shadow-sm ring-1 ring-violet-100/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-violet-900">Ek Dosyalar</h2>
        <button
          type="button"
          onClick={onAddClick}
          className="rounded-xl border border-sky-300/80 bg-sky-100 px-4 py-2.5 text-sm font-bold text-sky-950 transition hover:bg-sky-200/90"
        >
          Dosya Ekle
        </button>
      </div>

      {attachments.length === 0 ? (
        <p className="mt-4 text-base font-medium text-slate-500">
          Henüz ek dosya yok. Dosya Ekle ile belge veya görsel ekleyebilirsiniz.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {attachments.map((file) => {
            const selected = selectedId === file.id;
            return (
              <li
                key={file.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                  selected
                    ? "border-violet-400 bg-violet-50/80 ring-2 ring-violet-200"
                    : "border-violet-100 bg-white/90"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : file.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-base font-bold text-slate-900">{file.displayName}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">
                    {file.fileName} · {formatFileSize(file.size)}
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  {file.mimeType.startsWith("image/") ? (
                    <a
                      href={file.dataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-900 transition hover:bg-violet-100"
                    >
                      Aç
                    </a>
                  ) : (
                    <a
                      href={file.dataUrl}
                      download={file.fileName}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-900 transition hover:bg-violet-100"
                    >
                      İndir
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(file.id)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-bold text-red-600 transition hover:bg-red-100"
                  >
                    Kaldır
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
