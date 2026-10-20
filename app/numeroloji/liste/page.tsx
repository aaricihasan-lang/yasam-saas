"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/numeroloji/numerolojiListe.module.css";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { pruneSelection, visibleSelection } from "@/lib/ui/selection";
import { listNumerologyAnalyses, resolveNumerolojiTenantId, resolveNumerolojiUserAndTenant } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { RowErrorBoundary } from "../components/RowErrorBoundary";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { WordPersonSectionPicker } from "../components/WordPersonSectionPicker";
import type { WordPersonSections } from "../bilgi-bankasi/helpers/wordPersonSections";
import { numApi, numApiError, authHeaders } from "../helpers/numApiClient";
import { buildNumerolojiDeleteConfirm } from "../utils/deleteConfirmMessage";
import { MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { isDemoNumerologiOpenRecord } from "@/lib/demo/demoNumeroloji";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";



export default function NumerolojiListePage() {
  const pathname = usePathname();
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
      setError("Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.");
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await listNumerologyAnalyses(tenantId);
    if (e) {
      setError(`Kayıtlar yüklenemedi: ${e}`);
      setRows([]);
    } else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

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
      showToast({ title: "Demo Modu", message: "Demo hesapta silme işlemi gerçekleştirilemez.", type: "error" });
      return;
    }
    if (deleteLoading) return; // çift-tık koruması (modal + buton disable üstüne ek kalkan)
    // Yalnız görünür ∩ seçili: aramayla gizlenmiş seçili kayıt habersiz silinmez.
    const ids = visibleSelection(selectedIds, filteredRows.map((r) => r.id));
    if (ids.length === 0) return;

    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      showToast({ title: "Hata", message: MISSING_SESSION_TENANT_MESSAGE, type: "error" });
      return;
    }

    // Silme onayında yalnız adet değil, silinecek kayıt adları da gösterilir.
    const nameById = new Map(rows.map((r) => [r.id, `${r.name} ${r.surname}`]));
    const names = ids.map((id) => nameById.get(id) ?? "").filter((n) => n.trim().length > 0);
    const { title, message, secondMessage } = buildNumerolojiDeleteConfirm(ids.length, names);

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
      showToast({ title: "Hata", message: `Seçili kayıtlar silinemedi: ${e instanceof Error ? e.message : "Bilinmeyen hata"}`, type: "error" });
      return;
    } finally {
      setDeleteLoading(false);
    }

    const err = numApiError(res);
    if (err) {
      showToast({ title: "Hata", message: `Seçili kayıtlar silinemedi: ${err}`, type: "error" });
      return;
    }

    const deletedIds = Array.isArray(res.json.ids) ? (res.json.ids as string[]) : ids;
    const deletedCount = typeof res.json.deleted === "number" ? res.json.deleted : deletedIds.length;
    if (deletedCount === 0) {
      showToast({ title: "Hata", message: "Silme işlemi gerçekleşmedi. Lütfen tekrar deneyin.", type: "error" });
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
    showToast({ title: "Başarılı", message: `${deletedCount} analiz başarıyla silindi.`, type: "success" });
  }

  async function exportWord(mode: "selected" | "all" | "filtered", sections: WordPersonSections, referenceDate?: string) {
    if (isDemo) {
      showToast({ title: "Demo Modu", message: "Demo hesapta toplu Word raporu alınamaz.", type: "error" });
      return;
    }
    const session = await resolveNumerolojiUserAndTenant();
    if (!session) {
      showToast({ title: "Hata", message: "Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.", type: "error" });
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
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      await downloadFileResponse(res, `numeroloji-${mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu"}-${reportFileDate()}.docx`);
      showToast({ title: "Başarılı", message: "Numeroloji raporu indirildi.", type: "success" });
      setWordPicker(null);
      const emptyRaw = res.headers.get("X-Empty-Tabs");
      const empty = emptyRaw ? decodeURIComponent(emptyRaw).split("|").filter(Boolean) : [];
      if (empty.length > 0) {
        showToast({ title: "Bilgi", message: `Bazı bölümlerde içerik yoktu ve eklenmedi: ${empty.join(", ")}`, type: "info" });
      }
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
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
            <nav className={styles.heroNav} aria-label="Sayfa gezinmesi">
              <Link href="/numeroloji" className={`${styles.nBtn} ${styles.nGhost}`}>
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                Modül seçimi
              </Link>
              <Link href="/numeroloji/analiz" className={`${styles.nBtn} ${styles.nPrimary}`}>
                <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                Yeni analiz
              </Link>
            </nav>
            <h1 className={styles.title}>Kayıtlı analizler</h1>
            <p className={styles.sub}>Tüm numeroloji kayıtlarınızı görüntüleyin ve yönetin.</p>
          </div>
        </header>

        {/* Demo bilgilendirme banner */}
        {isDemo && (
          <div className={styles.demoBanner}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
              <div>
                <p className="text-sm font-black text-blue-900">Demo Modu — Örnek Analiz Listesi</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                  <span className="font-black">Hasan YILMAZ</span> örnek analizi tamamen açıktır ve tüm içeriğe erişilebilir.
                  Diğer kayıtlar sistemi göstermek için eklenmiştir; analiz içerikleri demo güvenliği nedeniyle flu gösterilir.
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
                aria-label="Ad veya soyad ara"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad veya soyad ara…"
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
            Yükleniyor…
          </div>
        ) : null}

        {!loading && error ? (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className={styles.notice}>
            Henüz kayıtlı analiz yok.
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && displayRows.length === 0 ? (
          <div className={styles.notice}>
            Aramanızla eşleşen kayıt bulunamadı.
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
