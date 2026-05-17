import Link from "next/link";

const modules = [
  {
    title: "Doğaltaş Kayıt",
    subtitle: "Yeni taş kaydı oluştur.",
    icon: "💎",
    href: "/dogaltas/dogaltas-kayit",
    dot: "bg-emerald-500",
    iconBg: "bg-cyan-50",
  },
  {
    title: "Mineral Bankası",
    subtitle: "Mineral veri kayıtları.",
    icon: "🧪",
    href: "/dogaltas/mineral-bankasi",
    dot: "bg-violet-500",
    iconBg: "bg-violet-50",
  },
  {
    title: "Mineral Listesi",
    subtitle: "Filtrele ve düzenle.",
    icon: "📋",
    href: "/dogaltas/mineral-listesi",
    dot: "bg-sky-500",
    iconBg: "bg-sky-50",
  },
  {
    title: "Doğaltaş Listesi",
    subtitle: "Kayıtlı taşlar.",
    icon: "🗂️",
    href: "/dogaltas/dogaltas-listesi",
    dot: "bg-blue-500",
    iconBg: "bg-blue-50",
  },
  {
    title: "Kombinasyonlar",
    subtitle: "Taş kombinasyonları.",
    icon: "🧩",
    href: "/dogaltas/kombinasyonlar",
    dot: "bg-orange-500",
    iconBg: "bg-orange-50",
  },
  {
    title: "Stok Yönetimi",
    subtitle: "Stok, adet ve fiyat.",
    icon: "📦",
    href: "/dogaltas/stok-yonetimi",
    dot: "bg-indigo-500",
    iconBg: "bg-indigo-50",
  },
  {
    title: "Taş Bilgi Kütüphanesi",
    subtitle: "Eğitim ve referans.",
    icon: "📚",
    href: "/dogaltas/tas-bilgi-kutuphanesi",
    dot: "bg-pink-500",
    iconBg: "bg-pink-50",
  },
];

export default function DogaltasPage() {
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.14),transparent_30%),radial-gradient(circle_at_60%_90%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)] text-slate-950">
      <div className="grid min-h-screen w-full grid-cols-[255px_1fr]">
        <aside className="border-r border-white/80 bg-white/88 px-5 py-5 shadow-[14px_0_35px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl shadow-[0_14px_32px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
              💎
            </div>

            <div>
              <h2 className="text-xs font-black tracking-[0.18em] text-slate-950">
                YAŞAM SİSTEMİ
              </h2>
              <p className="mt-0.5 text-xs font-bold text-emerald-700">Doğaltaş Modülü</p>
            </div>
          </div>

          <div className="mb-5 text-[11px] font-black tracking-[0.22em] text-slate-400">
            MODÜLLER
          </div>

          <nav className="space-y-2">
            {modules.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group grid grid-cols-[8px_40px_1fr_12px] items-center gap-2.5 rounded-2xl py-2 transition-all hover:scale-[1.02] hover:bg-white/70"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />

                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.iconBg} text-base shadow-sm ring-1 ring-slate-100`}
                >
                  {item.icon}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-950">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs leading-4 text-slate-500">
                    {item.subtitle}
                  </span>
                </span>

                <span className="text-base text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600">
                  →
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl bg-white/80 p-3 shadow-[0_14px_35px_rgba(15,23,42,0.045)] ring-1 ring-white/80">
            <p className="text-xs font-bold leading-5 text-slate-700">
              ✨ Bilgiyi yönetin, değere dönüştürün.
            </p>
          </div>
        </aside>

        <section className="relative min-h-screen overflow-y-auto overflow-x-hidden">
          <div className="pointer-events-none absolute right-[-180px] top-[-210px] h-[460px] w-[460px] rounded-full bg-cyan-200/30 blur-3xl" />
          <div className="pointer-events-none absolute left-[18%] top-[-240px] h-[460px] w-[460px] rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-220px] left-[38%] h-[420px] w-[420px] rounded-full bg-emerald-200/20 blur-3xl" />

          <div className="relative mx-auto w-full max-w-[1780px] px-8 py-8 lg:px-12 xl:px-16">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-6 rounded-[36px] border border-white/80 bg-white/65 px-10 py-8 shadow-[0_25px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center text-5xl leading-none">
                  💎
                </div>

                <div className="min-w-0">
                  <h1 className="text-5xl font-black tracking-tight text-slate-950">
                    <span className="bg-[linear-gradient(90deg,#a855f7_0%,#38bdf8_45%,#34d399_100%)] bg-clip-text text-transparent">
                      Doğaltaş
                    </span>{" "}
                    Yönetimi
                  </h1>

                  <p className="mt-3 max-w-3xl text-lg text-slate-600">
                    Doğaltaş, mineral, kombinasyon ve stok süreçlerini tek merkezden
                    yönetin.
                  </p>
                </div>
              </div>

              <Link
                href="/"
                className="shrink-0 rounded-2xl border border-white/80 bg-white/90 px-6 py-3 text-sm font-black text-slate-700 shadow-md transition hover:-translate-y-0.5 hover:bg-white"
              >
                ⌂ Ana Sayfaya Dön
              </Link>
            </header>

            <div className="mb-8 w-full max-w-none rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                    ⌕
                  </span>

                  <input
                    type="text"
                    placeholder="Taş, mineral veya anahtar kelime ara..."
                    className="h-16 w-full rounded-2xl border border-slate-200/70 bg-white/90 px-6 pl-14 text-base font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  />
                </div>

                <button
                  type="button"
                  className="h-16 shrink-0 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-8 text-base font-black text-white shadow-lg transition-all hover:scale-[1.03] hover:from-slate-800 hover:to-slate-700"
                >
                  Ara
                </button>
              </div>
            </div>

            <div className="w-full rounded-[36px] border border-white/80 bg-white/70 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl">
                  📊
                </div>

                <div>
                  <h2 className="text-2xl font-black text-slate-950">Hesaplanmış Analizler</h2>
                  <p className="mt-1 text-base text-slate-600">
                    Sistem verilerine göre otomatik analizler
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="min-h-[240px] rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-base font-black text-slate-800">Stok Değeri</p>
                  <p className="mt-1 text-sm text-slate-500">Toplam stok değeri</p>
                  <h3 className="mt-8 text-3xl font-black text-slate-950">₺ 2.450.780</h3>
                  <p className="mt-4 text-sm font-bold text-emerald-600">↗ %12.5</p>
                  <p className="mt-1 text-sm text-slate-500">Geçen aya göre</p>
                </div>

                <div className="min-h-[240px] rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-base font-black text-slate-800">Aylık Kayıt Trendi</p>
                  <p className="mt-1 text-sm text-slate-500">Son 6 ay</p>

                  <div className="mt-6 flex h-[120px] items-end gap-3">
                    {[45, 70, 50, 78, 96, 74].map((height, index) => (
                      <div
                        key={index}
                        className="flex flex-1 flex-col items-center gap-2"
                      >
                        <div
                          className="w-full rounded-t-2xl bg-gradient-to-t from-indigo-500 via-violet-400 to-sky-300"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-6 text-center text-xs font-medium text-slate-500">
                    <span>Kas</span>
                    <span>Ara</span>
                    <span>Oca</span>
                    <span>Şub</span>
                    <span>Mar</span>
                    <span>Nis</span>
                  </div>
                </div>

                <div className="min-h-[240px] rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-base font-black text-slate-800">En Çok Satılan Taşlar</p>
                  <p className="mt-1 text-sm text-slate-500">Bu ay</p>

                  <div className="mt-5 space-y-3">
                    {[
                      ["1", "🟣", "Ametist", "412 adet"],
                      ["2", "⚪", "Kuvars", "356 adet"],
                      ["3", "🟡", "Sitrin", "289 adet"],
                      ["4", "🔴", "Akik", "241 adet"],
                      ["5", "⚫", "Turmalin", "187 adet"],
                    ].map(([rank, icon, name, count]) => (
                      <div
                        key={rank}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
                            {rank}
                          </span>
                          <span className="text-lg">{icon}</span>
                          <span className="truncate text-sm font-bold text-slate-700">
                            {name}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-slate-500">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="rounded-[28px] border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-sm font-black uppercase tracking-wide text-teal-700">
                    Toplam Taş Kaydı
                  </p>
                  <p className="mt-4 text-4xl font-black text-slate-950">—</p>
                  <p className="mt-2 text-sm text-slate-600">Kayıtlı doğaltaş envanteri</p>
                </div>

                <div className="rounded-[28px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-sm font-black uppercase tracking-wide text-violet-700">
                    Mineral Bankası
                  </p>
                  <p className="mt-4 text-4xl font-black text-slate-950">—</p>
                  <p className="mt-2 text-sm text-slate-600">Mineral referans kayıtları</p>
                </div>

                <div className="rounded-[28px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]">
                  <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                    Aktif Kombinasyonlar
                  </p>
                  <p className="mt-4 text-4xl font-black text-slate-950">—</p>
                  <p className="mt-2 text-sm text-slate-600">Kullanımdaki taş kombinasyonları</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
