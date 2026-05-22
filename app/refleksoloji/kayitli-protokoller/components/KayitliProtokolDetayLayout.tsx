"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ProtocolFootMap } from "@/app/refleksoloji/protokol-haritasi/components/ProtocolFootMap";
import {
  buildOrganStatuses,
  missingAtlasOrgans,
  resolveColoredRegionsForOrgans,
} from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import type { ProtocolFootView } from "@/app/refleksoloji/protokol-haritasi/types";
import { supabase } from "@/lib/supabase";
import { formatProtocolDate, parseOrgansList } from "../lib/protocolActions";
import {
  buildProtocolClinicalContent,
  formatRawJsonForDev,
  protocolHeroTitle,
} from "../lib/protocolDetailContent";
import type { ReflexologyProtocolRecord } from "../types";
import { ClinicalProtocolStepsCard } from "./ClinicalProtocolStepsCard";

type KayitliProtokolDetayLayoutProps = {
  protocolId: string;
};

const navBtnBase =
  "inline-flex w-full items-center justify-center gap-3 rounded-2xl border-2 px-6 py-4 text-[16px] font-black leading-tight shadow-[0_12px_32px_-10px_rgba(91,33,182,0.4)] ring-2 ring-white/75 transition duration-200 hover:scale-[1.03] active:scale-[0.98] sm:w-auto sm:justify-start sm:px-7 sm:py-4 sm:text-[17px]";

/** Kayıtlı Protokollere Dön — mor/cyan pastel gradient */
const navBtnBackToList =
  `${navBtnBase} border-violet-300/90 bg-gradient-to-r from-violet-200 via-fuchsia-100 to-cyan-100 text-violet-950 hover:border-violet-400 hover:shadow-[0_16px_40px_-10px_rgba(139,92,246,0.5)] hover:from-violet-300/90 hover:via-fuchsia-200 hover:to-cyan-200`;

/** Refleksoloji ana menü — fuchsia/amber pastel */
const navBtnBackToMenu =
  `${navBtnBase} border-fuchsia-300/80 bg-gradient-to-r from-fuchsia-100 via-rose-50 to-amber-100 text-fuchsia-950 hover:border-fuchsia-400 hover:shadow-[0_16px_40px_-10px_rgba(217,70,239,0.4)] hover:from-fuchsia-200 hover:via-rose-100 hover:to-amber-200`;

const navBtnIconWrap =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/85 text-lg shadow-sm";

const clinicalCardClass =
  "rounded-[28px] border-2 border-white/90 bg-white/85 p-6 shadow-[0_16px_44px_-18px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/70 backdrop-blur-md sm:p-8";

const footMapPanelLargeClass =
  "flex w-full flex-col overflow-hidden rounded-[28px] border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white/95 to-fuchsia-50/80 shadow-[0_20px_50px_-16px_rgba(139,92,246,0.28)] ring-1 ring-violet-200/60 xl:sticky xl:top-6 xl:max-h-[calc(100vh-1.5rem)] xl:min-h-[min(78vh,900px)] xl:self-start";

const footMapPanelCompactClass =
  "w-full rounded-[22px] border-2 border-dashed border-violet-200/75 bg-gradient-to-br from-violet-50/85 via-white/95 to-fuchsia-50/50 px-5 py-4 shadow-sm ring-1 ring-violet-100/60 sm:px-6 sm:py-5 xl:max-w-md xl:justify-self-end";

type CardTone = "violet" | "fuchsia" | "cyan" | "amber" | "emerald";

const CARD_TITLE: Record<CardTone, string> = {
  violet: "text-violet-950",
  fuchsia: "text-fuchsia-950",
  cyan: "text-cyan-950",
  amber: "text-amber-950",
  emerald: "text-emerald-950",
};

function ClinicalCard({
  title,
  tone = "violet",
  children,
  hidden,
}: {
  title: string;
  tone?: CardTone;
  children: ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <section className={clinicalCardClass}>
      <h2 className={`text-xl font-black sm:text-2xl ${CARD_TITLE[tone]}`}>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-violet-200/90 bg-violet-50/50 px-4 py-3 text-[15px] font-semibold leading-relaxed text-violet-800/85">
      {children}
    </p>
  );
}

function ApplicationNotesBody({ text }: { text: string }) {
  const paragraphs = text.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length >= 2) {
    return (
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}-${paragraph.slice(0, 20)}`}
            className="text-[17px] font-semibold leading-[1.8] text-slate-800 sm:text-[18px]"
          >
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-[17px] font-semibold leading-[1.8] text-slate-800 sm:text-[18px]">
      {text}
    </p>
  );
}

function OrganPills({
  organs,
  organStatuses,
}: {
  organs: string[];
  organStatuses: ReturnType<typeof buildOrganStatuses>;
}) {
  if (organs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2.5">
      {organStatuses.map((status) => (
        <span
          key={status.name}
          className={`inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-[15px] font-black shadow-sm ring-2 ring-white/70 ${status.color.chipClass}`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80"
            style={{ backgroundColor: status.color.stroke }}
            aria-hidden
          />
          <span className="truncate">{status.name}</span>
        </span>
      ))}
    </div>
  );
}

function FootMapAtlasCompactCard({
  hasOrgans,
}: {
  hasOrgans: boolean;
}) {
  return (
    <section className={footMapPanelCompactClass} aria-label="Ayak haritası bilgisi">
      <h2 className="text-base font-black text-violet-950 sm:text-lg">Ayak Haritası</h2>
      <p className="mt-2 text-[15px] font-semibold leading-[1.75] text-violet-900 sm:text-[16px]">
        Bu protokol için atlas eşleşmesi bulunamadı.
      </p>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-violet-800/85">
        {hasOrgans
          ? "Organlar kayıtlı; bölge haritasında eşleşen bölge tanımlayın."
          : "Organ eklendiğinde harita otomatik gösterilir."}
      </p>
    </section>
  );
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

  const rawJson = protocol?.raw_json ?? null;

  const clinical = useMemo(
    () => (protocol ? buildProtocolClinicalContent(protocol) : null),
    [protocol],
  );

  const targetText = clinical?.targetProblem ?? null;
  const groupedProtocol = clinical?.groupedProtocol ?? {
    intro: null,
    groups: [],
    rawMetinLines: [],
    metinFallbackText: null,
    useFlatFallback: false,
  };
  const applicationNotesDisplay = clinical?.applicationNotes ?? null;
  const sourceDescription = clinical?.source ?? null;

  const heroTitle = useMemo(
    () => (protocol ? protocolHeroTitle(protocol, rawJson) : ""),
    [protocol, rawJson],
  );

  const rawJsonDevText = useMemo(
    () => formatRawJsonForDev(protocol?.raw_json ?? null),
    [protocol?.raw_json],
  );

  const showDevJson =
    process.env.NODE_ENV === "development" && Boolean(rawJsonDevText.trim());

  const hasAtlasMapping = organs.length > 0 && regions.length > 0;

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-lg font-semibold text-violet-900">Yükleniyor…</p>
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
        <Link href="/refleksoloji/kayitli-protokoller" className={navBtnBackToList}>
          <span className={navBtnIconWrap} aria-hidden>
            🗂️
          </span>
          <span>← Kayıtlı Protokollere Dön</span>
        </Link>
      </main>
    );
  }

  if (!protocol) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] px-6">
        <p className="text-xl font-bold text-violet-900">Protokol bulunamadı.</p>
        <Link href="/refleksoloji/kayitli-protokoller" className={navBtnBackToList}>
          <span className={navBtnIconWrap} aria-hidden>
            🗂️
          </span>
          <span>← Kayıtlı Protokollere Dön</span>
        </Link>
      </main>
    );
  }

  const notesParagraphs = applicationNotesDisplay
    ? applicationNotesDisplay.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : [];

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-[20%] h-64 w-64 rounded-full bg-cyan-200/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-6 py-6 sm:px-8 lg:px-10">
        <nav
          className="rounded-[24px] border-2 border-violet-200/70 bg-white/70 p-4 shadow-[0_12px_36px_-14px_rgba(139,92,246,0.25)] ring-1 ring-violet-100/80 backdrop-blur-md sm:p-5"
          aria-label="Sayfa gezintisi"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link href="/refleksoloji/kayitli-protokoller" className={navBtnBackToList}>
              <span className={navBtnIconWrap} aria-hidden>
                🗂️
              </span>
              <span>← Kayıtlı Protokollere Dön</span>
            </Link>
            <Link href="/refleksoloji" className={navBtnBackToMenu}>
              <span className={navBtnIconWrap} aria-hidden>
                ←
              </span>
              <span>Refleksoloji Ana Sayfasına Dön</span>
            </Link>
            <Link
              href={`/refleksoloji/protokol-haritasi?id=${encodeURIComponent(protocol.id)}`}
              className="inline-flex w-full items-center justify-center rounded-2xl border-2 border-emerald-300/80 bg-emerald-500 px-6 py-4 text-[16px] font-black text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.45)] transition duration-200 hover:scale-[1.02] hover:bg-emerald-600 sm:ml-auto sm:w-auto sm:text-[17px]"
            >
              Protokolü Düzenle
            </Link>
          </div>
        </nav>

        <header className="mt-6 rounded-[32px] border-2 border-violet-200/70 bg-gradient-to-br from-violet-100/90 via-white/95 to-fuchsia-50/90 p-6 shadow-[0_20px_50px_-18px_rgba(139,92,246,0.22)] sm:p-8 lg:p-10">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/90">
            Klinik Protokol Detayı
          </p>
          <h1 className="mt-3 text-[32px] font-black leading-[1.12] tracking-tight text-slate-950 sm:text-[42px] lg:text-[48px]">
            {heroTitle}
          </h1>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="inline-flex rounded-full border border-violet-200/90 bg-white/90 px-4 py-1.5 text-sm font-bold text-violet-900 shadow-sm">
              Kayıt: {formatProtocolDate(protocol.created_at)}
            </span>
            {protocol.source_uid?.trim() ? (
              <span className="inline-flex max-w-full truncate rounded-full border border-fuchsia-200/90 bg-fuchsia-50/90 px-4 py-1.5 text-sm font-bold text-fuchsia-950 shadow-sm">
                UID: {protocol.source_uid}
              </span>
            ) : null}
            {protocol.title?.trim() && protocol.title.trim() !== heroTitle ? (
              <span className="inline-flex rounded-full border border-cyan-200/90 bg-cyan-50/90 px-4 py-1.5 text-sm font-bold text-cyan-950 shadow-sm">
                Başlık: {protocol.title}
              </span>
            ) : null}
            {organs.length > 0 ? (
              <span className="inline-flex rounded-full border border-emerald-200/90 bg-emerald-50/90 px-4 py-1.5 text-sm font-bold text-emerald-950 shadow-sm">
                {organs.length} organ
              </span>
            ) : null}
          </div>
        </header>

        <div
          className={
            hasAtlasMapping
              ? "mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[58%_42%] xl:items-start xl:gap-8"
              : "mt-8 grid grid-cols-1 gap-6"
          }
        >
          <div className="min-w-0 space-y-6">
            <div className="rounded-[28px] border-2 border-violet-300/50 bg-violet-50/40 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-black text-violet-950 sm:text-xl">
                Klinik Protokol Bilgileri
              </h2>
              <p className="mt-1 text-[15px] font-medium text-violet-800/85">
                Hedef, organlar, uygulama adımları ve seans notları
              </p>
            </div>

            <ClinicalCard title="Hedef / Sorun" tone="fuchsia" hidden={!targetText}>
              <p className="text-[17px] font-semibold leading-[1.8] text-slate-800 sm:text-[18px]">
                {targetText}
              </p>
            </ClinicalCard>

            <ClinicalCard title="Organlar" tone="cyan" hidden={organs.length === 0}>
              <OrganPills organs={organs} organStatuses={organStatuses} />
            </ClinicalCard>

            <ClinicalProtocolStepsCard grouped={groupedProtocol} />

            <ClinicalCard title="Uygulama Notları" tone="amber" hidden={!applicationNotesDisplay}>
              {notesParagraphs.length >= 2 ? (
                <div className="space-y-4">
                  {notesParagraphs.map((paragraph, index) => (
                    <p
                      key={`note-${index}-${paragraph.slice(0, 16)}`}
                      className="rounded-2xl border border-amber-100/90 bg-amber-50/50 px-4 py-3 text-[17px] font-semibold leading-[1.8] text-slate-800 sm:text-[18px]"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <ApplicationNotesBody text={applicationNotesDisplay!} />
              )}
            </ClinicalCard>

            <ClinicalCard title="Kaynak / Açıklama" tone="emerald" hidden={!sourceDescription}>
              <p className="whitespace-pre-wrap text-[17px] font-semibold leading-[1.8] text-slate-800 sm:text-[18px]">
                {sourceDescription}
              </p>
            </ClinicalCard>

            {showDevJson ? (
              <details className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-3">
                <summary className="cursor-pointer text-sm font-black text-slate-600">
                  Geliştirici Verisi (raw_json)
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs font-mono leading-relaxed text-slate-700">
                  {rawJsonDevText}
                </pre>
              </details>
            ) : null}
          </div>

          {hasAtlasMapping ? (
            <section className={footMapPanelLargeClass} aria-label="Ayak haritası önizleme">
              <div className="shrink-0 border-b border-violet-200/70 px-5 py-4 sm:px-6">
                <h2 className="text-xl font-black text-violet-950 sm:text-2xl">
                  Ayak Haritası Önizleme
                </h2>
                <p className="mt-1 text-[15px] font-semibold text-violet-800/80">
                  Protokole bağlı organ bölgeleri atlas üzerinde vurgulanır
                </p>
              </div>

              <div className="relative min-h-[min(62vh,720px)] flex-1 p-3 sm:min-h-[min(68vh,800px)] sm:p-4">
                <div className="relative h-full min-h-[min(56vh,680px)] overflow-hidden rounded-2xl border border-violet-100/80 bg-white/90 shadow-inner sm:min-h-[min(64vh,760px)]">
                  <div className="absolute inset-0 origin-center scale-[1.06] sm:scale-[1.08]">
                    <ProtocolFootMap
                      regions={regions}
                      footView={footView}
                      missingOrgans={missingOrgans}
                      onFootViewChange={setFootView}
                      prominentControls
                      embedded
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <FootMapAtlasCompactCard hasOrgans={organs.length > 0} />
          )}
        </div>
      </div>
    </main>
  );
}
