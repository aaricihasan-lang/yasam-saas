"use client";

import { runInEffect } from "@/lib/runInEffect";
import { pruneSelection } from "@/lib/ui/selection";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";

import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, Eye, Layers, Search, Sparkles } from "lucide-react";
import styles from "@/app/_premium/biyoenerji/kutuphane/bioKutuphane.module.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { backgroundSyncYasamUserFromDb, readYasamUser } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchSymbolLanguageCount,
  fetchSymbolLanguagePage,
  previewSymbolLanguageText,
  symbolDisplayName,
  type SymbolLanguageListItem,
} from "@/lib/bioenergy/symbolLanguageListFetch";
import { symbolLanguageDetailHref } from "@/lib/bioenergy/symbolLanguageRoutes";
import {
  authHeaders,
  bioApiCategories,
  bioApiCreate,
  bioApiDeleteAll,
  bioApiDeleteMany,
  bioApiLastCreated,
} from "@/lib/biyoenerji/secureApi";
import { bioListGet, bioListKey, bioListSet } from "@/lib/biyoenerji/listCache";
import { useBioRequestGate } from "@/lib/biyoenerji/requestGate";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { badgeFieldWrapClass, bioSaveBtnClass, CrudEmptyState } from "./BiyoenerjiUi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";
import { useDirtySnapshot } from "@/lib/biyoenerji/useDirtyGuard";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";

async function exportSymbolsWord(
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
    const res = await fetch("/api/biyoenerji/symbol-report", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) { onError?.(); return; }
    await downloadFileResponse(res, `biyoenerji-sembol-${exportMode === "selected" ? "secili" : "tumu"}-${reportFileDate()}.docx`);
    onSuccess?.();
  } catch { onError?.(); } finally {
    setWordBusy(false);
  }
}

const SEARCH_DEBOUNCE_MS = 300;

type SymbolForm = {
  symbol_name: string;
  category: string;
  meaning: string;
  source: string;
};

const emptyForm: SymbolForm = {
  symbol_name: "",
  category: "",
  meaning: "",
  source: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
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

export default function SembolDili() {
  const { isDemo } = useDemoGuard();
  const lastGoodRowsRef = useRef<SymbolLanguageListItem[]>([]);
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<SymbolLanguageListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  // K-2: sayım çözülene kadar "…" göster; ilk yüklemede yanlış "0" önlenir.
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
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useSubmitLock();
  const [form, setForm] = useState<SymbolForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  // BIO-004/015 — form modalı için kaydedilmemiş değişiklik takibi.
  const { isDirty: formIsDirty } = useDirtySnapshot(formModalOpen, form);
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

  // A7/A8 — eski / başka hesap yanıtlarını yok sayan istek kapısı.
  const listGate = useBioRequestGate();
  const fetchList = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const ticket = listGate.begin({ append: Boolean(opts.append) });
      const tenantId = queryTenantId ?? getSessionTenantId();
      if (!tenantId) {
        setListLoading(false);
        setLoadingMore(false);
        setLoadErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;
      const category = categoryFilter || undefined;
      const cacheKey = bioListKey("symbols", { search, category, offset: 0 });

      if (opts.reset) {
        setLoadErrorMessage("");
        // Cache'ten anında göster (stale-while-revalidate); yoksa yükleniyor
        const cached = bioListGet(cacheKey);
        if (cached) {
          const cachedRows = cached.rows as SymbolLanguageListItem[];
          lastGoodRowsRef.current = cachedRows;
          setRows(cachedRows);
          setTotalInDb(cached.total);
          setStatsReady(true);
          setSearchResultCount(cached.searchCount);
          setLastCreatedAt(cached.lastCreatedAt);
          setListLoading(false);
        } else {
          setListLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        // 1) ÖNCE sayfa (grid) — istatistik beklenmez
        const pageRes = await fetchSymbolLanguagePage(tenantId, { offset, search, category });
        if (!listGate.isCurrent(ticket)) return; // A7/A8 — eski/başka hesap yanıtı yazılmaz

        if (opts.reset) setListLoading(false);
        setLoadingMore(false);

        const pageRows = pageRes.data;
        const hadPageError = Boolean(pageRes.error);
        const hasCachedRows = lastGoodRowsRef.current.length > 0;

        if (hadPageError) {
          const warnParts = [`Sembol kayıtları okunamadı: ${pageRes.error}`];
          if (pageRes.usedFallback) {
            warnParts.push("Arama filtresi kaldırılarak liste gösteriliyor.");
          }
          setLoadErrorMessage(warnParts.join(" "));

          if (pageRows.length > 0) {
            const merged = opts.append ? [...lastGoodRowsRef.current, ...pageRows] : pageRows;
            lastGoodRowsRef.current = merged;
            setRows(merged);
          } else if (hasCachedRows) {
            setRows(lastGoodRowsRef.current);
          } else if (opts.reset) {
            setRows([]);
          }
        } else {
          setLoadErrorMessage("");
          const merged = opts.append ? [...lastGoodRowsRef.current, ...pageRows] : pageRows;
          lastGoodRowsRef.current = merged;
          setRows(merged);
        }

        // 2) İstatistikler ARKA PLANDA (grid'i bloklamaz) — yalnız reset
        if (opts.reset) {
          void (async () => {
            const totalP = fetchSymbolLanguageCount(tenantId);
            // dedupe: arama+kategori boşken total == searchCount → tek sorgu
            const searchP =
              !search && !category ? totalP : fetchSymbolLanguageCount(tenantId, search, category);
            const [totalRes, searchCountRes, lastRes] = await Promise.all([
              totalP,
              searchP,
              bioApiLastCreated("symbols"),
            ]);
            if (!listGate.isCurrent(ticket)) return; // A7/A8 — sayım/cache yazılmaz
            let total = totalInDbRef.current;
            if (totalRes.error) {
              setLoadErrorMessage((prev) =>
                prev
                  ? `${prev} · Kayıt sayısı alınamadı: ${totalRes.error}`
                  : `Kayıt sayısı alınamadı: ${totalRes.error}`,
              );
            } else if (!hadPageError || totalRes.data > 0) {
              total = totalRes.data;
              setTotalInDb(total);
            }
            let searchCount = searchResultCountRef.current;
            if (searchCountRes.error) {
              if (!search?.trim()) {
                searchCount = 0;
                setSearchResultCount(0);
              }
            } else {
              searchCount = searchCountRes.data;
              setSearchResultCount(searchCount);
            }
            const lastAt = lastRes.error
              ? lastCreatedAtRef.current
              : ((lastRes as { lastCreatedAt?: string | null }).lastCreatedAt ?? null);
            if (!lastRes.error) setLastCreatedAt(lastAt);
            setStatsReady(true);
            bioListSet(cacheKey, {
              rows: lastGoodRowsRef.current,
              total,
              searchCount,
              lastCreatedAt: lastAt,
              categories: null,
            }, ticket);
          })();
        }
      } catch (err) {
        if (!listGate.isCurrent(ticket)) return;
        if (opts.reset) setListLoading(false);
        setLoadingMore(false);
        const message = err instanceof Error ? err.message : String(err);
        console.error("[SembolDili] fetchList exception:", message);
        setLoadErrorMessage(`Beklenmeyen hata: ${message}`);
        if (lastGoodRowsRef.current.length > 0) {
          setRows(lastGoodRowsRef.current);
        }
      }
    },
    [categoryFilter, debouncedSearch, queryTenantId, listGate],
  );

  const refreshCategories = useCallback(async () => {
    const { categories: cats, error } = await bioApiCategories("symbols");
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
    // Çift gönderim kilidi: senkron kilit İLK ifade (tenant çözümü dahil); ikinci tık yok sayılır.
    await saveLock
      .run(async () => {
        try {
          const tenantId = queryTenantId ?? (await getSyncedTenantId());
          if (!tenantId) {
            showSoft("err", MISSING_SESSION_TENANT_MESSAGE);
            return;
          }

          const nameTrim = form.symbol_name.trim();
          if (!nameTrim) {
            showSoft("err", "Sembol adı zorunludur.");
            return;
          }

          setSaving(true);
          const { error } = await bioApiCreate("symbols", {
            symbol: nameTrim,
            title: nameTrim,
            category: trimOrNull(form.category),
            meaning: trimOrNull(form.meaning),
            source: trimOrNull(form.source),
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
          showSoft("ok", "Sembol kaydı oluşturuldu.");
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", e instanceof Error ? e.message : "İşlem tamamlanamadı."));
  }

  // Toplu seçim güvenliği: arama/filtre ile liste değişince seçim görünür kayıtlarla
  // kesişime budanır (değişiklik yoksa aynı Set döner → render döngüsü yok). Silme ve
  // "seçili" Word yalnız görünür ∩ seçili kayıtlar üzerinden yapılır.
  useEffect(() => {
    const visibleIds = rows.map((r) => r.id);
    runInEffect(() => setSelectedForExport((prev) => pruneSelection(prev, visibleIds)));
  }, [rows]);
  const selectedVisibleRows = rows.filter((r) => selectedForExport.has(r.id));
  const selectedVisibleIds = new Set(selectedVisibleRows.map((r) => r.id));

  async function handleBulkDeleteSelected() {
    const ids = selectedVisibleRows.map((r) => r.id);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("symbols", ids);
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
    const { error } = await bioApiDeleteAll("symbols", totalInDb);
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
              <p className="text-sm font-black text-blue-900">Demo Modu — Sembol Dili</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                Bu sayfa demo amaçlıdır. Kayıt içerikleri demo güvenliği nedeniyle flu gösterilmektedir.
                Yeni kayıt, düzenleme, silme ve dışa aktarma işlemleri devre dışıdır.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS). Veri, arama, kategori, sayaç, seçim, Word, silme ve
          detay sayfasına geçiş davranışı DEĞİŞMEDİ; kartlar tek tip (kayda göre görsel/renk YOK). */}
      {!isDemo && (
        <div className={styles.newRow}>
          <button type="button" onClick={() => { setForm({ ...emptyForm }); setFormModalOpen(true); }} className={styles.newBtn}>
            + Yeni Kayıt
          </button>
        </div>
      )}

      <div className={`${styles.stats} ${styles.statsGap}`}>
        <div className={`${styles.stat} ${styles.sViolet}`}>
          <span className={styles.statIcon} aria-hidden><Layers className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>Toplam Kayıt</p>
            <p className={styles.statValue}>{statsReady ? totalInDb : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sBlue}`}>
          <span className={styles.statIcon} aria-hidden><Eye className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{isSearchActive ? "Arama sonucu" : "Görünen Sonuç"}</p>
            <p className={styles.statValue}>{statsReady ? searchResultCount : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sTeal}`}>
          <span className={styles.statIcon} aria-hidden><Clock3 className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>Son Kayıt</p>
            <p className={`${styles.statValue} ${styles.statSmall}`}>{formatDate(lastCreatedAt)}</p>
          </div>
        </div>
      </div>

      <div className={`${styles.filters} ${styles.filtersNarrowCat} ${categories.length > 0 ? "" : styles.filtersOne}`}>
        <label className="block min-w-0">
          <span className={`${styles.fLabel} ${styles.fLabelMuted}`}>Kütüphane araması</span>
          <span className={styles.inputWrap}>
            <Search className={styles.inIcon} strokeWidth={2} aria-hidden />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sembol adı, kategori, anlam ve kaynak içinde ara..."
              className={`${styles.input} ${styles.inputSearch}`}
            />
          </span>
          {listBusy ? (
            <p className={styles.hint}>Aranıyor…</p>
          ) : isSearchActive ? (
            <p className={styles.hint}> Arama: “{debouncedSearch}” · {searchResultCount} eşleşme
            </p>
          ) : null}
        </label>
        {categories.length > 0 && (
          <label className="block min-w-0">
            <span className={`${styles.fLabel} ${styles.fLabelMuted}`}>Kategori</span>
            <span className={styles.inputWrap}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`${styles.input} ${styles.select}`}
              >
                <option value="">Tümü</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className={styles.selIcon} strokeWidth={2} aria-hidden />
            </span>
          </label>
        )}
      </div>

      {loadErrorMessage ? (
        <div className={`${styles.notice} ${styles.noticeErr}`}>
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {infoSuccess ? (
            <div
              role="status"
              aria-live="polite"
              className={`flex-1 ${styles.notice} ${styles.noticeOk}`}
            >
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div
              role="alert"
              aria-live="assertive"
              className={`flex-1 ${styles.notice} ${styles.noticeErr}`}
            >
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      {listLoading && rows.length === 0 ? (
        <p className={styles.listEmpty}>Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <CrudEmptyState
          Icon={Sparkles}
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk sembol kaydını ekleyebilirsiniz."
          }
          tone="emerald"
        />
      ) : (
        <>
          {!isDemo && <div className={styles.bulk}>
            <BulkExportBar
              selectedCount={selectedForExport.size}
              totalCount={totalInDb}
              selectAllLabel="Görünenleri Seç"
              selectAllCount={rows.length}
              onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
              onClearSelection={() => setSelectedForExport(new Set())}
              onExportSelected={() => void exportSymbolsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedVisibleIds, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              onExportAll={() => void exportSymbolsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              isExporting={wordBusy}
              onDeleteSelected={() => setDanger({ open: true, mode: "selected" })}
              isDeleting={isBulkDeleting}
              onDeleteAll={() => setDanger({ open: true, mode: "all" })}
            />
          </div>}
          <div className={`${styles.grid} ${styles.grid4}`}>
            {rows.map((row) => {
              const detailHref = symbolLanguageDetailHref(row.id);
              const preview = previewSymbolLanguageText(row.meaning, row.source);
              const hasCategory = Boolean(row.category?.trim());
              const displayTitle = symbolDisplayName(row);
              const isExportSelected = selectedForExport.has(row.id);

              if (!detailHref) return null;

              return (
                <div key={row.id} className={styles.rWrap}>
                  {!isDemo && (
                    <label className={styles.rCheck} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Bu kaydı seç"
                        checked={isExportSelected}
                        onChange={() => setSelectedForExport((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                          return next;
                        })}
                      />
                    </label>
                  )}
                <Link
                  href={detailHref}
                  className={`${styles.rCard} ${!isDemo && isExportSelected ? styles.rSelected : ""}`}
                >
                  {hasCategory ? (
                    <span className={styles.pill}>
                      {row.category}
                    </span>
                  ) : (
                    <span className={`${styles.pill} ${styles.pillMuted}`}>
                      Kategorisiz
                    </span>
                  )}

                  <h2 className={`${styles.rTitle} ${styles.rTitleUpper}`} lang="tr">
                    {displayTitle}
                  </h2>
                  <AdminTransferBadge originType={row.origin_type} className="mt-1" />

                  <DemoBlur isProtected={isDemo} className={styles.rTextWrap}>
                    <p className={styles.rText}>
                      {preview}
                    </p>
                  </DemoBlur>

                  <span className={`${styles.rBtn} ${styles.rBtnOutline}`}>
                    Detayı Aç
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                </Link>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <div className={styles.moreWrap}>
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={() => void fetchList({ reset: false, append: true, offset: rows.length })}
                className={styles.moreBtn}
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
        isDirty={formIsDirty}
        title="Yeni sembol kaydı"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="symbol-form-modal-title"
        accentRingClass="ring-emerald-100/50"
        footer={({ requestClose }) => (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={requestClose}
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
        )}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Sembol Adı *</span>
            <input
              value={form.symbol_name}
              onChange={(e) => setForm((f) => ({ ...f, symbol_name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("emerald")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Örn. hayvan, doğa…"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Anlam</span>}
            modalTitle="Anlam"
            value={form.meaning}
            onChange={(v) => setForm((f) => ({ ...f, meaning: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-amber-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-amber-200/90 focus:ring-2 focus:ring-amber-100/55"
            />
          </label>
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        scope={{ filterActive: Boolean(debouncedSearch.trim() || categoryFilter), visibleCount: searchResultCount }}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedVisibleRows.length}
        names={danger.mode === "all" ? undefined : selectedVisibleRows.map((r) => symbolDisplayName(r))}
        resourceLabel="Sembol Dili"
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
