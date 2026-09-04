"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
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
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Güvenli kişisel arşiv API çağrıları için header — x-user-id + (varsa) x-session-token */
function userHeaders(json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-user-id": readYasamUser()?.id ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import {
  DIGITAL_CONTENT_DEMO_BANNER,
  DIGITAL_CONTENT_DEMO_MESSAGE,
} from "@/lib/demo/digitalContentDemo";

/**
 * Supabase kolonları:
 * personal_archives: id, tenant_id, title, category, tags, note, created_at, updated_at
 * personal_archive_files: id, tenant_id, archive_id, file_name, file_path, file_type, file_size, created_at
 * storage bucket: personal-archive (file_path storage içindeki yol ile uyumlu olmalı)
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

const CATEGORY_BADGE: Record<string, string> = {
  Ses: "border-amber-200 bg-amber-50 text-amber-700",
  Video: "border-violet-200 bg-violet-50 text-violet-700",
  Belgeler: "border-cyan-200 bg-cyan-50 text-cyan-700",
  Resimler: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  Sağlık: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Okul / Çocuk": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Evcil Hayvan": "border-orange-200 bg-orange-50 text-orange-700",
  Araç: "border-slate-200 bg-slate-50 text-slate-800",
  Ev: "border-teal-200 bg-teal-50 text-teal-700",
  Fikirler: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Toplantı: "border-blue-200 bg-blue-50 text-blue-700",
  Diğer: "border-stone-200 bg-stone-50 text-stone-800",
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

/** Arama: Türkçe harfleri ASCII’ye yaklaştır, noktalama/tire/alt çizgiyi boşluğa çevir, boşlukları sadeleştir. */
function normalizeSearchString(s: string): string {
  let t = (s ?? "").toLocaleLowerCase("tr-TR");
  t = t
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ");
  return t.replace(/\s+/g, " ").trim();
}

function searchQueryTokens(raw: string): string[] {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => normalizeSearchString(p)).filter(Boolean);
}

function archiveSearchBlob(row: ArchiveRow): string {
  const names = (row.personal_archive_files ?? []).map((f) => f.file_name ?? "");
  const raw = [row.title, row.category, row.tags ?? "", row.note ?? "", ...names].join(" ");
  return normalizeSearchString(raw);
}

function rowMatchesSearch(row: ArchiveRow, rawQuery: string): boolean {
  const tokens = searchQueryTokens(rawQuery);
  if (tokens.length === 0) return true;
  const blob = archiveSearchBlob(row);
  return tokens.every((t) => blob.includes(t));
}

/** Başlıkta vurgulama: uzunluk koruyan Türkçe katlama (indeksler orijinal metinle uyumlu). */
function foldTrAsciiPreserveLen(s: string): string {
  const t = s.toLocaleLowerCase("tr-TR");
  return t
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function categoryBadgeClass(category: string) {
  const tone =
    CATEGORY_BADGE[category] ?? "border-slate-200 bg-slate-50 text-slate-800";
  return `shrink-0 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide shadow-sm ${tone}`;
}

/** Başlıkta vurgulama: arama metnindeki en uzun kelimeyi katlamalı eşleştirir (çok kelimede yalnızca bir parça). */
function highlightText(text: string, query: string): ReactNode {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !text) return text;
  const needle = tokens.reduce((a, b) => (a.length >= b.length ? a : b));
  const fn = foldTrAsciiPreserveLen(needle);
  if (!fn.length) return text;
  const fh = foldTrAsciiPreserveLen(text);
  if (!fh.includes(fn)) return text;

  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = fh.indexOf(fn, i);
    if (idx === -1) {
      nodes.push(text.slice(i));
      break;
    }
    if (idx > i) nodes.push(text.slice(i, idx));
    const matchText = text.slice(idx, idx + fn.length);
    nodes.push(
      <mark
        key={`h-${key++}`}
        className="rounded px-0.5 py-0.5 [box-decoration-break:clone] bg-amber-200/95 text-inherit"
      >
        {matchText}
      </mark>,
    );
    i = idx + fn.length;
  }
  return nodes.length === 1 ? nodes[0] : <Fragment>{nodes}</Fragment>;
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
  const rounded = i === 0 ? String(Math.round(n)) : n < 10 ? n.toFixed(1) : String(Math.round(n));
  return `${rounded} ${units[i]}`;
}

function fileDisplayType(file: ArchiveFileRow): string {
  const t = file.file_type?.trim();
  if (t) return t;
  const n = file.file_name ?? "";
  const dot = n.lastIndexOf(".");
  return dot >= 0 ? `Dosya (${n.slice(dot)})` : "Bilinmeyen tür";
}

function getFileExtensionLower(file: ArchiveFileRow): string {
  const n = file.file_name ?? "";
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1).toLowerCase() : "";
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
  const t = (file.file_type ?? "").toLowerCase();
  return t.includes("amr");
}

/** Tarayıcıda <audio controls> ile önizleme: mp3, wav, ogg, m4a, aac, flac (+ MIME yedekleri). */
function isBrowserPreviewAudioControls(file: ArchiveFileRow): boolean {
  if (!isAudioFile(file) || isAmrFile(file)) return false;
  const ext = getFileExtensionLower(file);
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return true;
  const t = (file.file_type ?? "").toLowerCase();
  if (t.includes("mpeg") || t === "audio/mpeg") return true;
  if (t.includes("wav") || t.includes("wave")) return true;
  if (t.includes("ogg") && t.startsWith("audio/")) return true;
  if (t.includes("aac")) return true;
  if (t.startsWith("audio/mp4")) return true;
  if (t.includes("flac")) return true;
  return false;
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

type DetailFileKind = "image" | "audio" | "video" | "pdf" | "office" | "other";

function detectDetailFileKind(file: ArchiveFileRow): DetailFileKind {
  if (isImageFile(file)) return "image";
  if (isAudioFile(file)) return "audio";
  if (isVideoFile(file)) return "video";
  if (isPdfFile(file)) return "pdf";
  if (isOfficeFile(file)) return "office";
  return "other";
}

function detailFileIcon(kind: DetailFileKind): string {
  switch (kind) {
    case "image":
      return "🖼";
    case "audio":
      return "🎵";
    case "video":
      return "🎬";
    case "pdf":
      return "📄";
    case "office":
      return "📑";
    default:
      return "📎";
  }
}

const detailDownloadLinkClass =
  "inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-teal-50 px-8 py-4 text-center text-base font-black text-emerald-900 shadow-md ring-1 ring-white/80 transition hover:brightness-95 sm:flex-none";

const detailSecondaryLinkClass =
  "inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-2xl border border-sky-200/90 bg-gradient-to-r from-sky-50 to-violet-50 px-8 py-4 text-center text-base font-black text-sky-950 shadow-md ring-1 ring-white/80 transition hover:brightness-95 sm:flex-none";

const detailGrowButtonClass =
  "inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-2xl border border-violet-200/90 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-8 py-4 text-center text-base font-black text-violet-950 shadow-md ring-1 ring-white/80 transition hover:brightness-95 sm:flex-none";

function DetailArchiveFileCard({
  file,
  onImageClick,
  onDownload,
  tenantId,
  userId,
}: {
  file: ArchiveFileRow;
  onImageClick: (url: string) => void;
  onDownload: (file: ArchiveFileRow) => void | Promise<void>;
  tenantId: string | null;
  userId: string | null;
}) {
  const [imgBroken, setImgBroken] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState(false);

  useEffect(() => {
    if (!tenantId || !userId) return;
    let cancelled = false;
    fetch(
      `/api/kisisel-arsiv/signed-url` +
      `?filePath=${encodeURIComponent(file.file_path)}` +
      `&tenantId=${encodeURIComponent(tenantId)}` +
      `&userId=${encodeURIComponent(userId)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { signedUrl?: string }) => {
        if (cancelled) return;
        if (data.signedUrl) setSignedUrl(data.signedUrl);
        else setSignedUrlError(true);
      })
      .catch(() => { if (!cancelled) setSignedUrlError(true); });
    return () => { cancelled = true; };
  }, [file.file_path, tenantId, userId]);

  const kind = detectDetailFileKind(file);
  const fileName = file.file_name?.trim() || "Dosya";
  const typeLabel = fileDisplayType(file);
  const sizeLabel = formatFileSize(file.file_size);

  const downloadButton = (
    <button
      type="button"
      onClick={() => void onDownload(file)}
      className={detailDownloadLinkClass}
    >
      İndir
    </button>
  );

  const previewNewTabLink = signedUrl ? (
    <a href={signedUrl} target="_blank" rel="noreferrer" className={detailSecondaryLinkClass}>
      Önizle / Yeni Sekme
    </a>
  ) : null;

  const browserOpenLink = signedUrl ? (
    <a href={signedUrl} target="_blank" rel="noreferrer" className={detailSecondaryLinkClass}>
      Tarayıcıda Aç
    </a>
  ) : null;

  let previewLabel = "Önizle";
  if (kind === "audio") previewLabel = "Dinle";
  if (kind === "video") previewLabel = "İzle";

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-violet-100/90 bg-gradient-to-br from-white via-violet-50/25 to-sky-50/20 p-6 shadow-md ring-1 ring-slate-100/70">
      <div className="flex gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-white text-3xl shadow-inner" aria-hidden>
          {detailFileIcon(kind)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xl font-black leading-snug text-slate-900">{fileName}</p>
          <p className="mt-2 break-all text-sm font-semibold text-slate-600">{typeLabel}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Boyut: {sizeLabel}</p>
        </div>
      </div>

      {kind === "office" || kind === "other" ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-3 py-3">
          <p className="text-[12px] font-medium leading-relaxed text-slate-600">
            Bu dosya türü tarayıcıda önizlenemeyebilir.
            {kind === "office"
              ? " Düzenlemek veya görüntülemek için dosyayı indirip Office uyumlu bir uygulamada açın."
              : " İndirerek cihazınızda uygun uygulama ile açabilirsiniz."}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {previewLabel}
          </p>
          {kind === "image" ? (
            <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
              {signedUrlError ? (
                <p className="px-3 py-6 text-center text-[13px] font-semibold text-slate-500">
                  Önizleme URL'i oluşturulamadı.
                </p>
              ) : !signedUrl ? (
                <p className="px-3 py-6 text-center text-[13px] font-semibold text-slate-400">
                  Yükleniyor…
                </p>
              ) : !imgBroken ? (
                <div className="block w-full max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedUrl}
                    alt={fileName}
                    className="mx-auto w-full max-h-[520px] rounded-2xl object-contain"
                    onError={() => setImgBroken(true)}
                  />
                </div>
              ) : (
                <p className="px-3 py-6 text-center text-[13px] font-semibold text-slate-500">
                  Görsel yüklenemedi.
                </p>
              )}
            </div>
          ) : null}

          {kind === "audio" ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-inner">
              {isBrowserPreviewAudioControls(file) ? (
                <audio
                  controls
                  className="w-full max-w-full rounded-xl"
                  src={signedUrl ?? undefined}
                  preload="metadata"
                />
              ) : (
                <p className="text-[12px] font-medium leading-relaxed text-slate-600">
                  {isAmrFile(file) ? (
                    <>
                      Bu ses formatı tarayıcıda önizlenemeyebilir. Dinlemek için dosyayı indirip
                      telefon/bilgisayarınızda açabilirsiniz.
                    </>
                  ) : (
                    <>
                      Bu ses formatı tarayıcıda önizlenemeyebilir. Dinlemek için dosyayı indirip
                      uygun bir oynatıcıda açabilirsiniz.
                    </>
                  )}
                </p>
              )}
            </div>
          ) : null}

          {kind === "video" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-black shadow-inner">
              <video
                controls
                className="max-h-[520px] w-full rounded-2xl object-contain"
                src={signedUrl ?? undefined}
                preload="metadata"
              />
            </div>
          ) : null}

          {kind === "pdf" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-inner">
              <iframe title={fileName} src={signedUrl ?? undefined} className="h-[420px] w-full bg-white" />
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {kind === "image" ? (
          <>
            <button
              type="button"
              disabled={!signedUrl}
              onClick={() => { if (signedUrl) onImageClick(signedUrl); }}
              className={detailGrowButtonClass}
            >
              Büyüt
            </button>
            {previewNewTabLink}
            {downloadButton}
          </>
        ) : null}

        {kind === "pdf" ? (
          <>
            {previewNewTabLink}
            {downloadButton}
          </>
        ) : null}

        {kind === "audio" ? (
          <>
            {!isAmrFile(file) && !isBrowserPreviewAudioControls(file) ? browserOpenLink : null}
            {downloadButton}
          </>
        ) : null}

        {kind === "video" ? (
          <>
            {browserOpenLink}
            {downloadButton}
          </>
        ) : null}

        {kind === "office" || kind === "other" ? downloadButton : null}
      </div>
    </div>
  );
}

export default function KisiselArsivPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailEditTitle, setDetailEditTitle] = useState("");
  const [detailEditCategory, setDetailEditCategory] = useState<string>(CATEGORIES[0]);
  const [detailEditTags, setDetailEditTags] = useState("");
  const [detailEditNote, setDetailEditNote] = useState("");
  const [detailExtraFiles, setDetailExtraFiles] = useState<File[]>([]);
  const [savingDetail, setSavingDetail] = useState(false);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<ArchiveRow | null>(null);
  const [info, setInfo] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null,
  );

  const detailRow = useMemo(
    () => records.find((r) => r.id === detailId) ?? null,
    [records, detailId],
  );

  const showToast = useCallback(
    (message: string, variant: "success" | "error", durationMs = 1500) => {
      if (toastClearTimerRef.current) {
        clearTimeout(toastClearTimerRef.current);
        toastClearTimerRef.current = null;
      }
      setToast({ message, variant });
      toastClearTimerRef.current = setTimeout(() => {
        setToast(null);
        toastClearTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  const showSuccessToast = useCallback(
    (message: string) => showToast(message, "success", 1500),
    [showToast],
  );

  // Demo hesap — standart "işlem pasif" uyarısı (içerik gizlenmez, işlem engellenir).
  const notifyDemo = useCallback(
    () => showToast(DIGITAL_CONTENT_DEMO_MESSAGE, "error", 5000),
    [showToast],
  );

  const handleDownload = useCallback(
    async (file: ArchiveFileRow) => {
      if (isDemo) { notifyDemo(); return; }
      const name = file.file_name?.trim() || "dosya";
      if (!tenantId || !userId) {
        showToast("Dosya indirilemedi.", "error", 2000);
        return;
      }
      try {
        const res = await fetch(
          `/api/kisisel-arsiv/signed-url` +
          `?filePath=${encodeURIComponent(file.file_path)}` +
          `&tenantId=${encodeURIComponent(tenantId)}` +
          `&userId=${encodeURIComponent(userId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { signedUrl?: string };
        if (!data.signedUrl) throw new Error("URL boş");
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = name;
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        console.error("Archive file download failed:", e);
        showToast("Dosya indirilemedi.", "error", 2000);
      }
    },
    [showToast, tenantId, userId, isDemo, notifyDemo],
  );

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
    setUserId(readYasamUser()?.id ?? null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastClearTimerRef.current) {
        clearTimeout(toastClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxUrl]);

  useEffect(() => {
    const lock =
      isCreateModalOpen ||
      detailId !== null ||
      lightboxUrl !== null ||
      deleteConfirmRow !== null;
    if (!lock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isCreateModalOpen, detailId, lightboxUrl, deleteConfirmRow]);

  const loadRecords = useCallback(async () => {
    // Demo hesap — gerçek/örnek kayıt gösterilmez, temiz boş arşiv.
    if (isDemo) {
      setRecords([]);
      setLoadingList(false);
      return;
    }
    if (!tenantId) return;

    setLoadingList(true);

    let archives: ArchiveRowWithoutFiles[];
    try {
      const res = await fetch("/api/kisisel-arsiv", { headers: userHeaders() });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: ArchiveRowWithoutFiles[];
      };
      if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      archives = json.rows ?? [];
    } catch (archErr) {
      console.error("[kisisel-arsiv] personal_archives list", archErr);
      setLoadingList(false);
      setInfo({
        kind: "err",
        text: "Kayıtlar yüklenemedi. Lütfen daha sonra tekrar deneyin.",
      });
      return;
    }
    const archiveIds = archives.map((a) => a.id);
    const allFiles: ArchiveFileRow[] = [];

    if (archiveIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < archiveIds.length; i += CHUNK) {
        const slice = archiveIds.slice(i, i + CHUNK);
        try {
          const res = await fetch(
            `/api/kisisel-arsiv/files?archiveIds=${encodeURIComponent(slice.join(","))}`,
            { headers: userHeaders() },
          );
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: ArchiveFileRow[] };
          if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
          allFiles.push(...((json.rows ?? []) as ArchiveFileRow[]));
        } catch (filesErr) {
          console.error("[kisisel-arsiv] personal_archive_files list", filesErr);
          setLoadingList(false);
          setInfo({
            kind: "err",
            text: "Kayıtlar yüklenemedi. Lütfen daha sonra tekrar deneyin.",
          });
          return;
        }
      }
    }

    setRecords(mergeArchivesWithFiles(archives, allFiles));
    setLoadingList(false);
  }, [tenantId, isDemo]);

  useEffect(() => {
    runInEffect(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const visibleRows = useMemo(() => {
    const q = search.trim();
    if (!q) return records;
    return records.filter((row) => rowMatchesSearch(row, q));
  }, [records, search]);

  useEffect(() => {
    if (!detailRow || detailEditMode) return;
    const row = detailRow;
    runInEffect(() => {
      setDetailEditTitle(row.title);
      setDetailEditCategory(row.category);
      setDetailEditTags(row.tags ?? "");
      setDetailEditNote(row.note ?? "");
    });
  }, [detailRow, detailEditMode]);

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
    setDetailEditMode(false);
    setDetailExtraFiles([]);
    if (detailFileInputRef.current) detailFileInputRef.current.value = "";
  }

  function cancelDetailEdit() {
    if (!detailRow) return;
    setDetailEditTitle(detailRow.title);
    setDetailEditCategory(detailRow.category);
    setDetailEditTags(detailRow.tags ?? "");
    setDetailEditNote(detailRow.note ?? "");
    setDetailExtraFiles([]);
    if (detailFileInputRef.current) detailFileInputRef.current.value = "";
    setDetailEditMode(false);
  }

  async function saveDetailEdit() {
    if (isDemo) { notifyDemo(); return; }
    if (!detailRow || savingDetail) return;
    if (!detailEditTitle.trim()) {
      showToast("Başlık alanı zorunludur.", "error", 1800);
      return;
    }

    setSavingDetail(true);
    try {
      const archiveId = detailRow.id;
      const titleToSave = detailEditTitle.trim();
      const categoryToSave = detailEditCategory.trim() || "Diğer";
      const tagsToSave = detailEditTags.trim() || null;
      const noteToSave = detailEditNote.trim() || null;

      try {
        const res = await fetch("/api/kisisel-arsiv", {
          method: "PATCH",
          headers: userHeaders(true),
          body: JSON.stringify({
            id: archiveId,
            title: titleToSave,
            category: categoryToSave,
            tags: tagsToSave,
            note: noteToSave,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      } catch (updErr) {
        console.error("[kisisel-arsiv] personal_archives update", updErr);
        showToast("Kayıt güncellenemedi.", "error", 2000);
        return;
      }

      // P1-3: ek dosyalar da SUNUCU-YETKİLİ yüklenir. Tarayıcı storage.upload/remove ÇAĞIRMAZ;
      // upload + metadata + hata temizliği tek server akışında (/api/kisisel-arsiv/files/upload).
      for (let i = 0; i < detailExtraFiles.length; i++) {
        const file = detailExtraFiles[i]!;
        try {
          const fd = new FormData();
          fd.append("archiveId", archiveId);
          fd.append("file", file);
          const res = await fetch("/api/kisisel-arsiv/files/upload", {
            method: "POST",
            headers: userHeaders(),
            body: fd,
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
          if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
        } catch (upErr) {
          console.error("[kisisel-arsiv] detail extra upload", upErr);
        }
      }

      await loadRecords();
      setDetailExtraFiles([]);
      if (detailFileInputRef.current) detailFileInputRef.current.value = "";
      setDetailEditMode(false);
      showToast("Kayıt güncellendi.", "success", 1800);
    } catch (e) {
      console.error("[kisisel-arsiv] saveDetailEdit", e);
      showToast("Kayıt güncellenemedi.", "error", 2000);
    } finally {
      setSavingDetail(false);
    }
  }

  async function confirmDeleteArchive() {
    if (isDemo) { notifyDemo(); setDeleteConfirmRow(null); return; }
    const row = deleteConfirmRow;
    if (!row) return;

    setDeletingId(row.id);
    setInfo(null);

    try {
      // P1-3: storage silme SUNUCUDA yapılır. Tarayıcı artık storage.remove ÇAĞIRMAZ;
      // /api/kisisel-arsiv/files DELETE ucu path'leri DB'den (tenant+archive scoped) çözüp
      // service_role ile hem storage objelerini hem metadata satırlarını siler.
      try {
        const res = await fetch(
          `/api/kisisel-arsiv/files?archiveId=${encodeURIComponent(row.id)}`,
          { method: "DELETE", headers: userHeaders() },
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      } catch (delFilesErr) {
        console.error("[kisisel-arsiv] personal_archive_files delete", delFilesErr);
        throw delFilesErr;
      }

      const delRes = await fetch(
        `/api/kisisel-arsiv?id=${encodeURIComponent(row.id)}`,
        { method: "DELETE", headers: userHeaders() },
      );
      const delJson = (await delRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!delRes.ok || !delJson.ok) {
        const delArcErr = new Error(`HTTP ${delRes.status}`);
        console.error("[kisisel-arsiv] personal_archives delete", delArcErr);
        throw delArcErr;
      }

      if (detailId === row.id) closeDetail();
      await loadRecords();
      setDeleteConfirmRow(null);
      showToast("Kayıt silindi.", "success", 1500);
    } catch (e) {
      console.error("[kisisel-arsiv] delete archive", e);
      setDeleteConfirmRow(null);
      showToast("İşlem tamamlanamadı.", "error", 1500);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (isDemo) { notifyDemo(); return; }

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

    let archiveId: string | undefined;
    let insErr: unknown = null;
    try {
      const res = await fetch("/api/kisisel-arsiv", {
        method: "POST",
        headers: userHeaders(true),
        body: JSON.stringify({
          title: titleToSave,
          category: categoryToSave,
          tags: tagsToSave,
          note: noteToSave,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
      if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      archiveId = json.id ?? undefined;
    } catch (e) {
      insErr = e;
    }

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

    // P1-3: yükleme SUNUCU-YETKİLİ. Tarayıcı storage'a DOKUNMAZ; dosya multipart olarak
    // /api/kisisel-arsiv/files/upload'a gider, path + metadata SUNUCUDA üretilir/yazılır.
    for (const file of selectedFiles) {
      try {
        const fd = new FormData();
        fd.append("archiveId", archiveId);
        fd.append("file", file);
        const res = await fetch("/api/kisisel-arsiv/files/upload", {
          method: "POST",
          headers: userHeaders(),
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      } catch (upErr) {
        console.error("Dosya yükleme hatası:", upErr);
      }
    }

    await loadRecords();
    resetForm();
    setIsCreateModalOpen(false);
    setSaving(false);
    setInfo(null);
    queueMicrotask(() => {
      showSuccessToast("Kayıt başarıyla eklendi.");
    });
  }

  const searchInputClass =
    "h-9 w-full rounded-xl border-2 border-violet-200 bg-white/90 py-0 pl-9 pr-4 text-sm font-semibold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-300/30";

  const modalLabelClass =
    "mb-2 block text-[13px] font-semibold tracking-tight text-slate-800";

  const modalFieldClass =
    "h-9 w-full rounded-xl border border-slate-300 bg-white px-3 py-0 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

  const searchLabelClass =
    "mb-2 block text-sm font-black tracking-[0.18em] text-slate-600";

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_40%,#f8fafc_100%)]">
      <BfcacheRefreshHandler />
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed right-6 top-6 z-[99999] max-w-[min(92vw,22rem)] rounded-2xl border px-5 py-3 text-center text-[13px] font-black shadow-xl ring-2 sm:text-left ${
            toast.variant === "success"
              ? "border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 text-emerald-950 shadow-emerald-300/40 ring-white/80"
              : "border-rose-200/90 bg-gradient-to-r from-rose-50 via-orange-50/80 to-amber-50 text-rose-950 shadow-rose-200/35 ring-white/80"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-0 top-0 h-[360px] w-[360px] rounded-full bg-violet-300/15 blur-[100px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[360px] w-[360px] rounded-full bg-cyan-300/15 blur-[100px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-8">
        {isDemo && <DemoModuleBanner message={DIGITAL_CONTENT_DEMO_BANNER} />}
        <header className="rounded-2xl border border-violet-200/60 bg-white/80 px-4 py-4 shadow-[0_0_24px_rgba(139,92,246,0.10)] backdrop-blur-xl sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-100 to-sky-100 text-xl shadow-sm ring-1 ring-white/90"
                aria-hidden
              >
                📁
              </div>
              <div className="min-w-0">
                <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.18em] text-violet-700">
                  ARŞİV
                </div>
                <h1 className="mt-0.5 text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                  Kişisel Arşiv
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  Ses • Video • Belge • Resim • Not • Kişisel kayıt
                </p>
              </div>
            </div>
            {!isCreateModalOpen ? (
              <button
                type="button"
                onClick={() => {
                  if (isDemo) { notifyDemo(); return; }
                  setInfo(null);
                  setIsCreateModalOpen(true);
                }}
                className="w-full shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-300 hover:-translate-y-0.5 sm:w-auto"
              >
                + Yeni Kayıt
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-violet-100 bg-white/90 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Toplam Kayıt</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-violet-700">
                {stats.totalArchives}
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-white/90 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Toplam Dosya</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-violet-700">
                {stats.totalFiles}
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-white/90 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Kategori</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-violet-700">
                {stats.categoryKinds}
              </p>
            </div>
          </div>
        </header>

        {info ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-[13px] font-semibold shadow-sm ring-1 ${
              info.kind === "ok"
                ? "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 ring-emerald-100/60"
                : "border-rose-200/90 bg-rose-50/95 text-rose-950 ring-rose-100/60"
            }`}
          >
            {info.text}
          </div>
        ) : null}

        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-cyan-200/50 bg-white/80 px-4 py-5 shadow-[0_0_28px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                Kayıtlar
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                En yeni üstte. Türkçe harf ve noktalama farkları tolere edilir.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:max-w-[260px] lg:max-w-xs">
              <span className="sr-only">Ara</span>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] opacity-70"
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

          <div className="mt-4 w-full min-w-0 space-y-3">
            {loadingList ? (
              <p className="py-8 text-center text-[13px] font-semibold text-slate-500">
                Yükleniyor…
              </p>
            ) : records.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/60 px-5 py-8 text-center shadow-inner ring-1 ring-violet-100/50">
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-md shadow-violet-200/40 ring-2 ring-violet-100/80"
                  aria-hidden
                >
                  📂
                </div>
                <p className="text-[14px] font-black text-slate-900">
                  Henüz arşiv kaydı yok
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-[12px] font-semibold leading-relaxed text-slate-600">
                  İlk kaydınızı oluşturarak ses, belge veya fotoğraflarınızı tek yerde toplayın.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (isDemo) { notifyDemo(); return; }
                    setInfo(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="mt-4 inline-flex items-center rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-md transition-all hover:-translate-y-0.5"
                >
                  + Yeni kayıt oluştur
                </button>
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white px-5 py-8 text-center shadow-inner ring-1 ring-sky-100/50">
                <p className="text-[14px] font-black text-slate-900">
                  Aramanıza uygun kayıt bulunamadı
                </p>
                <p className="mx-auto mt-1.5 max-w-md text-[12px] font-semibold text-slate-600">
                  Farklı bir kelime deneyin veya aramayı temizleyin.
                </p>
              </div>
            ) : (
              visibleRows.map((row) => (
                <article
                  key={row.id}
                  className="group min-w-0 rounded-2xl border border-violet-200/60 bg-white/90 px-4 py-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/70 hover:shadow-[0_4px_20px_rgba(34,211,238,0.12)]"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 text-base font-black leading-snug text-slate-950">
                      {highlightText(row.title, search)}
                    </h3>
                    <span className={categoryBadgeClass(row.category)}>
                      {row.category}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {notePreview(row.note)}
                  </p>
                  {row.tags?.trim() ? (
                    <p className="mt-1.5 text-xs font-bold tracking-wide text-violet-700">
                      Etiketler: {row.tags}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold tracking-wide text-slate-500">
                    <time dateTime={row.created_at}>{formatTrDate(row.created_at)}</time>
                    <span className="rounded-full bg-slate-100/95 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {fileCount(row)} dosya
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxUrl(null);
                        setDetailEditMode(false);
                        setDetailExtraFiles([]);
                        if (detailFileInputRef.current) detailFileInputRef.current.value = "";
                        setDetailId(row.id);
                      }}
                      className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-1.5 text-sm font-black text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5"
                    >
                      Detay
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => { if (isDemo) { notifyDemo(); return; } setDeleteConfirmRow(row); }}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-1.5 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === row.id ? "Siliniyor…" : "Sil"}
                    </button>
                  </div>
                </article>
              ))
            )}
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

      {deleteConfirmRow ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8 sm:px-6"
          role="presentation"
        >
          <div
            role="presentation"
            className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm ${deletingId ? "cursor-wait" : "cursor-pointer"}`}
            onClick={() => {
              if (deletingId) return;
              setDeleteConfirmRow(null);
            }}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-desc"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border-2 border-white/90 bg-white shadow-2xl shadow-violet-400/25 ring-1 ring-rose-100/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-rose-100/80 bg-gradient-to-r from-rose-50/95 via-white to-violet-50/90 px-6 py-5">
              <h2
                id="delete-confirm-title"
                className="text-lg font-black tracking-tight text-slate-900"
              >
                Arşiv kaydı silinsin mi?
              </h2>
              <p
                id="delete-confirm-desc"
                className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-700"
              >
                Bu kayıt ve bağlı dosyalar kalıcı olarak silinecek.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-6 py-4">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setDeleteConfirmRow(null)}
                className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 text-[13px] font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void confirmDeleteArchive()}
                className="rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-[13px] font-black uppercase tracking-wide text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId ? "Siliniyor…" : "Evet, Sil"}
              </button>
            </div>
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
            className={`absolute inset-0 bg-slate-950/55 backdrop-blur-md ${savingDetail ? "cursor-wait" : "cursor-pointer"}`}
            onClick={() => {
              if (savingDetail) return;
              closeDetail();
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
            className="relative z-10 flex max-h-[88vh] min-h-[720px] w-[92vw] max-w-[1100px] flex-col overflow-hidden rounded-3xl border-2 border-white/90 bg-white shadow-2xl shadow-violet-500/30 ring-1 ring-violet-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-violet-100/90 bg-gradient-to-r from-violet-100/95 via-sky-50/95 to-emerald-100/90 px-5 py-5 sm:px-7 sm:py-6">
              <div
                className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-white/50 blur-2xl"
                aria-hidden
              />
              <button
                type="button"
                disabled={savingDetail}
                onClick={() => {
                  if (savingDetail) return;
                  closeDetail();
                }}
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-3xl border border-white/90 bg-white/95 text-xl font-light text-slate-600 shadow-md transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:top-4"
                aria-label="Kapat"
              >
                ×
              </button>
              {detailEditMode ? (
                <label className="block min-w-0 pr-12">
                  <span className="sr-only">Başlık</span>
                  <input
                    id="detail-modal-title"
                    value={detailEditTitle}
                    onChange={(e) => setDetailEditTitle(e.target.value)}
                    className={`${modalFieldClass} font-black`}
                    placeholder="Başlık"
                    autoComplete="off"
                  />
                </label>
              ) : (
                <h2
                  id="detail-modal-title"
                  className="pr-12 text-3xl font-black leading-snug text-slate-900"
                >
                  {highlightText(detailRow.title, search)}
                </h2>
              )}
            </div>

            <div className="min-h-0 max-h-[calc(88vh-120px)] flex-1 overflow-y-auto p-8">
              <div className="flex flex-wrap items-end gap-2">
                {detailEditMode ? (
                  <label className="min-w-0 flex-1 sm:max-w-xs">
                    <span className={searchLabelClass}>Kategori</span>
                    <select
                      value={detailEditCategory}
                      onChange={(e) => setDetailEditCategory(e.target.value)}
                      className={`${modalFieldClass} mt-1.5 cursor-pointer appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
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
                ) : (
                  <span className={`${categoryBadgeClass(detailRow.category)} text-base`}>
                    {detailRow.category}
                  </span>
                )}
                <time
                  className="text-sm font-semibold tracking-wide text-slate-500"
                  dateTime={detailRow.created_at}
                >
                  {formatTrDate(detailRow.created_at)}
                </time>
              </div>

              {detailEditMode ? (
                <label className="mt-4 block min-w-0">
                  <span className={modalLabelClass}>Etiketler</span>
                  <input
                    value={detailEditTags}
                    onChange={(e) => setDetailEditTags(e.target.value)}
                    className={modalFieldClass}
                    placeholder="Virgülle ayırın"
                    autoComplete="off"
                  />
                </label>
              ) : detailRow.tags?.trim() ? (
                <p className="mt-3 text-[13px] font-semibold text-violet-900">
                  Etiketler: {detailRow.tags}
                </p>
              ) : (
                <p className="mt-3 text-[13px] font-medium text-slate-400">Etiket yok</p>
              )}

              <div className="mt-4 rounded-3xl border border-slate-200/90 bg-slate-50/60 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Not
                </p>
                {detailEditMode ? (
                  <textarea
                    value={detailEditNote}
                    onChange={(e) => setDetailEditNote(e.target.value)}
                    rows={4}
                    className={`${modalFieldClass} mt-2 min-h-[8rem] max-h-64 resize-y text-lg leading-8`}
                    placeholder="Kısa açıklama veya bağlam…"
                  />
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-lg font-semibold leading-8 text-slate-800">
                    {detailRow.note?.trim() ? detailRow.note : "—"}
                  </p>
                )}
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
                      <li key={f.id} className="list-none">
                        <DetailArchiveFileCard
                          file={f}
                          onImageClick={(u) => setLightboxUrl(u)}
                          onDownload={handleDownload}
                          tenantId={tenantId}
                          userId={userId}
                        />
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {detailEditMode ? (
                <div className="mt-6 block min-w-0">
                  <span className={modalLabelClass}>Yeni dosya ekle</span>
                  <input
                    ref={detailFileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const incoming = e.target.files ? Array.from(e.target.files) : [];
                      if (incoming.length) {
                        setDetailExtraFiles((prev) => [...prev, ...incoming]);
                      }
                      e.target.value = "";
                    }}
                  />
                  <div className="mt-2 rounded-3xl border-[3px] border-dashed border-violet-300/80 bg-gradient-to-br from-violet-50/90 via-sky-50/70 to-emerald-50/80 p-5 text-center shadow-inner ring-2 ring-white/80 sm:p-6">
                    <button
                      type="button"
                      disabled={savingDetail}
                      onClick={() => detailFileInputRef.current?.click()}
                      className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-6 py-3 text-[13px] font-black uppercase tracking-wide text-white shadow-lg shadow-violet-500/35 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Dosya seç
                    </button>
                    <p className="mt-3 text-[12px] font-bold text-slate-600">
                      {detailExtraFiles.length === 0
                        ? "Henüz yeni dosya seçilmedi."
                        : `${detailExtraFiles.length} yeni dosya eklenecek`}
                    </p>
                    {detailExtraFiles.length > 0 ? (
                      <ul className="mx-auto mt-2 max-h-28 max-w-md list-inside list-disc overflow-y-auto text-left text-[12px] font-semibold text-slate-700">
                        {detailExtraFiles.map((f, i) => (
                          <li key={`${f.name}-${i}-${f.size}`}>{f.name}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-violet-100/80 bg-white/95 px-5 py-4 sm:px-7">
              {!detailEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => { if (isDemo) { notifyDemo(); return; } setDetailEditMode(true); }}
                    className="rounded-2xl border-2 border-violet-300 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-8 py-4 text-base font-black text-violet-950 shadow-md ring-1 ring-white/80 transition hover:brightness-95"
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => closeDetail()}
                    className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-4 text-base font-black text-white shadow-lg transition hover:brightness-110"
                  >
                    Kapat
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={savingDetail}
                    onClick={() => cancelDetailEdit()}
                    className="rounded-3xl border-2 border-slate-200 bg-white px-5 py-3 text-[13px] font-bold text-slate-800 shadow-md transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    disabled={savingDetail || !detailEditTitle.trim()}
                    onClick={() => void saveDetailEdit()}
                    className="rounded-3xl bg-gradient-to-r from-fuchsia-500 via-violet-600 to-cyan-500 px-7 py-3 text-[13px] font-black uppercase tracking-wide text-white shadow-[0_16px_40px_-10px_rgba(124,58,237,0.55)] ring-2 ring-white/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingDetail ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button
                    type="button"
                    disabled={savingDetail}
                    onClick={() => closeDetail()}
                    className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-4 text-base font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Kapat
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/92 px-4 pb-12 pt-20 sm:px-6"
          role="presentation"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
            className="fixed right-4 top-4 z-[100000] flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-red-500 text-3xl font-light leading-none text-white shadow-xl transition hover:bg-red-600 sm:right-6 sm:top-6"
            aria-label="Kapat"
          >
            ×
          </button>
          <div
            role="presentation"
            className="flex max-h-full max-w-full items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Büyütülmüş görsel"
              className="max-h-[86vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
