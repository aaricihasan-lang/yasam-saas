"use client";

import { pruneSelection } from "@/lib/ui/selection";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";

import { runInEffect } from "@/lib/runInEffect";
import { ChevronRight, Clock3, Layers, Search, Sprout } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  bioApiCount,
  authHeaders,
  bioApiCreate,
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
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import {
  ENERGY_BODIES_FONT_DEFAULT,
  type EnergyBodiesTypography,
} from "@/lib/bioenergy/energyBodiesFontSize";
import { useEnergyBodiesFontSize } from "@/lib/bioenergy/useEnergyBodiesFontSize";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { bioSaveBtnClass, CrudEmptyState } from "./BiyoenerjiUi";
import { energyBodyVisual } from "./energyBodyVisual";
import styles from "@/app/_premium/biyoenerji/enerjiBedenleri.module.css";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { LongTextareaField } from "./LargeTextModal";
import { useDirtySnapshot } from "@/lib/biyoenerji/useDirtyGuard";
import { BIO_SEARCH_RECORD_PARAM, BIO_SEARCH_TERM_PARAM, readBioUrlParam } from "@/lib/biyoenerji/searchSession";
import BiyoenerjiSearchHighlight from "./BiyoenerjiSearchHighlight";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoGate } from "@/components/demo/DemoGate";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";

const ENERGY_BODIES_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

async function exportEnergyBodiesWord(
  tenantId: string,
  userId: string,
  exportMode: "all" | "selected" | "single",
  ids: Set<string> | string,
  setWordBusy: (v: boolean) => void,
  onSuccess?: () => void,
  onError?: () => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, userId, exportMode };
    if (exportMode === "single" && typeof ids === "string") {
      body.id = ids;
    } else if (exportMode === "selected" && ids instanceof Set) {
      const arr = [...ids];
      if (!arr.length) return;
      body.ids = arr;
    }
    const res = await fetch("/api/biyoenerji/energy-body-report", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) { onError?.(); return; }
    await downloadFileResponse(res, `biyoenerji-enerji-bedenleri-${exportMode === "selected" ? "secili" : exportMode === "single" ? "tek" : "tumu"}-${reportFileDate()}.docx`);
    onSuccess?.();
  } catch { onError?.(); } finally {
    setWordBusy(false);
  }
}

type BioenergyEnergyBodyRecord = {
  id: string;
  tenant_id: string;
  source_uid: string;
  genel_tanim: string | null;
  gorevi: string | null;
  bozulma: string | null;
  onerilen_taslar: string | null;
  not_text: string | null;
  created_at: string;
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti. */
  origin_type?: string | null;
};

type EnergyBodyForm = {
  source_uid: string;
  genel_tanim: string;
  gorevi: string;
  bozulma: string;
  onerilen_taslar: string;
  not_text: string;
};

const emptyForm: EnergyBodyForm = {
  source_uid: "",
  genel_tanim: "",
  gorevi: "",
  bozulma: "",
  onerilen_taslar: "",
  not_text: "",
};

function trimOrEmpty(v: string) {
  return v.trim();
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

function EnergyBodyStats({
  total,
  uidCount,
  lastDate,
  loading = false,
}: {
  total: number;
  uidCount: number;
  lastDate: string;
  /** K-2: sayım gelene kadar 0 yerine "…" göster. */
  loading?: boolean;
}) {
  const items = [
    { label: "Toplam Kayıt", value: loading ? "…" : String(total), Icon: Layers, tone: styles.statViolet },
    { label: "Enerji Bedeni", value: loading ? "…" : String(uidCount), Icon: Sprout, tone: styles.statGreen },
    { label: "Son Kayıt", value: lastDate, Icon: Clock3, tone: styles.statAmber, small: true },
  ];

  return (
    <div className={styles.stats}>
      {items.map((item) => (
        <div key={item.label} className={`${styles.stat} ${item.tone}`}>
          <span className={styles.statIcon} aria-hidden>
            <item.Icon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{item.label}</p>
            <p className={`${styles.statValue} ${item.small ? styles.statValueSmall : ""}`}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailFieldCard({
  title,
  text,
  typography,
  dot,
}: {
  title: string;
  text: string | null | undefined;
  typography: EnergyBodiesTypography;
  /** Form alanlarıyla aynı renk noktası (yalnız görsel). */
  dot: string;
}) {
  const display = text?.trim() || "";

  return (
    <article className={styles.field}>
      <h4 className={styles.fieldTitle}>
        <span className={`${styles.fieldDot} ${dot}`} aria-hidden />
        {title}
      </h4>
      <div className={styles.fieldBody} style={typography.bodyStyle}>
        {display ? (
          formatStoneContent(display, { fontSizePx: typography.fontSizePx })
        ) : (
          <p className={styles.fieldEmpty}>Henüz bilgi girilmedi.</p>
        )}
      </div>
    </article>
  );
}

export default function EnerjiBedenleri() {
  const {
    fontSizePx,
    typography: detailTypography,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useEnergyBodiesFontSize();

  const { isDemo } = useDemoGuard();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergyEnergyBodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useSubmitLock();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // WT5: Biyoenerji genel aramasından gelindiyse (?q=) bölüm araması o terimle açılır.
  // FINAL-A2: `?rid=` → liste yüklenince o kayıt seçilir (aranan terim `?hq=` ile detayda sarı).
  const pendingOpenIdRef = useRef<string | null>(null);
  useEffect(() => {
    const initialQ = new URLSearchParams(window.location.search).get("q")?.trim();
    pendingOpenIdRef.current = readBioUrlParam(window.location.search, BIO_SEARCH_RECORD_PARAM) || null;
    if (initialQ) runInEffect(() => setSearchQuery(initialQ.slice(0, 100)));
  }, []);
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
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EnergyBodyForm>({ ...emptyForm });
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
  const loadRecords = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const ticket = listGate.begin({ append: Boolean(opts.append) });
      if (!tenantId) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;
      const cacheKey = bioListKey("energy-bodies", { search, offset: 0 });

      if (opts.reset) {
        setLoadErrorMessage(null);
        setInfoError("");
        // Cache'ten anında göster (stale-while-revalidate); yoksa yükleniyor
        const cached = bioListGet(cacheKey);
        if (cached) {
          setRows(cached.rows as BioenergyEnergyBodyRecord[]);
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
      const pageRes = await bioApiList("energy-bodies", { offset, limit: ENERGY_BODIES_PAGE_SIZE, search });
      if (!listGate.isCurrent(ticket)) return; // A7/A8 — eski/başka hesap yanıtı yazılmaz
      if (opts.reset) setLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setLoadErrorMessage(`Enerji bedenleri okunamadı: ${pageRes.error}`);
        if (opts.reset && !bioListGet(cacheKey)) setRows([]);
        return;
      }

      const pageRows = pageRes.rows as unknown as BioenergyEnergyBodyRecord[];
      setRows((current) => (opts.append ? [...current, ...pageRows] : pageRows));

      // 2) İstatistikler ARKA PLANDA (grid'i bloklamaz) — yalnız reset
      if (opts.reset) {
        void (async () => {
          const totalP = bioApiCount("energy-bodies");
          // dedupe: arama boşken total == searchCount → tek sorgu
          const searchP = search ? bioApiCount("energy-bodies", search) : totalP;
          const [totalRes, searchCountRes, lastRes] = await Promise.all([
            totalP,
            searchP,
            bioApiLastCreated("energy-bodies"),
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
    [tenantId, debouncedSearch, listGate],
  );

  useEffect(() => {
    if (!tenantId) return;
    runInEffect(() => {
      void loadRecords({ reset: true });
    });
  }, [tenantId, debouncedSearch, loadRecords]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Demo modda source_uid başına tek kayıt göster (duplikat koruması)
  const baseRows = useMemo(() => {
    if (!isDemo) return rows;
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = (r.source_uid ?? "").trim().toLocaleLowerCase("tr-TR");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows, isDemo]);

  const filteredRows = baseRows;
  const hasMore = rows.length < searchResultCount;
  const isSearchActive = Boolean(debouncedSearch);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );
  // Premium görünüm: seçili kaydın dekoratif ikon/tonu (yalnız sunum).
  const selectedVisual = energyBodyVisual(selectedRow?.source_uid);

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
    uids: totalInDb,
    last: lastCreatedAt ? formatDate(lastCreatedAt) : "—",
  };

  function fillFormFromRow(row: BioenergyEnergyBodyRecord) {
    const next = {
      source_uid: row.source_uid ?? "",
      genel_tanim: row.genel_tanim ?? "",
      gorevi: row.gorevi ?? "",
      bozulma: row.bozulma ?? "",
      onerilen_taslar: row.onerilen_taslar ?? "",
      not_text: row.not_text ?? "",
    };
    setForm(next);
    return next;
  }

  function selectRow(row: BioenergyEnergyBodyRecord) {
    pendingOpenIdRef.current = null;
    setSelectedId(row.id);
    setFormModalOpen(false);
    setInfoError("");
    setInfoSuccess("");
    // BIO-14 — detay paneli listenin altına yığıldığında (< lg) görünür alana getir.
    const el = detailPanelRef.current;
    if (el && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
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

          const uidTrim = form.source_uid.trim();
          if (!uidTrim) {
            showSoft("err", "Enerji bedeni / katman zorunludur (ör. eterik).");
            return;
          }

          setSaving(true);
          setInfoError("");
          const { error } = await bioApiCreate("energy-bodies", {
            source_uid: uidTrim,
            genel_tanim: trimOrEmpty(form.genel_tanim),
            gorevi: trimOrEmpty(form.gorevi),
            bozulma: trimOrEmpty(form.bozulma),
            onerilen_taslar: trimOrEmpty(form.onerilen_taslar),
            not_text: trimOrEmpty(form.not_text),
          });

          setSaving(false);

          if (error) {
            showSoft("err", `Kayıt eklenemedi: ${error}`);
            return;
          }

          setFormModalOpen(false);
          await loadRecords({ reset: true });
          showSoft("ok", "Enerji bedeni kaydı oluşturuldu.");
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", e instanceof Error ? e.message : "İşlem tamamlanamadı."));
  }

  async function handleGuncelle() {
    // Çift gönderim kilidi: senkron kilit İLK ifade (tenant çözümü dahil); ikinci tık yok sayılır.
    await saveLock
      .run(async () => {
        try {
          if (!selectedId) {
            showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
            return;
          }
          const uidTrim = form.source_uid.trim();
          if (!uidTrim) {
            showSoft("err", "Enerji bedeni / katman zorunludur.");
            return;
          }

          // A3 — yalnız form açılışındaki değerden FARKLI alanlar gönderilir (lost update önlenir).
          const payloadOf = (f: typeof form) => ({
            source_uid: f.source_uid.trim(),
            genel_tanim: trimOrEmpty(f.genel_tanim),
            gorevi: trimOrEmpty(f.gorevi),
            bozulma: trimOrEmpty(f.bozulma),
            onerilen_taslar: trimOrEmpty(f.onerilen_taslar),
            not_text: trimOrEmpty(f.not_text),
          });
          const changes = changedFields(payloadOf(form), editOriginalRef.current ? payloadOf(editOriginalRef.current) : null);
          if (Object.keys(changes).length === 0) {
            setFormModalOpen(false);
            showSoft("ok", "Değişiklik yok.");
            return;
          }
          setSaving(true);
          setInfoError("");
          const { error } = await bioApiUpdate("energy-bodies", selectedId, changes);

          setSaving(false);

          if (error) {
            showSoft("err", `Güncellenemedi: ${error}`);
            return;
          }

          setFormModalOpen(false);
          await loadRecords({ reset: true });
          showSoft("ok", "Kayıt güncellendi.");
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", e instanceof Error ? e.message : "İşlem tamamlanamadı."));
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
    if (!selectedId || !tenantId) return;

    setSaving(true);
    setInfoError("");
    const { error } = await bioApiDelete("energy-bodies", selectedId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }

    setSelectedForExport((prev) => {
      if (!selectedId || !prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
    await loadRecords({ reset: true });
    resetFormSelection();
    showSoft("ok", "Kayıt silindi.");
  }

  // Toplu seçim güvenliği: arama/filtre ile liste değişince seçim görünür kayıtlarla
  // kesişime budanır (değişiklik yoksa aynı Set döner → render döngüsü yok). Silme ve
  // "seçili" Word yalnız görünür ∩ seçili kayıtlar üzerinden yapılır.
  useEffect(() => {
    const visibleIds = baseRows.map((r) => r.id);
    runInEffect(() => setSelectedForExport((prev) => pruneSelection(prev, visibleIds)));
  }, [baseRows]);
  const selectedVisibleRows = baseRows.filter((r) => selectedForExport.has(r.id));
  const selectedVisibleIds = new Set(selectedVisibleRows.map((r) => r.id));

  async function handleBulkDeleteSelected() {
    const ids = selectedVisibleRows.map((r) => r.id);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("energy-bodies", ids);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    const deletedSet = new Set(ids);
    if (selectedId && deletedSet.has(selectedId)) resetFormSelection();
    setSelectedForExport(new Set());
    await loadRecords({ reset: true });
    showSoft("ok", `${ids.length} kayıt silindi.`);
  }

  async function handleDeleteAll() {
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteAll("energy-bodies", totalInDb);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }
    setSelectedForExport(new Set());
    resetFormSelection();
    await loadRecords({ reset: true });
    showSoft("ok", "Tüm kayıtlar silindi.");
  }

  return (
    <section className="w-full min-w-0">

      {/* Demo bilgilendirme banner */}
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">Demo Modu — Enerji Bedenleri</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                Bu sayfa demo amaçlıdır. Enerji bedenlerine ait içerikler demo güvenliği nedeniyle flu gösterilmektedir.
                Yeni kayıt, düzenleme, silme ve dışa aktarma işlemleri demo modunda devre dışıdır.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={`${styles.card} ${styles.searchCard}`}>
          <label className="block">
            <span className={styles.searchLabel}>Tanım, görev, bozulma, taşlar, not içinde ara</span>
            <span className={styles.searchField}>
              <Search className={styles.searchIcon} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Örn. eterik, aura, görev, bozulma…"
                className={styles.searchInput}
              />
            </span>
            {isSearchActive ? (
              <p className={styles.searchHint}>
                “{debouncedSearch}” · {searchResultCount} eşleşme
              </p>
            ) : null}
          </label>
        </div>
        <EnergyBodyStats
          total={moduleStats.total}
          uidCount={moduleStats.uids}
          lastDate={moduleStats.last}
          loading={!statsReady}
        />
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

      <div className={styles.workspace}>
        <div className={`${styles.card} ${styles.listPanel}`}>
          <div className={styles.listHead}>
            <h2 className={styles.listTitle}>Kayıtlar ({filteredRows.length})</h2>
            <div className="flex items-center gap-2">
              {loading ? <span className={styles.loadingNote}>Yükleniyor…</span> : null}
              {/* Demo modda yeni kayıt butonu gizli */}
              {!isDemo && (
                <button type="button" onClick={openCreateModal} className={styles.newBtn}>
                  + Yeni Kayıt
                </button>
              )}
            </div>
          </div>

          {/* Demo modda BulkExportBar gizli */}
          {!isDemo && baseRows.length > 0 && (
            <div className={styles.bulk}>
              <BulkExportBar
                selectedCount={selectedForExport.size}
                totalCount={totalInDb}
                selectAllLabel="Görünenleri Seç"
                selectAllCount={baseRows.length}
                onSelectAll={() => setSelectedForExport(new Set(baseRows.map((r) => r.id)))}
                onClearSelection={() => setSelectedForExport(new Set())}
                onExportSelected={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedVisibleIds, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
                onExportAll={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
                isExporting={wordBusy}
                onDeleteSelected={() => setDanger({ open: true, mode: "selected" })}
                isDeleting={isBulkDeleting}
                onDeleteAll={() => setDanger({ open: true, mode: "all" })}
              />
            </div>
          )}

          <div className={styles.rows}>
            {loading ? (
              <p className={styles.listEmpty}>Yükleniyor…</p>
            ) : loadErrorMessage ? null : baseRows.length === 0 ? (
              <CrudEmptyState
                Icon={Layers}
                title={isSearchActive ? "Sonuç bulunamadı" : "Liste boş"}
                subtitle={
                  isSearchActive
                    ? "Arama terimini değiştirin veya Yeni Kayıt ile enerji bedeni ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                }
                tone="cyan"
              />
            ) : filteredRows.length === 0 ? (
              <p className={styles.listEmpty}>
                Aramayı güncelleyin veya Yeni Kayıt ile enerji bedeni ekleyin.
              </p>
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const isExportSelected = selectedForExport.has(row.id);
                const { Icon, tone } = energyBodyVisual(row.source_uid);
                // Kısa önizleme gerçek kayıttan (Genel Tanım ilk satırı); demo modda içerik korunur → gösterilmez.
                const snippet = isDemo ? "" : (row.genel_tanim ?? "").trim().split(/\r?\n/)[0];
                return (
                  <div key={row.id} className={styles.row}>
                    {/* Demo modda checkbox gizli */}
                    {!isDemo && (
                      <label className={styles.rowCheck} onClick={(e) => e.stopPropagation()}>
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
                    <button
                      type="button"
                      onClick={() => selectRow(row)}
                      aria-current={active ? "true" : undefined}
                      className={`${styles.rowBtn} ${isDemo ? "" : styles.rowBtnWithCheck} ${
                        active ? styles.rowActive : isExportSelected ? styles.rowExportSelected : ""
                      }`}
                    >
                      <span className={`${styles.rowIcon} ${tone}`} aria-hidden>
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className={styles.rowText}>
                        <span className={`block ${styles.rowName}`}>{row.source_uid?.trim() || "—"}</span>
                        {snippet ? <span className={`block ${styles.rowSnippet}`}>{snippet}</span> : null}
                        <AdminTransferBadge originType={row.origin_type} className="mt-1" />
                      </span>
                    </button>
                    <ChevronRight className={styles.rowChevron} strokeWidth={2} aria-hidden />
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
                onClick={() => void loadRecords({ reset: false, append: true, offset: rows.length })}
                className={styles.moreBtn}
              >
                {loadingMore ? "Yükleniyor…" : `Daha Fazla Göster (${rows.length} / ${searchResultCount})`}
              </button>
            </div>
          ) : null}
        </div>

        <div ref={detailPanelRef} className={`${styles.card} ${styles.detailPanel}`} aria-live="polite">
          {/* FINAL-A2: genel aramadan gelindiyse (?hq=) seçili kayıtta terim sarı + ilk eşleşmeye kaydırma. */}
          <BiyoenerjiSearchHighlight recordKey="enerji-bedenleri" termParam={BIO_SEARCH_TERM_PARAM} className="flex min-w-0 flex-1 flex-col">
          {selectedRow ? (
            <>
              <div className={styles.detailHead}>
                <div className={styles.detailIdentity}>
                  <span className={`${styles.detailIcon} ${selectedVisual.tone}`} aria-hidden>
                    <selectedVisual.Icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <div className={styles.selectedPill}>SEÇİLİ KAYIT</div>
                    <h3 className={styles.detailTitle}>{selectedRow.source_uid?.trim() || "—"}</h3>
                  </div>
                </div>
                <DogaltasFontSizeControl
                  fontSizePx={fontSizePx}
                  onDecrease={decreaseFontSize}
                  onReset={resetFontSize}
                  onIncrease={increaseFontSize}
                  canDecrease={canDecreaseFontSize}
                  canIncrease={canIncreaseFontSize}
                  isDefault={isDefaultFontSize}
                  defaultFontSizePx={ENERGY_BODIES_FONT_DEFAULT}
                  compact
                />
              </div>

              {/* Demo modda içerik alanları DemoGate ile korunur */}
              <DemoGate
                isProtected={isDemo}
                message="Bu enerji bedeni içeriği demo hesabında sınırlı gösterilir. Tam sürümde tüm açıklamalar, görev ve taş bilgileri açık olarak kullanılabilir."
                className="mt-4"
              >
                <div className={styles.fields}>
                  <DetailFieldCard
                    title="Genel Tanım"
                    text={selectedRow.genel_tanim}
                    typography={detailTypography}
                    dot={styles.dotEmerald}
                  />
                  <DetailFieldCard title="Görevi" text={selectedRow.gorevi} typography={detailTypography} dot={styles.dotViolet} />
                  <DetailFieldCard
                    title="Bozulma Belirtileri"
                    text={selectedRow.bozulma}
                    typography={detailTypography}
                    dot={styles.dotRose}
                  />
                  <DetailFieldCard
                    title="Taşlar"
                    text={selectedRow.onerilen_taslar}
                    typography={detailTypography}
                    dot={styles.dotAmber}
                  />
                  <DetailFieldCard title="Not" text={selectedRow.not_text} typography={detailTypography} dot={styles.dotTeal} />
                </div>
              </DemoGate>

              {/* Demo modda aksiyon butonları gizli */}
              {!isDemo && (
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={openEditModal}
                    className={`${styles.actionBtn} ${styles.actionPrimary}`}
                  >
                    Güncelle
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={openDeleteConfirm}
                    className={`${styles.actionBtn} ${styles.actionDanger}`}
                  >
                    Sil
                  </button>
                  <button
                    type="button"
                    disabled={wordBusy}
                    onClick={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "single", selectedRow.id, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
                    className={`${styles.actionBtn} ${styles.actionWord}`}
                  >
                    {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.empty}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.emptyArt}
                src="/premium/biyoenerji/enerji-bedenleri-bos.webp"
                width={780}
                height={444}
                alt=""
                aria-hidden
                decoding="async"
                draggable={false}
              />
              <p className={styles.emptyTitle}>Soldan bir kayıt seçin</p>
              <p className={styles.emptySub}>
                {isDemo
                  ? "Detayları görmek için soldaki listeden bir enerji bedeni kaydı seçin ve içeriği inceleyin."
                  : "Detayları görmek veya düzenlemek için soldaki listeden bir enerji bedeni kaydı seçin ya da yeni enerji bedeni ekleyin."}
              </p>
              {/* Kısayol: gerçek listedeki ilk kayıtlar (yalnız seçim yapar; yeni veri yok). */}
              {!loading && baseRows.length > 0 ? (
                <div className={styles.quickChips}>
                  {baseRows.slice(0, 4).map((row) => {
                    const { Icon, tone } = energyBodyVisual(row.source_uid);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => selectRow(row)}
                        className={styles.quickChip}
                      >
                        <span className={`${styles.rowIcon} ${styles.quickChipIcon} ${tone}`} aria-hidden>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className={styles.quickChipLabel}>{row.source_uid?.trim() || "—"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          </BiyoenerjiSearchHighlight>
        </div>
      </div>

      {/* Form modal — demo modda erişilmez (butonlar gizli) */}
      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        isDirty={formIsDirty}
        title={formModalMode === "create" ? "Yeni enerji bedeni" : "Enerji bedenini düzenle"}
        subtitle="Kaydettikten sonra panel kapanır ve liste yenilenir."
        titleId="energy-body-form-modal-title"
        accentRingClass="ring-cyan-100/50"
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
                className="rounded-xl border border-cyan-200/70 bg-cyan-50/90 px-4 py-2.5 text-[12px] font-black text-cyan-950 shadow-sm transition hover:bg-cyan-100/90 disabled:opacity-55"
              >
                {saving ? "Güncelleniyor…" : "Güncelle"}
              </button>
            )}
          </>
        )}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
              Enerji Bedeni / Katman
            </span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              placeholder="ör. eterik, duygusal, zihinsel, ruhsal"
              className="h-12 w-full rounded-xl border border-cyan-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-cyan-200/90 focus:ring-2 focus:ring-cyan-100/60"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                Genel Tanım
              </span>
            }
            modalTitle="Genel Tanım"
            value={form.genel_tanim}
            onChange={(v) => setForm((f) => ({ ...f, genel_tanim: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-emerald-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90" />
                Görevi
              </span>
            }
            modalTitle="Görevi"
            value={form.gorevi}
            onChange={(v) => setForm((f) => ({ ...f, gorevi: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-violet-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500/80" />
                Bozulma Belirtileri
              </span>
            }
            modalTitle="Bozulma Belirtileri"
            value={form.bozulma}
            onChange={(v) => setForm((f) => ({ ...f, bozulma: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-rose-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-rose-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
                Önerilen Taşlar
              </span>
            }
            modalTitle="Önerilen Taşlar"
            value={form.onerilen_taslar}
            onChange={(v) => setForm((f) => ({ ...f, onerilen_taslar: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-amber-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500/80" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.not_text}
            onChange={(v) => setForm((f) => ({ ...f, not_text: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-teal-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-teal-100/50 transition"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiConfirmModal
        open={deleteConfirmOpen}
        title="Bu enerji bedeni kaydını silmek istediğinizden emin misiniz?"
        busy={saving}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void executeDelete()}
      />

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        scope={{ filterActive: Boolean(debouncedSearch.trim()), visibleCount: searchResultCount }}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedVisibleRows.length}
        names={danger.mode === "all" ? undefined : selectedVisibleRows.map((r) => (r.source_uid?.trim() || "İsimsiz kayıt"))}
        resourceLabel="Enerji Bedenleri"
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
