"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-900 transition hover:border-slate-400 hover:bg-slate-200 no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const CATEGORY_BADGE: Record<string, string> = {
  Ses: "border-amber-200 bg-amber-50 text-amber-800",
  Video: "border-violet-200 bg-violet-50 text-violet-800",
  Belgeler: "border-cyan-200 bg-cyan-50 text-cyan-800",
  Resimler: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  Diğer: "border-stone-200 bg-stone-50 text-stone-800",
};

const openLinkClass =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border-2 border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-black text-sky-950 no-underline transition hover:border-sky-300 hover:bg-sky-100";

const downloadLinkClass =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border-2 border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-black text-emerald-900 no-underline transition hover:border-emerald-300 hover:bg-emerald-100";

type ArchiveFileRow = {
  id: string;
  tenant_id?: string;
  archive_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

type ArchiveRecord = {
  id: string;
  tenant_id: string;
  title: string;
  category: string;
  tags: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

function categoryBadgeClass(category: string): string {
  const tone =
    CATEGORY_BADGE[category] ?? "border-slate-200 bg-slate-50 text-slate-800";
  return `inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone}`;
}

function parseTagsList(tags: string | null): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function getFileExtensionLower(file: ArchiveFileRow): string {
  const n = file.file_name ?? "";
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1).toLowerCase() : "";
}

function fileTypeLabel(file: ArchiveFileRow): string {
  const t = file.file_type?.trim();
  if (t) return t;
  const ext = getFileExtensionLower(file);
  return ext ? ext.toUpperCase() : "Bilinmeyen";
}

function isImageFile(file: ArchiveFileRow): boolean {
  const t = (file.file_type ?? "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const ext = getFileExtensionLower(file);
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

function isAudioFile(file: ArchiveFileRow): boolean {
  const t = (file.file_type ?? "").toLowerCase();
  if (t.startsWith("audio/")) return true;
  const ext = getFileExtensionLower(file);
  return ["mp3", "wav", "ogg", "m4a", "aac", "flac", "amr"].includes(ext);
}

function isAmrFile(file: ArchiveFileRow): boolean {
  if (getFileExtensionLower(file) === "amr") return true;
  return (file.file_type ?? "").toLowerCase().includes("amr");
}

function isBrowserPreviewAudio(file: ArchiveFileRow): boolean {
  if (!isAudioFile(file) || isAmrFile(file)) return false;
  const ext = getFileExtensionLower(file);
  return ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext);
}

function isVideoFile(file: ArchiveFileRow): boolean {
  const t = (file.file_type ?? "").toLowerCase();
  if (t.startsWith("video/")) return true;
  const ext = getFileExtensionLower(file);
  return ["mp4", "webm", "mov", "m4v"].includes(ext);
}

function isPdfFile(file: ArchiveFileRow): boolean {
  const t = (file.file_type ?? "").toLowerCase();
  const ext = getFileExtensionLower(file);
  return t === "application/pdf" || ext === "pdf" || t.includes("pdf");
}

function isOfficeFile(file: ArchiveFileRow): boolean {
  const ext = getFileExtensionLower(file);
  return ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
}

function isDocumentFile(file: ArchiveFileRow): boolean {
  return isPdfFile(file) || isOfficeFile(file);
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(Number(bytes))) return "—";
  const b = Number(bytes);
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const rounded =
    i === 0 ? String(Math.round(n)) : n < 10 ? n.toFixed(1) : String(Math.round(n));
  return `${rounded} ${units[i]}`;
}

function ReadonlyArchiveFileCard({
  file,
  onImageClick,
  adminUserId,
}: {
  file: ArchiveFileRow;
  onImageClick: (url: string, name: string) => void;
  adminUserId: string | null;
}) {
  const [imgBroken, setImgBroken] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState(false);

  useEffect(() => {
    if (!adminUserId) return;
    let cancelled = false;
    fetch(
      `/api/admin/kisisel-arsiv/signed-url` +
      `?filePath=${encodeURIComponent(file.file_path)}` +
      `&adminUserId=${encodeURIComponent(adminUserId)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { signedUrl?: string }) => {
        if (cancelled) return;
        if (data.signedUrl) setSignedUrl(data.signedUrl);
        else setSignedUrlError(true);
      })
      .catch(() => { if (!cancelled) setSignedUrlError(true); });
    return () => { cancelled = true; };
  }, [file.file_path, adminUserId]);

  const fileName = file.file_name?.trim() || "Dosya";
  const openLabel = isDocumentFile(file) ? "Dosyayı Aç" : "Önizle / Aç";

  return (
    <article className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {isImageFile(file) && !imgBroken && signedUrl ? (
          <button
            type="button"
            onClick={() => { if (signedUrl) onImageClick(signedUrl, fileName); }}
            className="shrink-0 overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
            title="Büyüt"
          >
            <img
              src={signedUrl}
              alt={fileName}
              className="h-24 w-24 object-cover sm:h-28 sm:w-28"
              loading="lazy"
              decoding="async"
              onError={() => setImgBroken(true)}
            />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-black text-slate-900">{fileName}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Tip: {fileTypeLabel(file)}
          </p>
          <p className="text-xs font-semibold text-slate-500">
            Boyut: {formatFileSize(file.file_size)}
          </p>
          {signedUrlError ? (
            <p className="mt-2 text-xs font-medium text-rose-600">Dosya URL'i oluşturulamadı.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {signedUrl ? (
                <>
                  <a href={signedUrl} target="_blank" rel="noreferrer" className={openLinkClass}>
                    {openLabel}
                  </a>
                  <a href={signedUrl} download={fileName} className={downloadLinkClass}>
                    İndir
                  </a>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-400">Yükleniyor…</span>
              )}
            </div>
          )}
        </div>
      </div>

      {isImageFile(file) && imgBroken ? (
        <p className="mt-3 text-sm font-medium text-slate-500">Görsel önizlemesi yüklenemedi.</p>
      ) : null}

      {isAudioFile(file) ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          {isBrowserPreviewAudio(file) ? (
            <audio controls className="w-full" src={signedUrl ?? undefined} preload="metadata" />
          ) : (
            <p className="text-sm font-medium text-slate-600">
              Bu ses formatı tarayıcıda önizlenemeyebilir. Dinlemek için dosyayı indirin.
            </p>
          )}
        </div>
      ) : null}

      {isVideoFile(file) ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-black">
          <video
            controls
            className="max-h-[360px] w-full object-contain"
            src={signedUrl ?? undefined}
            preload="metadata"
          />
        </div>
      ) : null}

      {isPdfFile(file) ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <iframe title={fileName} src={signedUrl ?? undefined} className="h-[360px] w-full bg-white" />
        </div>
      ) : null}

      {isOfficeFile(file) ? (
        <p className="mt-4 text-sm font-medium text-slate-600">
          Word/Office belgesi tarayıcıda önizlenemeyebilir. Görüntülemek için Dosyayı Aç
          veya İndir kullanın.
        </p>
      ) : null}
    </article>
  );
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-3) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function AdminWorkspaceArchiveDetailPage() {
  useBfcacheRefresh();
  const params = useParams();
  const expertUserId = typeof params.id === "string" ? params.id : "";
  const archiveId = typeof params.archiveId === "string" ? params.archiveId : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [archive, setArchive] = useState<ArchiveRecord | null>(null);
  const [files, setFiles] = useState<ArchiveFileRow[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const loadDetail = useCallback(async () => {
    if (!expertUserId || !archiveId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    let userRow: Record<string, unknown> | null = null;
    let userError: { message: string } | null = null;
    {
      const adminId = readYasamUser()?.id;
      const userRes = await fetch(`/api/admin/users/${expertUserId}`, {
        headers: adminHeaders(adminId),
      });
      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => ({}))) as { user?: Record<string, unknown> };
        userRow = userJson.user ?? null;
      } else {
        userError = { message: `HTTP ${userRes.status}` };
      }
    }

    if (userError || !userRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const expertRow = userRow as Record<string, unknown>;
    const mappedExpert = mapDbUser(expertRow);
    const tenantId =
      expertRow.tenant_id != null ? String(expertRow.tenant_id).trim() : "";

    setExpert(mappedExpert);

    if (!isExpertModuleEnabled(mappedExpert, "personal_archive")) {
      setModuleDisabled(true);
      setArchive(null);
      setFiles([]);
      setNotFound(false);
      setLoading(false);
      return;
    }

    if (!tenantId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let archiveRow: Record<string, unknown> | null = null;
    {
      const adminId = readYasamUser()?.id;
      const res = await fetch(
        `/api/admin/users/${expertUserId}/archive?archiveId=${encodeURIComponent(archiveId)}`,
        { headers: adminHeaders(adminId) },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        row?: Record<string, unknown>;
      };
      if (res.ok && json.ok) archiveRow = json.row ?? null;
    }

    if (!archiveRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let filesRaw: Record<string, unknown>[] = [];
    {
      const adminId = readYasamUser()?.id;
      const res = await fetch(
        `/api/admin/users/${expertUserId}/archive?files=1&archiveId=${encodeURIComponent(archiveId)}`,
        { headers: adminHeaders(adminId) },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: Record<string, unknown>[];
      };
      if (!res.ok || !json.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      filesRaw = json.rows ?? [];
    }

    const row = archiveRow as Record<string, unknown>;
    setArchive({
      id: String(row.id ?? ""),
      tenant_id: String(row.tenant_id ?? ""),
      title: String(row.title ?? ""),
      category: String(row.category ?? ""),
      tags: row.tags != null ? String(row.tags) : null,
      note: row.note != null ? String(row.note) : null,
      created_at: row.created_at != null ? String(row.created_at) : "",
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
    });
    setFiles(filesRaw as unknown as ArchiveFileRow[]);
    setModuleDisabled(false);
    setNotFound(false);
    setLoading(false);
  }, [expertUserId, archiveId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setAdminUserId(session?.id ?? null);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadDetail();
  }, [sessionChecked, allowed, loadDetail]);

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <p className="text-xl font-black text-rose-950">Erişim reddedildi</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
        </div>
      </main>
    );
  }

  const tagList = archive ? parseTagsList(archive.tags) : [];
  const showUpdatedAt =
    archive?.updated_at?.trim() &&
    archive.updated_at !== archive.created_at;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : moduleDisabled ? (
          <section
            className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
            role="alert"
          >
            <p className="text-base font-black text-rose-950">
              Bu modül kullanıcıda aktif değil.
            </p>
            <p className="mt-2 text-sm font-medium text-rose-900/80">
              Kişisel Arşiv modülü bu uzman için kapalı.
            </p>
            <Link href={`/admin/users/${expertUserId}/workspace`} className={`${navBtn} mt-5 inline-flex`}>
              Uzman Workspace
            </Link>
          </section>
        ) : notFound || !archive ? (
          <section className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Kayıt bulunamadı</p>
            <Link
              href={`/admin/users/${expertUserId}/workspace/archive`}
              className={`${navBtn} mt-6 inline-flex`}
            >
              Arşiv listesine dön
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-zinc-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-700 text-white shadow-md">
                  <Archive className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-600">
                    Salt okunur izleme
                  </p>
                  {expert ? (
                    <p className="mt-2 text-xs font-bold text-indigo-900">
                      Uzman: {expert.fullName} · {expert.email}
                    </p>
                  ) : null}
                </div>
              </div>
            </header>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Başlık
              </h2>
              <p className="mt-2 text-2xl font-black text-slate-950">{archive.title || "—"}</p>
            </section>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Kategori
              </h2>
              <div className="mt-3">
                <span className={categoryBadgeClass(archive.category)}>
                  {archive.category || "—"}
                </span>
              </div>
            </section>

            <section className={`${panelClass} border-indigo-200/80`}>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Etiketler
              </h2>
              {tagList.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tagList.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm font-medium text-slate-500">—</p>
              )}
            </section>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Notlar
              </h2>
              <div className="mt-3 rounded-2xl border-2 border-slate-100 bg-slate-50/80 p-4">
                <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-700">
                  {archive.note?.trim() || "—"}
                </p>
              </div>
            </section>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Tarihler
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <dt className="text-xs font-black text-slate-500">Kayıt tarihi</dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900">
                    {formatCreatedAt(archive.created_at)}
                  </dd>
                </div>
                {showUpdatedAt ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <dt className="text-xs font-black text-slate-500">Güncelleme tarihi</dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">
                      {formatCreatedAt(archive.updated_at!)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className={`${panelClass} border-cyan-200/80`}>
              <h2 className="text-lg font-black text-slate-950">Ekli Dosyalar</h2>
              <p className="mt-1 text-sm font-medium text-slate-600">
                {files.length} dosya
              </p>
              {files.length === 0 ? (
                <p className="mt-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                  Bu kayda dosya eklenmemiş.
                </p>
              ) : (
                <ul className="mt-6 space-y-4">
                  {files.map((file) => (
                    <li key={file.id} className="list-none">
                      <ReadonlyArchiveFileCard
                        file={file}
                        onImageClick={(url, name) => setLightbox({ url, name })}
                        adminUserId={adminUserId}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {lightbox ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Görsel önizleme"
            onClick={() => setLightbox(null)}
          >
            <div
              className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightbox.url}
                alt={lightbox.name}
                className="max-h-[80vh] w-full object-contain"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">{lightbox.name}</p>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className={openLinkClass}
                >
                  Yeni sekmede aç
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
