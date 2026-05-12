"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  tenant_id: string;
  name?: string;
  email: string;
  role?: string;
  status?: string;
};

type DashboardModule = {
  title: string;
  icon: string;
  desc: string;
  href: string;
  status: string;
  badge: string;
  active: boolean;
};

const modules: DashboardModule[] = [
  {
    title: "Danışanlar",
    icon: "👥",
    desc: "Danışan kayıtları, detaylar, notlar ve takip sistemi.",
    href: "/dashboard/clients",
    status: "Aktif",
    badge: "Ana Modül",
    active: true,
  },
  {
    title: "Ajanda",
    icon: "📅",
    desc: "Randevu, seans planlama ve günlük takip alanı.",
    href: "/dashboard/ajanda",
    status: "Aktif",
    badge: "Takip",
    active: true,
  },
  {
    title: "Doğaltaş",
    icon: "💎",
    desc: "Taş, mineral ve danışan eşleştirme sistemi.",
    href: "/dogaltas",
    status: "Aktif",
    badge: "Modül",
    active: true,
  },
  {
    title: "Numeroloji",
    icon: "🔢",
    desc: "Analiz, rapor ve kişisel yorum alanı.",
    href: "#",
    status: "Yakında",
    badge: "Plan",
    active: false,
  },
  {
    title: "Refleksoloji",
    icon: "🦶",
    desc: "Protokoller, atlas ve uygulama notları.",
    href: "#",
    status: "Yakında",
    badge: "Plan",
    active: false,
  },
  {
    title: "Aromaterapi",
    icon: "🌿",
    desc: "Yağlar, karışımlar ve kullanım rehberi.",
    href: "#",
    status: "Planlandı",
    badge: "Sırada",
    active: false,
  },
];

const quickStats = [
  { icon: "👥", value: "Aktif", label: "Danışan", desc: "Kayıt ve takip" },
  { icon: "📅", value: "Aktif", label: "Ajanda", desc: "Randevu sistemi" },
  { icon: "💎", value: "Aktif", label: "Doğaltaş", desc: "Modül hazır" },
  { icon: "🚀", value: "Online", label: "Sistem", desc: "Web bağlantısı" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

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
      return;
    }

    setReady(true);
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

  if (!ready || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_45%,#fdf2f8_100%)] text-slate-950">
        <div className="rounded-3xl border border-white/80 bg-white/80 px-8 py-6 text-sm font-black text-slate-600 shadow-xl backdrop-blur-xl">
          Panel hazırlanıyor...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_45%,#fdf2f8_100%)] text-slate-950">
      <div className="pointer-events-none fixed left-[-120px] top-[-130px] h-[330px] w-[330px] rounded-full bg-violet-200/40 blur-3xl" />
      <div className="pointer-events-none fixed right-[-120px] top-[120px] h-[360px] w-[360px] rounded-full bg-cyan-200/35 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-150px] left-[35%] h-[320px] w-[320px] rounded-full bg-fuchsia-200/30 blur-3xl" />

      <section className="relative z-10 mx-auto grid min-h-screen max-w-[1460px] grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[250px_1fr] lg:px-7">
        <aside className="hidden rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-500 text-xl text-white shadow-xl shadow-violet-200">
              ✨
            </div>
            <div>
              <div className="text-[13px] font-black tracking-[0.18em]">YAŞAM</div>
              <div className="text-[11px] font-black tracking-[0.18em]">SİSTEMİ</div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-100 bg-white/70 p-3">
            <div className="text-[11px] font-black text-slate-400">KULLANICI</div>
            <div className="mt-1 truncate text-sm font-black text-slate-950">
              {user.name || user.email}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">
              {user.email}
            </div>
          </div>

          <nav className="mt-5 space-y-2">
            <Link href="/dashboard" className="flex items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200">
              🏠 Ana Panel
            </Link>
            <Link href="/dashboard/clients" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-white/80">
              👥 Danışanlar
            </Link>
            <Link href="/dashboard/ajanda" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-white/80">
              📅 Ajanda
            </Link>
            <Link href="/dogaltas" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-white/80">
              💎 Doğaltaş
            </Link>
          </nav>

          <button
            type="button"
            onClick={logout}
            className="mt-auto rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 py-3 text-sm font-black text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5"
          >
            Çıkış Yap
          </button>
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          <header className="rounded-[28px] border border-white/80 bg-white/76 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-500">
                  {todayText}
                </div>
                <h1 className="mt-3 text-[27px] font-black tracking-tight text-slate-950 md:text-[32px]">
                  Hoş geldin, {user.name || user.email} ✨
                </h1>
                <p className="mt-2 max-w-[760px] text-sm leading-6 text-slate-500">
                  Yaşam Sistemi çalışma alanlarını buradan yönetebilir, aktif modüllere hızlıca geçebilirsin.
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

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {quickStats.map((item) => (
              <div
                key={item.label}
                className="rounded-[24px] border border-white/80 bg-white/72 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] backdrop-blur-xl"
              >
                <div className="text-xl">{item.icon}</div>
                <div className="mt-3 text-[21px] font-black text-slate-950">{item.value}</div>
                <div className="mt-1 text-sm font-black text-slate-900">{item.label}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{item.desc}</div>
              </div>
            ))}
          </section>

          <section className="flex-1 rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-black tracking-tight text-slate-950">Modüller</h2>
                <p className="mt-1 text-sm text-slate-500">Aktif çalışma alanları ve sıradaki modüller.</p>
              </div>
              <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                Sistem Online
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((item) => {
                const card = (
                  <div
                    className={`h-full rounded-[24px] border p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition ${
                      item.active
                        ? "border-white/90 bg-gradient-to-br from-white/95 to-slate-50/80 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]"
                        : "border-white/70 bg-white/48 opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 text-lg text-white shadow-lg shadow-violet-200">
                        {item.icon}
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="mt-4 text-[20px] font-black text-slate-950">{item.title}</h3>
                    <p className="mt-2 min-h-[42px] text-sm leading-6 text-slate-500">{item.desc}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className={`text-sm font-black ${item.active ? "text-emerald-700" : "text-slate-500"}`}>
                        {item.status}
                      </span>
                      <span className="text-sm font-black text-slate-400">→</span>
                    </div>
                  </div>
                );

                return item.active ? (
                  <Link key={item.title} href={item.href} className="text-inherit no-underline">
                    {card}
                  </Link>
                ) : (
                  <div key={item.title}>{card}</div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
