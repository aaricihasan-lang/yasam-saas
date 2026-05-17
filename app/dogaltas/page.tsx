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
    <main className="h-screen w-full overflow-hidden overflow-x-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.14),transparent_30%),radial-gradient(circle_at_60%_90%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)] text-slate-950">
      <div className="grid h-full w-full grid-cols-[320px_1fr] overflow-x-hidden">
        <aside className="flex h-screen w-[320px] min-w-[320px] shrink-0 flex-col overflow-hidden border-r border-white/80 bg-white/88 px-5 py-6 shadow-[14px_0_35px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="mb-4 flex h-16 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-md ring-1 ring-slate-100">
              💎
            </div>
            <div>
              <h2 className="text-[13px] font-black tracking-[0.22em] text-slate-950">
                YAŞAM SİSTEMİ
              </h2>
              <p className="mt-0.5 text-[13px] font-bold text-emerald-700">Doğaltaş Modülü</p>
            </div>
          </div>

          <div className="mb-3 text-[13px] font-black tracking-[0.22em] text-slate-400">
            MODÜLLER
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-hidden">
            {modules.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex h-[72px] items-center gap-4 rounded-2xl px-4 transition-all duration-300 hover:scale-[1.02] hover:bg-white/80 hover:shadow-lg"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />

                <span
                  className={`flex h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-md ring-1 ring-slate-100 ${item.iconBg}`}
                >
                  {item.icon}
                </span>

                <span className="min-w-0 flex-1 pr-1">
                  <span className="block text-[17px] font-black leading-tight text-slate-950">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-slate-600 line-clamp-2">
                    {item.subtitle}
                  </span>
                </span>

                <span className="shrink-0 text-lg opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                  →
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-3 shrink-0 rounded-2xl bg-white/80 p-3 shadow-md ring-1 ring-white/80">
            <p className="text-xs font-bold leading-5 text-slate-700">
              ✨ Bilgiyi yönetin, değere dönüştürün.
            </p>
          </div>
        </aside>

        <section className="relative h-screen min-w-0 overflow-hidden px-8 py-6">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl" />
            <div className="absolute left-[8%] -top-16 h-56 w-56 rounded-full bg-violet-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-[28%] h-48 w-48 rounded-full bg-emerald-200/20 blur-3xl" />
          </div>

          <div className="relative flex h-full w-full max-w-none flex-col gap-3 overflow-hidden">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[30px] border border-white/80 bg-white/65 px-8 py-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center text-3xl leading-none">
                  💎
                </div>
                <div className="min-w-0">
                  <h1 className="text-4xl font-black tracking-tight text-slate-950">
                    <span className="bg-[linear-gradient(90deg,#a855f7_0%,#38bdf8_45%,#34d399_100%)] bg-clip-text text-transparent">
                      Doğaltaş
                    </span>{" "}
                    Yönetimi
                  </h1>
                  <p className="mt-0.5 text-base text-slate-600">
                    Doğaltaş, mineral, kombinasyon ve stok süreçlerini tek merkezden
                    yönetin.
                  </p>
                </div>
              </div>
              <Link
                href="/"
                className="shrink-0 rounded-2xl border border-white/80 bg-white/90 px-5 py-2.5 text-sm font-black text-slate-700 shadow-md transition hover:bg-white"
              >
                ⌂ Ana Sayfaya Dön
              </Link>
            </header>

            <div className="w-full shrink-0 rounded-[26px] border border-white/80 bg-white/75 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex gap-3">
                <div className="relative min-w-0 flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-slate-400">
                    ⌕
                  </span>
                  <input
                    type="text"
                    placeholder="Taş, mineral veya anahtar kelime ara..."
                    className="h-14 w-full rounded-2xl border border-slate-200/70 bg-white/90 pl-11 pr-4 text-base font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
                <button
                  type="button"
                  className="h-14 shrink-0 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-7 text-sm font-black text-white shadow-lg transition-all hover:scale-[1.02]"
                >
                  Ara
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="mb-4 flex shrink-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-base">
                  📊
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Hesaplanmış Analizler</h2>
                  <p className="text-xs text-slate-600">Sistem verilerine göre otomatik analizler</p>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-3">
                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">Stok Değeri</p>
                  <p className="text-xs text-slate-500">Toplam stok değeri</p>
                  <h3 className="mt-auto pt-2 text-3xl font-black text-slate-950">₺ 2.450.780</h3>
                  <p className="mt-1 text-xs font-bold text-emerald-600">↗ %12.5</p>
                </div>

                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">Aylık Kayıt Trendi</p>
                  <p className="text-xs text-slate-500">Son 6 ay</p>
                  <div className="mt-2 flex h-[88px] items-end gap-1.5">
                    {[45, 70, 50, 78, 96, 74].map((height, index) => (
                      <div key={index} className="flex h-full flex-1 flex-col justify-end">
                        <div
                          className="w-full rounded-t-lg bg-gradient-to-t from-indigo-500 via-violet-400 to-sky-300"
                          style={{ height: `${height}%`, minHeight: "6px" }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 grid grid-cols-6 text-center text-[10px] font-medium text-slate-500">
                    <span>Kas</span>
                    <span>Ara</span>
                    <span>Oca</span>
                    <span>Şub</span>
                    <span>Mar</span>
                    <span>Nis</span>
                  </div>
                </div>

                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">En Çok Satılan Taşlar</p>
                  <p className="text-xs text-slate-500">Bu ay</p>
                  <div className="mt-2 space-y-1 overflow-hidden">
                    {[
                      ["1", "🟣", "Ametist", "412"],
                      ["2", "⚪", "Kuvars", "356"],
                      ["3", "🟡", "Sitrin", "289"],
                      ["4", "🔴", "Akik", "241"],
                      ["5", "⚫", "Turmalin", "187"],
                    ].map(([rank, icon, name, count]) => (
                      <div key={rank} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">
                            {rank}
                          </span>
                          <span className="text-sm">{icon}</span>
                          <span className="text-sm font-bold text-slate-700">{name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-slate-500">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid shrink-0 grid-cols-3 gap-3">
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 shadow-md">
                  <p className="text-sm font-black text-teal-700">Toplam Taş Kaydı</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">—</p>
                </div>
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 shadow-md">
                  <p className="text-sm font-black text-violet-700">Mineral Bankası</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">—</p>
                </div>
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-md">
                  <p className="text-sm font-black text-amber-700">Aktif Kombinasyonlar</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">—</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
