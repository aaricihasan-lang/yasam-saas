"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
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

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("yasam_user");

    if (savedUser) {
      router.replace("/dashboard");
    }
  }, [router]);

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

    const loggedUser: User = data[0];

    localStorage.setItem("yasam_user", JSON.stringify(loggedUser));
    setMessage("");
    setLoading(false);
    setLoginModalOpen(false);
    router.push("/dashboard");
  };

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

        <section className="relative z-10 grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_560px] lg:items-start">
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

        <section className="relative z-10 grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
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

        <section className="relative z-10 grid shrink-0 grid-cols-2 gap-0 overflow-hidden rounded-[18px] border border-white/80 bg-white/72 shadow-[0_14px_38px_rgba(15,23,42,0.05)] backdrop-blur-xl md:grid-cols-3 xl:grid-cols-6">
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
