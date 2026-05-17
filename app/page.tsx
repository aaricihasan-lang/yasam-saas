"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Calendar,
  Compass,
  Gem,
  Hash,
  Leaf,
  Rocket,
  Sparkles,
  Users,
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
  accent: string;
  border: string;
  iconWrap: string;
  surface: string;
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
    Icon: Compass,
    theme: {
      accent: "bg-blue-500",
      border: "border-l-blue-500",
      iconWrap: "from-blue-500 to-indigo-600",
      surface: "from-blue-50/90 via-white to-white",
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
      accent: "bg-teal-500",
      border: "border-l-teal-500",
      iconWrap: "from-teal-500 to-cyan-600",
      surface: "from-teal-50/90 via-white to-white",
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
      accent: "bg-emerald-500",
      border: "border-l-emerald-500",
      iconWrap: "from-emerald-500 to-green-600",
      surface: "from-emerald-50/90 via-white to-white",
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
      accent: "bg-purple-500",
      border: "border-l-purple-500",
      iconWrap: "from-purple-500 to-fuchsia-600",
      surface: "from-purple-50/90 via-white to-white",
    },
  },
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi",
    count: "Aktif",
    badge: "YENİ",
    href: "/dashboard/kisisel-arsiv",
    Icon: Archive,
    theme: {
      accent: "bg-orange-500",
      border: "border-l-orange-500",
      iconWrap: "from-orange-500 to-amber-600",
      surface: "from-orange-50/90 via-white to-white",
    },
  },
  {
    title: "Numeroloji",
    desc: "Analiz, rapor ve kişisel yorum alanı",
    count: "Aktif",
    badge: "Plan",
    href: "/numeroloji",
    Icon: Hash,
    theme: {
      accent: "bg-indigo-500",
      border: "border-l-indigo-500",
      iconWrap: "from-indigo-500 to-violet-600",
      surface: "from-indigo-50/90 via-white to-white",
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

  const todayText = useMemo(() => {
    return new Date().toLocaleDateString("tr-TR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
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
      <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 text-slate-900 antialiased">
        <div
          className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] bg-cyan-200/20 blur-[140px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] bg-purple-300/20 blur-[140px]"
          aria-hidden
        />

        <section className="relative z-10 mx-auto w-full max-w-[1800px] px-3 py-5 md:px-6 lg:px-8">
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl md:p-8">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                {todayText}
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Hoş geldin, {user.name} ✨
              </h1>
              <p className="mt-2 text-base text-slate-600">
                Çalışma alanlarını buradan yönetebilir, modüllere hızlıca geçebilirsin.
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
            >
              Çıkış Yap
            </button>
          </header>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { Icon: Users, title: "Danışan", value: "Aktif", desc: "Kayıt ve takip" },
              { Icon: Calendar, title: "Ajanda", value: "Aktif", desc: "Randevu sistemi" },
              { Icon: Gem, title: "Doğaltaş", value: "Aktif", desc: "Modül hazır" },
              { Icon: Rocket, title: "Sistem", value: "Online", desc: "Web bağlantısı" },
            ].map(({ Icon, title, value, desc }) => (
              <div
                key={title}
                className="min-h-[165px] rounded-3xl border border-white/80 bg-white/80 p-8 shadow-[0_12px_32px_rgba(15,23,42,0.05)] backdrop-blur-sm"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 shadow-md">
                  <Icon className="h-8 w-8 text-slate-700" strokeWidth={2} />
                </div>
                <div className="mt-4 text-xl font-bold text-slate-900">{value}</div>
                <div className="mt-1 text-base font-semibold text-slate-800">{title}</div>
                <div className="mt-1 text-base text-slate-500">{desc}</div>
              </div>
            ))}
          </div>

          <section className="mt-8 rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl md:p-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Modüller</h2>
              <p className="mt-2 text-base text-slate-600">
                Yaşam Sistemi içindeki ana çalışma alanları.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
              {dashboardModules.map((item) => {
                const isReady = item.href !== "#";
                const { Icon, theme } = item;

                const card = (
                  <div
                    className={`group relative min-h-[230px] overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br p-8 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-300 ${theme.surface} ${theme.border} border-l-4 ${
                      isReady
                        ? "cursor-pointer hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl"
                        : "cursor-default opacity-90"
                    }`}
                  >
                    <div className={`absolute inset-x-8 top-0 h-1 rounded-full ${theme.accent}`} />

                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.iconWrap} text-white shadow-md`}
                      >
                        <Icon className="h-8 w-8" strokeWidth={2} />
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="mt-5 text-2xl font-bold text-slate-900">{item.title}</h3>

                    <p className="mt-2 text-base leading-relaxed text-slate-600">{item.desc}</p>

                    <div className="mt-5">
                      <span className="inline-flex rounded-full bg-green-100 px-4 py-1 text-sm font-semibold text-green-700">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );

                return isReady ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="block text-inherit no-underline"
                  >
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
