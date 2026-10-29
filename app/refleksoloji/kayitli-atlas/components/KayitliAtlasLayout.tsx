"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import premium from "@/app/_premium/refleksoloji/kayitliAtlas.module.css";
import { useMemo, useRef, useState } from "react";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { useSavedAtlas } from "../hooks/useSavedAtlas";
import { getOrganProtocolUsage } from "../lib/organProtocolReconcile";
import { AtlasEditModal } from "./AtlasEditModal";
import { AtlasViewModal } from "./AtlasViewModal";
import { OrganAtlasCard } from "./OrganAtlasCard";
import { RefleksolojiListLoading } from "@/app/refleksoloji/components/RefleksolojiSkeleton";
import { LegacyQuarantineBanner } from "@/app/refleksoloji/components/LegacyQuarantineBanner";
import { SyncStatusBadge } from "@/app/refleksoloji/components/SyncStatusBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import { flushAtlasNow } from "@/lib/refleksolojiAtlasSync";
import { reflexUserHeaders } from "@/lib/refleksoloji/reflexStore";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";

/** W06: onay penceresinde ad listesi en fazla bu kadar gösterilir (gerisi "+N kayıt daha"). */
const BULK_NAME_PREVIEW = 12;

function previewNames(names: string[]): string {
  const head = names.slice(0, BULK_NAME_PREVIEW).map((n) => `• ${n}`).join("\n");
  return names.length > BULK_NAME_PREVIEW ? `${head}\n+${names.length - BULK_NAME_PREVIEW} kayıt daha` : head;
}

export function KayitliAtlasLayout() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { confirm } = useConfirm();
  const {
    summaries,
    orphanOrgans,
    organUpdatedAt,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
    hydrated,
    deleteOrgan,
    deleteOrgans,
    deleteOrphanOrgan,
    deleteRegion,
    renameOrgan,
  } = useSavedAtlas();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [viewOrgan, setViewOrgan] = useState<string | null>(null);
  const [editOrgan, setEditOrgan] = useState<string | null>(null);
  // W06: toplu silme seçimi (organ adı = atlas belgesindeki birebir anahtar).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkBusyRef = useRef(false);
  // W07: Kayıtlı Atlas Word dışa aktarma.
  const [wordBusy, setWordBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return summaries;
    return summaries.filter((s) => s.name.toLocaleLowerCase("tr").includes(q));
  }, [summaries, search]);

  // Yalnız listede HÂLÂ var olan seçimler sayılır/silinir (başka sekmede silinen düşer).
  const selectedNames = useMemo(
    () => summaries.filter((s) => selected.has(s.name)).map((s) => s.name),
    [summaries, selected],
  );
  const hiddenSelectedCount = useMemo(() => {
    const visible = new Set(filtered.map((s) => s.name));
    return selectedNames.filter((n) => !visible.has(n)).length;
  }, [filtered, selectedNames]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.name));
  const someVisibleSelected = filtered.some((s) => selected.has(s.name));

  const toggleSelect = (organ: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(organ)) next.delete(organ);
      else next.add(organ);
      return next;
    });
  };

  const toggleSelectVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((s) => next.delete(s.name));
      else filtered.forEach((s) => next.add(s.name));
      return next;
    });
  };

  /**
   * W06 toplu silme. 1–2 kayıt: tek açık onay; 3+ kayıt veya Tümünü Sil: sistem geneli
   * 3 aşamalı onay (lib/ui/bulkDeleteGuard). Yalnız bu kullanıcının yerel atlas belgesindeki
   * seçili organlar silinir (tek yazım → tek senkron; tenant sunucuda oturumdan belirlenir).
   */
  /**
   * W07 Kayıtlı Atlas Word. Önce bekleyen yerel değişiklikler sunucuya gönderilir (rapor sunucudaki
   * atlas belgesinden üretilir; tenant sunucuda oturumdan belirlenir). Gönderim başarısızsa rapor yine
   * sunucudaki son kayıtla üretilir ve kullanıcı açıkça uyarılır.
   */
  const exportAtlasWord = async (mode: "selected" | "all") => {
    if (wordBusy || isDemo) return;
    const organs = mode === "selected" ? selectedNames : [];
    if (mode === "selected" && organs.length === 0) return;
    setWordBusy(true);
    try {
      const flush = await flushAtlasNow().catch(() => ({ status: "error" as const }));
      const syncFailed = flush.status === "conflict" || flush.status === "error" || flush.status === "offline";
      const headers = reflexUserHeaders();
      if (!headers) {
        showToast({ type: "error", title: "Oturum", message: "Oturum doğrulanamadı. Lütfen yeniden giriş yapın." });
        return;
      }
      const res = await fetch("/api/refleksoloji/atlas-report", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(mode === "selected" ? { exportMode: mode, organs } : { exportMode: mode }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast({ type: "error", title: "Hata", message: err.error || "Atlas raporu oluşturulamadı." });
        return;
      }
      await downloadFileResponse(res, `refleksoloji-atlas-${mode === "selected" ? "secili" : "tumu"}-${reportFileDate()}.docx`);
      showToast(
        syncFailed
          ? { type: "warning", title: "Atlas raporu indirildi", message: "Son değişiklikler sunucuya gönderilemedi; rapor sunucudaki son kayıtla oluşturuldu." }
          : { type: "success", title: "Başarılı", message: "Atlas raporu indirildi." },
      );
    } catch (err) {
      showToast({ type: "error", title: "Hata", message: err instanceof Error ? err.message : "Atlas raporu oluşturulamadı." });
    } finally {
      setWordBusy(false);
    }
  };

  const runBulkDelete = async (names: string[], deleteAll: boolean) => {
    if (bulkBusyRef.current || names.length === 0) return;
    bulkBusyRef.current = true;
    setBulkBusy(true);
    try {
      const count = names.length;
      const usages = await Promise.all(
        names.map((n) =>
          getOrganProtocolUsage(n)
            .then((u) => ({ name: n, count: u.count }))
            .catch(() => ({ name: n, count: 0 })),
        ),
      );
      const used = usages.filter((u) => u.count > 0);
      const usageNote =
        used.length > 0
          ? `\n\n⚠️ ${used.length} organ protokollerde kullanılıyor: ${used
              .slice(0, 5)
              .map((u) => `${u.name} (${u.count})`)
              .join(", ")}${used.length > 5 ? "…" : ""}. Silerseniz bu protokollerin haritasında bu organlar eşleşmeyecek (protokol metni korunur).`
          : "";
      const scopeNote = deleteAll
        ? "\n\nKapsam: bu hesaptaki tüm Kayıtlı Atlas organları (arama filtresinden bağımsız). \"Atlası Olmayan Organlar\" listesi bu işleme dahil değildir."
        : "";
      const detail = `Silinecek kayıtlar:\n${previewNames(names)}${scopeNote}${usageNote}`;
      const ok = requiresBulkDeleteGuard(count, deleteAll)
        ? await runBulkDeleteConfirm(confirm, { count, deleteAll, detail, noun: "atlas kaydı" })
        : await confirm({
            title: "Seçilenleri Sil",
            message: `${count} atlas kaydı ve kayıtlı tüm bölgeleri kalıcı olarak silinecek. Bu işlem geri alınamaz.\n\n${detail}`,
            confirmText: `Sil (${count})`,
            cancelText: "Vazgeç",
            tone: "danger",
          });
      if (!ok) return;

      const r = deleteOrgans(names);
      // Silinen + bulunamayan seçimden düşer; yazılamayanlar SEÇİLİ kalır (yeniden denenebilir).
      const settled = new Set([...r.deleted, ...r.missing]);
      setSelected((prev) => new Set([...prev].filter((n) => !settled.has(n))));
      if (editOrgan && settled.has(editOrgan)) setEditOrgan(null);
      if (viewOrgan && settled.has(viewOrgan)) setViewOrgan(null);

      if (r.failed.length > 0) {
        showToast({
          type: "error",
          title: "Depolama Hatası",
          message: `${r.failed.length} kayıt silinemedi (cihaz depolama alanı dolu). Hiçbir kayıt değişmedi; seçim korundu.`,
        });
      } else if (r.missing.length > 0) {
        showToast({
          type: "warning",
          title: "Kısmi silme",
          message: `${r.deleted.length} kayıt silindi. ${r.missing.length} kayıt bulunamadı (başka sekmede/cihazda silinmiş olabilir): ${r.missing
            .slice(0, 5)
            .join(", ")}${r.missing.length > 5 ? "…" : ""}`,
        });
      } else {
        showToast({ type: "success", message: `${r.deleted.length} atlas kaydı silindi.` });
      }
      if (r.deleted.length > 0 && !r.organListSaved) {
        showToast({
          type: "warning",
          title: "Organ listesi güncellenemedi",
          message: "Silinen organlar \"Atlası Olmayan Organlar\" bölümünde görünebilir; oradan kaldırabilirsiniz.",
        });
      }
    } finally {
      bulkBusyRef.current = false;
      setBulkBusy(false);
    }
  };

  const handleDeleteOrgan = async (organ: string) => {
    // BUG-3: bu organı kullanan protokolleri sessizce orphan bırakma — kullanıcıya söyle.
    const usage = await getOrganProtocolUsage(organ).catch(() => ({ count: 0, titles: [] }));
    const usageNote =
      usage.count > 0
        ? `\n\n⚠️ Bu organ ${usage.count} protokolde kullanılıyor${
            usage.titles.length ? `: ${usage.titles.slice(0, 5).join(", ")}${usage.titles.length > 5 ? "…" : ""}` : ""
          }. Silerseniz bu protokollerin haritasında bu organ eşleşmeyecek (protokol metni korunur).`
        : "";
    const ok = await confirm({
      message:
        "Bu organ ve kayıtlı tüm atlas bölgeleri silinsin mi? Bu işlem geri alınamaz." +
        usageNote,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    if (!deleteOrgan(organ)) {
      showToast({ type: "error", title: "Depolama Hatası", message: "Organ silinemedi (cihaz depolama alanı dolu)." });
      return;
    }
    if (editOrgan === organ) setEditOrgan(null);
    if (viewOrgan === organ) setViewOrgan(null);
    setSelected((prev) => {
      if (!prev.has(organ)) return prev;
      const next = new Set(prev);
      next.delete(organ);
      return next;
    });
  };

  const handleDeleteOrphan = async (organ: string) => {
    const usage = await getOrganProtocolUsage(organ).catch(() => ({ count: 0, titles: [] }));
    const usageNote =
      usage.count > 0
        ? `\n\n⚠️ Bu organ ${usage.count} protokolde kullanılıyor${
            usage.titles.length ? `: ${usage.titles.slice(0, 5).join(", ")}${usage.titles.length > 5 ? "…" : ""}` : ""
          }. Silerseniz bu protokollerin haritasında bu organ eşleşmeyecek (protokol metni korunur).`
        : "";
    const ok = await confirm({
      message:
        `"${organ}" atlas kaydı olmayan (bölgesiz) bir organ. Organ listesinden kalıcı olarak silinsin mi?` +
        usageNote,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    if (!deleteOrphanOrgan(organ)) {
      showToast({ type: "error", title: "Depolama Hatası", message: "Organ silinemedi (cihaz depolama alanı dolu)." });
    }
  };

  if (!hydrated) {
    // REF-021
    return <RefleksolojiListLoading badge="REFLEKSOLOJİ · KAYITLI ATLAS" title="Kayıtlı Atlas" />;
  }

  return (
    <main className={`relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[#f7f5fd] text-slate-900 antialiased ${energyFontVars}`}>
      <div className="relative z-10 flex min-h-screen w-full max-w-none flex-col">
        {isDemo && (
          <DemoModuleBanner message="Atlas bölgeleri sadece cihazınızda saklanır. Oturumunuz boyunca görünür; çıkışta silinir. Gerçek uzman atlas verileri bu hesapta görünmez." />
        )}
        {/* 2026-10-20 premium başlık (owner GÖRSEL PASS). Owner kararı: üstteki "Ana Menü" ve "Bölge Haritasına Git"
            düğmeleri gösterilmez (route'lar ve uygulama gezinmesi aynen; boş durumda Bölge Haritası bağlantısı korunur). */}
        <header className={premium.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={premium.heroArt} src="/premium/refleksoloji/spa-hero-atlas.webp" width={1888} height={368} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={premium.heroBody}>
            <p className={premium.eyebrow}>REFLEKSOLOJİ</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={premium.title}>Kayıtlı Atlas</h1>
              {!isDemo ? <SyncStatusBadge /> : null}
            </div>
            <p className={premium.sub}>Bölge Haritası&apos;ndan kaydedilen organ koordinatları burada yönetilir.</p>
            {summaries.length > 0 ? (
              <label className={premium.search}>
                <Search className={premium.sIcon} strokeWidth={2} aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Organ adına göre ara…"
                />
              </label>
            ) : null}
          </div>
        </header>

        <div className="flex flex-1 flex-col px-3 pb-6 md:px-6 xl:px-9">
        {!isDemo && quarantineCount > 0 ? (
          <LegacyQuarantineBanner
            className="mb-4"
            count={quarantineCount}
            noun="organ kaydı"
            onImport={() => {
              const r = importQuarantine();
              showToast(
                r.ok
                  ? { type: "success", message: `${r.changedOrgans} organ atlasınıza aktarıldı.` }
                  : { type: "error", title: "Depolama Hatası", message: STORAGE_QUOTA_ERROR_MESSAGE },
              );
            }}
            onDiscard={() => {
              discardQuarantine();
              showToast({ type: "success", message: "Sahibi belirsiz atlas verisi bu cihazdan kaldırıldı." });
            }}
          />
        ) : null}

        {summaries.length === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200/70 bg-white/80 px-6 py-12 text-center shadow-sm ring-1 ring-violet-100/60">
            <p className="max-w-lg text-base font-bold text-violet-900">
              Henüz kayıtlı organ yok.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Bölge Haritası&apos;ndan organ ekleyip Kaydet ile atlas oluşturun.
            </p>
            <Link
              href="/refleksoloji/bolge-haritasi"
              className="mt-4 rounded-lg border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-950 transition hover:bg-violet-200/90"
            >
              Bölge Haritasına Git
            </Link>
          </section>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-violet-100 bg-white/80 px-4 py-5 text-center text-sm font-medium text-slate-600">
            Aramanızla eşleşen organ bulunamadı.
          </p>
        ) : (
          <>
          <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-100 bg-white/85 px-3 py-2 shadow-sm"
            role="toolbar"
            aria-label="Toplu işlemler"
          >
            <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 pr-1 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer accent-violet-600"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                }}
                onChange={toggleSelectVisible}
                disabled={bulkBusy}
                aria-label="Görünen kayıtların tümünü seç"
              />
              Görünenleri seç
            </label>
            <span className="text-sm font-medium text-slate-600" aria-live="polite">
              {selectedNames.length} seçili
              {hiddenSelectedCount > 0 ? ` (${hiddenSelectedCount} tanesi aramada gizli)` : ""}
            </span>
            {selectedNames.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={bulkBusy}
                className="min-h-[42px] rounded-lg px-2 text-sm font-semibold text-violet-800 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Seçimi temizle
              </button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {!isDemo ? (
                <>
                  <button
                    type="button"
                    onClick={() => void exportAtlasWord("selected")}
                    disabled={wordBusy || bulkBusy || selectedNames.length === 0}
                    className="min-h-[42px] rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Seçilenleri Word{selectedNames.length > 0 ? ` (${selectedNames.length})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportAtlasWord("all")}
                    disabled={wordBusy || bulkBusy || summaries.length === 0}
                    className="min-h-[42px] rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {wordBusy ? "Hazırlanıyor…" : `Tümünü Word (${summaries.length})`}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void runBulkDelete(selectedNames, false)}
                disabled={bulkBusy || selectedNames.length === 0}
                className="min-h-[42px] rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Seçilenleri Sil{selectedNames.length > 0 ? ` (${selectedNames.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => void runBulkDelete(summaries.map((s) => s.name), true)}
                disabled={bulkBusy || summaries.length === 0}
                className="min-h-[42px] rounded-lg border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tümünü Sil ({summaries.length})
              </button>
            </div>
          </div>
          <section className={premium.grid}>
            {filtered.map((summary) => (
              <OrganAtlasCard
                key={summary.name}
                summary={summary}
                updatedAt={organUpdatedAt[organKey(summary.name)] ?? null}
                onView={() => setViewOrgan(summary.name)}
                onEdit={() => setEditOrgan(summary.name)}
                onDelete={() => void handleDeleteOrgan(summary.name)}
                selected={selected.has(summary.name)}
                onToggleSelect={() => toggleSelect(summary.name)}
              />
            ))}
          </section>
          </>
        )}

        {orphanOrgans.length > 0 ? (
          <section className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 shadow-sm ring-1 ring-amber-100/70">
            <h2 className="text-sm font-black text-amber-950">Atlası Olmayan Organlar</h2>
            <p className="mt-0.5 text-xs font-medium text-amber-900/90">
              Organ listesinde görünen ama kayıtlı atlas bölgesi olmayan organlar. Eski/test kaydıysa
              silebilirsiniz; bilinçli oluşturduysanız bırakabilirsiniz. Silme kalıcıdır ve başka
              cihazdan geri gelmez.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {orphanOrgans.map((organ) => (
                <li
                  key={organ}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300/80 bg-white/90 px-2.5 py-1.5 text-xs font-bold text-amber-950 shadow-sm"
                >
                  <span className="truncate">{organ}</span>
                  <button
                    type="button"
                    onClick={() => void handleDeleteOrphan(organ)}
                    className="rounded-md border border-red-300/80 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-800 transition hover:bg-red-100"
                    aria-label={`${organ} organını sil`}
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        </div>
      </div>

      <AtlasViewModal
        open={viewOrgan != null}
        organName={viewOrgan ?? ""}
        onClose={() => setViewOrgan(null)}
      />

      <AtlasEditModal
        open={editOrgan != null}
        organName={editOrgan ?? ""}
        onClose={() => setEditOrgan(null)}
        onRename={renameOrgan}
        onDeleteRegion={deleteRegion}
      />
    </main>
  );
}
