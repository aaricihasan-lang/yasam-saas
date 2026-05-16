"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOrganNamesFromAtlas, loadAtlas } from "@/lib/atlasStorage";

export function KayitliAtlasLayout() {
  const [organs, setOrgans] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const doc = loadAtlas();
    setOrgans(listOrganNamesFromAtlas(doc));
    setUpdatedAt(doc._meta?.updated_at ?? null);
  }, []);

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col px-3 py-4 sm:px-4">
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200/90 bg-white/85 px-2.5 py-1.5 text-sm font-black text-violet-900 shadow-sm ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white"
          >
            <span aria-hidden>←</span>
            Ana Menü
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-violet-700/90">
              Refleksoloji · Kayıtlı Atlas
            </p>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Kayıtlı Atlas</h1>
          </header>
        </div>

        <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_20px_52px_-22px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/70 backdrop-blur-md">
          {updatedAt ? (
            <p className="shrink-0 text-xs font-medium text-slate-500">
              Son güncelleme: {new Date(updatedAt).toLocaleString("tr-TR")}
            </p>
          ) : null}

          <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
            {organs.length === 0 ? (
              <li className="rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-4 py-8 text-center text-base font-medium text-slate-600">
                Henüz kayıtlı organ yok. Bölge Haritası&apos;ndan organ ekleyip Kaydet ile atlas oluşturun.
              </li>
            ) : (
              organs.map((organ) => (
                <li key={organ}>
                  <Link
                    href={`/refleksoloji/bolge-haritasi?organ=${encodeURIComponent(organ)}`}
                    className="flex w-full items-center justify-between rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50/95 via-fuchsia-50/80 to-white/90 px-4 py-3.5 text-left font-bold text-violet-950 shadow-sm transition hover:border-violet-300 hover:from-violet-100/95 hover:shadow-md"
                  >
                    <span>{organ}</span>
                    <span className="text-sm font-semibold text-violet-700">Haritada aç →</span>
                  </Link>
                </li>
              ))
            )}
          </ul>

          <Link
            href="/refleksoloji/bolge-haritasi"
            className="mt-3 shrink-0 rounded-xl border border-violet-300/80 bg-violet-100/90 px-4 py-2.5 text-center text-sm font-bold text-violet-950 transition hover:bg-violet-200/90"
          >
            Bölge Haritasına Git
          </Link>
        </section>
      </div>
    </main>
  );
}
