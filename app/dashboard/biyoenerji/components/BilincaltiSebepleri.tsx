"use client";

import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backgroundSyncYasamUserFromDb, readYasamUser } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { getSubconsciousCardTheme } from "@/lib/bioenergy/subconsciousCausesCardTheme";
import {
  fetchSubconsciousCausesCount,
  fetchSubconsciousCausesPage,
  previewSubconsciousText,
  type SubconsciousCauseListItem,
} from "@/lib/bioenergy/subconsciousCausesListFetch";
import { subconsciousCauseDetailHref } from "@/lib/bioenergy/subconsciousCausesRoutes";
import {
  bioApiCategories,
  bioApiCreate,
  bioApiDeleteAll,
  bioApiDeleteMany,
  bioApiLastCreated,
} from "@/lib/biyoenerji/secureApi";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { badgeFieldWrapClass, bioSaveBtnClass, bioSearchInputClass, bioSelectClass, CrudEmptyState, newRecordBtnClass } from "./BiyoenerjiUi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

async function exportSubconsciousWord(
  tenantId: string,
  userId: string,
  exportMode: "all" | "selected",
  selectedIds: Set<string>,
  setWordBusy: (v: boolean) => void,
  onSuccess?: () => void,
  onError?: () => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, userId, exportMode };
    if (exportMode === "selected") {
      const arr = [...selectedIds];
      if (!arr.length) return;
      body.ids = arr;
    }
    const res = await fetch("/api/biyoenerji/subconscious-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { onError?.(); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biyoenerji-bilincalti-${exportMode === "selected" ? "secili" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    onSuccess?.();
  } catch { onError?.(); } finally {
    setWordBusy(false);
  }
}

const SEARCH_DEBOUNCE_MS = 300;

type SubconsciousCauseForm = {
  source_uid: string;
  title: string;
  category: string;
  content: string;
  note_text: string;
};

const emptyForm: SubconsciousCauseForm = {
  source_uid: "",
  title: "",
  category: "",
  content: "",
  note_text: "",
};

function trimOrEmpty(v: string) {
  return v.trim();
}

function slugifySourceUid(value: string) {
  const slug = value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || String(Date.now());
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const loadMoreBtnClass =
  "rounded-lg border border-fuchsia-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-fuchsia-50 disabled:opacity-60";

const detailOpenBtnClass =
  "relative z-10 mt-auto flex w-full shrink-0 items-center justify-center rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white shadow-sm transition duration-200 group-hover:bg-violet-700 group-focus-visible:bg-violet-700";

export default function BilincaltiSebepleri() {
  const { isDemo } = useDemoGuard();
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<SubconsciousCauseListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubconsciousCauseForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [danger, setDanger] = useState<{ open: boolean; mode: DangerDeleteMode }>({
    open: false,
    mode: "selected",
  });
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const showSoft = useCallback((kind: "ok" | "err", text: string) => {
    if (kind === "ok") {
      setInfoError("");
      setInfoSuccess(text);
    } else {
      setInfoSuccess("");
      setInfoError(text);
    }
  }, []);

  useEffect(() => {
    if (!infoSuccess && !infoError) return;
    const t = window.setTimeout(() => {
      setInfoSuccess("");
      setInfoError("");
    }, 5200);
    return () => window.clearTimeout(t);
  }, [infoSuccess, infoError]);

  const resolveTenant = useCallback(async () => {
    const cached = getSessionTenantId();
    if (cached) {
      setQueryTenantId(cached);
      backgroundSyncYasamUserFromDb();
      return cached;
    }
    const synced = await getSyncedTenantId();
    if (synced) setQueryTenantId(synced);
    return synced;
  }, []);

  const fetchList = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const tenantId = queryTenantId ?? getSessionTenantId();
      if (!tenantId) {
        setListLoading(false);
        setLoadingMore(false);
        setLoadErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }

      if (opts.reset) {
        setListLoading(true);
        setLoadErrorMessage("");
      } else {
        setLoadingMore(true);
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;
      const category = categoryFilter || undefined;

      const [pageRes, totalRes, searchCountRes, lastRes] = await Promise.all([
        fetchSubconsciousCausesPage(tenantId, { offset, search, category }),
        opts.reset
          ? fetchSubconsciousCausesCount(tenantId)
          : Promise.resolve({ count: totalInDb, error: null }),
        opts.reset
          ? fetchSubconsciousCausesCount(tenantId, search, category)
          : Promise.resolve({ count: searchResultCount, error: null }),
        opts.reset
          ? bioApiLastCreated("subconscious-causes")
          : Promise.resolve({ lastCreatedAt: null, error: null }),
      ]);

      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setLoadErrorMessage(`Bilinçaltı sebepleri okunamadı: ${pageRes.error}`);
        if (opts.reset) setRows([]);
        return;
      }

      if (opts.reset) {
        if (totalRes.error) {
          setLoadErrorMessage(`Kayıt sayısı alınamadı: ${totalRes.error}`);
        } else {
          setTotalInDb(totalRes.count);
        }
        if (searchCountRes.error) {
          setSearchResultCount(0);
        } else {
          setSearchResultCount(searchCountRes.count);
        }
        setLastCreatedAt(
          (lastRes as { lastCreatedAt?: string | null }).lastCreatedAt ?? null,
        );
      }

      setRows((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );
    },
    [categoryFilter, debouncedSearch, queryTenantId, searchResultCount, totalInDb],
  );

  const refreshCategories = useCallback(async () => {
    const { categories: cats, error } = await bioApiCategories("subconscious-causes");
    if (!error) setCategories(cats);
  }, []);

  useEffect(() => {
    void resolveTenant();
  }, [resolveTenant]);

  useEffect(() => {
    if (!queryTenantId) return;
    void refreshCategories();
  }, [queryTenantId, refreshCategories]);

  useEffect(() => {
    if (!queryTenantId) return;
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, categoryFilter, fetchList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const hasMore = rows.length < searchResultCount;
  const listBusy =
    listLoading || (Boolean(searchTerm.trim()) && searchTerm.trim() !== debouncedSearch);
  const isSearchActive = Boolean(debouncedSearch);

  async function handleKaydet() {
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      showSoft("err", MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await bioApiCreate("subconscious-causes", {
      source_uid: form.source_uid.trim() || slugifySourceUid(titleTrim),
      title: titleTrim,
      category: trimOrEmpty(form.category),
      content: trimOrEmpty(form.content),
      note_text: trimOrEmpty(form.note_text),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error}`);
      return;
    }

    setFormModalOpen(false);
    setForm({ ...emptyForm });
    await fetchList({ reset: true });
    void refreshCategories();
    showSoft("ok", "Kayıt oluşturuldu.");
  }

  async function handleBulkDeleteSelected() {
    const ids = [...selectedForExport];
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("subconscious-causes", ids);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    setSelectedForExport(new Set());
    await fetchList({ reset: true });
    void refreshCategories();
    showSoft("ok", `${ids.length} kayıt silindi.`);
  }

  async function handleDeleteAll() {
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteAll("subconscious-causes");
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    setSelectedForExport(new Set());
    setCategoryFilter("");
    await fetchList({ reset: true });
    void refreshCategories();
    showSoft("ok", "Tüm kayıtlar silindi.");
  }

  return (
    <section className="w-full min-w-0">
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">Demo Modu — Bilinçaltı Sebepleri</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                Bu sayfa demo amaçlıdır. Kayıt içerikleri demo güvenliği nedeniyle flu gösterilmektedir.
                Yeni kayıt, düzenleme, silme ve dışa aktarma işlemleri devre dışıdır.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 border-b border-fuchsia-100/60 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full xl:max-w-sm">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
              Başlık, kategori, içerik ve not içinde ara
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Örn. travma, duygusal, hastalık, sebep…"
              className={bioSearchInputClass}
            />
            {listBusy ? (
              <p className="mt-1 text-[10px] font-semibold text-violet-600">Aranıyor…</p>
            ) : isSearchActive ? (
              <p className="mt-1 text-[10px] font-semibold text-violet-600">
                "{debouncedSearch}" · {searchResultCount} eşleşme
              </p>
            ) : null}
          </label>
          {categories.length > 0 && (
            <label className="block w-full min-w-0 sm:w-auto sm:min-w-[170px]">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
                Kategori
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={bioSelectClass}
              >
                <option value="">Tümü</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {!isDemo && (
            <button type="button" onClick={() => setFormModalOpen(true)} className={newRecordBtnClass}>
              + Yeni Kayıt
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Toplam kayıt</p>
            <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
              {totalInDb}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {isSearchActive ? "Arama sonucu" : "Görünen"}
            </p>
            <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
              {searchResultCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Son kayıt</p>
            <p className="mt-0.5 truncate text-base font-black tracking-tight text-cyan-800">
              {formatDate(lastCreatedAt)}
            </p>
          </div>
        </div>
      </div>

      {loadErrorMessage ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      {listLoading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-slate-400">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <CrudEmptyState
          Icon={Brain}
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk bilinçaltı sebebini ekleyebilirsiniz."
          }
          tone="fuchsia"
        />
      ) : (
        <>
          {!isDemo && <div className="mb-3">
            <BulkExportBar
              selectedCount={selectedForExport.size}
              totalCount={totalInDb}
              selectAllLabel="Görünenleri Seç"
              selectAllCount={rows.length}
              onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
              onClearSelection={() => setSelectedForExport(new Set())}
              onExportSelected={() => void exportSubconsciousWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              onExportAll={() => void exportSubconsciousWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              isExporting={wordBusy}
              onDeleteSelected={() => setDanger({ open: true, mode: "selected" })}
              isDeleting={isBulkDeleting}
              onDeleteAll={() => setDanger({ open: true, mode: "all" })}
            />
          </div>}
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row, index) => {
              const detailHref = subconsciousCauseDetailHref(row.id);
              const preview = previewSubconsciousText(row.content, row.note_text);
              const theme = getSubconsciousCardTheme(index);
              const hasCategory = Boolean(row.category?.trim());
              const isExportSelected = selectedForExport.has(row.id);

              if (!detailHref) return null;

              return (
                <div key={row.id} className="relative">
                  {!isDemo && (
                    <label
                      className="absolute right-1 top-1 z-20 flex h-11 w-11 cursor-pointer items-center justify-center lg:right-3 lg:top-3 lg:h-5 lg:w-5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <input
                        type="checkbox"
                        checked={isExportSelected}
                        onChange={() => setSelectedForExport((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                          return next;
                        })}
                        className="h-4 w-4 rounded accent-fuchsia-600 shadow"
                      />
                    </label>
                  )}
                <Link
                  href={detailHref}
                  className={`group relative flex h-[220px] flex-col overflow-hidden rounded-2xl border p-4 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${!isDemo && isExportSelected ? "ring-2 ring-fuchsia-400/60 ring-offset-1" : ""} ${theme.card} ${theme.hover}`}
                >
                  {hasCategory ? (
                    <span
                      className={`mb-2 inline-flex w-fit max-w-full truncate rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${theme.badge}`}
                    >
                      {row.category}
                    </span>
                  ) : (
                    <span
                      className={`mb-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${theme.badgeMuted}`}
                    >
                      Kategorisiz
                    </span>
                  )}

                  <h2 className="line-clamp-2 text-[15px] font-black leading-snug text-slate-950">
                    {row.title?.trim() || "İsimsiz kayıt"}
                  </h2>

                  <DemoBlur isProtected={isDemo} className="mt-2 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-relaxed text-slate-700/90">
                      {preview}
                    </p>
                  </DemoBlur>

                  <span className={detailOpenBtnClass}>
                    Detayı Aç
                    <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                </Link>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={() => void fetchList({ reset: false, append: true, offset: rows.length })}
                className={loadMoreBtnClass}
              >
                {loadingMore
                  ? "Yükleniyor…"
                  : `Daha Fazla Göster (${rows.length} / ${searchResultCount})`}
              </button>
            </div>
          ) : null}
        </>
      )}

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Yeni bilinçaltı kaydı"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="subconscious-form-modal-title"
        accentRingClass="ring-fuchsia-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormModalOpen(false)}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm({ ...emptyForm })}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Temizle
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleKaydet()}
              className={bioSaveBtnClass}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak uid</span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              placeholder="JSON uid ile eşleşir (isteğe bağlı)"
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Başlık *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("fuchsia")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Örn. duygusal, travma…"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">İçerik</span>}
            modalTitle="İçerik"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Not</span>}
            modalTitle="Not"
            value={form.note_text}
            onChange={(v) => setForm((f) => ({ ...f, note_text: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-slate-100/60 transition"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedForExport.size}
        resourceLabel="Bilinçaltı Sebepleri"
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
