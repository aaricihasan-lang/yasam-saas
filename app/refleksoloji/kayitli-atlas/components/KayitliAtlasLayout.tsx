"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useSavedAtlas } from "../hooks/useSavedAtlas";
import { AtlasEditModal } from "./AtlasEditModal";
import { AtlasViewModal } from "./AtlasViewModal";
import { OrganAtlasCard } from "./OrganAtlasCard";

export function KayitliAtlasLayout() {
  const { confirm } = useConfirm();
  const { summaries, updatedAt, hydrated, deleteOrgan, deleteRegion, renameOrgan } =
    useSavedAtlas();
  const [search, setSearch] = useState("");
  const [viewOrgan, setViewOrgan] = useState<string | null>(null);
  const [editOrgan, setEditOrgan] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return summaries;
    return summaries.filter((s) => s.name.toLocaleLowerCase("tr").includes(q));
  }, [summaries, search]);

  const handleDeleteOrgan = async (organ: string) => {
    const ok = await confirm({
      message:
        "Bu organ ve kayıtlı tüm atlas bölgeleri silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    deleteOrgan(organ);
    if (editOrgan === organ) setEditOrgan(null);
    if (viewOrgan === organ) setViewOrgan(null);
  };

  if (!hydrated) {
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

      <div className="relative z-10 flex min-h-screen w-full max-w-none flex-col px-4 py-4 md:px-6 xl:px-8">
        <div className="flex shrink-0 flex-wrap items-center gap-4 pb-6">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-violet-300/95 bg-white/90 px-4 py-2.5 text-base font-extrabold text-violet-950 shadow-md ring-1 ring-violet-200/80 backdrop-blur-sm transition hover:border-violet-400 hover:bg-white"
          >
            <span aria-hidden>←</span>
            Ana Menü
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/90">
              Refleksoloji · Kayıtlı Atlas
            </p>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Kayıtlı Atlas
            </h1>
            <p className="mt-1 max-w-3xl text-lg font-medium text-slate-600">
              Bölge Haritası&apos;ndan kaydedilen organ koordinatları burada yönetilir.
            </p>
          </header>
          <Link
            href="/refleksoloji/bolge-haritasi"
            className="shrink-0 rounded-xl border border-violet-300/80 bg-violet-100 px-5 py-3 text-base font-bold text-violet-950 transition hover:bg-violet-200/90"
          >
            Bölge Haritasına Git
          </Link>
        </div>

        {summaries.length > 0 ? (
          <div className="mb-5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Organ adına göre ara…"
              className="w-full max-w-xl rounded-xl border border-violet-200/90 bg-white/90 px-4 py-3 text-base font-medium text-slate-800 outline-none ring-violet-300/30 focus:border-violet-400 focus:ring-2 md:max-w-md"
            />
          </div>
        ) : null}

        {summaries.length === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-[32px] border border-dashed border-violet-200/70 bg-white/80 px-8 py-20 text-center shadow-sm ring-1 ring-violet-100/60">
            <p className="max-w-lg text-xl font-bold text-violet-900">
              Henüz kayıtlı organ yok.
            </p>
            <p className="mt-3 text-base font-medium text-slate-600">
              Bölge Haritası&apos;ndan organ ekleyip Kaydet ile atlas oluşturun.
            </p>
            <Link
              href="/refleksoloji/bolge-haritasi"
              className="mt-6 rounded-xl border border-violet-300/80 bg-violet-100 px-6 py-3 text-base font-bold text-violet-950 transition hover:bg-violet-200/90"
            >
              Bölge Haritasına Git
            </Link>
          </section>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-violet-100 bg-white/80 px-6 py-8 text-center text-base font-medium text-slate-600">
            Aramanızla eşleşen organ bulunamadı.
          </p>
        ) : (
          <section className="grid grid-cols-1 gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((summary) => (
              <OrganAtlasCard
                key={summary.name}
                summary={summary}
                updatedAt={updatedAt}
                onView={() => setViewOrgan(summary.name)}
                onEdit={() => setEditOrgan(summary.name)}
                onDelete={() => void handleDeleteOrgan(summary.name)}
              />
            ))}
          </section>
        )}
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
