"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChartColumn,
  FolderArchive,
  Gem,
  Leaf,
  Package,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

type ModuleTheme = {
  iconWrap: string;
  cardBg: string;
  border: string;
};

type ModuleCard = {
  title: string;
  desc: string;
  count: string;
  badge: string;
  href: string;
  Icon: LucideIcon;
  theme: ModuleTheme;
};

type LandingModule = {
  title: string;
  desc: string;
  icon: string;
};

type FeatureItem = {
  title: string;
  desc: string;
  icon: string;
};

const landingModules: LandingModule[] = [
  {
    title: "Numeroloji",
    desc: "Profesyonel numeroloji analizleri ve danışan kayıt sistemi.",
    icon: "🔢",
  },
  {
    title: "Doğaltaş",
    desc: "Taş, mineral, kombinasyon ve enerji eşleştirme altyapısı.",
    icon: "💎",
  },
  {
    title: "Biyoenerji",
    desc: "Enerji bedenleri, çakra ve analiz süreç yönetimi.",
    icon: "✨",
  },
  {
    title: "Refleksoloji",
    desc: "Refleksoloji kayıtları ve profesyonel seans sistemi.",
    icon: "🦶",
  },
  {
    title: "Aromaterapi",
    desc: "Uçucu yağ, sabit yağ ve karışım yönetim sistemi.",
    icon: "🌿",
  },
  {
    title: "Danışan Yönetimi",
    desc: "Danışan kayıtları, notlar, analizler ve randevu sistemi.",
    icon: "👥",
  },
];

const featureItems: FeatureItem[] = [
  {
    title: "Güvenli & Gizli",
    desc: "Verileriniz kontrollü kullanım yapısında korunur.",
    icon: "🔒",
  },
  {
    title: "Analiz & Raporlama",
    desc: "Detaylı analiz ve raporlama alanları.",
    icon: "📈",
  },
  {
    title: "Randevu Yönetimi",
    desc: "Seans takibi ve planlama sistemi.",
    icon: "📅",
  },
  {
    title: "Mobil Uyumlu",
    desc: "Telefon, tablet ve bilgisayar uyumu.",
    icon: "📱",
  },
  {
    title: "Modüler Yapı",
    desc: "İhtiyaca göre genişleyen çalışma alanları.",
    icon: "🧩",
  },
  {
    title: "Yedekleme",
    desc: "Düzenli takip ve veri güvenliği yaklaşımı.",
    icon: "☁️",
  },
];

const dashboardModules: ModuleCard[] = [
  {
    title: "Danışan Yolculuğu",
    desc: "Danışan kayıtları, randevu ve seans takibi tek merkezde",
    count: "Aktif",
    badge: "Ana Modül",
    href: "/danisan-yolculugu",
    Icon: UsersRound,
    theme: {
      iconWrap: "from-indigo-500 to-blue-600",
      cardBg: "from-blue-100/90 via-sky-50/95 to-white",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Doğaltaş",
    desc: "Taş, mineral ve danışan eşleştirmeleri",
    count: "Aktif",
    badge: "Modül",
    href: "/dogaltas",
    Icon: Gem,
    theme: {
      iconWrap: "from-cyan-500 to-teal-500",
      cardBg: "from-cyan-100/90 via-teal-50/95 to-white",
      border: "border-teal-200/70",
    },
  },
  {
    title: "Ürün & Stok Merkezi",
    desc: "Tüm ürünler, stok, satış ve fiyatlandırma merkezi",
    count: "Aktif",
    badge: "Modül",
    href: "/urun-stok",
    Icon: Package,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-100/90 via-orange-50/95 to-white",
      border: "border-amber-200/70",
    },
  },
  {
    title: "Şifa Rehberi",
    desc: "Rahatsızlık bazlı bütünsel destek rehberi",
    count: "Aktif",
    badge: "Modül",
    href: "/sifa-rehberi",
    Icon: Leaf,
    theme: {
      iconWrap: "from-green-500 to-emerald-500",
      cardBg: "from-emerald-100/90 via-green-50/95 to-white",
      border: "border-emerald-200/70",
    },
  },
  {
    title: "Enerji & Beden",
    desc: "Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları",
    count: "Aktif",
    badge: "Modül",
    href: "/enerji-beden",
    Icon: Sparkles,
    theme: {
      iconWrap: "from-fuchsia-500 to-violet-600",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi",
    count: "Aktif",
    badge: "YENİ",
    href: "/dashboard/kisisel-arsiv",
    Icon: FolderArchive,
    theme: {
      iconWrap: "from-orange-500 to-amber-500",
      cardBg: "from-orange-100/90 via-amber-50/95 to-white",
      border: "border-orange-200/70",
    },
  },
  {
    title: "Numeroloji",
    desc: "Analiz, rapor ve kişisel yorum alanı",
    count: "Aktif",
    badge: "Plan",
    href: "/numeroloji",
    Icon: ChartColumn,
    theme: {
      iconWrap: "from-violet-500 to-indigo-600",
      cardBg: "from-indigo-100/90 via-violet-50/95 to-white",
      border: "border-indigo-200/70",
    },
  },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("yasam_user");
    if (!savedUser) return;

    runInEffect(() => {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("yasam_user");
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setMessage("Email ve şifre giriniz.");
      return;
    }

    setLoading(true);
    setMessage("Giriş yapılıyor...");

    const { data, error } = await supabase.rpc("login_user", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.log(error);
      setMessage("Sistem hatası oluştu.");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("Email veya şifre hatalı.");
      setLoading(false);
      return;
    }

    const loggedUser = data[0];

    localStorage.setItem("yasam_user", JSON.stringify(loggedUser));
    setUser(loggedUser);
    setLoginModalOpen(false);
    setMessage("");
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("yasam_user");
    setUser(null);
    setEmail("");
    setPassword("");
    setMessage("");
  };

  if (user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
        <div
          className="pointer-events-none absolute -left-[300px] bottom-[-250px] h-[900px] w-[900px] rounded-full bg-blue-400/20 blur-[180px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-[250px] top-[20%] h-[800px] w-[800px] rounded-full bg-fuchsia-300/18 blur-[180px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-[40%] top-[30%] h-[600px] w-[600px] rounded-full bg-violet-300/10 blur-[170px]"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute left-8 top-10 h-24 w-24 rounded-full bg-white/30 backdrop-blur-sm"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-24 top-28 h-16 w-16 rounded-full bg-white/30 backdrop-blur-sm"
          aria-hidden
        />
        <svg
          className="pointer-events-none absolute bottom-0 left-0 h-[42%] w-[38%] opacity-[0.06] text-indigo-400"
          viewBox="0 0 420 320"
          fill="none"
          aria-hidden
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={i * 64}
              x2="420"
              y2={i * 64}
              stroke="currentColor"
              strokeWidth="0.75"
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line
              key={`v-${i}`}
              x1={i * 70}
              y1="0"
              x2={i * 70}
              y2="320"
              stroke="currentColor"
              strokeWidth="0.75"
            />
          ))}
          {[
            [40, 48],
            [110, 120],
            [180, 72],
            [250, 160],
            [320, 88],
            [70, 200],
            [200, 240],
            [350, 200],
          ].map(([cx, cy], i) => (
            <circle key={`dot-${i}`} cx={cx} cy={cy} r="2.5" fill="currentColor" />
          ))}
        </svg>

        <svg
          className="pointer-events-none absolute bottom-8 right-0 h-[38%] w-[42%] opacity-[0.07] text-violet-400"
          viewBox="0 0 480 300"
          fill="none"
          aria-hidden
        >
          <line x1="60" y1="220" x2="180" y2="140" stroke="currentColor" strokeWidth="0.8" />
          <line x1="180" y1="140" x2="320" y2="180" stroke="currentColor" strokeWidth="0.8" />
          <line x1="320" y1="180" x2="420" y2="80" stroke="currentColor" strokeWidth="0.8" />
          <line x1="180" y1="140" x2="240" y2="260" stroke="currentColor" strokeWidth="0.8" />
          <line x1="240" y1="260" x2="380" y2="240" stroke="currentColor" strokeWidth="0.8" />
          <line x1="120" y1="60" x2="180" y2="140" stroke="currentColor" strokeWidth="0.8" />
          {[
            [60, 220],
            [180, 140],
            [320, 180],
            [420, 80],
            [240, 260],
            [380, 240],
            [120, 60],
          ].map(([cx, cy], i) => (
            <circle key={`node-${i}`} cx={cx} cy={cy} r="3" fill="currentColor" />
          ))}
        </svg>

        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.12]"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M0 95 C 240 40, 480 110, 720 70 C 960 30, 1200 90, 1440 55 L 1440 120 L 0 120 Z"
            fill="url(#home-bottom-glow)"
          />
          <defs>
            <linearGradient id="home-bottom-glow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(99,102,241,0)" />
              <stop offset="35%" stopColor="rgba(129,140,248,0.35)" />
              <stop offset="65%" stopColor="rgba(217,70,239,0.3)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0)" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 mx-auto flex h-screen w-full max-w-[1800px] flex-col px-6 pt-3 pb-4 lg:px-10 lg:pt-4 xl:px-14">
          <div
            className="relative w-full shrink-0 overflow-hidden rounded-[32px] border border-white/30 bg-gradient-to-r from-indigo-950 via-violet-700 to-fuchsia-500 px-6 py-8 text-white shadow-[0_30px_90px_rgba(79,70,229,0.22)] sm:px-8 sm:py-9 lg:py-10"
            aria-label="Uzman ve kurum profili"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 animate-pulse rounded-full bg-white/15 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 left-1/4 h-28 w-56 animate-pulse rounded-full bg-fuchsia-300/20 blur-2xl [animation-delay:700ms]"
              aria-hidden
            />

            <button
              type="button"
              onClick={logout}
              className="absolute right-4 top-4 z-10 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition hover:bg-white/20 sm:right-6 sm:top-5"
            >
              Çıkış Yap
            </button>

            <div className="relative flex flex-col gap-6 pr-20 sm:flex-row sm:items-center sm:gap-8 sm:pr-28">
                <div
                  className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-[5px] border-yellow-300/85 bg-slate-950/85 text-7xl font-light text-yellow-200 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ring-2 ring-yellow-200/25 sm:h-36 sm:w-36 sm:text-8xl"
                  aria-hidden
                >
                  H
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-black leading-tight sm:text-3xl lg:text-[2.35rem] lg:leading-tight">
                    Bütüncül Yaşam Analiz Platformu
                  </h1>

                  <p className="mt-2 text-3xl font-black tracking-tight text-yellow-300 sm:text-4xl lg:text-[2.75rem]">
                    Hasan ARICI
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/90 sm:text-base">
                    Doğaltaş • Enerji • Akademi
                  </p>
                </div>
            </div>
          </div>

          <section className="mt-3 flex min-h-0 flex-1 flex-col">
            <div className="mb-2 shrink-0">
              <h2 className="text-lg font-black tracking-tight text-slate-900 lg:text-xl">
                Modüller
              </h2>
              <p className="text-xs text-slate-600 lg:text-sm">
                Yaşam Sistemi içindeki ana çalışma alanları.
              </p>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
              {dashboardModules.map((item) => {
                const isReady = item.href !== "#";
                const { Icon, theme } = item;

                const card = (
                  <div
                    className={`group relative flex min-h-[170px] flex-col rounded-[28px] border bg-gradient-to-br p-6 shadow-[0_22px_55px_rgba(15,23,42,0.10)] transition-all duration-300 ${theme.cardBg} ${theme.border} ${
                      isReady
                        ? "cursor-pointer hover:-translate-y-1 hover:shadow-2xl"
                        : "cursor-default opacity-90"
                    }`}
                  >

                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-all duration-300 group-hover:scale-110 ${theme.iconWrap}`}
                      >
                        <Icon className="h-8 w-8" strokeWidth={2.25} />
                      </div>

                      <span className="rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="mt-3 text-xl font-black text-slate-900 lg:text-2xl">
                      {item.title}
                    </h3>

                    <p className="mt-1 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-700 lg:text-base">
                      {item.desc}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/80">
                        {item.count}
                      </span>

                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition group-hover:scale-105 ${
                          isReady ? "" : "opacity-50"
                        }`}
                        aria-hidden
                      >
                        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    </div>
                  </div>
                );

                return isReady ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="block h-full text-inherit no-underline"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={item.title} className="h-full">
                    {card}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_46%,#fdf2f8_100%)] text-slate-950">
      <div className="relative mx-auto flex h-screen max-w-[1540px] flex-col justify-between px-5 py-2 lg:px-7 lg:py-3">
        <div className="pointer-events-none absolute left-[-130px] top-[-150px] h-[330px] w-[330px] rounded-full bg-violet-200/38 blur-3xl" />
        <div className="pointer-events-none absolute right-[-110px] top-[70px] h-[360px] w-[360px] rounded-full bg-cyan-200/36 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-150px] left-[30%] h-[310px] w-[310px] rounded-full bg-fuchsia-200/28 blur-3xl" />

        <header className="relative z-10 flex shrink-0 items-center justify-between rounded-[20px] border border-white/75 bg-white/70 px-5 py-2.5 shadow-[0_14px_42px_rgba(15,23,42,0.055)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-500 text-lg text-white shadow-xl shadow-violet-200">
              ✨
            </div>

            <div>
              <h1 className="text-[13px] font-black tracking-[0.20em] text-slate-950 lg:text-[15px]">
                YAŞAM SİSTEMİ
              </h1>

              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Profesyonel bütünsel yönetim platformu
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
              💻 Offline Kullanım
            </div>

            <div className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700">
              ☁️ Web & Mobil Destek
            </div>

          </div>
        </header>

        <section className="relative z-10 mt-3 grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_560px] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/76 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">
              ✨ Profesyonel danışmanlık yönetim sistemi
            </div>

            <h2 className="mt-3 max-w-[760px] text-[27px] font-black leading-[1.05] tracking-tight text-slate-950 md:text-[33px] lg:text-[37px]">
              Profesyonel danışmanlar için geliştirilmiş bütünsel yönetim ve analiz platformu.
            </h2>

            <p className="mt-2.5 max-w-[690px] text-[13px] leading-6 text-slate-600">
              Numeroloji, doğaltaş, biyoenerji, refleksoloji, aromaterapi,
              danışan yönetimi, seans takibi ve analiz sistemleri tek merkezde birleşir.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="inline-flex items-center rounded-2xl border border-white/75 bg-white/78 px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm backdrop-blur">
                💻 Offline & Web destekli profesyonel sistem
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:mt-1">
            <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-violet-500/18 via-fuchsia-400/18 to-cyan-400/18 blur-2xl" />

            <div className="relative rounded-[22px] border border-white/75 bg-white/78 p-3 shadow-[0_18px_52px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
              <div className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-black text-violet-700">
                Çalışma Seçenekleri
              </div>

              <h3 className="mt-2 text-[19px] font-black leading-tight text-slate-950">
                Size uygun kullanım modeli
              </h3>

              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                Masaüstü ya da web/mobil çalışma modelini seçebilirsiniz.
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2.5">
                  <div className="text-[13px] font-black text-emerald-700">
                    💻 Offline Masaüstü
                  </div>
                  <div className="mt-1 text-[10px] font-semibold leading-4 text-emerald-700">
                    İnternetsiz kullanım, lokal veri, gizlilik odaklı çalışma.
                  </div>
                </div>

                <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2.5">
                  <div className="text-[13px] font-black text-cyan-700">
                    ☁️ Web & Mobil
                  </div>
                  <div className="mt-1 text-[10px] font-semibold leading-4 text-cyan-700">
                    Telefon, tablet ve bilgisayardan erişilebilir çalışma alanı.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setLoginModalOpen(true);
                }}
                className="mt-2.5 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 py-2.5 text-[13px] font-black text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5"
              >
                Uzman Paneline Gir →
              </button>
            </div>
          </div>
        </section>

        <section className="relative z-10 mt-0 grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {landingModules.map((item) => (
            <div
              key={item.title}
              className="min-h-[112px] rounded-[16px] border border-white/80 bg-white/72 p-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.045)] backdrop-blur-xl transition hover:-translate-y-1"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 text-base text-white shadow-lg shadow-violet-200">
                {item.icon}
              </div>

              <h3 className="mt-2.5 text-[14px] font-black text-slate-950">
                {item.title}
              </h3>

              <p className="mt-1.5 text-[11px] leading-4 text-slate-600">
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        <section className="relative z-10 mt-0 grid shrink-0 grid-cols-2 gap-0 overflow-hidden rounded-[18px] border border-white/80 bg-white/72 shadow-[0_14px_38px_rgba(15,23,42,0.05)] backdrop-blur-xl md:grid-cols-3 xl:grid-cols-6">
          {featureItems.map((item, index) => (
            <div
              key={item.title}
              className={`flex items-start gap-2 p-2.5 ${
                index !== featureItems.length - 1 ? "xl:border-r xl:border-slate-200/70" : ""
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl bg-white text-base shadow-sm ring-1 ring-slate-100">
                {item.icon}
              </div>

              <div>
                <h4 className="text-[11px] font-black text-slate-950">
                  {item.title}
                </h4>

                <p className="mt-1 text-[10px] leading-4 text-slate-600">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </section>

        <footer className="relative z-10 py-1.5 text-center text-[11px] font-semibold text-slate-500">
          © 2026 Yaşam Sistemi. Tüm hakları saklıdır.
        </footer>
      </div>

      {loginModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
          onClick={() => setLoginModalOpen(false)}
        >
          <div
            className="relative w-full max-w-[420px] overflow-hidden rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[180px] w-[180px] rounded-full bg-violet-200/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] h-[180px] w-[180px] rounded-full bg-cyan-200/50 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                  Uzman Paneli
                </div>

                <h3 className="mt-4 text-3xl font-black text-slate-950">
                  Giriş Yap
                </h3>

                <p className="mt-2 text-sm leading-7 text-slate-500">
                  Yetkili hesabınızla giriş yaparak çalışma panelinize ulaşabilirsiniz.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            <div className="relative z-10 mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">
                  E-Posta
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="uzman@test.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">
                  Şifre
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="relative z-10 mt-6 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 py-3.5 text-sm font-black text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Giriş Yapılıyor..." : "Uzman Paneline Gir →"}
            </button>

            {message && (
              <div className="relative z-10 mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
