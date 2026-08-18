"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Loader2, Search, Zap, X } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const searchInputClass =
  "mt-2 h-12 w-full rounded-2xl border-2 border-emerald-100 bg-white px-4 pl-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

type BioSectionId =
  | "cakralar"
  | "sembol"
  | "bilincalti"
  | "seanslar"
  | "enerji-bedenleri"
  | "imajinasyon";

type BioSectionMeta = {
  id: BioSectionId;
  label: string;
  table: string;
  icon: string;
  ring: string;
  bg: string;
  listTitle: string;
  listSubtitle: string;
  fieldOrder: string[];
  fieldLabels: Record<string, string>;
};

const BIO_SECTIONS: BioSectionMeta[] = [
  {
    id: "cakralar",
    label: "Çakralar",
    table: "chakra_notes",
    icon: "⬡",
    ring: "ring-violet-200",
    bg: "from-violet-50 via-white to-fuchsia-50/80",
    listTitle: "chakra_name",
    listSubtitle: "theme",
    fieldOrder: [
      "chakra_name",
      "chakra_color",
      "location",
      "theme",
      "imbalance_symptoms",
      "balanced_state",
      "healing_methods",
      "affirmation",
      "stone_support",
      "frequency_note",
      "source",
      "note",
      "created_at",
    ],
    fieldLabels: {
      chakra_name: "Çakra adı",
      chakra_color: "Renk",
      location: "Konum",
      theme: "Tema",
      imbalance_symptoms: "Dengesizlik belirtileri",
      balanced_state: "Dengeli durum",
      healing_methods: "Şifa yöntemleri",
      affirmation: "Olumlama",
      stone_support: "Taş desteği",
      frequency_note: "Frekans notu",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
  {
    id: "sembol",
    label: "Sembol Dili",
    table: "symbols_view",
    icon: "✦",
    ring: "ring-indigo-200",
    bg: "from-indigo-50 via-white to-sky-50/80",
    listTitle: "symbol_name",
    listSubtitle: "category",
    fieldOrder: [
      "symbol_name",
      "category",
      "meaning",
      "subconscious_message",
      "positive_aspect",
      "negative_aspect",
      "usage_area",
      "source",
      "note",
      "created_at",
    ],
    fieldLabels: {
      symbol_name: "Sembol adı",
      category: "Kategori",
      meaning: "Anlam",
      subconscious_message: "Bilinçaltı mesajı",
      positive_aspect: "Olumlu yön",
      negative_aspect: "Olumsuz yön",
      usage_area: "Kullanım alanı",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
  {
    id: "bilincalti",
    label: "Bilinçaltı Sebepler",
    table: "subconscious_causes",
    icon: "◐",
    ring: "ring-rose-200",
    bg: "from-rose-50 via-white to-orange-50/80",
    listTitle: "illness_name",
    listSubtitle: "category",
    fieldOrder: [
      "illness_name",
      "category",
      "subconscious_reason",
      "emotional_pattern",
      "affirmation",
      "healing_note",
      "source",
      "note",
      "created_at",
    ],
    fieldLabels: {
      illness_name: "Hastalık / durum",
      category: "Kategori",
      subconscious_reason: "Bilinçaltı sebebi",
      emotional_pattern: "Duygusal örüntü",
      affirmation: "Olumlama",
      healing_note: "Şifa notu",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
  {
    id: "seanslar",
    label: "Biyoenerji Seansları",
    table: "bioenergy_sessions",
    icon: "◈",
    ring: "ring-emerald-200",
    bg: "from-emerald-50 via-white to-teal-50/80",
    listTitle: "title",
    listSubtitle: "category",
    fieldOrder: ["title", "category", "content", "source", "note", "created_at"],
    fieldLabels: {
      title: "Başlık",
      category: "Kategori",
      content: "İçerik",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
  {
    id: "enerji-bedenleri",
    label: "Enerji Bedenleri",
    table: "energy_bodies",
    icon: "◎",
    ring: "ring-cyan-200",
    bg: "from-cyan-50 via-white to-sky-50/80",
    listTitle: "title",
    listSubtitle: "body_type",
    fieldOrder: [
      "title",
      "body_type",
      "content",
      "physical_notes",
      "emotional_notes",
      "spiritual_notes",
      "source",
      "note",
      "created_at",
    ],
    fieldLabels: {
      title: "Başlık",
      body_type: "Beden tipi",
      content: "İçerik",
      physical_notes: "Fiziksel notlar",
      emotional_notes: "Duygusal notlar",
      spiritual_notes: "Ruhsal notlar",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
  {
    id: "imajinasyon",
    label: "İmajinasyonlar",
    table: "bio_imaginations",
    icon: "✧",
    ring: "ring-amber-200",
    bg: "from-amber-50 via-white to-yellow-50/80",
    listTitle: "title",
    listSubtitle: "category",
    fieldOrder: [
      "title",
      "category",
      "purpose",
      "preparation",
      "imagination_text",
      "duration",
      "warning",
      "source",
      "note",
      "created_at",
    ],
    fieldLabels: {
      title: "Başlık",
      category: "Kategori",
      purpose: "Amaç",
      preparation: "Hazırlık",
      imagination_text: "İmajinasyon metni",
      duration: "Süre",
      warning: "Uyarı",
      source: "Kaynak",
      note: "Not",
      created_at: "Kayıt tarihi",
    },
  },
];

function previewText(value: string | null | undefined, max = 100): string {
  const t = (value ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function formatFieldValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key === "created_at" && typeof value === "string") {
    return formatCreatedAt(value);
  }
  const s = String(value).trim();
  return s || "—";
}

function ReadonlyDetailPanel({
  section,
  row,
  onClose,
}: {
  section: BioSectionMeta;
  row: Record<string, unknown>;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-emerald-200/80 bg-white p-5 shadow-inner">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-lg font-black text-slate-950">Kayıt detayı</h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
          aria-label="Detayı kapat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="space-y-4">
        {section.fieldOrder.map((key) => (
          <div key={key} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
            <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
              {section.fieldLabels[key] ?? key}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-800">
              {formatFieldValue(key, row[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-3) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/**
 * FAZ1 güvenlik: bioenergy_sessions okuması artık service-role admin endpoint'inden
 * gelir (publishable SELECT kaldırıldı). Yalnız "seanslar" sekmesi için; legacy 5
 * workspace sekmesi (chakra_notes/symbols_view/…) KAPSAM DIŞI ve değişmez.
 */
async function fetchAdminBioSessionCount(tenantId: string): Promise<number | null> {
  const adminId = readYasamUser()?.id;
  const res = await fetch(
    `/api/admin/biyoenerji/sessions?mode=count&tenantId=${encodeURIComponent(tenantId)}`,
    { headers: adminHeaders(adminId) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number };
  return json.ok ? Number(json.count ?? 0) : null;
}

async function fetchAdminBioSessionRows(
  tenantId: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const adminId = readYasamUser()?.id;
  const res = await fetch(
    `/api/admin/biyoenerji/sessions?mode=list&tenantId=${encodeURIComponent(tenantId)}`,
    { headers: adminHeaders(adminId) },
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    rows?: unknown;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    return { rows: [], error: String(json.error ?? `HTTP ${res.status}`) };
  }
  return {
    rows: Array.isArray(json.rows) ? (json.rows as Record<string, unknown>[]) : [],
    error: null,
  };
}

export default function AdminWorkspaceBioenergyPage() {
  useBfcacheRefresh();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<BioSectionId, number>>({
    cakralar: 0,
    sembol: 0,
    bilincalti: 0,
    seanslar: 0,
    "enerji-bedenleri": 0,
    imajinasyon: 0,
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<BioSectionId | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionRows, setSectionRows] = useState<Record<string, unknown>[]>([]);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "energy_body") : false;

  const activeMeta = useMemo(
    () => BIO_SECTIONS.find((s) => s.id === activeSection) ?? null,
    [activeSection],
  );

  const selectedRow = useMemo(() => {
    if (!selectedRowId) return null;
    return sectionRows.find((r) => String(r.id) === selectedRowId) ?? null;
  }, [sectionRows, selectedRowId]);

  const filteredRows = useMemo(() => {
    if (!activeMeta) return [];
    const q = search.trim().toLowerCase();
    if (!q) return sectionRows;

    return sectionRows.filter((row) => {
      const title = String(row[activeMeta.listTitle] ?? "").toLowerCase();
      const sub = String(row[activeMeta.listSubtitle] ?? "").toLowerCase();
      const note = String(row.note ?? "").toLowerCase();
      return title.includes(q) || sub.includes(q) || note.includes(q);
    });
  }, [sectionRows, search, activeMeta]);

  const fetchSectionCounts = useCallback(async (tenantId: string) => {
    const next: Record<BioSectionId, number> = {
      cakralar: 0,
      sembol: 0,
      bilincalti: 0,
      seanslar: 0,
      "enerji-bedenleri": 0,
      imajinasyon: 0,
    };

    await Promise.all(
      BIO_SECTIONS.map(async (section) => {
        // FAZ1: bioenergy_sessions sayımı service-role admin endpoint'inden gelir.
        if (section.table === "bioenergy_sessions") {
          const count = await fetchAdminBioSessionCount(tenantId);
          if (count != null) next[section.id] = count;
          return;
        }

        const { count, error } = await supabase
          .from(section.table)
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId);

        if (!error && count != null) {
          next[section.id] = count;
        }
      }),
    );

    setCounts(next);
  }, []);

  const loadExpertAndCounts = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    let userRow: Record<string, unknown> | null = null;
    let userError: { message: string } | null = null;
    {
      const adminId = readYasamUser()?.id;
      const userRes = await fetch(`/api/admin/users/${userId}`, {
        headers: adminHeaders(adminId),
      });
      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => ({}))) as { user?: Record<string, unknown> };
        userRow = userJson.user ?? null;
      } else {
        userError = { message: `HTTP ${userRes.status}` };
      }
    }

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

    if (!isExpertModuleEnabled(mapped, "energy_body")) {
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setLoadError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      setLoading(false);
      return;
    }

    await fetchSectionCounts(activeTenantId);
    setLoading(false);
  }, [userId, fetchSectionCounts]);

  const openSection = useCallback(
    async (sectionId: BioSectionId, tenantId: string) => {
      const meta = BIO_SECTIONS.find((s) => s.id === sectionId);
      if (!meta) return;

      setActiveSection(sectionId);
      setSectionLoading(true);
      setSectionError(null);
      setSectionRows([]);
      setSelectedRowId(null);
      setSearch("");

      // FAZ1: bioenergy_sessions listesi service-role admin endpoint'inden gelir.
      if (meta.table === "bioenergy_sessions") {
        const { rows, error } = await fetchAdminBioSessionRows(tenantId);
        setSectionLoading(false);
        if (error) {
          console.error(`Biyoenerji ${meta.label} listesi:`, error);
          setSectionError(error);
          setSectionRows([]);
          return;
        }
        setSectionRows(rows);
        return;
      }

      const { data, error } = await supabase
        .from(meta.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      setSectionLoading(false);

      if (error) {
        console.error(`Biyoenerji ${meta.label} listesi:`, error);
        setSectionError(error.message);
        setSectionRows([]);
        return;
      }

      setSectionRows((data ?? []) as Record<string, unknown>[]);
    },
    [],
  );

  const handleSectionClick = useCallback(
    async (sectionId: BioSectionId) => {
      if (!expert || !tenantId) {
        setSectionError("Tenant bilgisi bulunamadı.");
        return;
      }

      if (activeSection === sectionId) {
        setActiveSection(null);
        setSectionRows([]);
        setSelectedRowId(null);
        return;
      }

      await openSection(sectionId, tenantId);
    },
    [expert, tenantId, activeSection, openSection],
  );

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpertAndCounts();
  }, [sessionChecked, allowed, loadExpertAndCounts]);

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
      <div className={pageContainerClass}>
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-emerald-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
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
              className={`${panelClass} border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                  <Zap className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Biyoenerji İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Kayıt ekleme,
                    düzenleme veya silme yapılamaz.
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
                  Biyoenerji modülü bu uzman için kapalı.
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
                  <p className={`${panelClass} border-rose-200 bg-rose-50 text-sm font-bold text-rose-900`}>
                    {loadError}
                  </p>
                ) : null}

                <section
                  className={`${panelClass} border-emerald-200/80`}
                  aria-label="Biyoenerji bölümleri"
                >
                  <h2 className="text-xl font-black text-slate-950">Bölümler</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    Bir bölüme tıklayarak kayıtları salt okunur görüntüleyin.
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {BIO_SECTIONS.map((section) => {
                      const isActive = activeSection === section.id;
                      const count = counts[section.id];

                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => void handleSectionClick(section.id)}
                          className={`flex min-h-[140px] flex-col rounded-2xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                            isActive
                              ? `border-emerald-400 bg-gradient-to-br ${section.bg} shadow-md ring-2 ${section.ring}`
                              : `border-slate-200/90 bg-gradient-to-br ${section.bg} shadow-sm`
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-2xl" aria-hidden>
                              {section.icon}
                            </span>
                            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                              {count} kayıt
                            </span>
                          </div>
                          <p className="mt-3 text-base font-black text-slate-950">
                            {section.label}
                          </p>
                          <p className="mt-2 text-xs font-bold text-emerald-800">
                            {isActive ? "Panel açık · tekrar tıkla kapat" : "Kayıtları göster"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {activeSection && activeMeta ? (
                  <section
                    className={`${panelClass} border-violet-200/80`}
                    aria-label={`${activeMeta.label} kayıtları`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-black text-slate-950">
                          {activeMeta.label}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-slate-600">
                          {sectionLoading
                            ? "Yükleniyor…"
                            : `${filteredRows.length} kayıt gösteriliyor`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection(null);
                          setSectionRows([]);
                          setSelectedRowId(null);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-50"
                      >
                        <X className="h-4 w-4" />
                        Paneli kapat
                      </button>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-sm font-black text-slate-800">Ara</span>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Başlık, kategori veya not…"
                          className={searchInputClass}
                        />
                      </div>
                    </label>

                    {sectionError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                        {sectionError}
                      </p>
                    ) : null}

                    {sectionLoading ? (
                      <div className="mt-8 flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                      </div>
                    ) : !sectionError && filteredRows.length === 0 ? (
                      <p className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                        {sectionRows.length === 0
                          ? "Bu bölümde kayıt bulunamadı."
                          : "Arama kriterine uygun kayıt yok."}
                      </p>
                    ) : (
                      <div className="mt-6 grid gap-6 lg:grid-cols-2">
                        <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-2xl border-2 border-slate-100 p-2">
                          {filteredRows.map((row) => {
                            const id = String(row.id ?? "");
                            const isSelected = selectedRowId === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setSelectedRowId(id)}
                                className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${
                                  isSelected
                                    ? "border-emerald-300 bg-emerald-50"
                                    : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                <p className="font-bold text-slate-900">
                                  {String(row[activeMeta.listTitle] ?? "—") || "—"}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-600">
                                  {String(row[activeMeta.listSubtitle] ?? "") || "—"} ·{" "}
                                  {formatCreatedAt(String(row.created_at ?? ""))}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {previewText(
                                    row.note != null ? String(row.note) : null,
                                    80,
                                  )}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        <div className="min-h-[200px]">
                          {selectedRow ? (
                            <ReadonlyDetailPanel
                              section={activeMeta}
                              row={selectedRow}
                              onClose={() => setSelectedRowId(null)}
                            />
                          ) : (
                            <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 text-center text-sm font-bold text-slate-500">
                              Detay için soldan bir kayıt seçin.
                            </div>
                          )}
                        </div>
                      </div>
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
