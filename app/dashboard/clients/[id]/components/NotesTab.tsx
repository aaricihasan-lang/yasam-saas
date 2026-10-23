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
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

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
      <div className={`${dyp.kHeader} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
        <h3 className={dyp.kTitle}>
          {t("title")}
        </h3>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div className={`${dyp.kStat} flex items-baseline gap-1.5`}>
            <span className={dyp.kStatValue}>
              {items.length}
            </span>
            <span className={dyp.kStatLabel}>
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
                ? `${dyp.kBtnSecondary} ${dyp.kBtnSm}`
                : `${dyp.kBtnPrimary} ${dyp.kBtnSm}`
            }
          >
            {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
          </button>
        </div>
      </div>

      {/* ── Yeni not formu ───────────────────────────────────────────── */}
      {showForm && (
        <div className="overflow-hidden rounded-xl border border-[#e3e7ee] bg-white">
          <div className={`${dyp.kModalHead} flex items-center justify-between`}>
            <div>
              <h3 className={dyp.kSubtitle}>{t("newForm.title")}</h3>
              <p className={`${dyp.kDesc} mt-0.5`}>
                {t("newForm.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewContent("");
              }}
              className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
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
              className={`${dyp.kInput} w-full min-h-[140px] resize-y`}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewContent("");
                }}
                className={dyp.kBtnSecondary}
              >
                {t("newForm.cancel")}
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className={dyp.kBtnSave}
              >
                {saving ? t("newForm.saving") : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Not listesi ──────────────────────────────────────────────── */}
      <div className={dyp.kCardMuted}>
        {items.length === 0 ? (
          <div className={dyp.kEmpty}>
            <div className={dyp.kSubtitle}>
              {t("empty.title")}
            </div>
            <p className={`${dyp.kDesc} mt-2`}>
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
                    className={`${dyp.kCard} overflow-hidden`}
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h4 className={dyp.kSubtitle}>
                            {t("edit.title")}
                          </h4>
                          <p className={`${dyp.kDesc} mt-1`}>
                            {t("edit.subtitle")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
                        >
                          {t("edit.cancelTop")}
                        </button>
                      </div>

                      <textarea
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className={`${dyp.kInput} w-full min-h-[140px] resize-y`}
                      />

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className={dyp.kBtnSecondary}
                        >
                          {t("edit.cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note)}
                          disabled={saving}
                          className={dyp.kBtnSave}
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
                  className={`${dyp.kCard} overflow-hidden`}
                >
                  <div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <button
                        type="button"
                        onClick={() => setViewId(note.id)}
                        className="min-w-0 flex-1 text-left"
                        title={t("item.viewTitle")}
                      >
                        <p className={`${dyp.kFieldText} line-clamp-3 whitespace-pre-wrap break-words`}>
                          {note.content}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {note.createdAt && (
                            <span className={dyp.kMeta}>
                              {t("item.created", { date: formatTr(note.createdAt) })}
                            </span>
                          )}
                          {note.updatedAt && (
                            <span className="text-xs font-semibold text-[#2c5aa0]">
                              {t("item.updated", { date: formatTr(note.updatedAt) })}
                            </span>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setViewId(note.id)}
                          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                        >
                          {t("item.view")}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(note)}
                          className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
                        >
                          {t("item.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note)}
                          className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}
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
          className={`${dyp.kOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`}
          onClick={() => setViewId(null)}
        >
          <div
            className={`${dyp.kModal} relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${dyp.kModalHead} flex items-start justify-between gap-3`}>
              <div>
                <div className={`${dyp.kChipTeal} mb-1.5 inline-flex uppercase tracking-wide`}>
                  {t("viewModal.badge")}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {viewNote.createdAt && (
                    <span className={dyp.kMeta}>
                      {t("item.created", { date: formatTr(viewNote.createdAt) })}
                    </span>
                  )}
                  {viewNote.updatedAt && (
                    <span className="text-xs font-semibold text-[#2c5aa0]">
                      {t("item.updated", { date: formatTr(viewNote.updatedAt) })}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewId(null)}
                className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} shrink-0`}
              >
                {t("viewModal.close")}
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4">
              <p className={`${dyp.kFieldText} whitespace-pre-wrap break-words`}>
                {viewNote.content}
              </p>
            </div>

            <div className={`${dyp.kModalFoot} flex justify-end gap-2`}>
              <button
                type="button"
                onClick={() => setViewId(null)}
                className={dyp.kBtnSecondary}
              >
                {t("viewModal.close")}
              </button>
              <button
                type="button"
                onClick={() => startEdit(viewNote)}
                className={dyp.kBtnPrimary}
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
