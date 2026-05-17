"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type CombinationRecord = {
  id: string;
  tenant_id: string;
  title: string;
  combination_no: number;
  source_note: string | null;
  stone_combination: string | null;
  note_1: string | null;
  note_2: string | null;
  note_3: string | null;
  created_at: string;
  updated_at: string | null;
};

type EditDraft = {
  source_note: string;
  stone_combination: string;
  note_1: string;
  note_2: string;
  note_3: string;
};

const emptyNewForm = {
  source_note: "",
  stone_combination: "",
  note_1: "",
  note_2: "",
  note_3: "",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-violet-400/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl";
const uiDetailCard =
  "w-full rounded-[34px] border-[3px] border-cyan-300/45 bg-white/78 p-8 shadow-[0_0_50px_rgba(34,211,238,0.16)] backdrop-blur-xl";
const uiFieldBox =
  "rounded-[26px] border-[3px] border-violet-200 bg-gradient-to-br from-white/85 to-violet-50/70 p-6 shadow-[0_0_30px_rgba(139,92,246,0.10)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.16)]";
const uiFieldLabel = "text-sm font-black uppercase tracking-[0.18em] text-violet-700";
const uiFieldContent = "mt-4 text-lg font-semibold leading-8 text-slate-800";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiDatesBox =
  "rounded-[26px] border-[3px] border-amber-200 bg-gradient-to-br from-white/85 to-amber-50/70 p-6 shadow-[0_0_30px_rgba(245,158,11,0.12)] lg:col-span-2";
const uiComboBadge =
  "inline-flex items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2 text-sm font-black text-white shadow-md";

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={uiFieldBox}>
      <div className={uiFieldLabel}>{label}</div>
      <div className={uiFieldContent}>{children}</div>
    </div>
  );
}

export default function KombinasyonDetayPage() {
  const params = useParams<{ title: string | string[] }>();
  const rawSegment = params?.title;
  const encodedTitle = Array.isArray(rawSegment) ? rawSegment[0] : rawSegment;

  const decodedTitle = useMemo(() => {
    if (!encodedTitle || typeof encodedTitle !== "string") return "";
    try {
      return decodeURIComponent(encodedTitle);
    } catch {
      return encodedTitle;
    }
  }, [encodedTitle]);

  const [rows, setRows] = useState<CombinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState(emptyNewForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const total = rows.length;

  const loadRows = useCallback(async () => {
    if (!decodedTitle) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("stone_combinations")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("title", decodedTitle)
      .order("combination_no", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as CombinationRecord[]);
  }, [decodedTitle]);

  useEffect(() => {
    runInEffect(() => {
      loadRows();
    });
  }, [loadRows]);

  async function handleSaveNew() {
    if (!decodedTitle) return;

    setSavingNew(true);
    setErrorMessage("");
    setSuccessMessage("");

    const maxFromList = rows.reduce((max, row) => {
      const n =
        typeof row.combination_no === "number"
          ? row.combination_no
          : Number(row.combination_no);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const nextNo = maxFromList + 1;

    const now = new Date().toISOString();

    const { error: insertError } = await supabase.from("stone_combinations").insert({
      tenant_id: TENANT_ID,
      title: decodedTitle,
      combination_no: nextNo,
      source_note: newForm.source_note.trim() || null,
      stone_combination: newForm.stone_combination.trim() || null,
      note_1: newForm.note_1.trim() || null,
      note_2: newForm.note_2.trim() || null,
      note_3: newForm.note_3.trim() || null,
      updated_at: now,
    });

    setSavingNew(false);

    if (insertError) {
      setErrorMessage(`Kayıt eklenemedi: ${insertError.message}`);
      return;
    }

    setSuccessMessage("Kombinasyon eklendi.");
    setNewForm(emptyNewForm);
    setShowNewForm(false);
    setEditingId(null);
    setEditDraft(null);
    await loadRows();
  }

  async function handleDeleteConfirmed() {
    const id = deleteConfirmId;
    if (!id) return;

    setDeletingId(id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("stone_combinations")
      .delete()
      .eq("tenant_id", TENANT_ID)
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      setErrorMessage(`Silinemedi: ${error.message}`);
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setEditDraft(null);
    }

    setDeleteConfirmId(null);
    setSuccessMessage("Kombinasyon silindi.");
    await loadRows();
  }

  function cancelDeleteConfirm() {
    setDeleteConfirmId(null);
    setErrorMessage("");
  }
  function startEdit(row: CombinationRecord) {
    setEditingId(row.id);
    setEditDraft({
      source_note: row.source_note ?? "",
      stone_combination: row.stone_combination ?? "",
      note_1: row.note_1 ?? "",
      note_2: row.note_2 ?? "",
      note_3: row.note_3 ?? "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft) return;

    setSavingEditId(id);
    setErrorMessage("");
    setSuccessMessage("");

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("stone_combinations")
      .update({
        source_note: editDraft.source_note.trim() || null,
        stone_combination: editDraft.stone_combination.trim() || null,
        note_1: editDraft.note_1.trim() || null,
        note_2: editDraft.note_2.trim() || null,
        note_3: editDraft.note_3.trim() || null,
        updated_at: now,
      })
      .eq("tenant_id", TENANT_ID)
      .eq("id", id);

    setSavingEditId(null);

    if (error) {
      setErrorMessage(`Güncellenemedi: ${error.message}`);
      return;
    }

    setSuccessMessage("Kombinasyon güncellendi.");
    cancelEdit();
    await loadRows();
  }

  if (!decodedTitle) {
    return (
      <main className={`${pageBg} flex min-h-screen items-center justify-center`}>
        <div className={`${uiHeaderCard} w-full text-center`}>
          <p className="text-lg font-bold text-slate-600">Geçersiz başlık.</p>
          <Link
            href="/dogaltas/kombinasyonlar"
            className="mt-4 inline-flex rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-violet-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
              KOMBİNASYON DETAY
            </div>

            <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
              {decodedTitle}
            </h1>

            <p className="mt-3 text-lg font-medium text-slate-600">
              {total === 0
                ? "Bu başlık altında henüz kombinasyon yok."
                : `${total} kombinasyon listeleniyor.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/kombinasyonlar"
              className="rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-violet-50"
            >
              Listeye Dön
            </Link>

            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setSuccessMessage("");
                if (showNewForm) {
                  setNewForm(emptyNewForm);
                  setShowNewForm(false);
                } else {
                  setShowNewForm(true);
                }
              }}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-4 font-black text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] transition-all duration-300 hover:-translate-y-1"
            >
              + Yeni Kombinasyon
            </button>
          </div>
        </header>

        {showNewForm && (
          <section className={uiDetailCard}>
            <h2 className="text-xl font-black text-slate-950">Yeni kombinasyon</h2>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Bilgi Kaynağı
                </span>
                <input
                  value={newForm.source_note}
                  onChange={(e) => setNewForm({ ...newForm, source_note: e.target.value })}
                  className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-[13px] font-semibold outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Taş Kombinasyonu
                </span>
                <textarea
                  value={newForm.stone_combination}
                  onChange={(e) =>
                    setNewForm({ ...newForm, stone_combination: e.target.value })
                  }
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-4 text-[13px] leading-7 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block md:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                    Diğer Notlar 1
                  </span>
                  <textarea
                    value={newForm.note_1}
                    onChange={(e) => setNewForm({ ...newForm, note_1: e.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </label>
                <label className="block md:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                    Diğer Notlar 2
                  </span>
                  <textarea
                    value={newForm.note_2}
                    onChange={(e) => setNewForm({ ...newForm, note_2: e.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </label>
                <label className="block md:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                    Diğer Notlar 3
                  </span>
                  <textarea
                    value={newForm.note_3}
                    onChange={(e) => setNewForm({ ...newForm, note_3: e.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={savingNew}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)] transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingNew ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewForm(false);
                  setNewForm(emptyNewForm);
                }}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200"
              >
                İptal
              </button>
            </div>
          </section>
        )}

        {(errorMessage || successMessage) && (
          <div
            className={`mb-4 rounded-2xl px-5 py-3 text-[13px] font-black ring-1 ${
              errorMessage
                ? "bg-rose-50 text-rose-700 ring-rose-100"
                : "bg-emerald-50 text-emerald-700 ring-emerald-100"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        {loading ? (
          <div className={`${uiDetailCard} flex min-h-[280px] items-center justify-center text-base font-bold text-slate-500`}>
            Yükleniyor...
          </div>
        ) : rows.length === 0 ? (
          <div className={`${uiDetailCard} text-center`}>
            <div className="text-5xl">✶</div>
            <p className="mt-3 text-lg font-black text-slate-800">Henüz kayıt yok</p>
            <p className="mt-2 text-base font-medium text-slate-500">
              Yukarıdan yeni kombinasyon ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {rows.map((row, index) => {
              const isEditing = editingId === row.id;
              const positionLabel = `Kombinasyon ${index + 1} / ${total}`;

              return (
                <article
                  key={row.id}
                  className={uiDetailCard}
                >
                  <div className="flex flex-col gap-3 border-b border-cyan-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className={uiComboBadge}>
                        {positionLabel}
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-500">
                        Sıra #{index + 1} · No {row.combination_no}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(row.id)}
                            disabled={savingEditId === row.id}
                            className="rounded-2xl bg-emerald-600 px-4 py-2 text-[12px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {savingEditId === row.id ? "Kaydediliyor..." : "Kaydet"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingEditId === row.id}
                            className="rounded-2xl bg-slate-100 px-4 py-2 text-[12px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                          >
                            İptal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            disabled={deletingId === row.id || !!editingId}
                            className="rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-md transition hover:bg-violet-700 disabled:opacity-50"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMessage("");
                              setSuccessMessage("");
                              setDeleteConfirmId(row.id);
                            }}
                            disabled={
                              !!editingId || !!deletingId || deleteConfirmId !== null
                            }
                            className="rounded-2xl bg-red-500 px-6 py-4 font-black text-white shadow-md transition hover:bg-red-600 disabled:opacity-60"
                          >
                            Sil
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && editDraft ? (
                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                          Bilgi kaynağı
                        </span>
                        <input
                          value={editDraft.source_note}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, source_note: e.target.value })
                          }
                          className="h-11 w-full rounded-2xl border border-cyan-100 bg-white px-4 text-[13px] font-semibold outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                          Taş kombinasyonu
                        </span>
                        <textarea
                          value={editDraft.stone_combination}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              stone_combination: e.target.value,
                            })
                          }
                          rows={5}
                          className="w-full resize-none rounded-2xl border border-cyan-100 bg-white p-4 text-[13px] leading-7 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                        />
                      </label>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {(["note_1", "note_2", "note_3"] as const).map((key, i) => (
                          <label key={key} className="block">
                            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                              Diğer notlar {i + 1}
                            </span>
                            <textarea
                              value={editDraft[key]}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, [key]: e.target.value })
                              }
                              rows={4}
                              className="w-full resize-none rounded-2xl border border-cyan-100 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                            />
                          </label>
                        ))}
                      </div>
                      <div className={uiDatesBox}>
                        <div className={uiFieldLabel}>Tarihler</div>
                        <p className="text-base font-bold leading-8 text-slate-700">
                          Oluşturma: {formatDate(row.created_at)}
                        </p>
                        <p className="text-base font-bold leading-8 text-slate-700">
                          Güncelleme: {formatDate(row.updated_at)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <FieldBlock label="Bilgi kaynağı">
                        {row.source_note?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.source_note}</span>
                        ) : (
                          <span className={uiEmptyText}>—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Taş kombinasyonu">
                        {row.stone_combination?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.stone_combination}</span>
                        ) : (
                          <span className={uiEmptyText}>—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 1">
                        {row.note_1?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_1}</span>
                        ) : (
                          <span className={uiEmptyText}>—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 2">
                        {row.note_2?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_2}</span>
                        ) : (
                          <span className={uiEmptyText}>—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 3">
                        {row.note_3?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_3}</span>
                        ) : (
                          <span className={uiEmptyText}>—</span>
                        )}
                      </FieldBlock>
                      <div className={uiDatesBox}>
                        <div className={uiFieldLabel}>Tarihler</div>
                        <p className="text-base font-bold leading-8 text-slate-700">
                          Oluşturma: {formatDate(row.created_at)}
                        </p>
                        <p className="text-base font-bold leading-8 text-slate-700">
                          Güncelleme: {formatDate(row.updated_at)}
                        </p>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-combo-title"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
              ⚠️
            </div>

            <h2
              id="delete-combo-title"
              className="mt-4 text-[20px] font-black leading-snug text-slate-950"
            >
              Bu kombinasyonu silmek istediğinizden emin misiniz?
            </h2>

            <p className="mt-2 text-[12px] font-bold text-rose-600">
              Bu işlem geri alınamaz.
            </p>

            {errorMessage ? (
              <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={cancelDeleteConfirm}
                disabled={deletingId !== null}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deletingId !== null}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingId ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
