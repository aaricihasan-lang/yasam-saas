"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Footprints, Home, Loader2, X } from "lucide-react";
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
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const LOCAL_STORAGE_LIMIT_MESSAGE =
  "Bu bölüm henüz yerel kayıt yapısından merkezi veritabanına taşınmadığı için admin izleme bağlantısı sınırlıdır. Kayıtlar uzmanın tarayıcısındaki localStorage içinde tutulur; admin panelinden başka bir uzmanın verisine erişilemez.";

type ReflexSectionId = "atlas" | "protokoller" | "notlar";

type ReflexSectionMeta = {
  id: ReflexSectionId;
  label: string;
  description: string;
  icon: string;
  ring: string;
  bg: string;
  /** Gelecekte Supabase tablosu eklendiğinde doldurulur */
  supabaseTable: string | null;
  localStorageKey: string;
};

const REFLEX_SECTIONS: ReflexSectionMeta[] = [
  {
    id: "atlas",
    label: "Kayıtlı Atlas",
    description: "Bölge haritası ve organ atlas kayıtları",
    icon: "🗺",
    ring: "ring-teal-200",
    bg: "from-teal-50 via-white to-cyan-50/80",
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-atlas-v1",
  },
  {
    id: "protokoller",
    label: "Protokoller",
    description: "Kayıtlı refleksoloji protokolleri",
    icon: "📋",
    ring: "ring-violet-200",
    bg: "from-violet-50 via-white to-fuchsia-50/80",
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-protokoller-v1",
  },
  {
    id: "notlar",
    label: "Notlar",
    description: "Klinik notlar ve ekler",
    icon: "📝",
    ring: "ring-amber-200",
    bg: "from-amber-50 via-white to-orange-50/80",
    supabaseTable: null,
    localStorageKey: "yasam-refleksoloji-notlar-v1",
  },
];

type SectionDataMode = "local" | "supabase";

async function probeSupabaseTable(
  table: string,
  tenantId: string,
): Promise<{ mode: SectionDataMode; count: number } | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    return null;
  }

  return { mode: "supabase", count: count ?? 0 };
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
  const [sectionCounts, setSectionCounts] = useState<Record<ReflexSectionId, number | null>>({
    atlas: null,
    protokoller: null,
    notlar: null,
  });

  const [activeSection, setActiveSection] = useState<ReflexSectionId | null>(null);
  const [panelRows, setPanelRows] = useState<Record<string, unknown>[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "reflexology") : false;

  const activeMeta = REFLEX_SECTIONS.find((s) => s.id === activeSection) ?? null;
  const activeMode = activeSection ? sectionModes[activeSection] : "local";

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
    const counts: Record<ReflexSectionId, number | null> = {
      atlas: null,
      protokoller: null,
      notlar: null,
    };

    await Promise.all(
      REFLEX_SECTIONS.map(async (section) => {
        if (!section.supabaseTable) return;
        const result = await probeSupabaseTable(section.supabaseTable, activeTenantId);
        if (result) {
          modes[section.id] = result.mode;
          counts[section.id] = result.count;
        }
      }),
    );

    setSectionModes(modes);
    setSectionCounts(counts);
    setLoading(false);
  }, [userId]);

  const openSectionPanel = useCallback(
    async (sectionId: ReflexSectionId) => {
      const meta = REFLEX_SECTIONS.find((s) => s.id === sectionId);
      if (!meta || !tenantId) return;

      setActiveSection(sectionId);
      setSelectedRowId(null);
      setPanelRows([]);
      setPanelError(null);

      if (sectionModes[sectionId] !== "supabase" || !meta.supabaseTable) {
        setPanelLoading(false);
        return;
      }

      setPanelLoading(true);
      const { data, error } = await supabase
        .from(meta.supabaseTable)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      setPanelLoading(false);

      if (error) {
        setPanelError(error.message);
        setPanelRows([]);
        return;
      }

      setPanelRows((data ?? []) as Record<string, unknown>[]);
    },
    [tenantId, sectionModes],
  );

  const handleSectionClick = useCallback(
    (sectionId: ReflexSectionId) => {
      if (activeSection === sectionId) {
        setActiveSection(null);
        setPanelRows([]);
        setSelectedRowId(null);
        return;
      }
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

  const anySupabase = Object.values(sectionModes).some((m) => m === "supabase");

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
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
          <div className="space-y-6">
            <header
              className={`${panelClass} border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md">
                  <Footprints className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Refleksoloji İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Yeni organ ekleme,
                    çizim, düzenleme, silme veya kaydetme yapılamaz.
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

                {!anySupabase ? (
                  <section
                    className={`${panelClass} border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90`}
                    role="note"
                  >
                    <p className="text-sm font-bold leading-relaxed text-amber-950 md:text-base">
                      {LOCAL_STORAGE_LIMIT_MESSAGE}
                    </p>
                    <p className="mt-3 text-xs font-semibold text-amber-900/80">
                      Mevcut modülde atlas, protokoller ve notlar tarayıcı
                      localStorage anahtarlarında tutulur (
                      {REFLEX_SECTIONS.map((s) => s.localStorageKey).join(", ")}).
                    </p>
                  </section>
                ) : null}

                <section
                  className={`${panelClass} border-teal-200/80`}
                  aria-label="Refleksoloji bölümleri"
                >
                  <h2 className="text-xl font-black text-slate-950">Bölümler</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    Bir bölüme tıklayın. Merkezi veritabanı bağlantısı olan bölümlerde
                    kayıtlar listelenir.
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {REFLEX_SECTIONS.map((section) => {
                      const isActive = activeSection === section.id;
                      const mode = sectionModes[section.id];
                      const count = sectionCounts[section.id];

                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => handleSectionClick(section.id)}
                          className={`flex min-h-[150px] flex-col rounded-2xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                            isActive
                              ? `border-teal-400 bg-gradient-to-br ${section.bg} shadow-md ring-2 ${section.ring}`
                              : `border-slate-200/90 bg-gradient-to-br ${section.bg} shadow-sm`
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-2xl" aria-hidden>
                              {section.icon}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                                mode === "supabase"
                                  ? "bg-teal-600 text-white"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {mode === "supabase"
                                ? count != null
                                  ? `${count} kayıt`
                                  : "Supabase"
                                : "Yerel kayıt"}
                            </span>
                          </div>
                          <p className="mt-3 text-base font-black text-slate-950">
                            {section.label}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-600">
                            {section.description}
                          </p>
                          <p className="mt-2 text-xs font-bold text-teal-800">
                            {isActive ? "Panel açık" : "Detay"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {activeSection && activeMeta ? (
                  <section
                    className={`${panelClass} border-violet-200/80`}
                    aria-label={`${activeMeta.label} paneli`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-black text-slate-950">
                        {activeMeta.label}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection(null);
                          setPanelRows([]);
                          setSelectedRowId(null);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800"
                      >
                        <X className="h-4 w-4" />
                        Paneli kapat
                      </button>
                    </div>

                    {activeMode === "local" ? (
                      <div className="mt-6 rounded-2xl border-2 border-amber-200 bg-amber-50/90 p-6">
                        <p className="text-sm font-bold leading-relaxed text-amber-950">
                          {LOCAL_STORAGE_LIMIT_MESSAGE}
                        </p>
                        <p className="mt-4 text-sm font-medium text-slate-700">
                          Uzman bu bölümde kendi tarayıcısında kayıt oluşturur.
                          Admin paneli bu veriyi uzaktan okuyamaz. Merkezi izleme
                          için kayıtların Supabase&apos;e taşınması gerekir.
                        </p>
                        <p className="mt-3 text-xs font-semibold text-slate-500">
                          Yerel anahtar: <code className="font-mono">{activeMeta.localStorageKey}</code>
                        </p>
                      </div>
                    ) : panelLoading ? (
                      <div className="mt-8 flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                      </div>
                    ) : panelError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                        {panelError}
                      </p>
                    ) : panelRows.length === 0 ? (
                      <p className="mt-6 text-sm font-bold text-slate-600">
                        Bu bölümde merkezi kayıt bulunamadı.
                      </p>
                    ) : (
                      <ul className="mt-6 max-h-[400px] space-y-2 overflow-y-auto">
                        {panelRows.map((row) => {
                          const id = String(row.id ?? "");
                          const title =
                            String(row.title ?? row.name ?? row.organ ?? id) || "—";
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                onClick={() => setSelectedRowId(id)}
                                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-bold transition ${
                                  selectedRowId === id
                                    ? "border-teal-300 bg-teal-50 text-teal-950"
                                    : "border-slate-100 bg-white text-slate-800 hover:border-slate-200"
                                }`}
                              >
                                {title}
                              </button>
                              {selectedRowId === id ? (
                                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
                                  {JSON.stringify(row, null, 2)}
                                </pre>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
