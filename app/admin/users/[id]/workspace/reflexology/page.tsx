"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ClipboardList,
  Database,
  Footprints,
  Home,
  Loader2,
  Map,
  ShieldAlert,
  StickyNote,
} from "lucide-react";
import {
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1800px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const CENTRAL_PLACEHOLDER = "Henüz merkezi veri yok";

type ReflexSectionId = "atlas" | "protokoller" | "notlar";

type ReflexSectionMeta = {
  id: ReflexSectionId;
  label: string;
  description: string;
  ring: string;
  borderActive: string;
  bg: string;
  panelBg: string;
  accent: string;
  badge: string;
  icon: ReactNode;
  supabaseTable: string | null;
  localStorageKey: string;
  systemNote: string;
};

const REFLEX_SECTIONS: ReflexSectionMeta[] = [
  {
    id: "atlas",
    label: "Kayıtlı Atlas",
    description: "Bölge haritası ve organ atlas kayıtları",
    ring: "ring-teal-300",
    borderActive: "border-teal-400",
    bg: "from-teal-50 via-white to-cyan-50/90",
    panelBg: "from-teal-50/95 via-white/95 to-cyan-50/80",
    accent: "text-teal-800",
    badge: "bg-teal-600",
    icon: <Map className="h-7 w-7" aria-hidden />,
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-atlas-v1",
    systemNote:
      "Ayak atlası bölgeleri, organ eşleşmeleri ve bölge haritası çizimleri bu anahtar altında saklanır.",
  },
  {
    id: "protokoller",
    label: "Protokoller",
    description: "Kayıtlı refleksoloji protokolleri",
    ring: "ring-violet-300",
    borderActive: "border-violet-400",
    bg: "from-violet-50 via-white to-fuchsia-50/90",
    panelBg: "from-violet-50/95 via-white/95 to-fuchsia-50/80",
    accent: "text-violet-800",
    badge: "bg-violet-600",
    icon: <ClipboardList className="h-7 w-7" aria-hidden />,
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-protokoller-v1",
    systemNote:
      "Organ eşleşmeleri ve atlas bağlantıları kullanıyor. Protokol haritası ile kayıtlı protokol listesi bu yapıya bağlıdır.",
  },
  {
    id: "notlar",
    label: "Notlar",
    description: "Klinik notlar ve ekler",
    ring: "ring-amber-300",
    borderActive: "border-amber-400",
    bg: "from-amber-50 via-white to-orange-50/90",
    panelBg: "from-amber-50/95 via-white/95 to-orange-50/80",
    accent: "text-amber-900",
    badge: "bg-amber-600",
    icon: <StickyNote className="h-7 w-7" aria-hidden />,
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-notlar-v1",
    systemNote:
      "Büyük editör + ek dosya + detay ekranı kullanıyor. Klinik notlar ve ekler uzman oturumunda yerel olarak tutulur.",
  },
];

type SectionDataMode = "local" | "supabase";

type SectionCentralMeta = {
  recordCount: number | null;
  lastUpdated: string | null;
  expertActivity: string | null;
};

async function probeSupabaseTable(
  table: string,
  tenantId: string,
): Promise<{ mode: SectionDataMode; count: number; lastUpdated: string | null } | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) return null;

  const { data: latestRow } = await supabase
    .from(table)
    .select("updated_at, created_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = latestRow as Record<string, unknown> | null;
  const lastUpdated =
    row?.updated_at != null
      ? String(row.updated_at)
      : row?.created_at != null
        ? String(row.created_at)
        : null;

  return { mode: "supabase", count: count ?? 0, lastUpdated };
}

function InfoTile({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border-2 p-4 ${highlight ? "border-amber-200 bg-amber-50/80" : "border-white/90 bg-white/70"}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-sm font-bold leading-relaxed text-slate-900 ${mono ? "font-mono text-xs sm:text-sm" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ReflexSectionAccordion({
  section,
  isOpen,
  mode,
  central,
  supabaseRows,
  panelLoading,
  panelError,
  onToggle,
}: {
  section: ReflexSectionMeta;
  isOpen: boolean;
  mode: SectionDataMode;
  central: SectionCentralMeta;
  supabaseRows: Record<string, unknown>[];
  panelLoading: boolean;
  panelError: string | null;
  onToggle: () => void;
}) {
  const isLocal = mode === "local";
  const recordCountLabel =
    central.recordCount != null ? String(central.recordCount) : CENTRAL_PLACEHOLDER;
  const lastUpdatedLabel = central.lastUpdated ?? CENTRAL_PLACEHOLDER;
  const activityLabel = central.expertActivity ?? CENTRAL_PLACEHOLDER;

  return (
    <article
      className={`overflow-hidden rounded-[32px] border-2 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl transition-all duration-500 ${
        isOpen
          ? `${section.borderActive} bg-gradient-to-br ${section.bg} ring-4 ${section.ring}`
          : "border-white/80 bg-white/85 hover:border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full flex-col gap-4 p-6 text-left transition sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${section.badge}`}
          >
            {section.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-black text-slate-950 sm:text-3xl">
                {section.label}
              </h3>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white ${section.badge}`}
              >
                {isLocal ? "Yerel Kayıt" : "Merkezi Veri"}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600 md:text-base">
              {section.description}
            </p>
            <p className={`mt-2 text-xs font-bold ${section.accent}`}>
              {isOpen ? "Detay paneli açık" : "Detay panelini aç"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-2xl border-2 border-white/90 bg-white/80 px-4 py-2 text-center">
            <span className="block text-[10px] font-black uppercase text-slate-500">
              Kayıt
            </span>
            <span className="text-lg font-black text-slate-950">
              {isLocal ? "—" : recordCountLabel}
            </span>
          </span>
          <ChevronDown
            className={`h-8 w-8 text-slate-600 transition-transform duration-500 ${isOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`border-t-2 border-white/60 bg-gradient-to-br ${section.panelBg} px-6 pb-8 pt-2 sm:px-10 sm:pb-10`}
          >
            <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-white/70 pb-6">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-xl ${section.badge}`}
              >
                {section.icon}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">
                  Admin bilgi görüntüleme
                </p>
                <h4 className="text-3xl font-black text-slate-950 sm:text-4xl">
                  {section.label}
                </h4>
              </div>
              <span
                className={`ml-auto rounded-full px-4 py-2 text-xs font-black uppercase text-white ${section.badge}`}
              >
                {isLocal ? "Yerel Kayıt" : "Supabase Aktif"}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InfoTile label="Veri Kaynağı" value={section.localStorageKey} mono />
              <InfoTile label="Durum" value={isLocal ? "Yerel Kayıt" : "Merkezi Veritabanı"} />
              <InfoTile label="Admin erişimi" value="Sınırlı" highlight={isLocal} />
              <InfoTile
                label="Sebep"
                value={
                  isLocal
                    ? "Bu veri kullanıcının tarayıcısında tutuluyor."
                    : "Tenant bazlı merkezi kayıt okunuyor."
                }
              />
            </div>

            <div className="mt-4 rounded-[24px] border-2 border-white/80 bg-white/60 p-5 backdrop-blur-md sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Kayıt sistemi bilgisi
              </p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-800 md:text-base">
                {section.systemNote}
              </p>
              {section.id === "notlar" ? (
                <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm font-bold text-amber-950">
                  <span className="font-black">Not sistemi açıklaması:</span> Büyük editör +
                  ek dosya + detay ekranı kullanıyor.
                </p>
              ) : null}
              {section.id === "protokoller" ? (
                <p className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/90 px-4 py-3 text-sm font-bold text-violet-950">
                  <span className="font-black">Açıklama:</span> Organ eşleşmeleri ve atlas
                  bağlantıları kullanıyor.
                </p>
              ) : null}
              {section.id === "atlas" ? (
                <p className="mt-3 text-xs font-semibold text-slate-600">
                  Yerel kayıt anahtarı:{" "}
                  <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-teal-900">
                    {section.localStorageKey}
                  </code>
                </p>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoTile label="Kayıt Sayısı" value={recordCountLabel} highlight={isLocal} />
              <InfoTile label="Son Güncelleme" value={lastUpdatedLabel} highlight={isLocal} />
              <InfoTile label="Uzman Aktivitesi" value={activityLabel} highlight={isLocal} />
            </div>

            {isLocal ? (
              <div className="mt-6 flex gap-4 rounded-[24px] border-2 border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/95 p-6 backdrop-blur-sm sm:p-8">
                <ShieldAlert className="h-10 w-10 shrink-0 text-amber-700" aria-hidden />
                <div>
                  <p className="text-lg font-black text-amber-950">
                    Merkezi izleme henüz aktif değil
                  </p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-amber-900/90">
                    Bu bölüm henüz yerel kayıt yapısından merkezi veritabanına taşınmadığı
                    için admin izleme bağlantısı sınırlıdır. Kayıtlar uzmanın tarayıcısındaki{" "}
                    <code className="font-mono text-xs">{section.localStorageKey}</code>{" "}
                    anahtarında tutulur; başka uzmanın verisine admin panelinden erişilemez.
                  </p>
                  <p className="mt-3 text-xs font-bold text-slate-600">
                    Salt okunur: düzenleme, silme, kaydetme veya yeni kayıt oluşturma bu
                    ekranda yapılamaz.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border-2 border-teal-200/80 bg-white/80 p-6 backdrop-blur-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5 text-teal-700" aria-hidden />
                  <p className="text-sm font-black text-teal-950">
                    Merkezi kayıtlar ({supabaseRows.length})
                  </p>
                </div>
                {panelLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                  </div>
                ) : panelError ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                    {panelError}
                  </p>
                ) : supabaseRows.length === 0 ? (
                  <p className="text-sm font-bold text-slate-600">
                    Bu bölümde merkezi kayıt bulunamadı.
                  </p>
                ) : (
                  <ul className="max-h-[360px] space-y-2 overflow-y-auto">
                    {supabaseRows.map((row) => {
                      const id = String(row.id ?? "");
                      const title =
                        String(row.title ?? row.name ?? row.organ ?? id) || "—";
                      return (
                        <li
                          key={id}
                          className="rounded-xl border-2 border-slate-100 bg-slate-50/90 px-4 py-3 text-sm font-bold text-slate-800"
                        >
                          {title}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AdminWorkspaceReflexologyPage() {
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sectionModes, setSectionModes] = useState<Record<ReflexSectionId, SectionDataMode>>({
    atlas: "local",
    protokoller: "local",
    notlar: "local",
  });
  const [sectionCentral, setSectionCentral] = useState<
    Record<ReflexSectionId, SectionCentralMeta>
  >({
    atlas: { recordCount: null, lastUpdated: null, expertActivity: null },
    protokoller: { recordCount: null, lastUpdated: null, expertActivity: null },
    notlar: { recordCount: null, lastUpdated: null, expertActivity: null },
  });

  const [activeSection, setActiveSection] = useState<ReflexSectionId | null>(null);
  const [panelRowsBySection, setPanelRowsBySection] = useState<
    Partial<Record<ReflexSectionId, Record<string, unknown>[]>>
  >({});
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "reflexology") : false;

  const loadExpert = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      console.error("Uzman yükleme hatası:", userError);
      setExpert(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = userRow as Record<string, unknown>;
    const mapped = mapDbUser(row);
    const activeTenantId =
      row.tenant_id != null ? String(row.tenant_id).trim() : "";

    setExpert(mapped);
    setTenantId(activeTenantId || null);
    setNotFound(false);

    if (!isExpertModuleEnabled(mapped, "reflexology")) {
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setLoadError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      setLoading(false);
      return;
    }

    const modes: Record<ReflexSectionId, SectionDataMode> = {
      atlas: "local",
      protokoller: "local",
      notlar: "local",
    };
    const central: Record<ReflexSectionId, SectionCentralMeta> = {
      atlas: { recordCount: null, lastUpdated: null, expertActivity: null },
      protokoller: { recordCount: null, lastUpdated: null, expertActivity: null },
      notlar: { recordCount: null, lastUpdated: null, expertActivity: null },
    };

    await Promise.all(
      REFLEX_SECTIONS.map(async (section) => {
        if (!section.supabaseTable) return;
        const result = await probeSupabaseTable(section.supabaseTable, activeTenantId);
        if (result) {
          modes[section.id] = result.mode;
          central[section.id] = {
            recordCount: result.count,
            lastUpdated: result.lastUpdated,
            expertActivity: result.count > 0 ? "Aktif merkezi kayıt" : "Kayıt yok",
          };
        }
      }),
    );

    setSectionModes(modes);
    setSectionCentral(central);
    setLoading(false);
  }, [userId]);

  const openSectionPanel = useCallback(
    async (sectionId: ReflexSectionId) => {
      const meta = REFLEX_SECTIONS.find((s) => s.id === sectionId);
      if (!meta || !tenantId) return;

      setPanelError(null);

      if (sectionModes[sectionId] !== "supabase" || !meta.supabaseTable) {
        return;
      }

      if (panelRowsBySection[sectionId]) return;

      setPanelLoading(true);
      const { data, error } = await supabase
        .from(meta.supabaseTable)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      setPanelLoading(false);

      if (error) {
        setPanelError(error.message);
        return;
      }

      setPanelRowsBySection((prev) => ({
        ...prev,
        [sectionId]: (data ?? []) as Record<string, unknown>[],
      }));
    },
    [tenantId, sectionModes, panelRowsBySection],
  );

  const handleSectionToggle = useCallback(
    (sectionId: ReflexSectionId) => {
      if (activeSection === sectionId) {
        setActiveSection(null);
        setPanelError(null);
        return;
      }
      setActiveSection(sectionId);
      void openSectionPanel(sectionId);
    },
    [activeSection, openSectionPanel],
  );

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpert();
  }, [sessionChecked, allowed, loadExpert]);

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <p className="text-xl font-black text-rose-950">Erişim reddedildi</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
          <Link href="/" className={`${navBtn} mt-6 border-violet-300 bg-violet-50 text-violet-950`}>
            Ana Panele Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(20,184,166,0.12),transparent)]"
        aria-hidden
      />
      <div className={pageContainerClass}>
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-teal-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            <Link
              href={`/admin/users/${userId}/workspace`}
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950`}
            >
              Uzman Çalışma Alanına Dön
            </Link>
            <Link
              href={`/admin/users/${userId}`}
              className={`${navBtn} border-indigo-300/80 bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-950`}
            >
              Kullanıcı Detayına Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
          </div>
        </nav>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : notFound || !expert ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Üye bulunamadı</p>
            <Link href="/admin/users" className={`${navBtn} mt-6 inline-flex max-w-md`}>
              Kullanıcı yönetimine dön
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <header
              className={`${panelClass} border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg">
                  <Footprints className="h-7 w-7" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-4xl font-black text-slate-950 sm:text-5xl">
                    Refleksoloji İzleme
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Atlas, protokoller ve notlar için admin bilgi panelleri. Kayıt
                    düzenleme, silme veya yeni kayıt oluşturma yapılamaz.
                  </p>
                  <p className="mt-3 text-sm font-bold text-indigo-900">
                    {expert.fullName} · {expert.email}
                  </p>
                </div>
              </div>
            </header>

            {!moduleEnabled ? (
              <section
                className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
                role="alert"
              >
                <p className="text-base font-black text-rose-950">
                  Bu modül kullanıcıda aktif değil.
                </p>
                <p className="mt-2 text-sm font-medium text-rose-900/80">
                  Refleksoloji modülü bu uzman için kapalı.
                </p>
                <Link
                  href={`/admin/users/${userId}/workspace`}
                  className={`${navBtn} mt-5 inline-flex max-w-md border-violet-300 bg-violet-50 text-violet-950`}
                >
                  Uzman Çalışma Alanına Dön
                </Link>
              </section>
            ) : (
              <>
                {loadError ? (
                  <p
                    className={`${panelClass} border-rose-200 bg-rose-50 text-sm font-bold text-rose-900`}
                    role="alert"
                  >
                    {loadError}
                  </p>
                ) : null}

                <section className="space-y-6" aria-label="Refleksoloji accordion bölümleri">
                  <div className="px-1">
                    <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Bölümler</h2>
                    <p className="mt-2 text-sm font-medium text-slate-600 md:text-base">
                      Kartlara tıklayarak geniş premium detay panelini açın. Yerel kayıtlar
                      uzman tarayıcısında; merkezi taşıma sonrası sayım ve liste burada
                      görünecek.
                    </p>
                  </div>

                  {REFLEX_SECTIONS.map((section) => (
                    <ReflexSectionAccordion
                      key={section.id}
                      section={section}
                      isOpen={activeSection === section.id}
                      mode={sectionModes[section.id]}
                      central={sectionCentral[section.id]}
                      supabaseRows={panelRowsBySection[section.id] ?? []}
                      panelLoading={panelLoading && activeSection === section.id}
                      panelError={activeSection === section.id ? panelError : null}
                      onToggle={() => handleSectionToggle(section.id)}
                    />
                  ))}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
