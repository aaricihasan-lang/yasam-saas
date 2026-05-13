"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase";

/**
 * Supabase kolonları:
 * personal_archives: id, tenant_id, title, category, tags, note, created_at, updated_at
 * personal_archive_files: id, tenant_id, archive_id, file_name, file_path, file_type, file_size, created_at
 * storage bucket: personal-archive (file_path storage içindeki yol ile uyumlu olmalı)
 */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const CATEGORIES = [
  "Ses",
  "Video",
  "Belgeler",
  "Resimler",
  "Sağlık",
  "Okul / Çocuk",
  "Evcil Hayvan",
  "Araç",
  "Ev",
  "Fikirler",
  "Toplantı",
  "Diğer",
] as const;

type ArchiveFileRow = {
  id: string;
  tenant_id: string;
  archive_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

type ArchiveRow = {
  id: string;
  tenant_id: string;
  title: string;
  category: string;
  tags: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  personal_archive_files?: ArchiveFileRow[] | null;
};

function formatTrDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function notePreview(note: string | null, max = 120) {
  const t = (note ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function normTr(s: string) {
  return s.toLocaleLowerCase("tr-TR");
}

export default function KisiselArsivPage() {
  const [formOpen, setFormOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!formOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [formOpen]);

  const loadRows = useCallback(async () => {
    setLoadingList(true);

    const { data, error } = await supabase
      .from("personal_archives")
      .select(
        "id, tenant_id, title, category, tags, note, created_at, updated_at, personal_archive_files ( id, tenant_id, archive_id, file_name, file_path, file_type, file_size, created_at )",
      )
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoadingList(false);

    if (error) {
      console.error("[kisisel-arsiv] personal_archives list", error);
      setInfo({
        kind: "err",
        text: "Kayıtlar yüklenemedi. Lütfen daha sonra tekrar deneyin.",
      });
      setRows([]);
      return;
    }

    setRows((data ?? []) as ArchiveRow[]);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    const nq = normTr(q);
    return rows.filter((row) => {
      const hay = [
        row.title,
        row.category,
        row.tags ?? "",
        row.note ?? "",
        ...(row.personal_archive_files ?? []).map((f) => f.file_name ?? ""),
      ]
        .join(" ")
        .trim();
      return normTr(hay).includes(nq);
    });
  }, [rows, search]);

  const fileCount = useCallback((row: ArchiveRow) => {
    const f = row.personal_archive_files;
    return Array.isArray(f) ? f.length : 0;
  }, []);

  const stats = useMemo(() => {
    let totalFiles = 0;
    const categorySet = new Set<string>();
    for (const row of rows) {
      totalFiles += fileCount(row);
      categorySet.add(row.category);
    }
    return {
      totalArchives: rows.length,
      totalFiles,
      categoryKinds: categorySet.size,
    };
  }, [rows, fileCount]);

  const canSave = useMemo(
    () => title.trim().length > 0 && !saving,
    [title, saving],
  );

  function resetFormFields() {
    setTitle("");
    setCategory(CATEGORIES[0]);
    setTags("");
    setNote("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeForm() {
    setFormOpen(false);
    resetFormFields();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setInfo({ kind: "err", text: "Başlık zorunludur." });
      return;
    }

    setSaving(true);
    setInfo(null);

    const { data: inserted, error: insErr } = await supabase
      .from("personal_archives")
      .insert({
        tenant_id: TENANT_ID,
        title: title.trim(),
        category,
        tags: tags.trim() || null,
        note: note.trim() || null,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      console.error("[kisisel-arsiv] personal_archives insert", insErr);
      setSaving(false);
      setInfo({
        kind: "err",
        text: "Kayıt kaydedilemedi. Lütfen daha sonra tekrar deneyin.",
      });
      return;
    }

    const archiveId = inserted.id as string;
    let uploadHadFailure = false;

    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
      const path = `${TENANT_ID}/${archiveId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("personal-archive")
        .upload(path, file, { upsert: false });

      if (upErr) {
        console.error("[kisisel-arsiv] storage upload", { path, error: upErr });
        uploadHadFailure = true;
        continue;
      }

      const { error: metaErr } = await supabase.from("personal_archive_files").insert({
        tenant_id: TENANT_ID,
        archive_id: archiveId,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
      });

      if (metaErr) {
        console.error("[kisisel-arsiv] personal_archive_files insert", metaErr);
        uploadHadFailure = true;
        void supabase.storage.from("personal-archive").remove([path]);
      }
    }

    resetFormFields();
    setFormOpen(false);
    setSaving(false);

    if (uploadHadFailure) {
      setInfo({
        kind: "err",
        text: "Kayıt oluşturuldu ancak dosyaların tamamı yüklenemedi. Lütfen daha sonra tekrar deneyin.",
      });
    } else {
      setInfo({ kind: "ok", text: "Kayıt kaydedildi." });
    }

    await loadRows();
  }

  const searchInputClass =
    "w-full rounded-3xl border border-slate-200/95 bg-white py-3 pl-11 pr-4 text-[14px] font-medium text-slate-900 shadow-inner shadow-slate-100/80 outline-none ring-1 ring-violet-100/40 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

  const modalLabelClass =
    "mb-2 block text-[13px] font-semibold tracking-tight text-slate-800";

  const modalFieldClass =
    "w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-[14px] font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

  const searchLabelClass =
    "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-600";

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-violet-50 via-sky-50 to-emerald-50 px-3 py-6 sm:px-5 sm:py-8">
      <div
        className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-violet-300/35 blur-3xl sm:-left-32 sm:h-80 sm:w-80"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 top-48 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl sm:right-[-5rem] sm:top-36"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-emerald-300/25 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-5xl flex-col gap-5">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-3xl border border-white/90 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-800 shadow-lg shadow-violet-200/30 ring-1 ring-violet-100/50 backdrop-blur-md transition hover:border-violet-200 hover:bg-white hover:text-violet-900"
          >
            ← Ana panele dön
          </Link>
        </div>

        <header className="overflow-hidden rounded-3xl border border-white/70 bg-white/55 shadow-2xl shadow-violet-300/25 ring-1 ring-white/80 backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="bg-gradient-to-br from-violet-100/50 via-white/40 to-emerald-100/40 px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-100 to-sky-100 text-4xl shadow-lg shadow-violet-300/40 ring-2 ring-white/90 sm:h-20 sm:w-20 sm:text-[2.75rem]"
                  aria-hidden
                >
                  📁
                </div>
                <div className="min-w-0">
                  <div className="inline-flex rounded-full bg-gradient-to-r from-violet-200/90 via-sky-100/90 to-emerald-100/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-violet-950 ring-1 ring-violet-300/40">
                    ARŞİV
                  </div>
                  <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                    Kişisel Arşiv
                  </h1>
                  <p className="mt-2 max-w-2xl text-[13px] font-semibold leading-relaxed text-slate-700 sm:text-[14px]">
                    Ses • Video • Belge • Resim • Not • Her türlü kişisel kayıt
                  </p>
                </div>
              </div>
              {!formOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setInfo(null);
                    setFormOpen(true);
                  }}
                  className="shrink-0 self-start rounded-3xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-5 py-3.5 text-[12px] font-black uppercase tracking-wide text-white shadow-[0_14px_40px_-8px_rgba(109,40,217,0.55)] ring-2 ring-white/50 transition hover:brightness-110 active:scale-[0.98]"
                >
                  + Yeni Kayıt
                </button>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-3xl border border-violet-200/60 bg-gradient-to-br from-violet-50/95 to-white/80 px-4 py-3 shadow-lg shadow-violet-200/30 ring-1 ring-violet-100/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-800/80">
                  Toplam Kayıt
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-violet-950">
                  {stats.totalArchives}
                </p>
              </div>
              <div className="rounded-3xl border border-sky-200/60 bg-gradient-to-br from-sky-50/95 to-white/80 px-4 py-3 shadow-lg shadow-sky-200/30 ring-1 ring-sky-100/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-900/75">
                  Toplam Dosya
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-sky-950">
                  {stats.totalFiles}
                </p>
              </div>
              <div className="rounded-3xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/95 to-white/80 px-4 py-3 shadow-lg shadow-emerald-200/25 ring-1 ring-emerald-100/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-900/75">
                  Kategori
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-950">
                  {stats.categoryKinds}
                </p>
              </div>
            </div>
          </div>
        </header>

        {info ? (
          <div
            className={`rounded-3xl border px-4 py-3.5 text-[13px] font-semibold shadow-xl ring-1 ${
              info.kind === "ok"
                ? "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 ring-emerald-100/60"
                : "border-rose-200/90 bg-rose-50/95 text-rose-950 ring-rose-100/60"
            }`}
          >
            {info.text}
          </div>
        ) : null}

        <section className="min-w-0 overflow-hidden rounded-3xl border-2 border-white/90 bg-white/95 shadow-2xl shadow-slate-300/25 ring-1 ring-violet-100/50 backdrop-blur-md">
          <div
            className="h-1.5 w-full bg-gradient-to-r from-violet-300/90 via-sky-300/85 to-emerald-300/90"
            aria-hidden
          />
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[16px] font-black tracking-tight text-slate-900">
                  Kayıtlar
                </h2>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-600">
                  En yeni üstte. Arama başlık, kategori, etiket, not ve dosya adlarında
                  çalışır.
                </p>
              </div>
              <label className="block w-full min-w-0 sm:max-w-xs">
                <span className={searchLabelClass}>Ara</span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] opacity-80"
                    aria-hidden
                  >
                    🔎
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={searchInputClass}
                    placeholder="Kelime yazın…"
                    type="search"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              {loadingList ? (
                <p className="py-12 text-center text-[14px] font-semibold text-slate-500">
                  Yükleniyor…
                </p>
              ) : visibleRows.length === 0 ? (
                rows.length === 0 ? (
                  <div className="rounded-3xl border-2 border-dashed border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/60 px-5 py-14 text-center shadow-inner ring-1 ring-violet-100/50">
                    <div
                      className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-4xl shadow-lg shadow-violet-200/40 ring-2 ring-violet-100/80"
                      aria-hidden
                    >
                      📂
                    </div>
                    <p className="text-[16px] font-black text-slate-900">
                      Henüz arşiv kaydı yok
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-[13px] font-semibold leading-relaxed text-slate-600">
                      İlk kaydınızı oluşturarak ses, belge veya fotoğraflarınızı tek
                      yerde toplayın.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-3xl border-2 border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white px-5 py-12 text-center shadow-inner ring-1 ring-sky-100/50">
                    <p className="text-[15px] font-black text-slate-900">
                      Aramanıza uygun kayıt bulunamadı
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-[13px] font-semibold text-slate-600">
                      Farklı bir kelime deneyin veya aramayı temizleyin.
                    </p>
                  </div>
                )
              ) : (
                visibleRows.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-violet-50/20 to-sky-50/25 px-4 py-4 shadow-xl shadow-slate-200/40 ring-1 ring-violet-100/35 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-[15px] font-black leading-snug text-slate-900">
                        {row.title}
                      </h3>
                      <span className="shrink-0 rounded-full border border-violet-200/90 bg-violet-100/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-950">
                        {row.category}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
                      <time dateTime={row.created_at}>{formatTrDate(row.created_at)}</time>
                      <span className="rounded-full bg-slate-100/95 px-2 py-0.5 text-[10px] font-black text-slate-700">
                        {fileCount(row)} dosya
                      </span>
                    </div>
                    <p className="mt-3 text-[13px] font-semibold leading-relaxed text-slate-700">
                      {notePreview(row.note)}
                    </p>
                    {row.tags?.trim() ? (
                      <p className="mt-2 text-[11px] font-semibold text-violet-800">
                        Etiketler: {row.tags}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6 sm:px-5 sm:py-10"
          role="presentation"
        >
          <div
            role="presentation"
            className={`absolute inset-0 bg-slate-900/45 backdrop-blur-sm ${saving ? "cursor-wait" : "cursor-pointer"}`}
            onClick={() => {
              if (saving) return;
              setInfo(null);
              closeForm();
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-modal-title"
            aria-describedby="archive-modal-desc"
            className="relative z-10 flex max-h-[min(90vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border-2 border-white/80 bg-white shadow-2xl shadow-violet-400/25 ring-1 ring-violet-200/50"
          >
            <div className="relative flex shrink-0 items-start justify-between gap-3 overflow-hidden border-b border-violet-100/80 bg-gradient-to-r from-violet-100/95 via-sky-100/90 to-emerald-100/90 px-5 py-5 sm:px-7 sm:py-6">
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/40 blur-2xl"
                aria-hidden
              />
              <div className="relative min-w-0 pr-10 sm:pr-12">
                <h2
                  id="archive-modal-title"
                  className="text-lg font-black tracking-tight text-slate-900 sm:text-xl"
                >
                  Yeni Arşiv Kaydı
                </h2>
                <p
                  id="archive-modal-desc"
                  className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-800 sm:text-[14px]"
                >
                  Ses, belge, resim, video veya kişisel notlarınızı tek kayıt altında
                  saklayın.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (saving) return;
                  setInfo(null);
                  closeForm();
                }}
                className="absolute right-3 top-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-3xl border border-white/90 bg-white/90 text-xl font-light leading-none text-slate-600 shadow-lg shadow-violet-200/40 backdrop-blur-sm transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:right-4 sm:top-4"
                aria-label="Kapat"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-white to-slate-50/40"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                <div className="space-y-4">
                  <label className="block min-w-0">
                    <span className={modalLabelClass}>Başlık</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={modalFieldClass}
                      placeholder="Örn. Aile toplantısı ses kaydı"
                      autoComplete="off"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className={modalLabelClass}>Kategori</span>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={`${modalFieldClass} cursor-pointer appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                      }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-0">
                    <span className={modalLabelClass}>Etiketler</span>
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className={modalFieldClass}
                      placeholder="Virgülle ayırın: tatil, 2026, taslak"
                      autoComplete="off"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className={modalLabelClass}>Not</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className={`${modalFieldClass} min-h-[5.25rem] max-h-40 resize-y`}
                      placeholder="Kısa açıklama veya bağlam…"
                    />
                  </label>

                  <div className="block min-w-0">
                    <span className={modalLabelClass}>Dosyalar</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) =>
                        setFiles(e.target.files ? Array.from(e.target.files) : [])
                      }
                    />
                    <div className="rounded-3xl border-[3px] border-dashed border-violet-300/80 bg-gradient-to-br from-violet-50/90 via-sky-50/70 to-emerald-50/80 p-5 text-center shadow-inner ring-2 ring-white/80 sm:p-6">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl shadow-violet-600/35">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-7 w-7"
                          aria-hidden
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                      </div>
                      <p className="text-[13px] font-semibold text-slate-800">
                        Birden fazla dosya ekleyebilirsiniz.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-4 inline-flex items-center justify-center rounded-3xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-6 py-3 text-[13px] font-black uppercase tracking-wide text-white shadow-lg shadow-violet-500/35 transition hover:brightness-110"
                      >
                        Dosyaları seç
                      </button>
                      <p className="mt-3 text-[12px] font-bold text-slate-600">
                        {files.length === 0
                          ? "Henüz dosya seçilmedi."
                          : `${files.length} dosya seçildi`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-violet-100/70 bg-white/90 px-5 py-4 backdrop-blur-sm sm:px-7">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (saving) return;
                    setInfo(null);
                    closeForm();
                  }}
                  className="rounded-3xl border-2 border-slate-200 bg-white px-5 py-2.5 text-[13px] font-bold text-slate-800 shadow-md transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={!canSave || saving}
                  className="rounded-3xl bg-gradient-to-r from-fuchsia-500 via-violet-600 to-cyan-500 px-7 py-3 text-[13px] font-black uppercase tracking-wide text-white shadow-[0_16px_40px_-10px_rgba(124,58,237,0.55)] ring-2 ring-white/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
