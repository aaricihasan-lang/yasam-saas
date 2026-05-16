"use client";

import {
  attachmentHasData,
  attachmentTypeLabel,
  getAttachmentKind,
} from "../lib/attachmentKind";
import { formatFileSize } from "../lib/readAttachmentFile";
import type { NoteAttachment } from "../types";

type NoteDetayAttachmentCardProps = {
  file: NoteAttachment;
  editing: boolean;
  onOpenImage: () => void;
  onOpenPdf: () => void;
  onRename: () => void;
  onRemove: () => void;
};

const actionBtn =
  "rounded-lg border px-3 py-1.5 text-sm font-bold transition";

export function NoteDetayAttachmentCard({
  file,
  editing,
  onOpenImage,
  onOpenPdf,
  onRename,
  onRemove,
}: NoteDetayAttachmentCardProps) {
  const kind = getAttachmentKind(file);
  const hasData = attachmentHasData(file);
  const typeLabel = attachmentTypeLabel(kind);

  return (
    <article className="flex flex-col rounded-[24px] border border-purple-100 bg-white/90 p-5 shadow-sm ring-1 ring-violet-100/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-slate-900">{file.displayName}</p>
          <p className="mt-1 text-sm font-semibold text-violet-700">{typeLabel}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">
            {file.fileName} · {formatFileSize(file.size)}
          </p>
        </div>
      </div>

      {kind === "image" && hasData ? (
        <button
          type="button"
          onClick={onOpenImage}
          className="mt-4 overflow-hidden rounded-xl border border-violet-100 bg-slate-50 transition hover:ring-2 hover:ring-violet-200"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.dataUrl}
            alt={file.displayName}
            className="max-h-40 w-full object-contain"
          />
        </button>
      ) : null}

      {kind === "word" ? (
        <p className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950">
          Word dosyası tarayıcıda önizlenemeyebilir, indirme ile açabilirsiniz.
        </p>
      ) : null}

      {kind === "other" && !hasData ? (
        <p className="mt-4 text-sm font-medium text-slate-500">
          Bu ek için önizleme verisi yok. Yalnızca dosya adı kayıtlı.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {kind === "image" && hasData ? (
          <button
            type="button"
            onClick={onOpenImage}
            className={`${actionBtn} border-violet-300/80 bg-violet-100 text-violet-950 hover:bg-violet-200/90`}
          >
            Aç / Önizle
          </button>
        ) : null}

        {kind === "pdf" && hasData ? (
          <>
            <button
              type="button"
              onClick={onOpenPdf}
              className={`${actionBtn} border-violet-300/80 bg-violet-100 text-violet-950 hover:bg-violet-200/90`}
            >
              Aç / Önizle
            </button>
            <a
              href={file.dataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${actionBtn} border-sky-300/80 bg-sky-50 text-sky-950 hover:bg-sky-100`}
            >
              Yeni Sekme
            </a>
          </>
        ) : null}

        {hasData ? (
          <a
            href={file.dataUrl}
            download={file.fileName}
            className={`${actionBtn} border-emerald-300/80 bg-emerald-50 text-emerald-950 hover:bg-emerald-100`}
          >
            İndir
          </a>
        ) : (
          <span className={`${actionBtn} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400`}>
            İndir
          </span>
        )}

        {editing ? (
          <>
            <button
              type="button"
              onClick={onRename}
              className={`${actionBtn} border-fuchsia-300/80 bg-fuchsia-50 text-fuchsia-950 hover:bg-fuchsia-100`}
            >
              Adını Değiştir
            </button>
            <button
              type="button"
              onClick={onRemove}
              className={`${actionBtn} border-red-300/80 bg-red-50 text-red-700 hover:bg-red-100`}
            >
              Sil
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
