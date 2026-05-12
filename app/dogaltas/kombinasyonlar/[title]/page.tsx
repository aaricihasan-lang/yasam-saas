"use client";

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

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100/90 bg-slate-50/50 p-4 ring-1 ring-white/60">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="text-[14px] leading-7 text-slate-800">{children}</div>
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
    loadRows();
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

  async function handleDelete(id: string) {
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

    setSuccessMessage("Kombinasyon silindi.");
    await loadRows();
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
      <main className="min-h-screen bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] text-slate-950">
        <div className="mx-auto max-w-[1260px] px-6 py-10 text-center">
          <p className="text-[15px] font-bold text-slate-600">Geçersiz başlık.</p>
          <Link
            href="/dogaltas/kombinasyonlar"
            className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-[13px] font-black text-white"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] text-slate-950">
      <div className="mx-auto max-w-[960px] px-6 py-5">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 inline-flex rounded-full bg-white/70 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-violet-700 ring-1 ring-white">
              KOMBİNASYON DETAY
            </div>

            <h1 className="max-w-[720px] text-[30px] font-black leading-tight tracking-tight">
              {decodedTitle}
            </h1>

            <p className="mt-2 text-[13px] font-medium text-slate-500">
              {total === 0
                ? "Bu başlık altında henüz kombinasyon yok."
                : `${total} kombinasyon listeleniyor.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/kombinasyonlar"
              className="rounded-2xl bg-white/85 px-5 py-3 text-[13px] font-black text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.045)] ring-1 ring-white transition hover:bg-white"
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
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700"
            >
              + Yeni Kombinasyon
            </button>
          </div>
        </header>

        {showNewForm && (
          <section className="mb-5 rounded-[26px] border border-white bg-white/86 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)] ring-1 ring-white/90">
            <h2 className="text-[17px] font-black text-slate-950">Yeni kombinasyon</h2>

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
          <div className="flex min-h-[240px] items-center justify-center rounded-[26px] bg-white/70 text-[14px] font-bold text-slate-400 ring-1 ring-white">
            Yükleniyor...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[26px] border border-white bg-white/86 p-10 text-center shadow-[0_18px_45px_rgba(15,23,42,0.04)] ring-1 ring-white/90">
            <div className="text-[44px]">✶</div>
            <p className="mt-3 text-[15px] font-black text-slate-800">Henüz kayıt yok</p>
            <p className="mt-2 text-[13px] text-slate-500">
              Yukarıdan yeni kombinasyon ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {rows.map((row, index) => {
              const isEditing = editingId === row.id;
              const positionLabel = `Kombinasyon ${index + 1} / ${total}`;

              return (
                <article
                  key={row.id}
                  className="rounded-[26px] border border-white bg-white/86 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)] ring-1 ring-white/90"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 inline-flex rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black tracking-[0.1em] text-violet-700 ring-1 ring-violet-100">
                        {positionLabel}
                      </div>
                      <p className="text-[11px] font-bold text-slate-400">
                        Sıra #{index + 1} · No {row.combination_no}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
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
                            className="rounded-2xl bg-slate-950 px-4 py-2 text-[12px] font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id || !!editingId}
                            className="rounded-2xl bg-rose-600 px-4 py-2 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.2)] transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            {deletingId === row.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && editDraft ? (
                    <div className="mt-4 grid grid-cols-1 gap-4">
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
                      <div className="rounded-2xl border border-slate-100/90 bg-slate-50/40 px-4 py-3 text-[12px] font-semibold text-slate-500">
                        Oluşturma: {formatDate(row.created_at)} · Güncelleme:{" "}
                        {formatDate(row.updated_at)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <FieldBlock label="Bilgi kaynağı">
                        {row.source_note?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.source_note}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Taş kombinasyonu">
                        {row.stone_combination?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.stone_combination}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 1">
                        {row.note_1?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_1}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 2">
                        {row.note_2?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_2}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </FieldBlock>
                      <FieldBlock label="Diğer notlar 3">
                        {row.note_3?.trim() ? (
                          <span className="whitespace-pre-wrap">{row.note_3}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </FieldBlock>
                      <div className="rounded-2xl border border-slate-100/90 bg-slate-50/50 p-4 ring-1 ring-white/60 md:col-span-2">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Tarihler
                        </div>
                        <p className="text-[13px] font-semibold text-slate-700">
                          Oluşturma: {formatDate(row.created_at)}
                        </p>
                        <p className="mt-1 text-[13px] font-semibold text-slate-700">
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
    </main>
  );
}
