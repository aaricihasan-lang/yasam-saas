"use client";

import { runInEffect } from "@/lib/runInEffect";
import { Activity } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  bioApiCategories,
  bioApiCount,
  bioApiCreate,
  bioApiDelete,
  bioApiDeleteAll,
  bioApiDeleteMany,
  bioApiLastCreated,
  bioApiList,
  bioApiUpdate,
} from "@/lib/biyoenerji/secureApi";
import { bioListGet, bioListKey, bioListSet } from "@/lib/biyoenerji/listCache";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import {
  bioSaveBtnClass,
  CrudEmptyState,
  ModuleStats,
  badgeFieldWrapClass,
  formGlassPanelClass,
  listColumnClass,
  newRecordBtnClass,
  searchInputClass,
  sectionShellClass,
} from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { LongTextareaField } from "./LargeTextModal";

const SESSIONS_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";

type BioenergySession = {
  id: string;
  tenant_id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type SessionForm = {
  title: string;
  content: string;
  category: string;
  source: string;
  note: string;
};

const emptyForm: SessionForm = {
  title: "",
  content: "",
  category: "",
  source: "",
  note: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function formatDate(iso: string) {
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

function previewText(s: string | null, max = 200) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Özet için henüz metin yok.";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function BiyoenerjiSeanslari() {
  const { isDemo } = useDemoGuard();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [totalInDb, setTotalInDb] = useState(0);
  // K-2: sayım (count) çözülene kadar "…" göster; ilk yüklemede yanlış "0" önlenir.
  const [statsReady, setStatsReady] = useState(false);
  const [searchResultCount, setSearchResultCount] = useState(0);
  // Loader callback'i stabil tutmak için (çift-fetch önlenir): append dalında
  // sayım placeholder'ları bu ref'lerden okunur; state dep zincirini kırmaz.
  const totalInDbRef = useRef(0);
  const searchResultCountRef = useRef(0);
  useEffect(() => { totalInDbRef.current = totalInDb; }, [totalInDb]);
  useEffect(() => { searchResultCountRef.current = searchResultCount; }, [searchResultCount]);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const lastCreatedAtRef = useRef<string | null>(null);
  useEffect(() => { lastCreatedAtRef.current = lastCreatedAt; }, [lastCreatedAt]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<"create" | "edit">("create");
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
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

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  const loadSessions = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      if (!tenantId) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;
      const category = categoryFilter || undefined;
      const cacheKey = bioListKey("sessions", { search, category, offset: 0 });

      if (opts.reset) {
        setInfoError("");
        // Cache'ten anında göster (stale-while-revalidate); yoksa yükleniyor
        const cached = bioListGet(cacheKey);
        if (cached) {
          setRows(cached.rows as BioenergySession[]);
          setTotalInDb(cached.total);
          setStatsReady(true);
          setSearchResultCount(cached.searchCount);
          setLastCreatedAt(cached.lastCreatedAt);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      // 1) ÖNCE sayfa (grid) — istatistik beklenmez
      const pageRes = await bioApiList("sessions", { offset, limit: SESSIONS_PAGE_SIZE, search, category });
      if (opts.reset) setLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        showSoft("err", `Kayıtlar yüklenemedi: ${pageRes.error}`);
        if (opts.reset && !bioListGet(cacheKey)) setRows([]);
        return;
      }

      const pageRows = pageRes.rows as unknown as BioenergySession[];
      setRows((current) => (opts.append ? [...current, ...pageRows] : pageRows));

      // 2) İstatistikler ARKA PLANDA (grid'i bloklamaz) — yalnız reset
      if (opts.reset) {
        void (async () => {
          const totalP = bioApiCount("sessions");
          // dedupe: arama+kategori boşken total == searchCount → tek sorgu
          const searchP = !search && !category ? totalP : bioApiCount("sessions", search, category);
          const [totalRes, searchCountRes, lastRes] = await Promise.all([
            totalP,
            searchP,
            bioApiLastCreated("sessions"),
          ]);
          const total = totalRes.error ? totalInDbRef.current : totalRes.count;
          const searchCount = searchCountRes.error ? searchResultCountRef.current : searchCountRes.count;
          const lastAt = lastRes.error
            ? lastCreatedAtRef.current
            : ((lastRes as { lastCreatedAt?: string | null }).lastCreatedAt ?? null);
          if (!totalRes.error) setTotalInDb(total);
          if (!searchCountRes.error) setSearchResultCount(searchCount);
          if (!lastRes.error) setLastCreatedAt(lastAt);
          setStatsReady(true);
          bioListSet(cacheKey, {
            rows: pageRows,
            total,
            searchCount,
            lastCreatedAt: lastAt,
            categories: null,
          });
        })();
      }
    },
    [tenantId, debouncedSearch, categoryFilter, showSoft],
  );

  const refreshCategories = useCallback(async () => {
    const { categories: cats, error } = await bioApiCategories("sessions");
    if (!error) setCategories(cats);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void refreshCategories();
  }, [tenantId, refreshCategories]);

  useEffect(() => {
    if (!tenantId) return;
    runInEffect(() => {
      void loadSessions({ reset: true });
    });
  }, [tenantId, debouncedSearch, categoryFilter, loadSessions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const filteredRows = rows;
  const hasMore = rows.length < searchResultCount;
  const isSearchActive = Boolean(debouncedSearch);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = {
    total: totalInDb,
    cats: categories.length,
    last: lastCreatedAt ? formatDate(lastCreatedAt) : "—",
  };

  const hasSearch = Boolean(debouncedSearch.trim() || categoryFilter);

  const toggleExportSelection = useCallback((id: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  async function exportSessionsWord(mode: "selected" | "all" | "single", singleId?: string) {
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) { showSoft("err", "Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın."); return; }
    setWordBusy(true);
    try {
      const body: Record<string, unknown> = { tenantId, userId, exportMode: mode === "single" ? "single" : mode };
      if (mode === "single" && singleId) body.sessionId = singleId;
      else if (mode === "selected") {
        const ids = [...selectedForExport];
        if (!ids.length) return;
        body.sessionIds = ids;
      }
      const res = await fetch("/api/biyoenerji/session-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showSoft("err", "Rapor oluşturulamadı."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `biyoenerji-seans-${mode === "selected" ? "secili" : mode === "single" ? "tek" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showSoft("ok", "Seans raporu indirildi.");
    } catch { showSoft("err", "Rapor oluşturulamadı."); } finally {
      setWordBusy(false);
    }
  }

  function fillFormFromRow(row: BioenergySession) {
    setForm({
      title: row.title ?? "",
      content: row.content ?? "",
      category: row.category ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: BioenergySession) {
    setSelectedId(row.id);
    setFormModalOpen(false);
    setInfoError("");
    setInfoSuccess("");
  }

  function resetFormSelection() {
    setSelectedId(null);
    setForm({ ...emptyForm });
  }

  function closeFormModal() {
    setFormModalOpen(false);
  }

  function openCreateModal() {
    setFormModalMode("create");
    setForm({ ...emptyForm });
    setSelectedId(null);
    setFormModalOpen(true);
    setInfoError("");
  }

  function openEditModal() {
    if (!selectedRow) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    setFormModalMode("edit");
    fillFormFromRow(selectedRow);
    setFormModalOpen(true);
    setInfoError("");
  }

  function modalTemizle() {
    if (formModalMode === "create") {
      setForm({ ...emptyForm });
    } else if (selectedRow) {
      fillFormFromRow(selectedRow);
    }
  }

  async function handleKaydet() {
    if (!tenantId) return;

    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Seans başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await bioApiCreate("sessions", {
      title: titleTrim,
      content: trimOrNull(form.content),
      category: trimOrNull(form.category),
      source: trimOrNull(form.source),
      note: trimOrNull(form.note),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error}`);
      return;
    }

    setFormModalOpen(false);
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", "Seans kaydı oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!tenantId || !selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Seans başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await bioApiUpdate("sessions", selectedId, {
      title: titleTrim,
      content: trimOrNull(form.content),
      category: trimOrNull(form.category),
      source: trimOrNull(form.source),
      note: trimOrNull(form.note),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error}`);
      return;
    }

    setFormModalOpen(false);
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", "Kayıt güncellendi.");
  }

  function openDeleteConfirm() {
    if (!selectedId) {
      showSoft("err", "Silmek için listeden bir kayıt seçin.");
      return;
    }
    setDeleteConfirmOpen(true);
    setInfoError("");
  }

  async function executeDelete() {
    if (!tenantId || !selectedId) return;

    setSaving(true);
    setInfoError("");
    const { error } = await bioApiDelete("sessions", selectedId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }

    // Silinen kaydı seçim setinden de düş (hayalet id kalmasın)
    setSelectedForExport((prev) => {
      if (!selectedId || !prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
    await loadSessions({ reset: true });
    void refreshCategories();
    resetFormSelection();
    showSoft("ok", "Kayıt silindi.");
  }

  async function handleBulkDeleteSelected() {
    const ids = [...selectedForExport];
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("sessions", ids);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    const deletedSet = new Set(ids);
    if (selectedId && deletedSet.has(selectedId)) resetFormSelection();
    setSelectedForExport(new Set());
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", `${ids.length} kayıt silindi.`);
  }

  async function handleDeleteAll() {
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteAll("sessions");
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    setSelectedForExport(new Set());
    setCategoryFilter("");
    resetFormSelection();
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", "Tüm kayıtlar silindi.");
  }

  return (
    <section className={sectionShellClass}>
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">Demo Modu — Biyoenerji Seansları</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                Bu sayfa demo amaçlıdır. Seans içerikleri demo güvenliği nedeniyle flu gösterilmektedir.
                Yeni kayıt, düzenleme, silme ve dışa aktarma işlemleri devre dışıdır.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 border-b border-violet-100/60 pb-4">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
              Başlık, metin, kategori, kaynak ve not içinde ara
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Örn. analiz, enerji, blokaj…"
              className={searchInputClass("violet")}
            />
            {isSearchActive ? (
              <p className="mt-1 text-[10px] font-semibold text-violet-600">
                “{debouncedSearch}” · {searchResultCount} eşleşme
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
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40 lg:h-9"
              >
                <option value="">Tümü</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Kategori"
          midCount={moduleStats.cats}
          lastDate={moduleStats.last}
          tone="violet"
          loading={!statsReady}
        />
      </div>

      {(infoSuccess || infoError) && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {infoSuccess ? (
            <div className="flex-1 rounded-xl border border-emerald-100/80 bg-emerald-50/90 px-4 py-2.5 text-[12px] font-bold text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-xl border border-rose-100/80 bg-rose-50/90 px-4 py-2.5 text-[12px] font-bold text-rose-800 shadow-sm ring-1 ring-rose-100/50">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className={`${listColumnClass} order-1 xl:order-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-violet-600/90">
              Kayıtlar ({filteredRows.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {loading ? (
                <span className="text-[10px] font-bold text-slate-400">Yükleniyor…</span>
              ) : null}
              {!isDemo && (
                <button type="button" onClick={openCreateModal} className={newRecordBtnClass}>
                  + Yeni Kayıt
                </button>
              )}
            </div>
          </div>
          {/* Word export çubuğu */}
          {!isDemo && !loading && filteredRows.length > 0 && (
            <div className="mb-2">
              <BulkExportBar
                selectedCount={selectedForExport.size}
                totalCount={totalInDb}
                selectAllLabel="Görünenleri Seç"
                selectAllCount={rows.length}
                onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
                onClearSelection={() => setSelectedForExport(new Set())}
                onExportSelected={() => void exportSessionsWord("selected")}
                onExportAll={() => void exportSessionsWord("all")}
                isExporting={wordBusy}
                onDeleteSelected={() => setDanger({ open: true, mode: "selected" })}
                isDeleting={isBulkDeleting}
                onDeleteAll={() => setDanger({ open: true, mode: "all" })}
              />
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-400">Yükleniyor…</p>
            ) : filteredRows.length === 0 ? (
              <CrudEmptyState
                Icon={Activity}
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Arama kriterlerinizi değiştirin veya Yeni Kayıt ile seans ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk seansınızı oluşturabilirsiniz."
                }
                tone="violet"
              />
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const exportSelected = selectedForExport.has(row.id);
                return (
                  <div key={row.id} className="relative">
                    {!isDemo && (
                      <label
                        className="absolute left-0.5 top-1/2 z-10 -translate-y-1/2 flex h-11 w-9 cursor-pointer items-center justify-center lg:left-1.5 lg:h-4 lg:w-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={exportSelected}
                          onChange={() => toggleExportSelection(row.id)}
                          className="h-3.5 w-3.5 rounded border-violet-300 accent-violet-600"
                        />
                      </label>
                    )}
                  <button
                    type="button"
                    onClick={() => selectRow(row)}
                    className={`w-full rounded-xl border ${isDemo ? "pl-3.5" : "pl-7"} pr-3.5 py-3 text-left transition-all duration-200 ease-out will-change-transform ${
                      active
                        ? "scale-[1.01] border-violet-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(167,139,250,0.18),0_14px_36px_-12px_rgba(109,40,217,0.14)] ring-2 ring-violet-200/45 ring-offset-1 ring-offset-transparent"
                        : exportSelected
                          ? "border-blue-300/60 bg-blue-50/80"
                          : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-violet-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">
                      {row.title?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-violet-100/90 to-fuchsia-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-900/90 shadow-inner ring-1 ring-violet-200/45">
                          {row.category}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  </div>
                );
              })
            )}
          </div>
          {hasMore ? (
            <div className="mt-3 flex shrink-0 justify-center">
              <button
                type="button"
                disabled={loadingMore || loading}
                onClick={() => void loadSessions({ reset: false, append: true, offset: rows.length })}
                className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-60"
              >
                {loadingMore ? "Yükleniyor…" : `Daha Fazla Göster (${rows.length} / ${searchResultCount})`}
              </button>
            </div>
          ) : null}
        </div>

        <div className={`${formGlassPanelClass} order-2 xl:order-none`}>
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-violet-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-violet-800 ring-1 ring-violet-200/45">
                SEÇİLİ KAYIT
              </div>
              <h3 className="mt-2 text-[17px] font-black leading-snug text-slate-900 sm:text-[18px]">
                {selectedRow.title?.trim() || "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.category?.trim() ? (
                  <span className="rounded-full bg-gradient-to-r from-violet-100/90 to-fuchsia-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-900/90 ring-1 ring-violet-200/45">
                    {selectedRow.category}
                  </span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-amber-100/80 bg-amber-50/80 px-2 py-0.5 text-[10px] font-black text-amber-950/90">
                    Kaynak: {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <DemoBlur isProtected={isDemo}>
                <p className="mt-4 text-[12px] font-semibold leading-relaxed text-slate-600">
                  {previewText(selectedRow.content)}
                </p>
              </DemoBlur>
              {!isDemo && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                  <button
                    type="button"
                    disabled={wordBusy}
                    onClick={() => void exportSessionsWord("single", selectedRow.id)}
                    className="rounded-xl border border-blue-200/70 bg-blue-50/90 px-4 py-2.5 text-[12px] font-black text-blue-800 transition hover:bg-blue-100/90 disabled:opacity-50"
                  >
                    {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
                  </button>
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[12px] font-black text-violet-900 shadow-[0_4px_18px_-8px_rgba(109,40,217,0.12)] transition hover:bg-violet-100/90"
                  >
                    Güncelle
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={openDeleteConfirm}
                    className="rounded-xl border border-rose-200/70 bg-rose-50/90 px-4 py-2.5 text-[12px] font-black text-rose-800 transition hover:bg-rose-100/90 disabled:opacity-45"
                  >
                    Sil
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200 bg-white/65 px-4 text-center">
              <p className="max-w-sm text-sm font-medium text-slate-400">
                {isDemo ? "Soldan bir kayıt seçerek özetini görün." : "Soldan bir kayıt seçerek özetini görün veya yeni kayıt ekleyin."}
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni seans kaydı" : "Seans kaydını düzenle"}
        subtitle={
          formModalMode === "edit"
            ? "Değişiklikleri kaydettikten sonra panel kapanır ve liste yenilenir."
            : "Zorunlu alanları doldurup kaydedin; panel kapanır ve liste yenilenir."
        }
        titleId="seans-form-modal-title"
        accentRingClass="ring-violet-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={closeFormModal}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={modalTemizle}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Temizle
            </button>
            {formModalMode === "create" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleKaydet()}
                className={bioSaveBtnClass}
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleGuncelle()}
                className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[12px] font-black text-violet-900 shadow-sm transition hover:bg-violet-100/90 disabled:opacity-55"
              >
                {saving ? "Güncelleniyor…" : "Güncelle"}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90 shadow-[0_0_8px_rgba(109,40,217,0.35)]" />
              Seans Başlığı
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-white/70 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none ring-1 ring-violet-100/40 transition duration-200 focus:border-violet-200/70 focus:ring-2 focus:ring-violet-100/45"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/85" />
              Kategori
            </span>
            <div className={badgeFieldWrapClass("cyan")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent py-0.5 text-[13px] font-semibold text-slate-900 outline-none"
              />
            </div>
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/85" />
                Seans Metni
              </span>
            }
            modalTitle="Seans Metni"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-emerald-100/40 transition duration-200"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/85" />
              Kaynak
            </span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-white/70 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none ring-1 ring-amber-100/40 transition duration-200 focus:border-amber-200/70 focus:ring-2 focus:ring-amber-100/45"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/75" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.note}
            onChange={(v) => setForm((f) => ({ ...f, note: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-fuchsia-100/40 transition duration-200"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiConfirmModal
        open={deleteConfirmOpen}
        title="Bu seans kaydını silmek istediğinizden emin misiniz?"
        busy={saving}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void executeDelete()}
      />

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedForExport.size}
        resourceLabel="Biyoenerji Seansları"
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
