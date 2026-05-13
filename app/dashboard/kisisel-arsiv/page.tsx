"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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

  const inputClass =
    "w-full rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-[14px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] outline-none ring-1 ring-slate-100/60 transition placeholder:text-slate-400 focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/50";

  const labelClass =
    "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500";

  return (
    <div className="min-h-0 flex-1 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_45%,#eef2ff_100%)] px-3 py-6 sm:px-5 sm:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3.5 py-2 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100/50 transition hover:border-violet-200/60 hover:bg-white hover:text-violet-900"
          >
            ← Ana panele dön
          </Link>
        </div>

        <header className="rounded-3xl border border-white/80 bg-white/85 px-5 py-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.12)] ring-1 ring-violet-100/40 backdrop-blur-md sm:px-8 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-gradient-to-r from-violet-100/90 via-fuchsia-50/80 to-cyan-50/70 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-violet-900 ring-1 ring-violet-200/50">
                ARŞİV
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Kişisel Arşiv
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] font-medium leading-relaxed text-slate-600 sm:text-[14px]">
                Ses • Video • Belge • Resim • Not • Her türlü kişisel kayıt
              </p>
            </div>
            {!formOpen ? (
              <button
                type="button"
                onClick={() => {
                  setInfo(null);
                  setFormOpen(true);
                }}
                className="shrink-0 self-start rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-[12px] font-black uppercase tracking-wide text-white shadow-[0_10px_28px_-10px_rgba(109,40,217,0.4)] transition hover:from-violet-700 hover:to-indigo-700"
              >
                + Yeni Kayıt
              </button>
            ) : null}
          </div>
        </header>

        {info ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-[13px] font-semibold shadow-sm ring-1 ${
              info.kind === "ok"
                ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 ring-emerald-100/50"
                : "border-rose-200/80 bg-rose-50/90 text-rose-900 ring-rose-100/50"
            }`}
          >
            {info.text}
          </div>
        ) : null}

        <section className="min-w-0 rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_14px_44px_-20px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/50 backdrop-blur-md sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[15px] font-black text-slate-900">Kayıtlar</h2>
              <p className="mt-1 text-[12px] font-medium text-slate-500">
                En yeni üstte. Arama başlık, kategori, etiket, not ve dosya adlarında
                çalışır.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:max-w-xs">
              <span className={labelClass}>Ara</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
                placeholder="Kelime yazın…"
                type="search"
              />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {loadingList ? (
              <p className="py-10 text-center text-[14px] font-medium text-slate-400">
                Yükleniyor…
              </p>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-4 py-12 text-center ring-1 ring-slate-100/50">
                <p className="text-[14px] font-semibold text-slate-600">
                  Henüz kayıt yok veya aramanıza uygun sonuç bulunamadı.
                </p>
              </div>
            ) : (
              visibleRows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-slate-100/90 bg-gradient-to-br from-white via-white to-slate-50/50 px-4 py-4 shadow-[0_6px_24px_-14px_rgba(15,23,42,0.08)] ring-1 ring-slate-100/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 text-[15px] font-black leading-snug text-slate-900">
                      {row.title}
                    </h3>
                    <span className="shrink-0 rounded-full border border-violet-100/80 bg-violet-50/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-900">
                      {row.category}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
                    <time dateTime={row.created_at}>{formatTrDate(row.created_at)}</time>
                    <span className="rounded-full bg-slate-100/90 px-2 py-0.5 text-[10px] font-black text-slate-600">
                      {fileCount(row)} dosya
                    </span>
                  </div>
                  <p className="mt-3 text-[13px] font-medium leading-relaxed text-slate-600">
                    {notePreview(row.note)}
                  </p>
                  {row.tags?.trim() ? (
                    <p className="mt-2 text-[11px] font-semibold text-violet-700/90">
                      Etiketler: {row.tags}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        {formOpen ? (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_14px_44px_-20px_rgba(15,23,42,0.14)] ring-1 ring-slate-100/50 backdrop-blur-md sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-black text-slate-900">Yeni kayıt</h2>
                <p className="mt-1 text-[12px] font-medium text-slate-500">
                  Başlık ve kategori zorunlu; dosyalar isteğe bağlı.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInfo(null);
                  closeForm();
                }}
                className="shrink-0 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                İptal
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block min-w-0">
                <span className={labelClass}>Başlık</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder="Örn. Aile toplantısı ses kaydı"
                  autoComplete="off"
                />
              </label>

              <label className="block min-w-0">
                <span className={labelClass}>Kategori</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`${inputClass} cursor-pointer appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
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
                <span className={labelClass}>Etiketler</span>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className={inputClass}
                  placeholder="Virgülle ayırın: tatil, 2026, taslak"
                  autoComplete="off"
                />
              </label>

              <label className="block min-w-0">
                <span className={labelClass}>Not</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className={`${inputClass} min-h-[6.5rem] resize-y`}
                  placeholder="Kısa açıklama veya bağlam…"
                />
              </label>

              <label className="block min-w-0">
                <span className={labelClass}>Dosyalar</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    setFiles(e.target.files ? Array.from(e.target.files) : [])
                  }
                  className="block w-full min-w-0 cursor-pointer rounded-2xl border border-dashed border-slate-200/95 bg-slate-50/80 px-3 py-3 text-[13px] font-medium text-slate-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-[12px] file:font-black file:text-white hover:border-violet-200/80 hover:bg-violet-50/30"
                />
                {files.length > 0 ? (
                  <p className="mt-2 text-[12px] font-medium text-slate-500">
                    {files.length} dosya seçildi
                  </p>
                ) : null}
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-[13px] font-black uppercase tracking-wide text-white shadow-[0_12px_32px_-12px_rgba(109,40,217,0.45)] transition hover:from-violet-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
