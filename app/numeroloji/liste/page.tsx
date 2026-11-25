"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/numeroloji/numerolojiListe.module.css";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { pruneSelection, visibleSelection } from "@/lib/ui/selection";
import { listNumerologyAnalyses, resolveNumerolojiTenantId, resolveNumerolojiUserAndTenant } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { RowErrorBoundary } from "../components/RowErrorBoundary";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { WordPersonSectionPicker } from "../components/WordPersonSectionPicker";
import { WORD_TAB_LABELS, WORD_TAB_ORDER, type WordPersonSections } from "../bilgi-bankasi/helpers/wordPersonSections";
import { numApi, numApiError, authHeaders } from "../helpers/numApiClient";
import { buildNumerolojiDeleteConfirm, buildNumerolojiDeleteConfirmEn } from "../utils/deleteConfirmMessage";
import { MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { isDemoNumerologiOpenRecord } from "@/lib/demo/demoNumeroloji";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { localizeApiError, type ApiErrorPayload } from "@/lib/i18n/apiError";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// Demo kaydının adı (lib/demo/demoNumeroloji kaydı) — kullanıcı verisi; çevrilmez.
const DEMO_OPEN_RECORD_NAME = "Hasan YILMAZ";



export default function NumerolojiListePage() {
  const pathname = usePathname();
  const t = useTranslations("numerology.app.list");
  const tPicker = useTranslations("numerology.app.picker");
  const tApi = useTranslations("common.apiErrors");
  const tDel = useTranslations("numerology.analysis.deleteConfirm");
  const locale = useLocale();
  // Sunucu/yardımcı ayrıntısı: TR'de birebir; diğer dillerde kod eşlemesi ya da genel metin (karışık dil yok).
  const detailOf = (payload: ApiErrorPayload): string => localizeApiError(tApi, locale, payload);
  // X-Empty-Tabs başlığı sunucunun Türkçe sekme adlarını taşır → ekran dilinde sekme adına eşlenir.
  const emptyTabLabel = (label: string): string => {
    if (locale === DEFAULT_LOCALE) return label;
    const key = WORD_TAB_ORDER.find((k) => WORD_TAB_LABELS[k] === label);
    return key ? tPicker(`tabs.${key}`) : label;
  };
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const { isDemo } = useDemoGuard();
  const [rows, setRows] = useState<NumerolojiListeSatir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Toplu seçim
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [wordPicker, setWordPicker] = useState<{ mode: "selected" | "all" | "filtered" } | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      setError(t("tenantMissing"));
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await listNumerologyAnalyses(tenantId);
    if (e) {
      setError(t("loadFailed", { detail: locale === DEFAULT_LOCALE ? e : localizeApiError(tApi, locale, { error: e }) }));
      setRows([]);
    } else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, [t, tApi, locale]);

  useEffect(() => {
    runInEffect(() => {
      void loadRows();
    });
  }, [loadRows, pathname]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => {
      const adSoyad = `${r.name} ${r.surname}`.toLocaleLowerCase("tr-TR");
      return adSoyad.includes(q);
    });
  }, [rows, search]);

  // Demo modda Hasan YILMAZ her zaman en üstte
  const displayRows = useMemo(() => {
    if (!isDemo) return filteredRows;
    const open = filteredRows.filter((r) => isDemoNumerologiOpenRecord(r));
    const rest = filteredRows.filter((r) => !isDemoNumerologiOpenRecord(r));
    return [...open, ...rest];
  }, [filteredRows, isDemo]);

  const hasActiveFilter = Boolean(search.trim());

  // Arama değişince seçim görünür kayıtlarla kesişime budanır
  // (değişiklik yoksa aynı Set döner → render döngüsü yok).
  useEffect(() => {
    const visibleIds = filteredRows.map((r) => r.id);
    runInEffect(() => setSelectedIds((prev) => pruneSelection(prev, visibleIds)));
  }, [filteredRows]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredRows.map((r) => r.id)));
  }, [filteredRows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function handleBulkDelete() {
    if (isDemo) {
      showToast({ title: t("demoTitle"), message: t("demoNoDelete"), type: "error" });
      return;
    }
    if (deleteLoading) return; // çift-tık koruması (modal + buton disable üstüne ek kalkan)
    // Yalnız görünür ∩ seçili: aramayla gizlenmiş seçili kayıt habersiz silinmez.
    const ids = visibleSelection(selectedIds, filteredRows.map((r) => r.id));
    if (ids.length === 0) return;

    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      // TR: paylaşımlı sabit birebir (lib/auth/sessionTenant); diğer dillerde aynı anlamın çevirisi.
      showToast({ title: t("errorTitle"), message: locale === DEFAULT_LOCALE ? MISSING_SESSION_TENANT_MESSAGE : t("tenantMissing"), type: "error" });
      return;
    }

    // Silme onayında yalnız adet değil, silinecek kayıt adları da gösterilir.
    const nameById = new Map(rows.map((r) => [r.id, `${r.name} ${r.surname}`]));
    const names = ids.map((id) => nameById.get(id) ?? "").filter((n) => n.trim().length > 0);
    const { title, message, secondMessage } =
      locale === DEFAULT_LOCALE ? buildNumerolojiDeleteConfirm(ids.length, names) : buildNumerolojiDeleteConfirmEn(tDel, ids.length, names);

    const confirmed = await deleteConfirm({ title, message, secondMessage, count: ids.length, noun: "analiz" });
    if (!confirmed) return;

    setDeleteLoading(true);

    // tenant_id SUNUCUDA session'dan alınır; çapraz-tenant silme engellidir.
    let res: Awaited<ReturnType<typeof numApi>>;
    try {
      res = await numApi("/api/numeroloji/analyses", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
    } catch (e) {
      showToast({ title: t("errorTitle"), message: t("deleteFailed", { detail: e instanceof Error ? e.message : t("unknownError") }), type: "error" });
      return;
    } finally {
      setDeleteLoading(false);
    }

    const err = numApiError(res);
    if (err) {
      showToast({ title: t("errorTitle"), message: t("deleteFailed", { detail: locale === DEFAULT_LOCALE ? err : detailOf(res.json as ApiErrorPayload) }), type: "error" });
      return;
    }

    const deletedIds = Array.isArray(res.json.ids) ? (res.json.ids as string[]) : ids;
    const deletedCount = typeof res.json.deleted === "number" ? res.json.deleted : deletedIds.length;
    if (deletedCount === 0) {
      showToast({ title: t("errorTitle"), message: t("deleteNothing"), type: "error" });
      return;
    }

    const deletedIdSet = new Set(deletedIds);
    setRows((prev) => prev.filter((r) => !deletedIdSet.has(r.id)));
    // Silinemeyenler seçili kalır; yalnız silinenler seçimden düşer.
    setSelectedIds((prev) => {
      const next = new Set(prev);
      deletedIdSet.forEach((id) => next.delete(id));
      return next;
    });
    showToast({ title: t("successTitle"), message: t("deleted", { countText: String(deletedCount) }), type: "success" });
  }

  async function exportWord(mode: "selected" | "all" | "filtered", sections: WordPersonSections, referenceDate?: string) {
    if (isDemo) {
      showToast({ title: t("demoTitle"), message: t("demoNoWord"), type: "error" });
      return;
    }
    const session = await resolveNumerolojiUserAndTenant();
    if (!session) {
      showToast({ title: t("errorTitle"), message: t("noSession"), type: "error" });
      return;
    }
    setWordBusy(true);
    try {
      let ids: string[] | undefined;
      if (mode === "selected") {
        ids = visibleSelection(selectedIds, filteredRows.map((r) => r.id));
        if (!ids.length) return;
      } else if (mode === "filtered") {
        ids = filteredRows.map((r) => r.id);
        if (!ids.length) return;
      }
      // NUM-001: kimlik/tenant body'ye KONMAZ; sunucu oturumdan çözer (authHeaders).
      const res = await fetch("/api/numeroloji/word-report", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ exportMode: mode === "all" ? "all" : "selected", ids, sections, referenceDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; code?: string };
        showToast({ title: t("errorTitle"), message: locale === DEFAULT_LOCALE ? err.error || t("reportFailed") : localizeApiError(tApi, locale, err, t("reportFailed")), type: "error" });
        return;
      }
      await downloadFileResponse(res, `numeroloji-${mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu"}-${reportFileDate()}.docx`);
      showToast({ title: t("successTitle"), message: t("reportDownloaded"), type: "success" });
      setWordPicker(null);
      const emptyRaw = res.headers.get("X-Empty-Tabs");
      const empty = emptyRaw ? decodeURIComponent(emptyRaw).split("|").filter(Boolean) : [];
      if (empty.length > 0) {
        showToast({ title: t("infoTitle"), message: t("emptyTabs", { list: empty.map(emptyTabLabel).join(", ") }), type: "info" });
      }
    } catch (err) {
      showToast({ title: t("errorTitle"), message: err instanceof Error ? err.message : t("unknownError"), type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <BfcacheRefreshHandler />
      <div className={styles.inner}>
        {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS — ilk referans). Yalnız sunum. */}
        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroArt} src="/premium/numeroloji/liste-hero.webp" width={1324} height={356} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={styles.heroBody}>
            <nav className={styles.heroNav} aria-label={t("pageNavAria")}>
              <Link href="/numeroloji/analiz" className={`${styles.nBtn} ${styles.nPrimary}`}>
                <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                {t("newAnalysis")}
              </Link>
            </nav>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.sub}>{t("sub")}</p>
          </div>
        </header>

        {/* Demo bilgilendirme banner */}
        {isDemo && (
          <div className={styles.demoBanner}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
              <div>
                <p className="text-sm font-black text-blue-900">{t("demoBannerTitle")}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                  {t.rich("demoBannerText", { name: DEMO_OPEN_RECORD_NAME, b: (chunks) => <span className="font-black">{chunks}</span> })}
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && rows.length > 0 ? (
          <>
            <label className={styles.search}>
              <Search className={styles.sIcon} width={20} height={20} strokeWidth={2} aria-hidden />
              <input
                id="noj-liste-ara"
                aria-label={t("searchAria")}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                autoComplete="off"
              />
            </label>

            {/* Demo modda toplu işlem çubuğu gizlenir */}
            {!isDemo && (
              <div className={styles.bulk} style={{ marginTop: 10 }}>
                <BulkExportBar
                  compact
                  selectedCount={selectedIds.size}
                  totalCount={rows.length}
                  filteredCount={filteredRows.length}
                  hasActiveFilter={hasActiveFilter}
                  onSelectAll={selectAllFiltered}
                  onClearSelection={clearSelection}
                  onExportSelected={() => setWordPicker({ mode: "selected" })}
                  onExportAll={() => setWordPicker({ mode: "all" })}
                  onExportFiltered={hasActiveFilter ? () => setWordPicker({ mode: "filtered" }) : undefined}
                  isExporting={wordBusy}
                  onDeleteSelected={() => void handleBulkDelete()}
                  isDeleting={deleteLoading}
                />
              </div>
            )}
          </>
        ) : null}

        {loading ? (
          <div className={styles.notice}>
            {t("loading")}
          </div>
        ) : null}

        {!loading && error ? (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className={styles.notice}>
            {t("empty")}
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && displayRows.length === 0 ? (
          <div className={styles.notice}>
            {t("noMatch")}
          </div>
        ) : null}

        {!loading && !error && displayRows.length > 0 ? (
          <ul className={styles.list}>
            {displayRows.map((r) => (
              <RowErrorBoundary key={r.id}>
                <NumerolojiListeKarti
                  row={r}
                  isSelected={selectedIds.has(r.id)}
                  onToggleSelect={isDemo ? undefined : () => toggleSelection(r.id)}
                />
              </RowErrorBoundary>
            ))}
          </ul>
        ) : null}
      </div>

      <WordPersonSectionPicker
        open={wordPicker !== null}
        busy={wordBusy}
        onCancel={() => setWordPicker(null)}
        onConfirm={(sections, referenceDate) => {
          if (wordPicker) void exportWord(wordPicker.mode, sections, referenceDate);
        }}
      />
    </main>
  );
}
