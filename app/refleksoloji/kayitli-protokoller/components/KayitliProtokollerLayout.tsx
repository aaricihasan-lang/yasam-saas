"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { getSyncedYasamUser } from "@/lib/auth/sessionTenant";
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

export function KayitliProtokollerLayout() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { protocols, loading, loadErrorMessage, deleteProtocol, isDemo } = useProtocolList();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filtered.map((p) => p.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `refleksoloji-protokol-${mode === "selected" ? "secili" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
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

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      message: "Bu protokol silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    deleteProtocol(id);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full px-3 py-3 lg:px-6 xl:px-10">
        {isDemo && (
          <DemoModuleBanner message="Kayıtlı protokoller demo hesabı için temsili verilerle gösterilmektedir. Kendi oluşturduğunuz protokoller oturumunuz boyunca görünür; çıkışta silinir. Gerçek uzman verileri gizlidir." />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <header className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">
              Refleksoloji &middot; Kayıtlı Protokoller
            </p>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Kayıtlı Protokoller
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              {protocols.length} kayıt listeleniyor.
            </p>
          </header>

          <Link
            href="/refleksoloji/protokol-haritasi"
            className="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600"
          >
            + Yeni Protokol Oluştur
          </Link>
        </div>

        {loadErrorMessage ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
            role="alert"
          >
            {loadErrorMessage}
          </p>
        ) : null}

        {protocols.length > 0 ? (
          <div className="mt-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Başlık, hedef, organ veya nota göre ara..."
              className="h-9 w-full rounded-lg border border-violet-200/80 bg-white/90 px-3 text-sm font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2"
            />
          </div>
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
              <div className="mt-3 mb-3">
                <BulkExportBar
                  selectedCount={selectedIds.size}
                  totalCount={protocols.length}
                  onSelectAll={selectAllFiltered}
                  onClearSelection={clearSelection}
                  onExportSelected={() => void exportProtocolsWord("selected")}
                  onExportAll={() => void exportProtocolsWord("all")}
                  isExporting={wordBusy}
                />
              </div>
            )}
            <section className="mt-3 grid grid-cols-1 gap-3 pb-6 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((protocol) => (
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
          </>
        ) : null}
      </div>
    </main>
  );
}
