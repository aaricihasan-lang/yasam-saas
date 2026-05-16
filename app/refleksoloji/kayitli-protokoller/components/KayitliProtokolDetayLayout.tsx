"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtocolFootMap } from "@/app/refleksoloji/protokol-haritasi/components/ProtocolFootMap";
import {
  missingAtlasOrgans,
  resolveColoredRegionsForOrgans,
} from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import type { ProtocolFootView } from "@/app/refleksoloji/protokol-haritasi/types";
import { formatProtocolDate, getProtocolById } from "../lib/protocolActions";

type KayitliProtokolDetayLayoutProps = {
  protocolId: string;
};

const panelClass =
  "rounded-[28px] border border-purple-100 bg-white/80 p-6 shadow-sm ring-1 ring-violet-100/60 backdrop-blur-md xl:p-8";

export function KayitliProtokolDetayLayout({ protocolId }: KayitliProtokolDetayLayoutProps) {
  const [hydrated, setHydrated] = useState(false);
  const [protocol, setProtocol] = useState(() => getProtocolById(protocolId));
  const [footView, setFootView] = useState<ProtocolFootView>("taban");

  useEffect(() => {
    setProtocol(getProtocolById(protocolId));
    setHydrated(true);
  }, [protocolId]);

  const organs = protocol?.organs ?? [];

  const { regions, statuses } = useMemo(
    () => resolveColoredRegionsForOrgans(organs, footView),
    [organs, footView],
  );

  const organStatuses = useMemo(() => buildOrganStatuses(organs, footView), [organs, footView]);
  const missingOrgans = useMemo(() => missingAtlasOrgans(organStatuses), [organStatuses]);

  if (!hydrated) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  if (!protocol) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] px-6">
        <p className="text-xl font-bold text-violet-900">Protokol bulunamadı.</p>
        <Link
          href="/refleksoloji/kayitli-protokoller"
          className="rounded-xl border border-violet-300/80 bg-violet-100 px-5 py-2.5 text-base font-bold text-violet-950"
        >
          Listeye dön
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-6 py-6 xl:px-10">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/refleksoloji/kayitli-protokoller"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-violet-300/95 bg-white/90 px-4 py-2.5 text-base font-extrabold text-violet-950 shadow-md ring-1 ring-violet-200/80 backdrop-blur-sm transition hover:border-violet-400 hover:bg-white"
          >
            <span aria-hidden>←</span>
            Kayıtlı Protokoller
          </Link>
          <Link
            href={`/refleksoloji/protokol-haritasi?id=${encodeURIComponent(protocol.id)}`}
            className="rounded-xl border border-fuchsia-300/80 bg-fuchsia-50 px-4 py-2.5 text-sm font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
          >
            Düzenle
          </Link>
        </div>

        <header className="mt-4">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/90">
            Protokol Detayı
          </p>
          <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">{protocol.title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Oluşturulma: {formatProtocolDate(protocol.createdAt)}
            {protocol.updatedAt !== protocol.createdAt
              ? ` · Güncelleme: ${formatProtocolDate(protocol.updatedAt)}`
              : ""}
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(480px,1fr)]">
          <div className="space-y-6">
            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Açıklama</h2>
              <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {protocol.description.trim() || "Açıklama eklenmemiş."}
              </p>
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Organlar</h2>
              {organs.length === 0 ? (
                <p className="mt-2 text-base font-medium text-slate-500">Organ tanımlanmamış.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {statuses.map((status) => (
                      <li
                        key={status.name}
                        className={`rounded-xl border p-4 ${status.color.chipClass}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-lg font-bold">{status.name}</span>
                          <span
                            className={`rounded-lg px-3 py-1 text-sm font-bold ${
                              status.found
                                ? "bg-white/80 text-emerald-800"
                                : "bg-white/80 text-amber-900"
                            }`}
                          >
                            {status.found
                              ? `Atlas bulundu (${status.regionCount})`
                              : "Atlas bulunamadı"}
                          </span>
                        </div>
                        {!status.found ? (
                          <p className="mt-2 text-sm font-medium opacity-90">
                            Bu organ için atlas bölgesi kayıtlı değil. Önce Bölge Haritası&apos;ndan
                            organ bölgesi ekleyin.
                          </p>
                        ) : null}
                      </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Uygulama Notları</h2>
              <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {protocol.notes.trim() || "Uygulama notu eklenmemiş."}
              </p>
            </section>
          </div>

          <section className={`${panelClass} flex min-h-[560px] flex-col xl:min-h-[720px]`}>
            <h2 className="mb-4 text-xl font-bold text-violet-900">Ayak Haritası Önizleme</h2>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 origin-center scale-[1.08]">
                <ProtocolFootMap
                  regions={regions}
                  footView={footView}
                  missingOrgans={missingOrgans}
                  onFootViewChange={setFootView}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
