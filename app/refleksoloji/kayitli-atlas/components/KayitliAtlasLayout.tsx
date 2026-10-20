"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import premium from "@/app/_premium/refleksoloji/kayitliAtlas.module.css";
import { useMemo, useState } from "react";
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
    deleteOrphanOrgan,
    deleteRegion,
    renameOrgan,
  } = useSavedAtlas();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [viewOrgan, setViewOrgan] = useState<string | null>(null);
  const [editOrgan, setEditOrgan] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return summaries;
    return summaries.filter((s) => s.name.toLocaleLowerCase("tr").includes(q));
  }, [summaries, search]);

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
          <section className={premium.grid}>
            {filtered.map((summary) => (
              <OrganAtlasCard
                key={summary.name}
                summary={summary}
                updatedAt={organUpdatedAt[organKey(summary.name)] ?? null}
                onView={() => setViewOrgan(summary.name)}
                onEdit={() => setEditOrgan(summary.name)}
                onDelete={() => void handleDeleteOrgan(summary.name)}
              />
            ))}
          </section>
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
