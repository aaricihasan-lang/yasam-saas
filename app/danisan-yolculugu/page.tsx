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
  ContactRound,
  ListFilter,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { DEMO_CLIENTS } from "@/lib/demo/demoClients";
import { readDemoClients } from "@/lib/demo/demoSession";
import { DanisanSectionShell } from "@/app/danisan-yolculugu/components/DanisanSectionShell";

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
  const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 1 — Toplam Danışan
  const total = clients.length;

  // 2 — Bu Ay Yeni (created_at bu ay)
  const thisMonthNew = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d >= startOfMonth && d < startOfNextMonth;
  }).length;

  // 3 — Son Kayıt (en yeni created_at)
  const lastCreated = clients
    .map((c) => c.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  // 4 — Bu Ay Randevu (demo: gorusme bu ay içinde)
  const thisMonthAppts = clients.filter((c) => {
    if (!c.gorusme) return false;
    const d = new Date(c.gorusme);
    return d >= startOfMonth && d < startOfNextMonth;
  }).length;

  // 5 — Bu Ay Tamamlanan (demo: gorusme bu ay ve geçmiş)
  const thisMonthCompleted = clients.filter((c) => {
    if (!c.gorusme) return false;
    const d = new Date(c.gorusme);
    return d >= startOfMonth && d < now;
  }).length;

  return [
    fmtCount(total),              // 1 Toplam Danışan
    fmtCount(thisMonthNew),       // 2 Bu Ay Yeni
    isoToTR(lastCreated),         // 3 Son Kayıt
    fmtCount(thisMonthAppts),     // 4 Bu Ay Randevu
    "—",                          // 5 En Yakın Randevu (demo'da randevu verisi yok)
    fmtCount(thisMonthCompleted), // 6 Bu Ay Tamamlanan
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

// Sade, premium palet: tek marka vurgusu (indigo). Renk yalnızca anlam taşıyorsa
// kullanılır — "Bu Ay Tamamlanan" olumlu/tamamlanmış anlamıyla emerald.
const ACCENT = {
  cardBg: "bg-white",
  border: "border-slate-200/80",
  iconBox: "bg-indigo-500 text-white",
} as const;

const STAT_CARD_DEFS: StatCardDef[] = [
  { label: "Toplam Danışan",   Icon: UsersRound,    ...ACCENT },
  { label: "Bu Ay Yeni",       Icon: UserPlus,      ...ACCENT },
  { label: "Son Kayıt",        Icon: CalendarDays,  ...ACCENT },
  { label: "Bu Ay Randevu",    Icon: CalendarClock, ...ACCENT },
  { label: "En Yakın Randevu", Icon: Activity,      ...ACCENT },
  {
    label: "Bu Ay Tamamlanan",
    Icon: CalendarCheck,
    cardBg: "bg-white",
    border: "border-slate-200/80",
    iconBox: "bg-emerald-500 text-white",
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
      className={`group relative z-0 flex flex-col justify-between gap-3 rounded-xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md 2xl:p-4 ${border} ${cardBg}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all duration-200 group-hover:scale-105 2xl:h-10 2xl:w-10 ${iconBox}`}
      >
        <Icon className="h-4 w-4 2xl:h-5 2xl:w-5" strokeWidth={2.25} aria-hidden />
      </div>
      <div>
        <p
          className={`text-2xl font-black tabular-nums leading-none tracking-tight text-slate-950 transition-all duration-300 2xl:text-[28px] ${
            loading ? "animate-pulse text-slate-300" : ""
          }`}
        >
          {loading ? "—" : value}
        </p>
        <p
          className="mt-1 truncate text-[11px] font-semibold leading-tight text-slate-600 sm:text-xs"
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
  // 6 stat değeri — yükleme öncesi "—"
  const [stats, setStats] = useState<string[]>(Array(6).fill("—"));
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

      const uid = readYasamUser()?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      const token = readSessionToken();
      const headers: Record<string, string> = {
        "x-user-id": uid,
        ...(token ? { "x-session-token": token } : {}),
      };

      const now = new Date();

      // Ay sınırları
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // Hafif özet endpoint'i — satırları indirmeden sunucuda sayım.
      // Ay sınırları + "şimdi" yerel saat diliminde hesaplanıp ISO gönderilir.
      const qs = new URLSearchParams({
        monthStart: startOfMonth.toISOString(),
        monthEnd: startOfNextMonth.toISOString(),
        now: now.toISOString(),
      });
      const res = await fetch(`/api/clients/stats?${qs.toString()}`, { headers });
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const json = (await res.json()) as {
        stats?: {
          totalClients: number;
          thisMonthClients: number;
          lastClientDate: string | null;
          thisMonthAppts: number;
          nextApptDate: string | null;
          thisMonthCompleted: number;
        };
      };
      if (cancelled) return;
      const s = json.stats;
      if (!s) {
        setLoading(false);
        return;
      }

      setStats([
        fmtCount(s.totalClients),          // 1 Toplam Danışan
        fmtCount(s.thisMonthClients),      // 2 Bu Ay Yeni
        isoToTR(s.lastClientDate),         // 3 Son Kayıt
        fmtCount(s.thisMonthAppts),        // 4 Bu Ay Randevu
        isoToTR(s.nextApptDate),           // 5 En Yakın Randevu
        fmtCount(s.thisMonthCompleted),    // 6 Bu Ay Tamamlanan
      ]);
      setLoading(false);
    }

    void loadStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.10),transparent_30%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-2 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -bottom-24 -left-24 h-[480px] w-[480px] rounded-full bg-blue-400/14 blur-[160px]" />
        <div className="absolute -right-24 -top-16 h-[420px] w-[420px] rounded-full bg-pink-300/12 blur-[150px]" />
        <div className="absolute bottom-1/3 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-violet-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1600px]">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr] lg:items-start lg:gap-6 2xl:gap-8">
          {/* SOL KOLON */}
          <div className="flex flex-col gap-5 2xl:gap-6">
            {/* Hero Header */}
            <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-4 py-5 shadow-lg sm:px-8">
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
            <DanisanSectionShell
              as="div"
              desktopClassName="sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/90 sm:p-6 sm:shadow-lg"
            >
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
            </DanisanSectionShell>
          </aside>
        </div>
      </div>
    </main>
  );
}
