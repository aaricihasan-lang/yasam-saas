"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtocolFootMap } from "@/app/refleksoloji/protokol-haritasi/components/ProtocolFootMap";
import {
  buildOrganStatuses,
  missingAtlasOrgans,
  resolveColoredRegionsForOrgans,
} from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import type { ProtocolFootView } from "@/app/refleksoloji/protokol-haritasi/types";
import { supabase } from "@/lib/supabase";
import { formatProtocolDate, parseOrgansList } from "../lib/protocolActions";
import type { ReflexologyProtocolRecord } from "../types";

type KayitliProtokolDetayLayoutProps = {
  protocolId: string;
};

const panelClass =
  "rounded-[28px] border border-purple-100 bg-white/80 p-6 shadow-sm ring-1 ring-violet-100/60 backdrop-blur-md xl:p-8";

function fieldValue(value: string | null | undefined, emptyLabel = "—") {
  const text = value?.trim();
  return text || emptyLabel;
}

export function KayitliProtokolDetayLayout({ protocolId }: KayitliProtokolDetayLayoutProps) {
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<ReflexologyProtocolRecord | null>(null);
  const [footView, setFootView] = useState<ProtocolFootView>("taban");

  useEffect(() => {
    let cancelled = false;

    async function loadProtocol() {
      setLoading(true);
      setLoadErrorMessage(null);

      const { data, error } = await supabase
        .from("reflexology_protocols")
        .select("*")
        .eq("id", protocolId)
        .maybeSingle();

      if (cancelled) return;

      setLoading(false);

      if (error) {
        setLoadErrorMessage(`Protokoller okunamadı: ${error.message}`);
        setProtocol(null);
        return;
      }

      setProtocol((data as ReflexologyProtocolRecord | null) ?? null);
    }

    void loadProtocol();

    return () => {
      cancelled = true;
    };
  }, [protocolId]);

  const organs = useMemo(() => parseOrgansList(protocol?.organs), [protocol?.organs]);

  const { regions } = useMemo(
    () => resolveColoredRegionsForOrgans(organs, footView),
    [organs, footView],
  );

  const organStatuses = useMemo(() => buildOrganStatuses(organs, footView), [organs, footView]);
  const missingOrgans = useMemo(() => missingAtlasOrgans(organStatuses), [organStatuses]);

  const rawJsonText = useMemo(() => {
    if (!protocol?.raw_json) return "";
    try {
      return JSON.stringify(protocol.raw_json, null, 2);
    } catch {
      return String(protocol.raw_json);
    }
  }, [protocol?.raw_json]);

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  if (loadErrorMessage) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] px-6">
        <p
          className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-center text-base font-semibold text-rose-900"
          role="alert"
        >
          {loadErrorMessage}
        </p>
        <Link
          href="/refleksoloji/kayitli-protokoller"
          className="rounded-xl border border-violet-300/80 bg-violet-100 px-5 py-2.5 text-base font-bold text-violet-950"
        >
          Listeye dön
        </Link>
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

  const title = fieldValue(protocol.title, "Başlıksız protokol");

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
          <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Kayıt: {formatProtocolDate(protocol.created_at)}
            {protocol.source_uid?.trim() ? ` · UID: ${protocol.source_uid}` : ""}
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(480px,1fr)]">
          <div className="space-y-6">
            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Hedef / Sorun</h2>
              <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {fieldValue(protocol.target_problem, "Hedef bilgisi eklenmemiş.")}
              </p>
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Organlar</h2>
              <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {fieldValue(protocol.organs, "Organ bilgisi eklenmemiş.")}
              </p>
              {organs.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {organStatuses.map((status) => (
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
              ) : null}
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Uygulama Notları</h2>
              <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
                {fieldValue(protocol.application_notes, "Uygulama notu eklenmemiş.")}
              </p>
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-bold text-violet-900">Ham JSON (raw_json)</h2>
              {rawJsonText ? (
                <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-violet-100 bg-violet-50/40 p-4 text-xs font-mono leading-relaxed text-slate-800">
                  {rawJsonText}
                </pre>
              ) : (
                <p className="mt-3 text-base font-medium text-slate-500">Ham JSON kaydı yok.</p>
              )}
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
