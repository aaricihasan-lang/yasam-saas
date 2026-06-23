"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Clock3,
  ContactRound,
  ListFilter,
  PieChart,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { DEMO_CLIENTS } from "@/lib/demo/demoClients";
import { readDemoClients } from "@/lib/demo/demoSession";

// ─── Yardımcı: ISO tarihi → DD.MM.YYYY ──────────────────────────────────────
function isoToTR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Yardımcı: Sayıyı okunabilir stringe çevir ──────────────────────────────
function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return String(n);
}

// ─── Demo stats — DEMO_CLIENTS + session clientlarından hesapla ──────────────
type FlatClient = { created_at: string; gorusme: string | null };

function calcDemoStats(clients: FlatClient[]): string[] {
  const now = new Date();

  // Ay sınırları
  const startOfMonth    = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Hafta sınırları (Pzt–Paz)
  const dow = now.getDay();
  const diffMon = dow === 0 ? -6 : 1 - dow;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + diffMon);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  // Yıl sınırları
  const startOfYear    = new Date(now.getFullYear(), 0, 1);
  const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

  // Son 3 ay (bu ay hariç)
  const start3MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  // 1 — Toplam Danışan
  const total = clients.length;

  // 2 — Son Kayıt (en yeni created_at)
  const lastCreated = clients
    .map((c) => c.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  // 3 — Bu Ay Yeni (created_at bu ay)
  const thisMonthNew = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d >= startOfMonth && d < startOfNextMonth;
  }).length;

  // 4 — Son 3 Ay Ort. (bu aydan önceki 3 aylık yeni danışan / 3)
  const last3mTotal = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d >= start3MonthsAgo && d < startOfMonth;
  }).length;
  const avg3m = Math.round(last3mTotal / 3);

  // 5 — Bu Ay Randevu (gorusme bu ay içinde)
  const thisMonthAppts = clients.filter((c) => {
    if (!c.gorusme) return false;
    const d = new Date(c.gorusme);
    return d >= startOfMonth && d < startOfNextMonth;
  }).length;

  // 6 — En Yakın Randevu (demo-0 profilindeki ilk yaklaşan randevu)
  const nextAppt = "03.07.2026";

  // 7 — Bu Hafta (created_at bu hafta)
  const thisWeek = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d >= startOfWeek && d < endOfWeek;
  }).length;

  // 8 — Bu Ay Tamamlanan (geçmişteki gorusme tarihleri bu ay)
  const thisMonthCompleted = clients.filter((c) => {
    if (!c.gorusme) return false;
    const d = new Date(c.gorusme);
    return d >= startOfMonth && d < now;
  }).length;

  // 9 — Bu Yıl Toplam (gorusme bu yıl içinde)
  const thisYearTotal = clients.filter((c) => {
    if (!c.gorusme) return false;
    const d = new Date(c.gorusme);
    return d >= startOfYear && d < startOfNextYear;
  }).length;

  // 10 — Bu Yıl Danışan (created_at bu yıl)
  const thisYearClients = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d >= startOfYear && d < startOfNextYear;
  }).length;

  return [
    fmtCount(total),             // 1
    isoToTR(lastCreated),        // 2
    fmtCount(thisMonthNew),      // 3
    fmtCount(avg3m),             // 4
    fmtCount(thisMonthAppts),    // 5
    nextAppt,                    // 6
    fmtCount(thisWeek),          // 7
    fmtCount(thisMonthCompleted),// 8
    fmtCount(thisYearTotal),     // 9
    fmtCount(thisYearClients),   // 10
  ];
}

// ─── Sabit kart tanımları (renk + ikon) ─────────────────────────────────────
type StatCardDef = {
  label: string;
  Icon: LucideIcon;
  cardBg: string;
  border: string;
  iconBox: string;
};

const STAT_CARD_DEFS: StatCardDef[] = [
  {
    label: "Toplam Danışan",
    Icon: UsersRound,
    cardBg: "bg-gradient-to-br from-violet-100 via-white to-indigo-100",
    border: "border-violet-300/70",
    iconBox: "bg-violet-500 text-white",
  },
  {
    label: "Son Kayıt",
    Icon: CalendarDays,
    cardBg: "bg-gradient-to-br from-sky-100 via-white to-blue-100",
    border: "border-sky-300/70",
    iconBox: "bg-sky-500 text-white",
  },
  {
    label: "Bu Ay Yeni",
    Icon: Clock3,
    cardBg: "bg-gradient-to-br from-teal-100 via-white to-emerald-100",
    border: "border-teal-300/70",
    iconBox: "bg-teal-500 text-white",
  },
  {
    label: "Son 3 Ay Ort.",
    Icon: ChartColumn,
    cardBg: "bg-gradient-to-br from-amber-100 via-white to-orange-100",
    border: "border-amber-300/70",
    iconBox: "bg-orange-500 text-white",
  },
  {
    label: "Bu Ay Randevu",
    Icon: Activity,
    cardBg: "bg-gradient-to-br from-pink-100 via-white to-rose-100",
    border: "border-pink-300/70",
    iconBox: "bg-pink-500 text-white",
  },
  {
    label: "En Yakın Randevu",
    Icon: CalendarClock,
    cardBg: "bg-gradient-to-br from-cyan-100 via-white to-sky-100",
    border: "border-cyan-300/70",
    iconBox: "bg-cyan-500 text-white",
  },
  {
    label: "Bu Hafta",
    Icon: CalendarRange,
    cardBg: "bg-gradient-to-br from-yellow-100 via-white to-amber-100",
    border: "border-yellow-300/70",
    iconBox: "bg-yellow-500 text-white",
  },
  {
    label: "Bu Ay Tamamlanan",
    Icon: CalendarCheck,
    cardBg: "bg-gradient-to-br from-rose-100 via-white to-pink-100",
    border: "border-rose-300/70",
    iconBox: "bg-rose-500 text-white",
  },
  {
    label: "Bu Yıl Toplam",
    Icon: PieChart,
    cardBg: "bg-gradient-to-br from-purple-100 via-white to-violet-100",
    border: "border-purple-300/70",
    iconBox: "bg-purple-500 text-white",
  },
  {
    label: "Bu Yıl Danışan",
    Icon: TrendingUp,
    cardBg: "bg-gradient-to-br from-green-100 via-white to-emerald-100",
    border: "border-green-300/70",
    iconBox: "bg-green-500 text-white",
  },
];

const journeyFolders: {
  title: string;
  desc: string;
  href: string;
  badge: string;
  cardGradient: string;
  border: string;
  iconBox: string;
  decorColor: string;
  Icon: LucideIcon;
  DecorIcon: LucideIcon;
}[] = [
  {
    title: "Danışan Kayıt",
    desc: "Yeni danışan ekle, kişisel bilgileri ve görüşme tarihini kaydet.",
    href: "/danisan-yolculugu/kayit",
    badge: "Yeni Kayıt",
    cardGradient: "bg-gradient-to-br from-emerald-100 via-white to-teal-100",
    border: "border-emerald-300/70",
    iconBox: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
    decorColor: "text-emerald-500",
    Icon: UserPlus,
    DecorIcon: ContactRound,
  },
  {
    title: "Danışan Listesi",
    desc: "Kayıtlı danışanları görüntüle, ara, düzenle ve detaylara eriş.",
    href: "/danisan-yolculugu/liste",
    badge: "Liste & Detay",
    cardGradient: "bg-gradient-to-br from-violet-100 via-white to-indigo-100",
    border: "border-violet-300/70",
    iconBox: "bg-gradient-to-br from-violet-500 to-indigo-500 text-white",
    decorColor: "text-violet-500",
    Icon: UsersRound,
    DecorIcon: ListFilter,
  },
  {
    title: "Danışan Takip",
    desc: "Randevular, seans planlama, günlük takip ve danışan süreç yönetimi.",
    href: "/danisan-yolculugu/takip",
    badge: "Takip & Plan",
    cardGradient: "bg-gradient-to-br from-cyan-100 via-white to-teal-100",
    border: "border-cyan-300/70",
    iconBox: "bg-gradient-to-br from-cyan-500 to-teal-500 text-white",
    decorColor: "text-teal-500",
    Icon: CalendarDays,
    DecorIcon: CalendarRange,
  },
];

// ─── Stat Kart Bileşeni ──────────────────────────────────────────────────────
function SummaryStatCard({
  label,
  value,
  Icon,
  cardBg,
  border,
  iconBox,
  loading,
}: StatCardDef & { value: string; loading: boolean }) {
  return (
    <div
      className={`group relative z-0 flex flex-col justify-between gap-3 rounded-xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${border} ${cardBg}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all duration-200 group-hover:scale-105 ${iconBox}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </div>
      <div>
        <p
          className={`text-2xl font-black tabular-nums leading-none tracking-tight text-slate-950 transition-all duration-300 ${
            loading ? "animate-pulse text-slate-300" : ""
          }`}
        >
          {loading ? "—" : value}
        </p>
        <p
          className="mt-1 truncate text-[10.5px] font-semibold leading-tight text-slate-600"
          title={label}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function DanisanYolculuguPage() {
  // 10 stat değeri — yükleme öncesi "—"
  const [stats, setStats] = useState<string[]>(Array(10).fill("—"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      // Demo hesap: Supabase yerine local veriden hesapla
      const user = readYasamUser();
      if (user?.is_demo_account === true) {
        const sessionClients = readDemoClients();
        const allClients: FlatClient[] = [
          ...sessionClients,
          ...(DEMO_CLIENTS as FlatClient[]),
        ];
        if (!cancelled) {
          setStats(calcDemoStats(allClients));
          setLoading(false);
        }
        return;
      }

      const tenantId = await getSyncedTenantId();
      if (!tenantId) {
        setLoading(false);
        return;
      }

      const now = new Date();

      // Ay sınırları
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // Hafta sınırları (Pazartesi–Pazar)
      const dayOfWeek = now.getDay(); // 0=Pazar
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() + diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      // Yıl sınırları
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

      // Son 3 ay (bu ay hariç)
      const start3MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

      const [
        totalClientsRes,
        lastClientRes,
        thisMonthClientsRes,
        last3mClientsRes,
        thisMonthApptsRes,
        nextApptRes,
        thisWeekApptsRes,
        thisMonthCompletedRes,
        thisYearApptsRes,
        thisYearClientsRes,
      ] = await Promise.all([
        // 1 — Toplam Danışan
        supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId),

        // 2 — Son Kayıt tarihi
        supabase
          .from("clients")
          .select("created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1),

        // 3 — Bu Ay Yeni
        supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", startOfMonth.toISOString())
          .lt("created_at", startOfNextMonth.toISOString()),

        // 4 — Son 3 Ay Ort. (son 3 ay toplamı / 3)
        supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", start3MonthsAgo.toISOString())
          .lt("created_at", startOfMonth.toISOString()),

        // 5 — Bu Ay Randevu (toplam)
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("appointment_date", startOfMonth.toISOString())
          .lt("appointment_date", startOfNextMonth.toISOString()),

        // 6 — En Yakın Randevu tarihi
        supabase
          .from("appointments")
          .select("appointment_date")
          .eq("tenant_id", tenantId)
          .gt("appointment_date", now.toISOString())
          .neq("status", "iptal")
          .order("appointment_date", { ascending: true })
          .limit(1),

        // 7 — Bu Hafta Randevu
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("appointment_date", startOfWeek.toISOString())
          .lt("appointment_date", endOfWeek.toISOString()),

        // 8 — Bu Ay Tamamlanan
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "tamamlandi")
          .gte("appointment_date", startOfMonth.toISOString())
          .lt("appointment_date", startOfNextMonth.toISOString()),

        // 9 — Bu Yıl Toplam Randevu
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("appointment_date", startOfYear.toISOString())
          .lt("appointment_date", startOfNextYear.toISOString()),

        // 10 — Bu Yıl Danışan
        supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", startOfYear.toISOString())
          .lt("created_at", startOfNextYear.toISOString()),
      ]);

      if (cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastClientDate = (lastClientRes.data as any)?.[0]?.created_at ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextApptDate = (nextApptRes.data as any)?.[0]?.appointment_date ?? null;

      const last3mTotal = last3mClientsRes.count ?? 0;
      const avg3m = Math.round(last3mTotal / 3);

      setStats([
        fmtCount(totalClientsRes.count ?? null),   // 1 Toplam Danışan
        isoToTR(lastClientDate),                    // 2 Son Kayıt
        fmtCount(thisMonthClientsRes.count ?? null),// 3 Bu Ay Yeni
        fmtCount(avg3m),                            // 4 Son 3 Ay Ort.
        fmtCount(thisMonthApptsRes.count ?? null),  // 5 Bu Ay Randevu
        isoToTR(nextApptDate),                      // 6 En Yakın Randevu
        fmtCount(thisWeekApptsRes.count ?? null),   // 7 Bu Hafta
        fmtCount(thisMonthCompletedRes.count ?? null), // 8 Bu Ay Tamamlanan
        fmtCount(thisYearApptsRes.count ?? null),   // 9 Bu Yıl Toplam
        fmtCount(thisYearClientsRes.count ?? null), // 10 Bu Yıl Danışan
      ]);
      setLoading(false);
    }

    void loadStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.10),transparent_30%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-4 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -bottom-24 -left-24 h-[480px] w-[480px] rounded-full bg-blue-400/14 blur-[160px]" />
        <div className="absolute -right-24 -top-16 h-[420px] w-[420px] rounded-full bg-pink-300/12 blur-[150px]" />
        <div className="absolute bottom-1/3 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-violet-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr] lg:items-start">
          {/* SOL KOLON */}
          <div className="flex flex-col gap-5">
            {/* Hero Header */}
            <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-6 py-5 shadow-lg sm:px-8">
              <CalendarCheck
                className="pointer-events-none absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-indigo-400 opacity-10"
                strokeWidth={1.25}
                aria-hidden
              />
              <div className="relative z-10">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700/85">
                  Yaşam Sistemi
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Danışan Yolculuğu
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-snug text-slate-600">
                  Danışan sürecinizi üç ana klasörde yönetin: yeni kayıt, danışan listesi ve takip &amp; ajanda.
                </p>
              </div>
            </header>

            {/* Hızlı İşlemler */}
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Hızlı İşlemler</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Danışan yönetimi için üç ana klasöre hızlıca erişin.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {journeyFolders.map((folder) => {
                  const { Icon, DecorIcon } = folder;
                  return (
                    <Link
                      key={folder.title}
                      href={folder.href}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${folder.border} ${folder.cardGradient}`}
                    >
                      <DecorIcon
                        className={`pointer-events-none absolute -bottom-3 -right-3 h-28 w-28 ${folder.decorColor} opacity-10`}
                        strokeWidth={1.25}
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md ${folder.iconBox}`}
                          >
                            <Icon className="h-5 w-5" strokeWidth={2} />
                          </div>
                          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                            {folder.badge}
                          </span>
                        </div>
                        <h3 className="mt-3.5 text-xl font-black text-slate-900">
                          {folder.title}
                        </h3>
                        <p className="mt-1.5 text-[13px] leading-snug text-slate-600">
                          {folder.desc}
                        </p>
                        <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-slate-900/80 px-4 py-2 text-xs font-bold text-white shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:bg-slate-900">
                          Klasöre git
                          <span aria-hidden>→</span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          {/* SAĞ KOLON */}
          <aside>
            <div className="rounded-2xl border border-white/80 bg-white/90 p-6 shadow-lg">
              <div>
                <h2 className="text-2xl font-black text-slate-950">Genel Özet</h2>
                <p className="mt-1 text-sm font-medium leading-snug text-slate-600">
                  Danışan ve randevu süreçlerinizin anonim genel görünümü.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {STAT_CARD_DEFS.map((def, i) => (
                  <SummaryStatCard
                    key={def.label}
                    {...def}
                    value={stats[i]}
                    loading={loading}
                  />
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm">
                  <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">Gizlilik Önceliğimiz</p>
                  <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">
                    Kişisel bilgiler bu ekranda gösterilmez.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
