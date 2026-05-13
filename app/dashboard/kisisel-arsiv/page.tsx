"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Supabase beklenen yapı:
 * - public.personal_archives: id uuid PK, created_at timestamptz, user_id uuid null,
 *   title text, category text, tags text null, notes text null
 * - public.personal_archive_files: id uuid PK, created_at timestamptz, archive_id uuid FK → personal_archives,
 *   storage_path text, file_name text, mime_type text null, size_bytes bigint null
 * - storage bucket: personal-archive
 */

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

type ArchiveRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  title: string;
  category: string;
  tags: string | null;
  notes: string | null;
  personal_archive_files?: { id: string }[] | null;
};

function escapeIlike(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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

function notePreview(notes: string | null, max = 120) {
  const t = (notes ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function KisiselArsivPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        setUserId(data.user?.id ?? null);
        setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingList(true);
    setInfo(null);

    let q = supabase
      .from("personal_archives")
      .select(
        "id, created_at, user_id, title, category, tags, notes, personal_archive_files ( id )",
      )
      .order("created_at", { ascending: false });

    if (userId) {
      q = q.eq("user_id", userId);
    } else {
      q = q.is("user_id", null);
    }

    const term = search.trim();
    if (term.length > 0) {
      const p = `%${escapeIlike(term)}%`;
      q = q.or(
        `title.ilike.${p},category.ilike.${p},tags.ilike.${p},notes.ilike.${p}`,
      );
    }

    const { data, error } = await q;

    setLoadingList(false);

    if (error) {
      setInfo({ kind: "err", text: `Liste yüklenemedi: ${error.message}` });
      setRows([]);
      return;
    }

    setRows((data ?? []) as ArchiveRow[]);
  }, [userId, search]);

  useEffect(() => {
    if (!authChecked) return;
    void loadRows();
  }, [authChecked, loadRows]);

  const fileCount = useCallback((row: ArchiveRow) => {
    const f = row.personal_archive_files;
    return Array.isArray(f) ? f.length : 0;
  }, []);

  const canSave = useMemo(
    () => title.trim().length > 0 && !saving,
    [title, saving],
  );

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
        user_id: userId,
        title: title.trim(),
        category,
        tags: tags.trim() || null,
        notes: notes.trim() || null,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      setSaving(false);
      setInfo({
        kind: "err",
        text: `Kayıt oluşturulamadı: ${insErr?.message ?? "Bilinmeyen hata"}`,
      });
      return;
    }

    const archiveId = inserted.id as string;
    const uploadErrors: string[] = [];

    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
      const path = userId
        ? `${userId}/${archiveId}/${Date.now()}_${safeName}`
        : `anon/${archiveId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("personal-archive")
        .upload(path, file, { upsert: false });

      if (upErr) {
        uploadErrors.push(`${file.name}: ${upErr.message}`);
        continue;
      }

      const { error: metaErr } = await supabase.from("personal_archive_files").insert({
        archive_id: archiveId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });

      if (metaErr) {
        uploadErrors.push(`${file.name} (meta): ${metaErr.message}`);
        void supabase.storage.from("personal-archive").remove([path]);
      }
    }

    setTitle("");
    setCategory(CATEGORIES[0]);
    setTags("");
    setNotes("");
    setFiles([]);
    setSaving(false);

    if (uploadErrors.length > 0) {
      setInfo({
        kind: "err",
        text: `Arşiv kaydı oluşturuldu; bazı dosyalar yüklenemedi: ${uploadErrors.join(" · ")}`,
      });
    } else {
      setInfo({ kind: "ok", text: "Kayıt kaydedildi." });
    }

    await loadRows();
  }

  const inputClass =
    "w-full rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-[14px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] outline-none ring-1 ring-slate-100/60 transition placeholder:text-slate-400 focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/50";

  const labelClass = "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500";

  return (
    <div className="min-h-0 flex-1 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_45%,#eef2ff_100%)] px-3 py-6 sm:px-5 sm:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-white/80 bg-white/85 px-5 py-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.12)] ring-1 ring-violet-100/40 backdrop-blur-md sm:px-8 sm:py-8">
          <div className="inline-flex rounded-full bg-gradient-to-r from-violet-100/90 via-fuchsia-50/80 to-cyan-50/70 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-violet-900 ring-1 ring-violet-200/50">
            ARŞİV
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Kişisel Arşiv
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] font-medium leading-relaxed text-slate-600 sm:text-[14px]">
            Ses • Video • Belge • Resim • Not • Her türlü kişisel kayıt
          </p>
        </header>

        {!userId && authChecked ? (
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-3 text-[13px] font-semibold text-amber-950 ring-1 ring-amber-100/60">
            Oturum açmadan kayıtlar <code className="rounded bg-white/80 px-1">user_id</code>{" "}
            alanı boş kaydedilir; üretimde RLS ile kullanıcıya bağlayın. Giriş yaptığınızda kayıtlar
            hesabınıza göre listelenir.
          </div>
        ) : null}

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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_14px_44px_-20px_rgba(15,23,42,0.14)] ring-1 ring-slate-100/50 backdrop-blur-md sm:p-6"
          >
            <h2 className="text-[15px] font-black text-slate-900">Yeni kayıt</h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              Başlık ve kategori zorunlu; dosyalar isteğe bağlı.
            </p>

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
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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

            <button
              type="submit"
              disabled={!canSave}
              className="mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3.5 text-[13px] font-black uppercase tracking-wide text-white shadow-[0_12px_32px_-12px_rgba(109,40,217,0.45)] transition hover:from-violet-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[160px]"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>

          <section className="min-w-0 rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_14px_44px_-20px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/50 backdrop-blur-md sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[15px] font-black text-slate-900">Kayıtlar</h2>
                <p className="mt-1 text-[12px] font-medium text-slate-500">
                  En yeni üstte. Arama başlık, kategori, etiket ve notta çalışır.
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
              ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-4 py-12 text-center ring-1 ring-slate-100/50">
                  <p className="text-[14px] font-semibold text-slate-600">
                    Henüz kayıt yok veya aramanıza uygun sonuç bulunamadı.
                  </p>
                </div>
              ) : (
                rows.map((row) => (
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
                      {notePreview(row.notes)}
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
        </div>
      </div>
    </div>
  );
}
