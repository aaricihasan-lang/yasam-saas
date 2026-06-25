"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { runInEffect } from "@/lib/runInEffect";
import {
  fetchClientCombinations,
  updateClientCombination,
  deleteClientCombination,
  parseStonesText,
  type ClientCombinationRow,
} from "@/lib/dogaltas/clientCombinationsApi";

type ClientCombinationsSectionProps = {
  clientId: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type EditState = {
  name: string;
  description: string;
  note: string;
};

/**
 * Danışan Detayı > Doğaltaşlar sekmesi — "Kayıtlı Kombinasyonlar" bölümü.
 *
 * "Kombinasyon Oluştur" akışında "Danışana Özel Kaydet" ile bu danışana yazılan
 * kombinasyonları listeler. Detay (taş listesi, amaç, not), düzenleme ve silme
 * desteklenir. Genel kombinasyonlardan ayrı tablo/route kullanır.
 */
export default function ClientCombinationsSection({
  clientId,
}: ClientCombinationsSectionProps) {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [rows, setRows] = useState<ClientCombinationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>({ name: "", description: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetchClientCombinations(clientId);
    if (!res.ok) {
      setError(res.error ?? "Kombinasyonlar yüklenemedi.");
      setRows([]);
    } else {
      setRows(res.rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    runInEffect(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function startEdit(row: ClientCombinationRow) {
    setEditingId(row.id);
    setEditForm({
      name: row.name ?? "",
      description: row.description ?? "",
      note: row.note ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", description: "", note: "" });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      showToast({ title: "İşlem başarısız", message: "Kombinasyon adı boş olamaz.", type: "error" });
      return;
    }
    setSavingEdit(true);
    const res = await updateClientCombination(clientId, id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      note: editForm.note.trim() || null,
    });
    setSavingEdit(false);

    if (!res.ok) {
      showToast({ title: "İşlem başarısız", message: res.error ?? "Güncellenemedi.", type: "error" });
      return;
    }
    cancelEdit();
    await load();
    showToast({ title: "Başarılı", message: "Kombinasyon güncellendi.", type: "success" });
  }

  async function handleDelete(row: ClientCombinationRow) {
    const ok = await deleteConfirm({
      title: "Kombinasyonu sil",
      message: `"${row.name}" kombinasyonu bu danışandan silinsin mi?`,
    });
    if (!ok) return;

    const res = await deleteClientCombination(clientId, row.id);
    if (!res.ok) {
      showToast({ title: "İşlem başarısız", message: res.error ?? "Silinemedi.", type: "error" });
      return;
    }
    if (editingId === row.id) cancelEdit();
    if (expandedId === row.id) setExpandedId(null);
    await load();
    showToast({ title: "Başarılı", message: "Kombinasyon silindi.", type: "success" });
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-md shadow-slate-200/50">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-slate-950">
            🧩 Kayıtlı Kombinasyonlar
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Bu danışana özel kaydedilen mineral kombinasyonları.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
          Kombinasyonlar yükleniyor...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-5 text-center">
          <div className="text-base font-black text-slate-800">
            Henüz kombinasyon yok
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            "Kombinasyon Oluştur" ekranından "Danışana Özel Kaydet" ile bu danışana
            kombinasyon ekleyebilirsin.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const stones = parseStonesText(row.stones_text);
            const isExpanded = expandedId === row.id;
            const isEditing = editingId === row.id;

            return (
              <div
                key={row.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-violet-50/40 shadow-sm transition hover:border-violet-200"
              >
                {isEditing ? (
                  <div className="border-l-4 border-violet-500 bg-violet-50/50 p-4">
                    <h4 className="mb-2 text-sm font-black text-slate-950">
                      Kombinasyonu Düzenle
                    </h4>
                    <div className="space-y-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Kombinasyon adı"
                        maxLength={200}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />
                      <input
                        value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Amaç / açıklama (opsiyonel)"
                        maxLength={200}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />
                      <textarea
                        value={editForm.note}
                        onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                        placeholder="Not (opsiyonel)"
                        rows={2}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        Vazgeç
                      </button>
                      <button
                        onClick={() => saveEdit(row.id)}
                        disabled={savingEdit}
                        className="btn-primary px-4 py-2 text-sm"
                      >
                        {savingEdit ? "Güncelleniyor..." : "Güncelle"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-black tracking-tight text-slate-950">
                          {row.name}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">
                            {stones.length} taş
                          </span>
                          <span>📅 {formatDate(row.created_at)}</span>
                        </div>
                        {row.description && (
                          <p className="mt-1.5 line-clamp-2 text-sm font-medium text-slate-600">
                            {row.description}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className="rounded-xl border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100"
                        >
                          {isExpanded ? "Gizle" : "Detay"}
                        </button>
                        <button
                          onClick={() => startEdit(row)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          className="rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                        >
                          Sil
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                        <div>
                          <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                            Taşlar
                          </div>
                          {stones.length === 0 ? (
                            <p className="text-xs font-semibold text-slate-400">
                              Taş bilgisi yok.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {stones.map((s, i) => (
                                <span
                                  key={`${row.id}-s-${i}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"
                                >
                                  💎 {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {row.description && (
                          <div>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                              Amaç
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-5 text-slate-700">
                              {row.description}
                            </p>
                          </div>
                        )}

                        {row.note && (
                          <div>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                              Not
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-5 text-slate-700">
                              {row.note}
                            </p>
                          </div>
                        )}

                        {(row.notes_text || row.notes_text_2) && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {row.notes_text && (
                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                                <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                  Mineral Özeti
                                </div>
                                <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                  {row.notes_text}
                                </p>
                              </div>
                            )}
                            {row.notes_text_2 && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                                <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-amber-600">
                                  Uyarı / Stok Özeti
                                </div>
                                <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">
                                  {row.notes_text_2}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
