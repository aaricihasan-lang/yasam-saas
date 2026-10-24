"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { formatDateTime } from "@/lib/i18n/format";
import {
  parseClientNotes,
  serializeClientNotes,
  type ClientNoteItem,
} from "@/lib/clientNotes";

type Props = {
  /** Sunucudan gelen ham `notlar` değeri (kaynak gerçeklik). */
  initialNotlar: string;
  /** Ham `notlar` metnini kalıcılaştırır; başarılıysa true döner. */
  onPersist: (raw: string) => Promise<boolean>;
  /** Kalıcılaştırma sürüyor mu? */
  saving: boolean;
};

// Merkezî locale-duyarlı format helper üzerinden; çıktı tr-TR ile byte-aynı.
function formatTr(iso: string): string {
  return formatDateTime(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* yedek aşağıda */
  }
  return `n-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export default function NotesTab({ initialNotlar, onPersist, saving }: Props) {
  const t = useTranslations("clients.notes");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [items, setItems] = useState<ClientNoteItem[]>(() =>
    parseClientNotes(initialNotlar),
  );

  // Yeni not formu
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState("");

  // Satır içi düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Görüntüleme modalı
  const [viewId, setViewId] = useState<string | null>(null);

  // Sunucudaki değer değiştiğinde (yükleme/başarılı kayıt sonrası) yerel listeyi senkronla.
  useEffect(() => {
    setItems(parseClientNotes(initialNotlar));
  }, [initialNotlar]);

  // Modal açıkken Escape ile kapat
  useEffect(() => {
    if (!viewId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewId]);

  const viewNote = items.find((n) => n.id === viewId) || null;

  async function persist(next: ClientNoteItem[], successMsg: string): Promise<boolean> {
    const ok = await onPersist(serializeClientNotes(next));
    if (ok) {
      setItems(next);
      showToast({ title: t("toast.successTitle"), message: successMsg, type: "success" });
    }
    return ok;
  }

  async function handleAdd() {
    const content = newContent.trim();
    if (!content) {
      showToast({ title: t("toast.emptyTitle"), message: t("toast.emptyNew"), type: "error" });
      return;
    }
    const note: ClientNoteItem = {
      id: newId(),
      content,
      createdAt: new Date().toISOString(),
    };
    const ok = await persist([note, ...items], t("toast.added"));
    if (ok) {
      setNewContent("");
      setShowForm(false);
    }
  }

  function startEdit(note: ClientNoteItem) {
    setViewId(null);
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  async function saveEdit(note: ClientNoteItem) {
    const content = editContent.trim();
    if (!content) {
      showToast({ title: t("toast.emptyTitle"), message: t("toast.emptyEdit"), type: "error" });
      return;
    }
    if (content === note.content) {
      cancelEdit();
      return;
    }
    const next = items.map((n) =>
      n.id === note.id
        ? { ...n, content, updatedAt: new Date().toISOString() }
        : n,
    );
    const ok = await persist(next, t("toast.updated"));
    if (ok) cancelEdit();
  }

  async function handleDelete(note: ClientNoteItem) {
    const ok = await deleteConfirm({
      title: t("delete.title"),
      message: t("delete.message"),
    });
    if (!ok) return;
    await persist(
      items.filter((n) => n.id !== note.id),
      t("toast.deleted"),
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Üst toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-black tracking-tight text-slate-950">
          {t("title")}
        </h3>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div className="flex items-baseline gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 shadow-sm">
            <span className="text-sm font-black leading-none text-violet-700">
              {items.length}
            </span>
            <span className="text-[11px] font-black uppercase tracking-wide text-violet-700/70">
              {t("totalLabel", { count: items.length })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setNewContent("");
            }}
            className={
              showForm
                ? "rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                : "rounded-xl border border-violet-300 bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"
            }
          >
            {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
          </button>
        </div>
      </div>

      {/* ── Yeni not formu ───────────────────────────────────────────── */}
      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-violet-100 bg-gradient-to-br from-violet-50/60 to-white px-4 py-3">
            <div>
              <h3 className="text-base font-black text-slate-950">{t("newForm.title")}</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {t("newForm.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewContent("");
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("newForm.cancel")}
            </button>
          </div>
          <div className="p-4">
            <textarea
              autoFocus
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t("newForm.placeholder")}
              className="w-full min-h-[140px] resize-y rounded-[14px] border border-slate-300 bg-white p-3 text-[14px] outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewContent("");
                }}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("newForm.cancel")}
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-70"
              >
                {saving ? t("newForm.saving") : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Not listesi ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/50">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <div className="text-base font-black text-slate-800">
              {t("empty.title")}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("empty.hint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {items.map((note) => {
              const isEditing = editingId === note.id;

              if (isEditing) {
                return (
                  <div
                    key={note.id}
                    className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm shadow-slate-200/50"
                  >
                    <div className="border-l-4 border-violet-500 bg-violet-50/50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-base font-black text-slate-950">
                            {t("edit.title")}
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-600">
                            {t("edit.subtitle")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl bg-white px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          {t("edit.cancelTop")}
                        </button>
                      </div>

                      <textarea
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full min-h-[140px] resize-y rounded-[14px] border border-slate-300 bg-white p-3 text-[14px] outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      />

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          {t("edit.cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note)}
                          disabled={saving}
                          className="btn-primary px-4 py-2 text-sm disabled:opacity-70"
                        >
                          {saving ? t("edit.saving") : t("edit.save")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={note.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-violet-50/40 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-100/70"
                >
                  <div className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <button
                        type="button"
                        onClick={() => setViewId(note.id)}
                        className="min-w-0 flex-1 text-left"
                        title={t("item.viewTitle")}
                      >
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm font-medium leading-5 text-slate-800">
                          {note.content}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {note.createdAt && (
                            <span className="text-xs font-bold text-slate-500">
                              {t("item.created", { date: formatTr(note.createdAt) })}
                            </span>
                          )}
                          {note.updatedAt && (
                            <span className="text-xs font-bold text-violet-600">
                              {t("item.updated", { date: formatTr(note.updatedAt) })}
                            </span>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setViewId(note.id)}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                        >
                          {t("item.view")}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(note)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                        >
                          {t("item.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note)}
                          className="rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                        >
                          {t("item.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Görüntüleme modalı (blur arka plan) ──────────────────────── */}
      {viewNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setViewId(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/40 px-4 py-3">
              <div>
                <div className="mb-1.5 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-700">
                  {t("viewModal.badge")}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {viewNote.createdAt && (
                    <span className="text-xs font-bold text-slate-500">
                      {t("item.created", { date: formatTr(viewNote.createdAt) })}
                    </span>
                  )}
                  {viewNote.updatedAt && (
                    <span className="text-xs font-bold text-violet-600">
                      {t("item.updated", { date: formatTr(viewNote.updatedAt) })}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewId(null)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("viewModal.close")}
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4">
              <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-800">
                {viewNote.content}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setViewId(null)}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("viewModal.close")}
              </button>
              <button
                type="button"
                onClick={() => startEdit(viewNote)}
                className="btn-primary px-4 py-2 text-sm"
              >
                {t("viewModal.edit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
