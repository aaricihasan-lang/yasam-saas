"use client";

import { pruneSelection, visibleSelection } from "@/lib/ui/selection";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { runInEffect } from "@/lib/runInEffect";
import { Activity, ChevronDown, Clock3, FileText, Folder, Layers, Search } from "lucide-react";
import styles from "@/app/_premium/biyoenerji/kutuphane/bioKutuphane.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useBioErrorText } from "../useBioErrorText";
import { useBioDateTime } from "../useBioDateTime";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  bioApiCategories,
  bioApiCount,
  bioApiCreate,
  authHeaders,
  bioApiDelete,
  bioApiDeleteAll,
  bioApiDeleteMany,
  bioApiLastCreated,
  bioApiList,
  bioApiUpdate,
} from "@/lib/biyoenerji/secureApi";
import { changedFields } from "@/lib/biyoenerji/changedFields";
import { bioListGet, bioListKey, bioListSet } from "@/lib/biyoenerji/listCache";
import { useBioRequestGate } from "@/lib/biyoenerji/requestGate";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { bioSaveBtnClass, badgeFieldWrapClass } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { useDirtySnapshot } from "@/lib/biyoenerji/useDirtyGuard";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { LongTextareaField } from "./LargeTextModal";
import BiyoenerjiSearchHighlight from "./BiyoenerjiSearchHighlight";
import { BIO_SEARCH_RECORD_PARAM, BIO_SEARCH_TERM_PARAM, readBioUrlParam } from "@/lib/biyoenerji/searchSession";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";

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


/** BIO-14 — yan panel listenin altına yığıldığında (Tailwind xl altı) paneli görünür alana getir. */
function scrollPanelIntoViewIfStacked(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  if (!window.matchMedia("(max-width: 1279px)").matches) return;
  window.requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}


export default function BiyoenerjiSeanslari() {
  const { isDemo } = useDemoGuard();
  const t = useTranslations("bioenergy.sessions");
  const tl = useTranslations("bioenergy.list");
  const td = useTranslations("bioenergy.detail");
  const te = useTranslations("bioenergy.energyBodies");
  const errText = useBioErrorText();
  const formatDate = useBioDateTime();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useSubmitLock();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // WT5: Biyoenerji genel aramasından gelindiyse (?q=) bölüm araması o terimle açılır.
  // FINAL-A2: `?rid=` → liste yüklenince o kayıt seçilir (aranan terim `?hq=` ile detayda sarı).
  const pendingOpenIdRef = useRef<string | null>(null);
  useEffect(() => {
    const initialQ = new URLSearchParams(window.location.search).get("q")?.trim();
    pendingOpenIdRef.current = readBioUrlParam(window.location.search, BIO_SEARCH_RECORD_PARAM) || null;
    if (initialQ) runInEffect(() => setSearchTerm(initialQ.slice(0, 100)));
  }, []);
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
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionForm>({ ...emptyForm });
  // A3 — düzenleme formunun açılış anındaki değeri (değişen alan karşılaştırması).
  const editOriginalRef = useRef<typeof form | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<"create" | "edit">("create");
  // BIO-004/015 — form modalı için kaydedilmemiş değişiklik takibi.
  const { isDirty: formIsDirty } = useDirtySnapshot(formModalOpen, form);
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

  // A7/A8 — eski / başka hesap yanıtlarını yok sayan istek kapısı.
  const listGate = useBioRequestGate();
  const loadSessions = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const ticket = listGate.begin({ append: Boolean(opts.append) });
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
      if (!listGate.isCurrent(ticket)) return; // A7/A8 — eski/başka hesap yanıtı yazılmaz
      if (opts.reset) setLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        showSoft("err", t("readFailed", { detail: errText(pageRes.error, tl("serverError")) }));
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
          if (!listGate.isCurrent(ticket)) return; // A7/A8 — sayım/cache yazılmaz
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
          }, ticket);
        })();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- çeviri işlevleri dil değişiminde yeniden liste çekmez
    [tenantId, debouncedSearch, categoryFilter, showSoft, listGate],
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

  // FINAL-A2: genel aramadan açılan kayıt (rid) listede belirince bir kez seçilir.
  useEffect(() => {
    const want = pendingOpenIdRef.current;
    if (!want || loading) return;
    if (!rows.some((r) => r.id === want)) return;
    pendingOpenIdRef.current = null;
    runInEffect(() => setSelectedId(want));
  }, [rows, loading]);

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
    if (!userId) { showSoft("err", t("noUser")); return; }
    setWordBusy(true);
    try {
      const body: Record<string, unknown> = { tenantId, userId, exportMode: mode === "single" ? "single" : mode };
      if (mode === "single" && singleId) body.sessionId = singleId;
      else if (mode === "selected") {
        const ids = visibleSelection(selectedForExport, rows.map((r) => r.id));
        if (!ids.length) return;
        body.sessionIds = ids;
      }
      const res = await fetch("/api/biyoenerji/session-report", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) { showSoft("err", tl("reportFailed")); return; }
      await downloadFileResponse(res, `biyoenerji-seans-${mode === "selected" ? "secili" : mode === "single" ? "tek" : "tumu"}-${reportFileDate()}.docx`);
      showSoft("ok", t("reportDownloaded"));
    } catch { showSoft("err", tl("reportFailed")); } finally {
      setWordBusy(false);
    }
  }

  function fillFormFromRow(row: BioenergySession) {
    const next = {
      title: row.title ?? "",
      content: row.content ?? "",
      category: row.category ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    };
    setForm(next);
    return next;
  }

  function selectRow(row: BioenergySession) {
    pendingOpenIdRef.current = null;
    setSelectedId(row.id);
    setFormModalOpen(false);
    setInfoError("");
    setInfoSuccess("");
    // BIO-14 — panel listenin ALTINDA yığılı olduğu genişliklerde (< xl) seçilen
    // kaydın detayı görünür alana kaydırılır; masaüstü yan-panel düzeni etkilenmez.
    scrollPanelIntoViewIfStacked(detailPanelRef.current);
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
      showSoft("err", te("selectToUpdate"));
      return;
    }
    setFormModalMode("edit");
    editOriginalRef.current = fillFormFromRow(selectedRow);
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
    // Çift gönderim kilidi: senkron kilit İLK ifade (tenant çözümü dahil); ikinci tık yok sayılır.
    await saveLock
      .run(async () => {
        try {
          if (!tenantId) return;

          const titleTrim = form.title.trim();
          if (!titleTrim) {
            showSoft("err", t("titleRequired"));
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
            showSoft("err", tl("addFailed", { detail: errText(error, tl("serverError")) }));
            return;
          }

          setFormModalOpen(false);
          await loadSessions({ reset: true });
          void refreshCategories();
          showSoft("ok", t("created"));
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", errText(e, tl("opFailed"))));
  }

  async function handleGuncelle() {
    // Çift gönderim kilidi: senkron kilit İLK ifade (tenant çözümü dahil); ikinci tık yok sayılır.
    await saveLock
      .run(async () => {
        try {
          if (!tenantId || !selectedId) {
            showSoft("err", te("selectToUpdate"));
            return;
          }
          const titleTrim = form.title.trim();
          if (!titleTrim) {
            showSoft("err", t("titleRequired"));
            return;
          }

          // A3 — yalnız form açılışındaki değerden FARKLI alanlar gönderilir (lost update önlenir).
          const payloadOf = (f: typeof form) => ({
            title: f.title.trim(),
            content: trimOrNull(f.content),
            category: trimOrNull(f.category),
            source: trimOrNull(f.source),
            note: trimOrNull(f.note),
          });
          const changes = changedFields(payloadOf(form), editOriginalRef.current ? payloadOf(editOriginalRef.current) : null);
          if (Object.keys(changes).length === 0) {
            setFormModalOpen(false);
            showSoft("ok", td("noChanges"));
            return;
          }
          setSaving(true);
          setInfoError("");
          const { error } = await bioApiUpdate("sessions", selectedId, changes);

          setSaving(false);

          if (error) {
            showSoft("err", td("updateFailed", { detail: errText(error, tl("serverError")) }));
            return;
          }

          setFormModalOpen(false);
          await loadSessions({ reset: true });
          void refreshCategories();
          showSoft("ok", td("updated"));
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", errText(e, tl("opFailed"))));
  }

  function openDeleteConfirm() {
    if (!selectedId) {
      showSoft("err", te("selectToDelete"));
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
      showSoft("err", tl("deleteFailed", { detail: errText(error, tl("serverError")) }));
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
    showSoft("ok", te("deleted"));
  }

  // Toplu seçim güvenliği: arama/filtre ile liste değişince seçim görünür kayıtlarla
  // kesişime budanır (değişiklik yoksa aynı Set döner → render döngüsü yok). Silme ve
  // "seçili" Word yalnız görünür ∩ seçili kayıtlar üzerinden yapılır.
  useEffect(() => {
    const visibleIds = rows.map((r) => r.id);
    runInEffect(() => setSelectedForExport((prev) => pruneSelection(prev, visibleIds)));
  }, [rows]);
  const selectedVisibleRows = rows.filter((r) => selectedForExport.has(r.id));

  async function handleBulkDeleteSelected() {
    const ids = selectedVisibleRows.map((r) => r.id);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("sessions", ids);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", tl("deleteFailed", { detail: errText(error, tl("serverError")) }));
      return;
    }
    const deletedSet = new Set(ids);
    if (selectedId && deletedSet.has(selectedId)) resetFormSelection();
    setSelectedForExport(new Set());
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", tl("deletedCount", { count: String(ids.length) }));
  }

  async function handleDeleteAll() {
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteAll("sessions", totalInDb);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", tl("deleteFailed", { detail: errText(error, tl("serverError")) }));
      return;
    }
    setSelectedForExport(new Set());
    setCategoryFilter("");
    resetFormSelection();
    await loadSessions({ reset: true });
    void refreshCategories();
    showSoft("ok", tl("deletedAll"));
  }

  return (
    <section className="w-full min-w-0">
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">{t("demoTitle")}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                {t("demoBody")}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS): arama kartı, 3 sayaç, Kayıtlar | detay paneli.
          Veri, arama, kategori, sayaç, seçim, Word, güncelleme, silme ve arama vurgusu davranışı DEĞİŞMEDİ. */}
      <section className={`${styles.card} ${styles.searchCard}`}>
        <div className={`${styles.filters} ${categories.length > 0 ? styles.filtersNarrowCat : styles.filtersOne}`} style={{ marginBottom: 0 }}>
          <label className="block min-w-0">
            <span className={styles.fLabel}>{t("searchLabel")}</span>
            <span className={styles.inputWrap}>
              <Search className={styles.inIcon} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className={`${styles.input} ${styles.inputSearch}`}
              />
            </span>
            {isSearchActive ? (
              <p className={styles.hint}>
                {tl("searchSummaryCurly", { query: debouncedSearch, count: String(searchResultCount) })}
              </p>
            ) : null}
          </label>
          {categories.length > 0 && (
            <label className="block min-w-0">
              <span className={styles.fLabel}>{t("fields.category")}</span>
              <span className={styles.inputWrap}>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`${styles.input} ${styles.select}`}
                >
                  <option value="">{tl("all")}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className={styles.selIcon} strokeWidth={2} aria-hidden />
              </span>
            </label>
          )}
        </div>
      </section>

      <div className={`${styles.stats} ${styles.statsSeans}`}>
        <div className={`${styles.stat} ${styles.sViolet}`}>
          <span className={styles.statIcon} aria-hidden><Layers className="h-7 w-7" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{tl("statTotalCap")}</p>
            <p className={styles.statValue}>{statsReady ? moduleStats.total : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sBlue}`}>
          <span className={styles.statIcon} aria-hidden><Folder className="h-7 w-7" fill="currentColor" strokeWidth={1.6} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{t("fields.category")}</p>
            <p className={styles.statValue}>{statsReady ? moduleStats.cats : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sTeal}`}>
          <span className={styles.statIcon} aria-hidden><Clock3 className="h-7 w-7" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{tl("statLastCap")}</p>
            <p className={`${styles.statValue} ${styles.statSmall}`}>{moduleStats.last}</p>
          </div>
        </div>
      </div>

      {(infoSuccess || infoError) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {infoSuccess ? (
            <div role="status" aria-live="polite" className={`flex-1 ${styles.notice} ${styles.noticeOk}`}>
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div role="alert" aria-live="assertive" className={`flex-1 ${styles.notice} ${styles.noticeErr}`}>
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      <div className={styles.workspace}>
        <section className={`${styles.card} ${styles.listPanel}`}>
          <div className={styles.listHead}>
            <h2 className={styles.listTitle}>{te("listTitle", { count: String(filteredRows.length) })}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {loading ? <span className="text-[11px] font-bold text-slate-400">{tl("loading")}</span> : null}
              {!isDemo && (
                <button type="button" onClick={openCreateModal} className={`${styles.newBtn} ${styles.seansNew}`}>
                  {tl("newRecord")}
                </button>
              )}
            </div>
          </div>
          {/* Word export çubuğu */}
          {!isDemo && !loading && filteredRows.length > 0 && (
            <div className={styles.bulk}>
              <BulkExportBar
                selectedCount={selectedForExport.size}
                totalCount={totalInDb}
                selectAllLabel={tl("selectVisible")}
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
          <div className={styles.rows}>
            {loading ? (
              <p className={styles.listEmpty}>{tl("loading")}</p>
            ) : filteredRows.length === 0 ? (
              <div className={`${styles.emptyBox} ${styles.emptyList}`}>
                <span className={styles.emptyIcon} aria-hidden><Activity className="h-6 w-6" strokeWidth={2} /></span>
                <p className={styles.emptyTitle}>{te("emptyTitle")}</p>
                <p className={styles.emptySub}>
                  {hasSearch
                    ? t("emptySearchBody")
                    : t("emptyBody")}
                </p>
              </div>
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const exportSelected = selectedForExport.has(row.id);
                return (
                  <div key={row.id} className={styles.rowWrap}>
                    {!isDemo && (
                      <label className={styles.rowCheck} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={tl("selectRecord")}
                          checked={exportSelected}
                          onChange={() => toggleExportSelection(row.id)}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => selectRow(row)}
                      aria-current={active ? "true" : undefined}
                      className={`${styles.rowBtn} ${active ? styles.rowActive : exportSelected ? styles.rowExport : ""}`}
                    >
                      <span className={styles.rowName}>{row.title?.trim() || "—"}</span>
                      <span className={`flex flex-wrap items-center gap-2 ${styles.rowMeta}`}>
                        <span>{formatDate(row.created_at)}</span>
                        {row.category?.trim() ? (
                          <span className={styles.pill}>{row.category}</span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {hasMore ? (
            <div className={styles.moreWrap}>
              <button
                type="button"
                disabled={loadingMore || loading}
                onClick={() => void loadSessions({ reset: false, append: true, offset: rows.length })}
                className={styles.moreBtn}
              >
                {loadingMore ? tl("loading") : tl("loadMore", { shown: String(rows.length), total: String(searchResultCount) })}
              </button>
            </div>
          ) : null}
        </section>

        <div
          ref={detailPanelRef}
          className={`${styles.card} ${styles.detailPanel}`}
          aria-live="polite"
        >
          {/* FINAL-A2: genel aramadan gelindiyse (?hq=) seçili kayıtta terim sarı + ilk eşleşmeye kaydırma. */}
          <BiyoenerjiSearchHighlight recordKey="seanslar" termParam={BIO_SEARCH_TERM_PARAM} className="flex min-w-0 flex-1 flex-col">
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex w-fit rounded-full bg-violet-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-violet-800 ring-1 ring-violet-200/45">
                {te("selectedPill")}
              </div>
              <h3 className="mt-2 text-[19px] font-black leading-snug text-slate-900 sm:text-[21px]">
                {selectedRow.title?.trim() || "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.category?.trim() ? (
                  <span className={styles.pill}>{selectedRow.category}</span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-amber-100/80 bg-amber-50/80 px-2 py-0.5 text-[11px] font-black text-amber-950/90">
                    {t("sourcePrefix")} {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <DemoBlur isProtected={isDemo}>
                {/* BIO-16 — tam seans metni + Not (salt-okuma); düzenleme modalı ayrı kalır. */}
                <div className="mt-4 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
                  {selectedRow.content?.trim() ? (
                    <p className="whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
                      {selectedRow.content}
                    </p>
                  ) : (
                    <p className="text-[13px] font-semibold text-slate-400">{t("textEmpty")}</p>
                  )}
                  {selectedRow.note?.trim() ? (
                    <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{t("fields.note")}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
                        {selectedRow.note}
                      </p>
                    </div>
                  ) : null}
                </div>
              </DemoBlur>
              {!isDemo && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-violet-100/70 pt-5">
                  <button
                    type="button"
                    disabled={wordBusy}
                    onClick={() => void exportSessionsWord("single", selectedRow.id)}
                    className="min-h-[44px] rounded-xl border border-blue-200/70 bg-blue-50/90 px-4 py-2.5 text-[13px] font-black text-blue-800 transition hover:bg-blue-100/90 disabled:opacity-50"
                  >
                    {wordBusy ? te("wordPreparing") : te("wordReport")}
                  </button>
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="min-h-[44px] rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[13px] font-black text-violet-900 shadow-[0_4px_18px_-8px_rgba(109,40,217,0.12)] transition hover:bg-violet-100/90"
                  >
                    {td("update")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={openDeleteConfirm}
                    className="min-h-[44px] rounded-xl border border-rose-200/70 bg-rose-50/90 px-4 py-2.5 text-[13px] font-black text-rose-800 transition hover:bg-rose-100/90 disabled:opacity-45"
                  >
                    {td("delete")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={`${styles.emptyBox} ${styles.emptyDetail}`}>
              <span className={styles.emptyIcon} aria-hidden><FileText className="h-6 w-6" strokeWidth={2} /></span>
              <p className={styles.emptySub}>
                {isDemo ? t("pickDemo") : t("pick")}
              </p>
            </div>
          )}
          </BiyoenerjiSearchHighlight>
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        isDirty={formIsDirty}
        title={formModalMode === "create" ? t("formCreate") : t("formEdit")}
        subtitle={
          formModalMode === "edit"
            ? t("formSubtitleEdit")
            : t("formSubtitleCreate")
        }
        titleId="seans-form-modal-title"
        accentRingClass="ring-violet-100/50"
        footer={({ requestClose }) => (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={requestClose}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {tl("cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={modalTemizle}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {tl("clear")}
            </button>
            {formModalMode === "create" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleKaydet()}
                className={bioSaveBtnClass}
              >
                {saving ? tl("saving") : tl("save")}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleGuncelle()}
                className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[12px] font-black text-violet-900 shadow-sm transition hover:bg-violet-100/90 disabled:opacity-55"
              >
                {saving ? td("updating") : td("update")}
              </button>
            )}
          </>
        )}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90 shadow-[0_0_8px_rgba(109,40,217,0.35)]" />
              {t("fields.title")}
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
              {t("fields.category")}
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
                {t("fields.text")}
              </span>
            }
            modalTitle={t("fields.text")}
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-emerald-100/40 transition duration-200"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/85" />
              {t("fields.source")}
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
                {t("fields.note")}
              </span>
            }
            modalTitle={t("fields.note")}
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
        title={t("deleteConfirm")}
        busy={saving}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void executeDelete()}
      />

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        scope={{ filterActive: Boolean(debouncedSearch.trim() || categoryFilter), visibleCount: searchResultCount }}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedVisibleRows.length}
        names={danger.mode === "all" ? undefined : selectedVisibleRows.map((r) => (r.title?.trim() || tl("untitled")))}
        resourceLabel={t("resourceLabel")}
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
