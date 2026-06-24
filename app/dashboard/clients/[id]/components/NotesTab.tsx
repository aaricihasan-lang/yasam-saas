"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
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

function formatTr(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", {
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
      showToast({ title: "Başarılı", message: successMsg, type: "success" });
    }
    return ok;
  }

  async function handleAdd() {
    const content = newContent.trim();
    if (!content) {
      showToast({ title: "Boş not", message: "Lütfen bir not metni girin.", type: "error" });
      return;
    }
    const note: ClientNoteItem = {
      id: newId(),
      content,
      createdAt: new Date().toISOString(),
    };
    const ok = await persist([note, ...items], "Not eklendi.");
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
      showToast({ title: "Boş not", message: "Not metni boş olamaz.", type: "error" });
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
    const ok = await persist(next, "Not güncellendi.");
    if (ok) cancelEdit();
  }

  async function handleDelete(note: ClientNoteItem) {
    const ok = await deleteConfirm({
      title: "Notu sil",
      message: "Bu not kalıcı olarak silinsin mi?",
    });
    if (!ok) return;
    await persist(
      items.filter((n) => n.id !== note.id),
      "Not silindi.",
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Premium başlık kartı ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/50">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/40 px-3 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black uppercase tracking-wide text-violet-700 shadow-sm">
                Danışan Not Takip Sistemi
              </div>

              <h2 className="text-base font-black tracking-tight text-slate-950">
                Danışan Notları
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-5 text-slate-600">
                Danışana ait özel notları, seans gözlemlerini ve takip
                bilgilerini tek ekrandan yönetebilirsin.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 lg:items-end">
              <div className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-center shadow-md">
                <div className="text-base font-black text-violet-700">
                  {items.length}
                </div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  toplam not
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setNewContent("");
                }}
                className={
                  showForm
                    ? "rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                    : "rounded-2xl border border-violet-300 bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"
                }
              >
                {showForm ? "Formu Kapat" : "+ Yeni Not Ekle"}
              </button>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400" />
        </div>
      </div>

      {/* ── Yeni not formu ───────────────────────────────────────────── */}
      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-violet-100 bg-gradient-to-br from-violet-50/60 to-white px-4 py-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Yeni Not</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Danışan hakkında yeni bir not yaz ve kaydet.
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
              Vazgeç
            </button>
          </div>
          <div className="p-4">
            <textarea
              autoFocus
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Danışan hakkında özel notlar, seans gözlemleri, takip bilgileri..."
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
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-70"
              >
                {saving ? "Kaydediliyor..." : "💾 Notu Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kayıtlı notlar ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/50">
        <div className="mb-3">
          <h3 className="text-base font-black tracking-tight text-slate-950">
            Kayıtlı Notlar
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Bu danışana ait tüm notlar. Notu görüntüleyebilir, güncelleyebilir
            veya silebilirsin.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <div className="text-base font-black text-slate-800">
              Henüz not yok
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              "+ Yeni Not Ekle" butonundan ilk notu oluşturabilirsin.
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
                            Notu Düzenle
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-600">
                            Not metnini güncelleyip kaydedebilirsin.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl bg-white px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          İptal
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
                          Vazgeç
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note)}
                          disabled={saving}
                          className="btn-primary px-4 py-2 text-sm disabled:opacity-70"
                        >
                          {saving ? "Güncelleniyor..." : "Güncelle"}
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
                        title="Notu görüntüle"
                      >
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm font-medium leading-5 text-slate-800">
                          {note.content}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {note.createdAt && (
                            <span className="text-xs font-bold text-slate-500">
                              Kayıt: {formatTr(note.createdAt)}
                            </span>
                          )}
                          {note.updatedAt && (
                            <span className="text-xs font-bold text-violet-600">
                              Güncelleme: {formatTr(note.updatedAt)}
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
                          Gör
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(note)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                        >
                          Güncelle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note)}
                          className="rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                        >
                          Sil
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
                  Danışan Notu
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {viewNote.createdAt && (
                    <span className="text-xs font-bold text-slate-500">
                      Kayıt: {formatTr(viewNote.createdAt)}
                    </span>
                  )}
                  {viewNote.updatedAt && (
                    <span className="text-xs font-bold text-violet-600">
                      Güncelleme: {formatTr(viewNote.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewId(null)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Kapat
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
                Kapat
              </button>
              <button
                type="button"
                onClick={() => startEdit(viewNote)}
                className="btn-primary px-4 py-2 text-sm"
              >
                Güncelle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
