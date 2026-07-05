"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { DemoGate } from "@/components/demo/DemoGate";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { ProtocolFootMap } from "@/app/refleksoloji/protokol-haritasi/components/ProtocolFootMap";
import {
  buildOrganStatuses,
  missingAtlasOrgans,
  resolveColoredRegionsForOrgans,
} from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import type { ProtocolFootView } from "@/app/refleksoloji/protokol-haritasi/types";
import {
  DEMO_FIXTURE_PROTO_PREFIX,
  DEMO_SEED_PROTOCOLS,
  DEMO_USER_LOCAL_PREFIX,
  isDemoFixtureProtocol,
  savedProtocolToRecord,
} from "@/lib/demo/demoRefleksoloji";
import { loadProtocolsFromStorage } from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";
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

function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

const navBtnBackToList =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-300/70 bg-violet-50 px-3 text-[12px] font-semibold text-violet-900 transition hover:bg-violet-100";

const navBtnBackToMenu =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-fuchsia-300/70 bg-fuchsia-50 px-3 text-[12px] font-semibold text-fuchsia-900 transition hover:bg-fuchsia-100";

const navBtnIconWrap = "text-sm leading-none";

const clinicalCardClass =
  "rounded-xl border border-slate-200/70 bg-white/85 p-4 shadow-sm";

const footMapPanelLargeClass =
  "flex w-full flex-col overflow-hidden rounded-[28px] border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white/95 to-fuchsia-50/80 shadow-[0_20px_50px_-16px_rgba(139,92,246,0.28)] ring-1 ring-violet-200/60 xl:sticky xl:top-6 xl:max-h-[calc(100vh-1.5rem)] xl:min-h-[min(78vh,900px)] xl:self-start";

const footMapPanelCompactClass =
  "w-full rounded-xl border border-dashed border-violet-200/60 bg-violet-50/30 px-3 py-3 xl:max-w-md xl:justify-self-end";

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
      <h2 className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${CARD_TITLE[tone]}`}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function ApplicationNotesBody({ text }: { text: string }) {
  const paragraphs = text.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length >= 2) {
    return (
      <div className="space-y-3">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}-${paragraph.slice(0, 20)}`}
            className="text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]"
          >
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]">
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
    <div className="flex flex-wrap gap-1.5">
      {organStatuses.map((status) => (
        <span
          key={status.name}
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-sm ${status.color.chipClass}`}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: status.color.stroke }}
            aria-hidden
          />
          <span className="truncate">{status.name}</span>
        </span>
      ))}
    </div>
  );
}

function FootMapAtlasCompactCard({ hasOrgans }: { hasOrgans: boolean }) {
  return (
    <section className={footMapPanelCompactClass} aria-label="Ayak haritasi bilgisi">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Ayak Haritasi</h2>
      <p className="mt-1.5 text-sm font-medium text-violet-900">
        Bu protokol icin atlas eslesme bulunamadi.
      </p>
      <p className="mt-1 text-xs font-medium text-violet-700/80">
        {hasOrgans
          ? "Organlar kayitli; bolge haritasinda eslesen bolge tanimlayin."
          : "Organ eklendiginde harita otomatik gosterilir."}
      </p>
    </section>
  );
}

export function KayitliProtokolDetayLayout({ protocolId }: KayitliProtokolDetayLayoutProps) {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const isSeed = isDemo && isDemoFixtureProtocol(protocolId);

  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<ReflexologyProtocolRecord | null>(null);
  const [footView, setFootView] = useState<ProtocolFootView>("taban");
  const [wordBusy, setWordBusy] = useState(false);

  const downloadWord = useCallback(async () => {
    if (!protocol || isDemo) return;
    const tid = await getSyncedTenantId();
    if (!tid) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/refleksoloji/protocol-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": readYasamUser()?.id ?? "",
          "x-session-token": readSessionToken() ?? "",
        },
        body: JSON.stringify({ tenantId: tid, exportMode: "single", protocolId: protocol.id }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (protocol.title || "protokol").toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `refleksoloji-protokol-${safe}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [protocol, isDemo]);

  useEffect(() => {
    let cancelled = false;

    async function loadProtocol() {
      setLoading(true);
      setLoadErrorMessage(null);

      if (isDemo) {
        // Demo fixture protokolü
        if (protocolId.startsWith(DEMO_FIXTURE_PROTO_PREFIX)) {
          const fixture = DEMO_SEED_PROTOCOLS.find((p) => p.id === protocolId) ?? null;
          if (!cancelled) { setProtocol(fixture); setLoading(false); }
          return;
        }
        // Demo kullanıcısının kendi localStorage protokolü
        if (protocolId.startsWith(DEMO_USER_LOCAL_PREFIX)) {
          const localId = protocolId.slice(DEMO_USER_LOCAL_PREFIX.length);
          const found = loadProtocolsFromStorage().find((p) => p.id === localId);
          if (!cancelled) { setProtocol(found ? savedProtocolToRecord(found) : null); setLoading(false); }
          return;
        }
        if (!cancelled) { setProtocol(null); setLoading(false); }
        return;
      }

      // GÜVENLİK (anon kilidi): tek protokol güvenli route'tan; id+tenant_id
      // eşleşmesi sunucuda zorlanır (IDOR engellenir).
      try {
        const res = await fetch(
          `/api/refleksoloji/protocols/${encodeURIComponent(protocolId)}`,
          { headers: userHeaders(), cache: "no-store" },
        );
        if (cancelled) return;
        setLoading(false);

        if (res.status === 404) {
          setProtocol(null);
          return;
        }

        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; protocol?: ReflexologyProtocolRecord | null; error?: string }
          | null;

        if (!res.ok || !json?.ok) {
          setLoadErrorMessage(`Protokoller okunamadı: ${json?.error ?? res.statusText}`);
          setProtocol(null);
          return;
        }

        setProtocol((json.protocol as ReflexologyProtocolRecord | null) ?? null);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setLoadErrorMessage(
          `Protokoller okunamadı: ${err instanceof Error ? err.message : "Bağlantı hatası"}`,
        );
        setProtocol(null);
      }
    }

    void loadProtocol();
    return () => { cancelled = true; };
  }, [isDemo, protocolId]);

  const organs = useMemo(() => parseOrgansList(protocol?.organs), [protocol?.organs]);
  const { regions } = useMemo(() => resolveColoredRegionsForOrgans(organs, footView), [organs, footView]);
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

  const showDevJson = process.env.NODE_ENV === "development" && Boolean(rawJsonDevText.trim()) && !isDemo;
  const hasAtlasMapping = organs.length > 0 && regions.length > 0;

  const notesParagraphs = applicationNotesDisplay
    ? applicationNotesDisplay.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : [];

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
        <p className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-center text-base font-semibold text-rose-900" role="alert">
          {loadErrorMessage}
        </p>
        <Link href="/refleksoloji/kayitli-protokoller" className={navBtnBackToList}>
          <span className={navBtnIconWrap} aria-hidden>🗂️</span>
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
          <span className={navBtnIconWrap} aria-hidden>🗂️</span>
          <span>← Kayıtlı Protokollere Dön</span>
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-[20%] h-64 w-64 rounded-full bg-cyan-200/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full px-4 py-3 sm:px-6 lg:px-8 xl:px-12">
        {isDemo && (
          <DemoModuleBanner
            className="mb-3"
            message={
              isSeed
                ? "Bu demo protokolüdür. Başlık ve harita görünümü açık; klinik detaylar demo hesabında gizlidir."
                : "Kendi oluşturduğunuz protokol. Oturumunuz boyunca görünür; çıkışta silinir."
            }
          />
        )}

        <nav className="rounded-xl border border-violet-200/50 bg-white/70 p-2.5 backdrop-blur-md" aria-label="Sayfa gezintisi">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/refleksoloji/kayitli-protokoller" className={navBtnBackToList}>
              <span className={navBtnIconWrap} aria-hidden>🗂️</span>
              <span>← Protokollere Dön</span>
            </Link>
            <Link href="/refleksoloji" className={navBtnBackToMenu}>
              <span>← Refleksoloji</span>
            </Link>
            {/* Word raporu sadece gerçek hesaplarda */}
            {protocol && !isDemo && (
              <button
                type="button"
                onClick={() => void downloadWord()}
                disabled={wordBusy}
                className="inline-flex h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
              >
                {wordBusy ? "Hazırlanıyor..." : "Word Raporu"}
              </button>
            )}
            {/* Düzenle: sadece kullanıcının kendi oluşturduğu protokollerde */}
            {!isSeed && (
              <Link
                href={`/refleksoloji/protokol-haritasi?id=${encodeURIComponent(protocol.source_uid ?? protocol.id)}`}
                className="ml-auto inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-emerald-500 px-3 text-[12px] font-semibold text-white transition hover:bg-emerald-600"
              >
                Protokolü Düzenle
              </Link>
            )}
          </div>
        </nav>

        <header className="mt-3 rounded-xl border border-violet-200/50 bg-white/70 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-500">
            Klinik Protokol Detayı
          </p>
          <h1 className="mt-1 text-xl font-bold leading-snug tracking-tight text-slate-950 sm:text-2xl">
            {heroTitle}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex rounded-full border border-violet-200/80 bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-violet-800">
              {formatProtocolDate(protocol.created_at)}
            </span>
            {/* source_uid demo'da gizli */}
            {protocol.source_uid?.trim() && !isDemo ? (
              <span className="inline-flex max-w-full truncate rounded-full border border-fuchsia-200/80 bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-900">
                UID: {protocol.source_uid}
              </span>
            ) : null}
            {protocol.title?.trim() && protocol.title.trim() !== heroTitle ? (
              <span className="inline-flex rounded-full border border-cyan-200/80 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-medium text-cyan-900">
                {protocol.title}
              </span>
            ) : null}
            {organs.length > 0 ? (
              <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900">
                {organs.length} organ
              </span>
            ) : null}
          </div>
        </header>

        <div
          className={
            hasAtlasMapping
              ? "mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[58%_42%] xl:items-start xl:gap-6"
              : "mt-4 grid grid-cols-1 gap-4"
          }
        >
          <div className="min-w-0 space-y-3">
            <div className="rounded-lg border border-violet-200/40 bg-violet-50/30 px-4 py-2.5">
              <h2 className="text-sm font-bold text-violet-950">Klinik Protokol Bilgileri</h2>
              <p className="mt-0.5 text-xs font-medium text-violet-800/85">
                Hedef, organlar, uygulama adımları ve seans notları
              </p>
            </div>

            {/*
              DemoGate: isSeed=true → blur+kilit overlay
              isSeed=false (kullanıcı protokolü veya gerçek hesap) → children doğrudan geçer
            */}
            <DemoGate
              isProtected={isSeed}
              message="Bu içerik demo hesabında gizlidir. Tam sürümde tüm klinik detaylar açık olarak kullanılabilir."
            >
              <>
                <ClinicalCard title="Hedef / Sorun" tone="fuchsia" hidden={!targetText}>
                  <p className="text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]">
                    {targetText}
                  </p>
                </ClinicalCard>

                <ClinicalCard title="Organlar" tone="cyan" hidden={organs.length === 0}>
                  <OrganPills organs={organs} organStatuses={organStatuses} />
                </ClinicalCard>

                <ClinicalProtocolStepsCard grouped={groupedProtocol} />

                <ClinicalCard title="Uygulama Notları" tone="amber" hidden={!applicationNotesDisplay}>
                  {notesParagraphs.length >= 2 ? (
                    <div className="space-y-3">
                      {notesParagraphs.map((paragraph, index) => (
                        <p
                          key={`note-${index}-${paragraph.slice(0, 16)}`}
                          className="rounded-lg border border-amber-100/80 bg-amber-50/40 px-3 py-2 text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]"
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
                  <p className="whitespace-pre-wrap text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]">
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
              </>
            </DemoGate>
          </div>

          {hasAtlasMapping ? (
            <section className={footMapPanelLargeClass} aria-label="Ayak haritası önizleme">
              <div className="shrink-0 border-b border-violet-200/70 px-4 py-3">
                <h2 className="text-sm font-bold text-violet-950">Ayak Haritası Önizleme</h2>
                <p className="mt-0.5 text-xs font-medium text-violet-800/80">
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
