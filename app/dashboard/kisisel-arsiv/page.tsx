"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
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

const CATEGORY_FILTER_ALL = "Tümü" as const;

const CATEGORY_BADGE: Record<string, string> = {
  Ses: "border-amber-200/90 bg-amber-50/95 text-amber-950 ring-amber-100/60",
  Video: "border-violet-200/90 bg-violet-50/95 text-violet-950 ring-violet-100/60",
  Belgeler: "border-sky-200/90 bg-sky-50/95 text-sky-950 ring-sky-100/60",
  Resimler: "border-fuchsia-200/90 bg-fuchsia-50/95 text-fuchsia-950 ring-fuchsia-100/60",
  Sağlık: "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 ring-emerald-100/60",
  "Okul / Çocuk": "border-cyan-200/90 bg-cyan-50/95 text-cyan-950 ring-cyan-100/60",
  "Evcil Hayvan": "border-orange-200/90 bg-orange-50/95 text-orange-950 ring-orange-100/60",
  Araç: "border-slate-300/90 bg-slate-50/95 text-slate-900 ring-slate-100/60",
  Ev: "border-teal-200/90 bg-teal-50/95 text-teal-950 ring-teal-100/60",
  Fikirler: "border-indigo-200/90 bg-indigo-50/95 text-indigo-950 ring-indigo-100/60",
  Toplantı: "border-blue-200/90 bg-blue-50/95 text-blue-950 ring-blue-100/60",
  Diğer: "border-stone-200/90 bg-stone-50/95 text-stone-900 ring-stone-100/60",
};

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

type ArchiveRowWithoutFiles = Omit<ArchiveRow, "personal_archive_files">;

function mergeArchivesWithFiles(
  archives: ArchiveRowWithoutFiles[],
  files: ArchiveFileRow[],
): ArchiveRow[] {
  const map = new Map<string, ArchiveFileRow[]>();
  for (const f of files) {
    const list = map.get(f.archive_id);
    if (list) list.push(f);
    else map.set(f.archive_id, [f]);
  }
  return archives.map((a) => ({
    ...a,
    personal_archive_files: map.get(a.id) ?? [],
  }));
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

function notePreview(note: string | null, max = 120) {
  const t = (note ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function normTr(s: string) {
  return s.toLocaleLowerCase("tr-TR");
}

function categoryBadgeClass(category: string) {
  return (
    CATEGORY_BADGE[category] ??
    "border-slate-200/90 bg-slate-50/95 text-slate-900 ring-slate-100/60"
  );
}

function getPublicFileUrl(filePath: string) {
  return supabase.storage.from("personal-archive").getPublicUrl(filePath).data
    .publicUrl;
}

/** Türkçe duyarlı arama ile uyumlu: normTr üzerinde indeks, orijinal metinde aynı uzunlukta dilim. */
function highlightText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const qn = normTr(q);
  const tn = normTr(text);
  if (!qn.length || !tn.includes(qn)) return text;

  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = tn.indexOf(qn, i);
    if (idx === -1) {
      nodes.push(text.slice(i));
      break;
    }
    if (idx > i) nodes.push(text.slice(i, idx));
    const matchText = text.slice(idx, idx + qn.length);
    nodes.push(
      <mark
        key={`h-${key++}`}
        className="rounded px-0.5 py-0.5 [box-decoration-break:clone] bg-amber-200/95 text-inherit"
      >
        {matchText}
      </mark>,
    );
    i = idx + qn.length;
  }
  return nodes.length === 1 ? nodes[0] : <Fragment>{nodes}</Fragment>;
}

function chunkPaths(paths: string[], size: number) {
  const out: string[][] = [];
  for (let i = 0; i < paths.length; i += size) out.push(paths.slice(i, i + size));
  return out;
}

function ArchiveFilePreview({
  file,
  onImageClick,
}: {
  file: ArchiveFileRow;
  onImageClick: (url: string) => void;
}) {
  const url = getPublicFileUrl(file.file_path);
  const type = file.file_type ?? "";
  const nameLower = (file.file_name ?? "").toLowerCase();
  const isPdf =
    type === "application/pdf" ||
    nameLower.endsWith(".pdf") ||
    type.toLowerCase().includes("pdf");

  if (type.startsWith("image/")) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onImageClick(url)}
          className="overflow-hidden rounded-2xl border-2 border-violet-200/80 bg-white shadow-md ring-2 ring-white transition hover:ring-violet-300"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.file_name ?? "Önizleme"}
            className="h-20 max-w-[200px] object-cover sm:h-24 sm:max-w-[240px]"
          />
        </button>
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-700">
          {file.file_name}
        </span>
      </div>
    );
  }

  if (type.startsWith("audio/")) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-slate-800">{file.file_name}</p>
        <audio controls className="w-full max-w-md rounded-xl" src={url} preload="metadata" />
      </div>
    );
  }

  if (type.startsWith("video/")) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-slate-800">{file.file_name}</p>
        <video
          controls
          className="max-h-48 w-full max-w-md rounded-2xl border border-slate-200 bg-black shadow-md"
          src={url}
          preload="metadata"
        />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-slate-800">{file.file_name}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-full bg-violet-600 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-700"
        >
          PDF Aç
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold text-slate-800">{file.file_name}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-800 shadow-sm transition hover:border-violet-300 hover:text-violet-900"
      >
        Dosyayı Aç
      </a>
    </div>
  );
}

export default function KisiselArsivPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [records, setRecords] = useState<ArchiveRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_FILTER_ALL);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [info, setInfo] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState("");

  const detailRow = useMemo(
    () => records.find((r) => r.id === detailId) ?? null,
    [records, detailId],
  );

  const showSuccessToast = useCallback((message: string) => {
    if (toastClearTimerRef.current) {
      clearTimeout(toastClearTimerRef.current);
      toastClearTimerRef.current = null;
    }
    setToastMessage(message);
    toastClearTimerRef.current = setTimeout(() => {
      setToastMessage("");
      toastClearTimerRef.current = null;
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastClearTimerRef.current) {
        clearTimeout(toastClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const lock = isCreateModalOpen || detailId !== null || lightboxUrl !== null;
    if (!lock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isCreateModalOpen, detailId, lightboxUrl]);

  const loadRecords = useCallback(async () => {
    setLoadingList(true);

    const { data: archivesRaw, error: archErr } = await supabase
      .from("personal_archives")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    if (archErr) {
      console.error("[kisisel-arsiv] personal_archives list", archErr);
      setLoadingList(false);
      setInfo({
        kind: "err",
        text: "Kayıtlar yüklenemedi. Lütfen daha sonra tekrar deneyin.",
      });
      return;
    }

    const archives = (archivesRaw ?? []) as ArchiveRowWithoutFiles[];
    const archiveIds = archives.map((a) => a.id);
    const allFiles: ArchiveFileRow[] = [];

    if (archiveIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < archiveIds.length; i += CHUNK) {
        const slice = archiveIds.slice(i, i + CHUNK);
        const { data: filesRaw, error: filesErr } = await supabase
          .from("personal_archive_files")
          .select("*")
          .eq("tenant_id", TENANT_ID)
          .in("archive_id", slice);

        if (filesErr) {
          console.error("[kisisel-arsiv] personal_archive_files list", filesErr);
          setLoadingList(false);
          setInfo({
            kind: "err",
            text: "Kayıtlar yüklenemedi. Lütfen daha sonra tekrar deneyin.",
          });
          return;
        }
        allFiles.push(...((filesRaw ?? []) as ArchiveFileRow[]));
      }
    }

    setRecords(mergeArchivesWithFiles(archives, allFiles));
    setLoadingList(false);
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const recordsByCategory = useMemo(() => {
    if (categoryFilter === CATEGORY_FILTER_ALL) return records;
    return records.filter((row) => row.category === categoryFilter);
  }, [records, categoryFilter]);

  const visibleRows = useMemo(() => {
    const q = search.trim();
    if (!q) return recordsByCategory;
    const nq = normTr(q);
    return recordsByCategory.filter((row) => {
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
  }, [recordsByCategory, search]);

  const fileCount = useCallback((row: ArchiveRow) => {
    const f = row.personal_archive_files;
    return Array.isArray(f) ? f.length : 0;
  }, []);

  const stats = useMemo(() => {
    let totalFiles = 0;
    const categorySet = new Set<string>();
    for (const row of records) {
      totalFiles += fileCount(row);
      categorySet.add(row.category);
    }
    return {
      totalArchives: records.length,
      totalFiles,
      categoryKinds: categorySet.size,
    };
  }, [records, fileCount]);

  const canSave = useMemo(
    () => title.trim().length > 0 && !saving,
    [title, saving],
  );

  function resetForm() {
    setTitle("");
    setCategory("Diğer");
    setTags("");
    setNote("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    resetForm();
  }

  function closeDetail() {
    setDetailId(null);
    setLightboxUrl(null);
  }

  async function handleDeleteArchive(row: ArchiveRow) {
    if (
      !window.confirm(
        "Bu arşiv kaydı ve bağlı dosyaları silinecek. Emin misiniz?",
      )
    ) {
      return;
    }

    setDeletingId(row.id);
    setInfo(null);

    try {
      const fileRows = row.personal_archive_files ?? [];
      const paths = fileRows.map((f) => f.file_path).filter(Boolean);

      for (const batch of chunkPaths(paths, 50)) {
        if (batch.length === 0) continue;
        const { error: rmErr } = await supabase.storage
          .from("personal-archive")
          .remove(batch);
        if (rmErr) {
          console.error("[kisisel-arsiv] storage remove on delete", rmErr);
        }
      }

      const { error: delFilesErr } = await supabase
        .from("personal_archive_files")
        .delete()
        .eq("archive_id", row.id)
        .eq("tenant_id", TENANT_ID);

      if (delFilesErr) {
        console.error("[kisisel-arsiv] personal_archive_files delete", delFilesErr);
        throw delFilesErr;
      }

      const { error: delArcErr } = await supabase
        .from("personal_archives")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", TENANT_ID);

      if (delArcErr) {
        console.error("[kisisel-arsiv] personal_archives delete", delArcErr);
        throw delArcErr;
      }

      if (detailId === row.id) closeDetail();
      await loadRecords();
      setInfo({ kind: "ok", text: "Kayıt silindi." });
    } catch (e) {
      console.error("[kisisel-arsiv] delete archive", e);
      setInfo({
        kind: "err",
        text: "Kayıt silinemedi. Lütfen daha sonra tekrar deneyin.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setInfo({ kind: "err", text: "Başlık alanı zorunludur." });
      return;
    }

    const titleToSave = title.trim();
    const categoryToSave = category.trim() || "Diğer";
    const tagsToSave = tags.trim() || null;
    const noteToSave = note.trim() || null;

    setSaving(true);
    setInfo(null);

    const { data: insertedRows, error: insErr } = await supabase
      .from("personal_archives")
      .insert({
        tenant_id: TENANT_ID,
        title: titleToSave,
        category: categoryToSave,
        tags: tagsToSave,
        note: noteToSave,
      })
      .select("id");

    const archiveId = insertedRows?.[0]?.id as string | undefined;

    if (insErr || !archiveId) {
      console.error(
        "Kişisel arşiv kayıt hatası:",
        insErr ?? new Error("Kayıt sonrası id alınamadı"),
      );
      setSaving(false);
      setInfo({
        kind: "err",
        text: "Kayıt kaydedilemedi. Lütfen daha sonra tekrar deneyin.",
      });
      return;
    }

    for (const file of selectedFiles) {
      const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
      const path = `${TENANT_ID}/${archiveId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("personal-archive")
        .upload(path, file, { upsert: false });

      if (upErr) {
        console.error("Dosya yükleme hatası:", upErr);
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
        console.error("Dosya tablo kayıt hatası:", metaErr);
        void supabase.storage.from("personal-archive").remove([path]);
      }
    }

    await loadRecords();
    resetForm();
    setIsCreateModalOpen(false);
    showSuccessToast("Kayıt başarıyla eklendi.");
    setSaving(false);
    setInfo(null);
  }

  const searchInputClass =
    "w-full rounded-3xl border border-slate-200/95 bg-white py-3 pl-11 pr-4 text-[14px] font-medium text-slate-900 shadow-inner shadow-slate-100/80 outline-none ring-1 ring-violet-100/40 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

  const modalLabelClass =
    "mb-2 block text-[13px] font-semibold tracking-tight text-slate-800";

  const modalFieldClass =
    "w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-[14px] font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

  const searchLabelClass =
    "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-600";

  const chipBase =
    "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition sm:text-[12px]";
  const chipInactive =
    "border-slate-200/90 bg-white/90 text-slate-600 shadow-sm hover:border-violet-200 hover:text-violet-900";
  const chipActive =
    "border-violet-400 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-400/30";

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-violet-50 via-sky-50 to-emerald-50 px-3 py-6 sm:px-5 sm:py-8">
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-5 z-[9999] w-[min(92%,22rem)] -translate-x-1/2 rounded-3xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-5 py-3.5 text-center text-[13px] font-black text-emerald-950 shadow-2xl shadow-emerald-300/40 ring-2 ring-white/80"
        >
          {toastMessage}
        </div>
      ) : null}
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
              {!isCreateModalOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setInfo(null);
                    setIsCreateModalOpen(true);
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

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCategoryFilter(CATEGORY_FILTER_ALL)}
                className={`${chipBase} ${
                  categoryFilter === CATEGORY_FILTER_ALL ? chipActive : chipInactive
                }`}
              >
                {CATEGORY_FILTER_ALL}
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`${chipBase} ${
                    categoryFilter === c ? chipActive : chipInactive
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {loadingList ? (
                <p className="py-12 text-center text-[14px] font-semibold text-slate-500">
                  Yükleniyor…
                </p>
              ) : records.length === 0 ? (
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
              ) : recordsByCategory.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white px-5 py-12 text-center shadow-inner ring-1 ring-amber-100/50">
                  <p className="text-[15px] font-black text-slate-900">
                    Bu kategoride kayıt yok
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[13px] font-semibold text-slate-600">
                    Farklı bir kategori seçin veya tümünü görüntüleyin.
                  </p>
                </div>
              ) : visibleRows.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white px-5 py-12 text-center shadow-inner ring-1 ring-sky-100/50">
                  <p className="text-[15px] font-black text-slate-900">
                    Aramanıza uygun kayıt bulunamadı
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[13px] font-semibold text-slate-600">
                    Farklı bir kelime deneyin veya aramayı temizleyin.
                  </p>
                </div>
              ) : (
                visibleRows.map((row) => (
                  <article
                    key={row.id}
                    className="group rounded-3xl border border-slate-200/95 bg-gradient-to-br from-white via-violet-50/25 to-sky-50/30 p-4 shadow-xl shadow-slate-200/50 ring-1 ring-violet-100/40 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-violet-200/35 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-[15px] font-black leading-snug text-slate-900">
                        {highlightText(row.title, search)}
                      </h3>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${categoryBadgeClass(row.category)}`}
                      >
                        {row.category}
                      </span>
                    </div>
                    <p className="mt-3 text-[13px] font-semibold leading-relaxed text-slate-700">
                      {highlightText(notePreview(row.note), search)}
                    </p>
                    {row.tags?.trim() ? (
                      <p className="mt-2 text-[11px] font-semibold text-violet-800">
                        Etiketler: {row.tags}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
                      <time dateTime={row.created_at}>{formatTrDate(row.created_at)}</time>
                      <span className="rounded-full bg-slate-100/95 px-2 py-0.5 text-[10px] font-black text-slate-700">
                        {fileCount(row)} dosya
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLightboxUrl(null);
                          setDetailId(row.id);
                        }}
                        className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-[12px] font-black uppercase tracking-wide text-white shadow-md shadow-violet-400/30 transition hover:brightness-110"
                      >
                        Detay
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === row.id}
                        onClick={() => void handleDeleteArchive(row)}
                        className="rounded-2xl border-2 border-rose-200 bg-rose-50/90 px-4 py-2 text-[12px] font-black uppercase tracking-wide text-rose-800 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === row.id ? "Siliniyor…" : "Sil"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {isCreateModalOpen ? (
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
              closeCreateModal();
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
                  closeCreateModal();
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
                        setSelectedFiles(
                          e.target.files ? Array.from(e.target.files) : [],
                        )
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
                        {selectedFiles.length === 0
                          ? "Henüz dosya seçilmedi."
                          : `${selectedFiles.length} dosya seçildi`}
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
                    closeCreateModal();
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
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailRow ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-6 sm:px-5 sm:py-10"
          role="presentation"
        >
          <div
            role="presentation"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => closeDetail()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
            className="relative z-10 flex max-h-[min(92vh,46rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-white/90 bg-white shadow-2xl shadow-violet-500/30 ring-1 ring-violet-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-violet-100/90 bg-gradient-to-r from-violet-100/95 via-sky-50/95 to-emerald-100/90 px-5 py-5 sm:px-7 sm:py-6">
              <div
                className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-white/50 blur-2xl"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => closeDetail()}
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-3xl border border-white/90 bg-white/95 text-xl font-light text-slate-600 shadow-md transition hover:bg-white hover:text-slate-900 sm:right-4 sm:top-4"
                aria-label="Kapat"
              >
                ×
              </button>
              <h2
                id="detail-modal-title"
                className="pr-12 text-lg font-black leading-snug text-slate-900 sm:text-xl"
              >
                {highlightText(detailRow.title, search)}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${categoryBadgeClass(detailRow.category)}`}
                >
                  {detailRow.category}
                </span>
                <time
                  className="text-[12px] font-bold text-slate-500"
                  dateTime={detailRow.created_at}
                >
                  {formatTrDate(detailRow.created_at)}
                </time>
              </div>
              {detailRow.tags?.trim() ? (
                <p className="mt-3 text-[13px] font-semibold text-violet-900">
                  Etiketler: {detailRow.tags}
                </p>
              ) : (
                <p className="mt-3 text-[13px] font-medium text-slate-400">Etiket yok</p>
              )}
              <div className="mt-4 rounded-3xl border border-slate-200/90 bg-slate-50/60 p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Not
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[14px] font-semibold leading-relaxed text-slate-800">
                  {detailRow.note?.trim()
                    ? highlightText(detailRow.note, search)
                    : "—"}
                </p>
              </div>

              <div className="mt-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Dosyalar
                </p>
                <ul className="mt-3 space-y-4">
                  {(detailRow.personal_archive_files ?? []).length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-[13px] font-semibold text-slate-500">
                      Bu kayda dosya eklenmemiş.
                    </li>
                  ) : (
                    (detailRow.personal_archive_files ?? []).map((f) => (
                      <li
                        key={f.id}
                        className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white to-violet-50/30 p-4 shadow-sm ring-1 ring-violet-50/60"
                      >
                        <ArchiveFilePreview
                          file={f}
                          onImageClick={(u) => setLightboxUrl(u)}
                        />
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="shrink-0 border-t border-violet-100/80 bg-white/95 px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={() => closeDetail()}
                className="w-full rounded-3xl bg-gradient-to-r from-slate-800 to-slate-900 py-3 text-[13px] font-black uppercase tracking-wide text-white shadow-lg transition hover:brightness-110 sm:w-auto sm:px-8"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/92 px-4 py-8"
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-3xl border border-white/20 bg-white/10 text-2xl font-light text-white transition hover:bg-white/20"
            aria-label="Kapat"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Büyütülmüş görsel"
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
