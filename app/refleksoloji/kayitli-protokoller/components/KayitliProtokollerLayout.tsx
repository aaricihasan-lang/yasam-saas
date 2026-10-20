"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import premium from "@/app/_premium/refleksoloji/kayitliProtokoller.module.css";
import { useCallback, useMemo, useState } from "react";
import { getSyncedYasamUser } from "@/lib/auth/sessionTenant";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { isDemoFixtureProtocol } from "@/lib/demo/demoRefleksoloji";
import {
  normalizeSearchQuery,
  protocolMatchesSearch,
} from "../lib/protocolActions";
import { useProtocolList } from "../hooks/useProtocolList";
import { ProtocolListCard } from "./ProtocolListCard";
import { RefleksolojiListLoading } from "@/app/refleksoloji/components/RefleksolojiSkeleton";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { LegacyQuarantineBanner } from "@/app/refleksoloji/components/LegacyQuarantineBanner";

// P1-3: ilk yüklemede tüm listeyi basma — son N kaydı göster, "Daha fazla yükle" ile aç.
const PAGE_SIZE = 10;

export function KayitliProtokollerLayout() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const {
    protocols,
    loading,
    loadErrorMessage,
    deleteProtocol,
    isDemo,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
  } = useProtocolList();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // P1-3: "Tümünü Seç" yanıltıcı olmasın — yalnızca ekranda görünen kayıtları seçer.
  const selectVisible = useCallback(() => {
    setSelectedIds(new Set(visible.map((p) => p.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols, search, visibleCount]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function exportProtocolsWord(mode: "selected" | "all") {
    if (isDemo) return;
    const user = await getSyncedYasamUser();
    if (!user?.tenant_id || !user.id) return;
    setWordBusy(true);
    try {
      const body: Record<string, unknown> = { tenantId: user.tenant_id, userId: user.id, exportMode: mode };
      if (mode === "selected") {
        const ids = [...selectedIds];
        if (!ids.length) return;
        body.protocolIds = ids;
      }
      const res = await fetch("/api/refleksoloji/protocol-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-session-token": readSessionToken() ?? "",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      // Dosya adı sunucudan (Content-Disposition, İstanbul günü); yoksa yerel gün.
      await downloadFileResponse(
        res,
        `refleksoloji-protokol-${mode === "selected" ? "secili" : "tumu"}-${reportFileDate()}.docx`,
      );
      showToast({ title: "Başarılı", message: "Protokol raporu indirildi.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = normalizeSearchQuery(search);
    if (!q) return protocols;
    return protocols.filter((p) => protocolMatchesSearch(p, q));
  }, [protocols, search]);

  // P1-3: ekranda gösterilen dilim + kalan sayısı.
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const remaining = filtered.length - visible.length;

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      message: "Bu protokol silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    const deleted = await deleteProtocol(id);
    showToast(
      deleted
        ? { type: "success", message: "Protokol silindi.", duration: 2500 }
        : { type: "error", title: "Silinemedi", message: "Protokol silinemedi. Lütfen tekrar deneyin." },
    );
  };

  if (loading) {
    // REF-021: route skeleton'ıyla tutarlı iskelet.
    return (
      <RefleksolojiListLoading badge="REFLEKSOLOJİ · KAYITLI PROTOKOLLER" title="Kayıtlı Protokoller" />
    );
  }

  return (
    // 2026-10-20 premium görünüm (owner GÖRSEL PASS prototipi refleksoloji-kayitli-protokoller). Yalnız sunum.
    <main className={`relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden text-slate-900 antialiased ${premium.page}`}>
      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 xl:px-[60px]">
        {isDemo && (
          <DemoModuleBanner message="Kayıtlı protokoller demo hesabı için temsili verilerle gösterilmektedir. Kendi oluşturduğunuz protokoller oturumunuz boyunca görünür; çıkışta silinir. Gerçek uzman verileri gizlidir." />
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 px-1 sm:px-3">
          <header className="min-w-0">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.22em] text-violet-600">
              Refleksoloji &middot; Kayıtlı Protokoller
            </p>
            <h1 className="mt-2 text-[1.75rem] font-extrabold tracking-tight text-[#17132f] sm:text-[2.25rem]">
              Kayıtlı Protokoller
            </h1>
            <p className="mt-2 text-sm font-medium text-[#57536b]">
              {protocols.length} kayıt listeleniyor.
            </p>
          </header>

          <Link
            href="/refleksoloji/protokol-haritasi"
            className="inline-flex min-h-[46px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#16b46b] to-[#10a865] px-5 text-[16px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(16,168,101,0.7)] transition hover:brightness-105 sm:w-auto"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
            Yeni Protokol Oluştur
          </Link>
        </div>

        {!isDemo && quarantineCount > 0 ? (
          <LegacyQuarantineBanner
            className="mt-3"
            count={quarantineCount}
            noun="protokol"
            onImport={async () => {
              const r = await importQuarantine();
              showToast(
                r.failed === 0
                  ? { type: "success", message: `${r.imported} protokol hesabınıza aktarıldı.` }
                  : {
                      type: "warning",
                      title: "Kısmen aktarıldı",
                      message: `${r.imported} protokol aktarıldı; ${r.failed} protokol aktarılamadı ve bu cihazda bekliyor.`,
                    },
              );
            }}
            onDiscard={() => {
              discardQuarantine();
              showToast({ type: "success", message: "Sahibi belirsiz protokoller bu cihazdan kaldırıldı." });
            }}
          />
        ) : null}

        {loadErrorMessage ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
            role="alert"
          >
            {loadErrorMessage}
          </p>
        ) : null}

        {protocols.length > 0 ? (
          <label className="relative mt-5 block">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4b4766]" strokeWidth={2} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Başlık, hedef, organ veya nota göre ara..."
              className="h-11 w-full rounded-2xl border border-[#ebe7f6] bg-white/95 pl-[52px] pr-4 text-[15px] font-medium text-slate-800 shadow-[0_6px_18px_-12px_rgba(76,61,140,0.3)] outline-none placeholder:text-[#75728a] focus:border-violet-400 focus:ring-[3px] focus:ring-violet-300/25"
            />
          </label>
        ) : null}

        {!loadErrorMessage && protocols.length === 0 ? (
          <section className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200/70 bg-white/80 px-6 py-8 text-center shadow-sm">
            <p className="text-base font-bold text-violet-900">Henüz protokol yok</p>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-600">
              Toplu veri aktarımı veya Protokol Haritası ile yeni kayıt ekleyebilirsiniz.
            </p>
            <Link
              href="/refleksoloji/protokol-haritasi"
              className="mt-4 rounded-xl border border-emerald-300/80 bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600"
            >
              + Yeni Protokol Oluştur
            </Link>
          </section>
        ) : !loadErrorMessage && filtered.length === 0 ? (
          <p className="mt-5 rounded-xl border border-violet-100 bg-white/80 px-5 py-6 text-center text-sm font-medium text-slate-600">
            Aramanızla eşleşen protokol bulunamadı.
          </p>
        ) : !loadErrorMessage ? (
          <>
            {/* BulkExportBar sadece gerçek hesaplarda gösterilir */}
            {!isDemo && (
              <div className={`mt-3 mb-3 ${premium.bulk}`}>
                <BulkExportBar
                  selectedCount={selectedIds.size}
                  totalCount={protocols.length}
                  onSelectAll={selectVisible}
                  onClearSelection={clearSelection}
                  onExportSelected={() => void exportProtocolsWord("selected")}
                  onExportAll={() => void exportProtocolsWord("all")}
                  isExporting={wordBusy}
                  selectAllLabel="Görünenleri Seç"
                  selectAllCount={visible.length}
                />
              </div>
            )}
            <section className="mt-4 grid grid-cols-1 items-stretch gap-4 pb-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-[18px]">
              {visible.map((protocol) => (
                <ProtocolListCard
                  key={protocol.id}
                  protocol={protocol}
                  onDelete={() => void handleDelete(protocol.id)}
                  isSelected={selectedIds.has(protocol.id)}
                  onToggleSelect={() => toggleSelection(protocol.id)}
                  isDemo={isDemo}
                  isSeed={isDemo && isDemoFixtureProtocol(protocol.id)}
                />
              ))}
            </section>

            {remaining > 0 ? (
              <div className="mb-6 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="rounded-xl border border-violet-300/80 bg-white/90 px-5 py-2.5 text-sm font-bold text-violet-800 shadow-sm transition hover:bg-violet-50"
                >
                  Daha fazla yükle ({Math.min(PAGE_SIZE, remaining)})
                </button>
                <p className="text-xs font-medium text-slate-500">
                  {visible.length} / {filtered.length} kayıt gösteriliyor
                </p>
              </div>
            ) : filtered.length > PAGE_SIZE ? (
              <p className="mb-6 text-center text-xs font-medium text-slate-500">
                Tüm kayıtlar gösteriliyor ({filtered.length})
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
