"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const emptyForm = {
  title: "",
  source_note: "",
  stone_combination: "",
  note_1: "",
  note_2: "",
  note_3: "",
};

function previewText(rows: CombinationRecord[], limit = 140) {
  for (const row of rows) {
    const chunk = [
      row.stone_combination,
      row.source_note,
      row.note_1,
      row.note_2,
      row.note_3,
    ]
      .find((v) => v && v.trim().length > 0)
      ?.replace(/\s+/g, " ")
      .trim();

    if (chunk) {
      return chunk.length > limit ? `${chunk.slice(0, limit)}…` : chunk;
    }
  }

  return "Henüz önizleme metni yok.";
}

function firstSourceNoteInGroup(rows: CombinationRecord[]) {
  for (const row of rows) {
    const note = row.source_note?.trim();
    if (note) return note;
  }
  return null;
}

function latestDisplayTimestamp(rows: CombinationRecord[]) {
  let best = 0;
  let chosen: string | null = null;

  for (const row of rows) {
    const raw = row.updated_at || row.created_at;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t) && t >= best) {
      best = t;
      chosen = raw;
    }
  }

  return chosen;
}

function formatListCardDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-violet-300/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl";
const uiStatCard =
  "rounded-2xl border-2 border-cyan-200 bg-white/85 px-8 py-5 text-center shadow-md";
const uiFilterCard =
  "rounded-[30px] border-[3px] border-cyan-300/45 bg-white/75 p-5 shadow-[0_0_40px_rgba(34,211,238,0.14)] backdrop-blur-xl";
const uiSearchInput =
  "h-14 w-full rounded-2xl border-2 border-cyan-200 bg-white/90 px-5 pl-12 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiViewBtn =
  "rounded-2xl px-6 py-4 font-black shadow-md transition-all duration-300 hover:-translate-y-1";
const uiComboCard =
  "flex flex-col rounded-[32px] border-[3px] border-cyan-300/45 bg-white/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-[0_0_55px_rgba(139,92,246,0.18)]";
const uiComboBadge =
  "inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 font-black text-white shadow-md";
const uiComboBtn =
  "mt-4 inline-flex w-fit items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-lg transition hover:bg-violet-700";

export default function KombinasyonlarPage() {
  const [rows, setRows] = useState<CombinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => ({ ...emptyForm }));
  const [viewMode, setViewMode] = useState<"list" | "card">("card");

  async function loadCombinations() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("stone_combinations")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("title", { ascending: true })
      .order("combination_no", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      return;
    }

    setRows((data || []) as CombinationRecord[]);
  }

  useEffect(() => {
    runInEffect(() => {
      loadCombinations();
    });
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    if (!keyword) return rows;

    return rows.filter((row) => {
      const text = [
        row.title,
        row.source_note,
        row.stone_combination,
        row.note_1,
        row.note_2,
        row.note_3,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return text.includes(keyword);
    });
  }, [rows, search]);

  const groups = useMemo(() => {
    const map = new Map<string, CombinationRecord[]>();

    for (const row of filteredRows) {
      const key = row.title?.trim() || "İsimsiz";
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }

    return Array.from(map.entries())
      .map(([title, groupRows]) => ({
        title,
        rows: [...groupRows].sort((a, b) => a.combination_no - b.combination_no),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "tr-TR"));
  }, [filteredRows]);

  const uniqueTitles = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.title?.trim() || "İsimsiz"));
    return set.size;
  }, [rows]);

  function resetForm() {
    setForm(() => ({ ...emptyForm }));
  }

  async function handleSaveNew() {
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      setErrorMessage("Rahatsızlık / Konu başlığı zorunludur.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data: maxRows, error: maxError } = await supabase
      .from("stone_combinations")
      .select("combination_no")
      .eq("tenant_id", TENANT_ID)
      .eq("title", titleTrim)
      .order("combination_no", { ascending: false })
      .limit(1);

    if (maxError) {
      setSaving(false);
      setErrorMessage(`Sıra numarası alınamadı: ${maxError.message}`);
      return;
    }

    const maxNo = maxRows?.[0]?.combination_no;
    const nextNo =
      typeof maxNo === "number" && !Number.isNaN(maxNo) ? maxNo + 1 : 1;

    const now = new Date().toISOString();

    const { error: insertError } = await supabase.from("stone_combinations").insert({
      tenant_id: TENANT_ID,
      title: titleTrim,
      combination_no: nextNo,
      source_note: form.source_note.trim() || null,
      stone_combination: form.stone_combination.trim() || null,
      note_1: form.note_1.trim() || null,
      note_2: form.note_2.trim() || null,
      note_3: form.note_3.trim() || null,
      updated_at: now,
    });

    setSaving(false);

    if (insertError) {
      setErrorMessage(`Kayıt eklenemedi: ${insertError.message}`);
      return;
    }

    resetForm();
    setShowForm(false);
    setSuccessMessage("Kombinasyon kaydedildi.");
    await loadCombinations();
    resetForm();
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
              ✶ TAŞ KOMBİNASYONLARI
            </div>

            <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
              Taş Kombinasyonları
            </h1>

            <p className="mt-3 text-lg font-medium text-slate-600 xl:text-xl">
              Rahatsızlık başlığına göre gruplanmış kombinasyon bilgi bankası.
            </p>

            <Link
              href="/"
              className="mt-4 inline-flex w-fit max-w-full shrink-0 items-center gap-2 rounded-2xl border-2 border-cyan-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md transition hover:bg-cyan-50"
            >
              <svg
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-cyan-600/90"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
              </svg>
              <span className="truncate">Ana Panele Dön</span>
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:min-w-[480px]">
            <div className={uiStatCard}>
              <div className="text-3xl font-black text-slate-950">{rows.length}</div>
              <div className="text-sm font-bold text-slate-500">Kombinasyon</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-3xl font-black text-slate-950">{uniqueTitles}</div>
              <div className="text-sm font-bold text-slate-500">Başlık</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-3xl font-black text-slate-950">{groups.length}</div>
              <div className="text-sm font-bold text-slate-500">Görünen grup</div>
            </div>
          </div>
        </header>

        <section className={uiFilterCard}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 w-full">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-slate-400">
                ⌕
              </span>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Başlık, kaynak, taş kombinasyonu veya notlarda ara..."
                className={uiSearchInput}
              />
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-3 xl:w-auto xl:justify-end">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${uiViewBtn} ${
                  viewMode === "list"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Liste
              </button>

              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${uiViewBtn} ${
                  viewMode === "card"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Kart
              </button>

              <button
                type="button"
                onClick={loadCombinations}
                className={`${uiViewBtn} border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Yenile
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className={`${uiViewBtn} bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_10px_30px_rgba(34,211,238,0.25)] hover:from-cyan-600 hover:to-violet-700`}
              >
                + Yeni Kombinasyon
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400">
              {search.trim()
                ? `${filteredRows.length} kayıt · ${groups.length} grup`
                : `${rows.length} kayıt · ${groups.length} grup`}
            </p>

            {loading && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                Yükleniyor...
              </span>
            )}
          </div>
        </section>

        {showForm && (
          <section className="mb-4 rounded-[26px] border border-white/80 bg-white/86 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90">
            <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[17px] font-black text-slate-950">Yeni kombinasyon</h2>
                <p className="text-[12px] font-medium text-slate-500">
                  Aynı başlık altında sıra numarası otomatik artar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-[12px] font-black text-slate-600 transition hover:bg-slate-200"
              >
                Kapat
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Rahatsızlık / Konu başlığı
                </span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-[13px] font-semibold outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  placeholder="Örn. Omuz Ağrısı"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Bilgi kaynağı
                </span>
                <input
                  value={form.source_note}
                  onChange={(e) => setForm({ ...form, source_note: e.target.value })}
                  className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-[13px] font-semibold outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  placeholder="Kaynak veya referans"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Taş kombinasyonu
                </span>
                <textarea
                  value={form.stone_combination}
                  onChange={(e) => setForm({ ...form, stone_combination: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-4 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  placeholder="Taşlar ve kullanım şekli..."
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Diğer notlar 1
                </span>
                <textarea
                  value={form.note_1}
                  onChange={(e) => setForm({ ...form, note_1: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Diğer notlar 2
                </span>
                <textarea
                  value={form.note_2}
                  onChange={(e) => setForm({ ...form, note_2: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Diğer notlar 3
                </span>
                <textarea
                  value={form.note_3}
                  onChange={(e) => setForm({ ...form, note_3: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white p-3 text-[13px] leading-6 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={saving}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)] transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </section>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        )}

        {successMessage && !errorMessage && (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-5 py-3 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">
            {successMessage}
          </div>
        )}

        <section className="rounded-[28px] bg-white/72 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-[14px] font-bold text-slate-400">
              Kayıtlar yükleniyor...
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[48px]">✶</div>
              <h3 className="mt-2 text-[18px] font-black text-slate-900">Kayıt bulunamadı</h3>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                Arama kriterinizi değiştirin veya yeni bir kombinasyon ekleyin.
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-hidden overflow-x-auto rounded-[24px] bg-white/86 ring-1 ring-slate-100">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.25fr_0.62fr_1.15fr_0.78fr_0.62fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  <div>Başlık</div>
                  <div>Kombinasyon sayısı</div>
                  <div>Kaynak</div>
                  <div>Son güncelleme</div>
                  <div className="text-right">İşlem</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {groups.map(({ title, rows: groupRows }) => {
                    const sourceLine = firstSourceNoteInGroup(groupRows);
                    const ts = latestDisplayTimestamp(groupRows);
                    const count = groupRows.length;

                    return (
                      <div
                        key={title}
                        className="grid grid-cols-[1.25fr_0.62fr_1.15fr_0.78fr_0.62fr] gap-3 px-4 py-3 text-[12px] transition hover:bg-cyan-50/45"
                      >
                        <div className="min-w-0 font-black text-slate-950">
                          <span className="block truncate">{title}</span>
                        </div>
                        <div className="font-bold text-slate-600">{count}</div>
                        <div className="min-w-0 text-slate-600">
                          <span className="line-clamp-2 block font-medium">
                            {sourceLine || (
                              <span className="text-slate-400">Kaynak belirtilmedi</span>
                            )}
                          </span>
                        </div>
                        <div className="whitespace-nowrap text-[12px] font-semibold text-slate-500">
                          {ts ? formatListCardDate(ts) : "—"}
                        </div>
                        <div className="flex justify-end">
                          <Link
                            href={`/dogaltas/kombinasyonlar/${encodeURIComponent(title)}`}
                            className={`${uiComboBtn} !mt-0 px-4 py-3 text-sm`}
                          >
                            Kombinasyonları Gör →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {groups.map(({ title, rows: groupRows }) => {
                const sourceLine = firstSourceNoteInGroup(groupRows);
                const ts = latestDisplayTimestamp(groupRows);
                const count = groupRows.length;

                return (
                <article
                  key={title}
                  className={uiComboCard}
                >
                  <div className="flex gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#ede9fe_0%,#e0f2fe_48%,#d1fae5_100%)] text-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_20px_rgba(139,92,246,0.12)] ring-1 ring-white/90"
                      aria-hidden
                    >
                      ✦
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={uiComboBadge}>
                          {count} kombinasyon
                        </span>
                      </div>

                      <h2 className="mt-3 text-3xl font-black text-slate-950">{title}</h2>

                      <p className="mt-2 line-clamp-2 text-sm font-bold text-cyan-700">
                        {sourceLine ? (
                          <>
                            <span>Kaynak: </span>
                            {sourceLine}
                          </>
                        ) : (
                          <span className="text-slate-400">Kaynak belirtilmedi</span>
                        )}
                      </p>

                      <p className="mt-3 flex-1 text-base leading-7 text-slate-700">
                        {previewText(groupRows)}
                      </p>

                      <p className="mt-2 text-sm font-medium text-slate-500">
                        {ts
                          ? `Son güncelleme: ${formatListCardDate(ts)}`
                          : "Son güncelleme: —"}
                      </p>

                      <Link
                        href={`/dogaltas/kombinasyonlar/${encodeURIComponent(title)}`}
                        className={uiComboBtn}
                      >
                        Kombinasyonları Gör →
                      </Link>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
