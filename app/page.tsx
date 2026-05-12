"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
    title: "Danışanlar",
    icon: "👥",
    desc: "Danışan kayıtları, detaylar ve takip sistemi",
    count: "Aktif",
    badge: "Ana Modül",
    href: "/dashboard/clients",
  },
  {
    title: "Ajanda",
    icon: "📅",
    desc: "Randevu, seans planlama ve günlük takip",
    count: "Aktif",
    badge: "Takip",
    href: "/dashboard/ajanda",
  },
  {
    title: "Doğaltaş",
    icon: "💎",
    desc: "Taş, mineral ve danışan eşleştirmeleri",
    count: "Aktif",
    badge: "Modül",
    href: "/dogaltas",
  },
  {
    title: "Numeroloji",
    icon: "🔢",
    desc: "Analiz, rapor ve kişisel yorum alanı",
    count: "Yakında",
    badge: "Plan",
    href: "#",
  },
  {
    title: "Refleksoloji",
    icon: "🦶",
    desc: "Protokoller, atlas ve uygulama notları",
    count: "Yakında",
    badge: "Plan",
    href: "#",
  },
  {
    title: "Aromaterapi",
    icon: "🌿",
    desc: "Yağlar, karışımlar ve kullanım rehberi",
    count: "Planlandı",
    badge: "Sırada",
    href: "#",
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

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("yasam_user");
      }
    }
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
      <main
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(135deg,#f7fbff 0%,#f5f1ff 45%,#f5fff8 100%)",
          color: "#111827",
          padding: 14,
        }}
      >
        <section style={{ maxWidth: 1180, margin: "0 auto" }}>
          <header
            style={{
              background: "rgba(255,255,255,0.86)",
              border: "1px solid rgba(226,232,240,0.9)",
              borderRadius: 22,
              padding: 16,
              boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  color: "#64748b",
                  fontSize: 11,
                  fontWeight: 850,
                  marginBottom: 8,
                }}
              >
                {todayText}
              </div>

              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 950,
                  margin: 0,
                  letterSpacing: "-0.8px",
                }}
              >
                Hoş geldin, {user.name} ✨
              </h1>

              <p style={{ color: "#64748b", marginTop: 6, fontSize: 12 }}>
                Çalışma alanlarını buradan yönetebilir, modüllere hızlıca geçebilirsin.
              </p>
            </div>

            <button
              onClick={logout}
              style={{
                padding: "9px 13px",
                borderRadius: 13,
                border: "none",
                background: "#111827",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Çıkış Yap
            </button>
          </header>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {[
              ["👥", "Danışan", "Aktif", "Kayıt ve takip"],
              ["📅", "Ajanda", "Aktif", "Randevu sistemi"],
              ["💎", "Doğaltaş", "Aktif", "Modül hazır"],
              ["🚀", "Sistem", "Online", "Web bağlantısı"],
            ].map(([icon, title, value, desc]) => (
              <div
                key={title}
                style={{
                  background: "rgba(255,255,255,0.84)",
                  border: "1px solid rgba(226,232,240,0.9)",
                  borderRadius: 18,
                  padding: 14,
                  boxShadow: "0 12px 28px rgba(15,23,42,0.045)",
                }}
              >
                <div style={{ fontSize: 20 }}>{icon}</div>
                <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>
                  {value}
                </div>
                <div style={{ fontWeight: 900, marginTop: 2, fontSize: 12 }}>
                  {title}
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>

          <section
            style={{
              marginTop: 14,
              background: "rgba(255,255,255,0.84)",
              border: "1px solid rgba(226,232,240,0.9)",
              borderRadius: 22,
              padding: 16,
              boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 950 }}>
                Modüller
              </h2>

              <p style={{ color: "#64748b", marginTop: 5, fontSize: 12 }}>
                Yaşam Sistemi içindeki ana çalışma alanları.
              </p>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 10,
              }}
            >
              {dashboardModules.map((item) => {
                const isReady = item.href !== "#";

                const card = (
                  <div
                    style={{
                      background:
                        "linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))",
                      border: "1px solid #e5e7eb",
                      borderRadius: 18,
                      padding: 14,
                      minHeight: 116,
                      boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                      cursor: isReady ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 25 }}>{item.icon}</div>

                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          color: "#475569",
                          background: "#f1f5f9",
                          padding: "5px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {item.badge}
                      </span>
                    </div>

                    <h3 style={{ marginTop: 12, marginBottom: 5, fontSize: 16, fontWeight: 950 }}>
                      {item.title}
                    </h3>

                    <p style={{ color: "#64748b", margin: 0, fontSize: 12, lineHeight: 1.42 }}>
                      {item.desc}
                    </p>

                    <div style={{ marginTop: 10, fontWeight: 900, color: "#111827", fontSize: 11 }}>
                      {item.count}
                    </div>
                  </div>
                );

                return isReady ? (
                  <Link key={item.title} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
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
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_46%,#fdf2f8_100%)] text-slate-950">
      <div className="relative mx-auto flex min-h-screen max-w-[1540px] flex-col px-5 py-3 lg:px-7 lg:py-4">
        <div className="pointer-events-none absolute left-[-130px] top-[-150px] h-[330px] w-[330px] rounded-full bg-violet-200/38 blur-3xl" />
        <div className="pointer-events-none absolute right-[-110px] top-[70px] h-[360px] w-[360px] rounded-full bg-cyan-200/36 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-150px] left-[30%] h-[310px] w-[310px] rounded-full bg-fuchsia-200/28 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between rounded-[22px] border border-white/75 bg-white/70 px-5 py-3 shadow-[0_14px_42px_rgba(15,23,42,0.055)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-500 text-xl text-white shadow-xl shadow-violet-200">
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

        <section className="relative z-10 mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_560px] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/76 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">
              ✨ Profesyonel danışmanlık yönetim sistemi
            </div>

            <h2 className="mt-4 max-w-[760px] text-[28px] font-black leading-[1.06] tracking-tight text-slate-950 md:text-[34px] lg:text-[38px]">
              Profesyonel danışmanlar için geliştirilmiş bütünsel yönetim ve analiz platformu.
            </h2>

            <p className="mt-3 max-w-[690px] text-[14px] leading-6 text-slate-600">
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

        <section className="relative z-10 mt-8 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {landingModules.map((item) => (
            <div
              key={item.title}
              className="min-h-[118px] rounded-[16px] border border-white/80 bg-white/72 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.045)] backdrop-blur-xl transition hover:-translate-y-1"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 text-base text-white shadow-lg shadow-violet-200">
                {item.icon}
              </div>

              <h3 className="mt-3 text-[15px] font-black text-slate-950">
                {item.title}
              </h3>

              <p className="mt-1.5 text-[11px] leading-4 text-slate-600">
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        <section className="relative z-10 mt-3 grid grid-cols-2 gap-0 overflow-hidden rounded-[20px] border border-white/80 bg-white/72 shadow-[0_14px_38px_rgba(15,23,42,0.05)] backdrop-blur-xl md:grid-cols-3 xl:grid-cols-6">
          {featureItems.map((item, index) => (
            <div
              key={item.title}
              className={`flex items-start gap-2.5 p-3 ${
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

        <footer className="relative z-10 py-3 text-center text-[11px] font-semibold text-slate-500">
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
