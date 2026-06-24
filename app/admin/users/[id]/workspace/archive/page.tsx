"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Home, Loader2, Search } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const searchInputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 pl-12 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

const badgeTag =
  "inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-800";

const CATEGORY_BADGE: Record<string, string> = {
  Ses: "border-amber-200 bg-amber-50 text-amber-800",
  Video: "border-violet-200 bg-violet-50 text-violet-800",
  Belgeler: "border-cyan-200 bg-cyan-50 text-cyan-800",
  Resimler: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  Diğer: "border-stone-200 bg-stone-50 text-stone-800",
};

type ArchiveFileRow = {
  id: string;
  archive_id: string;
  file_name: string;
};

type ArchiveListRow = {
  id: string;
  title: string;
  category: string;
  tags: string | null;
  note: string | null;
  created_at: string;
  fileCount: number;
};

function notePreview(note: string | null, max = 100): string {
  const t = (note ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function parseTagsList(tags: string | null): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function categoryBadgeClass(category: string): string {
  const tone =
    CATEGORY_BADGE[category] ?? "border-slate-200 bg-slate-50 text-slate-800";
  return `inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black ${tone}`;
}

function mergeArchivesWithFileCounts(
  archives: Record<string, unknown>[],
  files: ArchiveFileRow[],
): ArchiveListRow[] {
  const countMap = new Map<string, number>();
  for (const f of files) {
    countMap.set(f.archive_id, (countMap.get(f.archive_id) ?? 0) + 1);
  }

  return archives.map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    tags: row.tags != null ? String(row.tags) : null,
    note: row.note != null ? String(row.note) : null,
    created_at: row.created_at != null ? String(row.created_at) : "",
    fileCount: countMap.get(String(row.id ?? "")) ?? 0,
  }));
}

export default function AdminWorkspaceArchivePage() {
  useBfcacheRefresh();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [archives, setArchives] = useState<ArchiveListRow[]>([]);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const moduleEnabled = expert
    ? isExpertModuleEnabled(expert, "personal_archive")
    : false;

  const filteredArchives = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return archives;

    return archives.filter((row) => {
      const title = row.title.toLowerCase();
      const note = (row.note || "").toLowerCase();
      const tags = (row.tags || "").toLowerCase();
      const category = row.category.toLowerCase();
      return (
        title.includes(q) ||
        note.includes(q) ||
        tags.includes(q) ||
        category.includes(q)
      );
    });
  }, [archives, search]);

  const loadExpertAndArchives = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setArchivesError(null);

    let userRow: Record<string, unknown> | null = null;
    let userError: { message: string } | null = null;
    {
      const adminId = readYasamUser()?.id;
      const userRes = await fetch(`/api/admin/users/${userId}`, {
        headers: { "x-admin-id": adminId ?? "" },
      });
      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => ({}))) as { user?: Record<string, unknown> };
        userRow = userJson.user ?? null;
      } else {
        userError = { message: `HTTP ${userRes.status}` };
      }
    }

    if (userError || !userRow) {
      console.error("Uzman yükleme hatası:", userError);
      setExpert(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = userRow as Record<string, unknown>;
    const mapped = mapDbUser(row);
    const activeTenantId =
      row.tenant_id != null ? String(row.tenant_id).trim() : "";

    setExpert(mapped);
    setNotFound(false);

    if (!isExpertModuleEnabled(mapped, "personal_archive")) {
      setArchives([]);
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setArchives([]);
      setArchivesError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      setLoading(false);
      return;
    }

    const { data: archivesRaw, error: archErr } = await supabase
      .from("personal_archives")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false });

    if (archErr) {
      console.error("Kişisel arşiv listesi hatası:", archErr);
      setArchives([]);
      setArchivesError(archErr.message);
      setLoading(false);
      return;
    }

    const archiveRows = (archivesRaw ?? []) as Record<string, unknown>[];
    const archiveIds = archiveRows.map((a) => String(a.id ?? ""));
    const allFiles: ArchiveFileRow[] = [];

    if (archiveIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < archiveIds.length; i += CHUNK) {
        const slice = archiveIds.slice(i, i + CHUNK);
        const { data: filesRaw, error: filesErr } = await supabase
          .from("personal_archive_files")
          .select("id, archive_id, file_name")
          .eq("tenant_id", activeTenantId)
          .in("archive_id", slice);

        if (filesErr) {
          console.error("Kişisel arşiv dosya listesi hatası:", filesErr);
          setArchives([]);
          setArchivesError(filesErr.message);
          setLoading(false);
          return;
        }

        allFiles.push(
          ...((filesRaw ?? []) as ArchiveFileRow[]).map((f) => ({
            id: String(f.id),
            archive_id: String(f.archive_id),
            file_name: String(f.file_name ?? ""),
          })),
        );
      }
    }

    setArchives(mergeArchivesWithFileCounts(archiveRows, allFiles));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpertAndArchives();
  }, [sessionChecked, allowed, loadExpertAndArchives]);

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
          <Link href="/" className={`${navBtn} mt-6 border-violet-300 bg-violet-50 text-violet-950`}>
            Ana Panele Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-rose-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            <Link
              href={`/admin/users/${userId}/workspace`}
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950`}
            >
              Uzman Çalışma Alanına Dön
            </Link>
            <Link
              href={`/admin/users/${userId}`}
              className={`${navBtn} border-indigo-300/80 bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-950`}
            >
              Kullanıcı Detayına Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
          </div>
        </nav>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : notFound || !expert ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Üye bulunamadı</p>
            <Link href="/admin/users" className={`${navBtn} mt-6 inline-flex max-w-md`}>
              Kullanıcı yönetimine dön
            </Link>
          </div>
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
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Kişisel Arşiv İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Kayıt ekleme,
                    düzenleme, silme veya dosya yükleme yapılamaz.
                  </p>
                  <p className="mt-3 text-sm font-bold text-indigo-900">
                    {expert.fullName} · {expert.email}
                  </p>
                </div>
              </div>
            </header>

            {!moduleEnabled ? (
              <section
                className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
                role="alert"
              >
                <p className="text-base font-black text-rose-950">
                  Bu modül kullanıcıda aktif değil.
                </p>
                <p className="mt-2 text-sm font-medium text-rose-900/80">
                  Kişisel Arşiv modülü bu uzman için kapalı. Liste görüntülenemez.
                </p>
                <Link
                  href={`/admin/users/${userId}/workspace`}
                  className={`${navBtn} mt-5 inline-flex max-w-md border-violet-300 bg-violet-50 text-violet-950`}
                >
                  Uzman Çalışma Alanına Dön
                </Link>
              </section>
            ) : (
              <>
                <section
                  className={`${panelClass} border-slate-300/80 bg-gradient-to-r from-slate-50/95 via-zinc-50/80 to-slate-50/90`}
                  role="note"
                >
                  <p className="text-sm font-bold leading-relaxed text-slate-800 md:text-base">
                    Kayıtlar, mevcut kişisel arşiv modülüyle aynı şekilde uzmanın
                    çalışma alanına (tenant) göre filtrelenir.
                  </p>
                </section>

                <section className={`${panelClass} border-slate-200/80`}>
                  <label className="block">
                    <span className="text-sm font-black text-slate-800">Ara</span>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Başlık, kategori, etiket veya not ara…"
                        className={searchInputClass}
                      />
                    </div>
                  </label>
                </section>

                <section className={`${panelClass} border-slate-200/80`}>
                  <h2 className="text-xl font-black text-slate-950">Arşiv Listesi</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {filteredArchives.length} kayıt
                    {search.trim() ? " (filtrelenmiş)" : ""}
                  </p>

                  {archivesError ? (
                    <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                      {archivesError}
                    </p>
                  ) : null}

                  {!archivesError && filteredArchives.length === 0 ? (
                    <p className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                      {archives.length === 0
                        ? "Bu uzmana ait kişisel arşiv kaydı bulunamadı."
                        : "Arama kriterine uygun kayıt bulunamadı."}
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto rounded-2xl border-2 border-slate-100">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-100 bg-slate-50/90">
                            {[
                              "Başlık",
                              "Kategori",
                              "Etiketler",
                              "Not Özeti",
                              "Dosya Sayısı",
                              "Kayıt Tarihi",
                              "İşlem",
                            ].map((col) => (
                              <th
                                key={col}
                                className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArchives.map((row) => {
                            const tagList = parseTagsList(row.tags);
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                              >
                                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                                  {row.title || "—"}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <span className={categoryBadgeClass(row.category)}>
                                    {row.category || "—"}
                                  </span>
                                </td>
                                <td className="max-w-[180px] px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {tagList.length > 0 ? (
                                      tagList.slice(0, 3).map((tag) => (
                                        <span key={tag} className={badgeTag}>
                                          {tag}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                    {tagList.length > 3 ? (
                                      <span className="text-[11px] font-bold text-slate-500">
                                        +{tagList.length - 3}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="max-w-xs px-4 py-3 font-medium text-slate-700">
                                  {notePreview(row.note)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">
                                  {row.fileCount}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                  {formatCreatedAt(row.created_at)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <Link
                                    href={`/admin/users/${userId}/workspace/archive/${row.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-xs font-black text-slate-900 transition hover:border-slate-400 hover:bg-slate-200 no-underline"
                                  >
                                    <span aria-hidden>👁</span>
                                    Detay Gör
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
