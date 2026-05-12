"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

type ModuleCard = {
  title: string;
  icon: string;
  desc: string;
  count: string;
  badge: string;
  href: string;
};

const modules: ModuleCard[] = [
  {
    title: "Danışanlar",
    icon: "👥",
    desc: "Danışan kayıtları, detaylar, notlar ve takip sistemi.",
    count: "Aktif",
    badge: "Ana Modül",
    href: "/dashboard/clients",
  },
  {
    title: "Ajanda",
    icon: "📅",
    desc: "Randevu, seans planlama ve günlük takip ekranı.",
    count: "Aktif",
    badge: "Takip",
    href: "/dashboard/ajanda",
  },
  {
    title: "Doğaltaş",
    icon: "💎",
    desc: "Taş, mineral ve danışan eşleştirme alanı.",
    count: "Aktif",
    badge: "Modül",
    href: "/dogaltas",
  },
  {
    title: "Numeroloji",
    icon: "🔢",
    desc: "Analiz, rapor ve kişisel yorum alanı.",
    count: "Yakında",
    badge: "Plan",
    href: "#",
  },
  {
    title: "Refleksoloji",
    icon: "🦶",
    desc: "Protokoller, atlas ve uygulama notları.",
    count: "Yakında",
    badge: "Plan",
    href: "#",
  },
  {
    title: "Aromaterapi",
    icon: "🌿",
    desc: "Yağlar, karışımlar ve kullanım rehberi.",
    count: "Planlandı",
    badge: "Sırada",
    href: "#",
  },
];

const summaryCards = [
  ["👥", "Danışan", "Aktif", "Kayıt ve takip"],
  ["📅", "Ajanda", "Aktif", "Randevu sistemi"],
  ["💎", "Doğaltaş", "Aktif", "Modül hazır"],
  ["🚀", "Sistem", "Online", "Web bağlantısı"],
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("yasam_user");

    if (!savedUser) {
      router.replace("/");
      return;
    }

    try {
      setUser(JSON.parse(savedUser));
    } catch {
      localStorage.removeItem("yasam_user");
      router.replace("/");
    }
  }, [router]);

  const todayText = useMemo(() => {
    return new Date().toLocaleDateString("tr-TR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, []);

  const logout = () => {
    localStorage.removeItem("yasam_user");
    router.replace("/");
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Panel hazırlanıyor...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7fbff_0%,#f5f1ff_48%,#f5fff8_100%)] p-4 text-slate-950 lg:p-5">
      <section className="mx-auto max-w-[1280px]">
        <header className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
          <div className="pointer-events-none absolute right-[-90px] top-[-120px] h-[260px] w-[260px] rounded-full bg-violet-200/40 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-130px] left-[15%] h-[240px] w-[240px] rounded-full bg-cyan-200/30 blur-3xl" />

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600">
                {todayText}
              </div>

              <h1 className="mt-4 text-[28px] font-black tracking-tight text-slate-950 md:text-[34px]">
                Hoş geldin, {user.name || user.email} ✨
              </h1>

              <p className="mt-2 max-w-[720px] text-sm leading-6 text-slate-600">
                Yaşam Sistemi çalışma panelinden danışanlarını, randevularını ve aktif modüllerini yönetebilirsin.
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Çıkış Yap
            </button>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryCards.map(([icon, title, value, desc]) => (
            <div
              key={title}
              className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.055)] backdrop-blur-xl"
            >
              <div className="text-2xl">{icon}</div>
              <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
              <div className="mt-1 text-sm font-black text-slate-900">{title}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{desc}</div>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-950">Modüller</h2>
              <p className="mt-1 text-sm text-slate-500">
                Aktif çalışma alanların ve sıradaki geliştirme modülleri.
              </p>
            </div>

            <div className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
              SaaS Panel Aktif
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((item) => {
              const isReady = item.href !== "#";

              const card = (
                <div
                  className={`h-full rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-5 shadow-[0_12px_32px_rgba(15,23,42,0.045)] transition ${
                    isReady ? "hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]" : "opacity-80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-3xl">{item.icon}</div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="mt-5 text-xl font-black text-slate-950">{item.title}</h3>
                  <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-600">{item.desc}</p>

                  <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-slate-800 ring-1 ring-slate-100">
                    {item.count}
                  </div>
                </div>
              );

              return isReady ? (
                <Link key={item.title} href={item.href} className="text-inherit no-underline">
                  {card}
                </Link>
              ) : (
                <div key={item.title}>{card}</div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
