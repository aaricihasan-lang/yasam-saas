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
    <main className="h-screen overflow-hidden bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] text-slate-950">
      <div className="grid h-screen grid-cols-[255px_1fr]">
        <aside className="border-r border-slate-100 bg-white/88 px-5 py-5 shadow-[14px_0_35px_rgba(15,23,42,0.03)]">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl shadow-[0_14px_32px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
              💎
            </div>

            <div>
              <h2 className="text-[12px] font-black tracking-[0.18em] text-slate-950">
                YAŞAM SİSTEMİ
              </h2>
              <p className="mt-0.5 text-[12px] font-bold text-emerald-700">
                Doğaltaş Modülü
              </p>
            </div>
          </div>

          <div className="mb-5 text-[11px] font-black tracking-[0.22em] text-slate-400">
            MODÜLLER
          </div>

          <nav className="space-y-2.5">
            {modules.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group grid grid-cols-[8px_40px_1fr_12px] items-center gap-2.5 rounded-2xl py-1.5 transition hover:bg-slate-50/90"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />

                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.iconBg} text-base shadow-sm ring-1 ring-slate-100`}
                >
                  {item.icon}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black text-slate-950">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] leading-4 text-slate-500">
                    {item.subtitle}
                  </span>
                </span>

                <span className="text-base text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600">
                  →
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl bg-white p-3 shadow-[0_14px_35px_rgba(15,23,42,0.045)] ring-1 ring-slate-100">
            <p className="text-[11px] font-bold leading-5 text-slate-700">
              ✨ Bilgiyi yönetin, değere dönüştürün.
            </p>
          </div>
        </aside>

        <section className="relative overflow-hidden px-7 py-5">
          <div className="pointer-events-none absolute right-[-180px] top-[-210px] h-[460px] w-[460px] rounded-full bg-cyan-100/55 blur-3xl" />
          <div className="pointer-events-none absolute left-[18%] top-[-240px] h-[460px] w-[460px] rounded-full bg-violet-100/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-220px] left-[38%] h-[420px] w-[420px] rounded-full bg-emerald-100/35 blur-3xl" />

          <div className="relative mx-auto max-w-[1210px] scale-[0.86] origin-top">
            <header className="mb-6 flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="flex h-[84px] w-[84px] items-center justify-center text-[58px] leading-none">
                  💎
                </div>

                <div>
                  <h1 className="text-[38px] font-black leading-none tracking-tight text-slate-950">
                    <span className="bg-[linear-gradient(90deg,#a855f7_0%,#38bdf8_45%,#34d399_100%)] bg-clip-text text-transparent">
                      Doğaltaş
                    </span>{" "}
                    Yönetimi
                  </h1>

                  <p className="mt-3 max-w-[560px] text-[15px] font-medium leading-7 text-slate-500">
                    Doğaltaş, mineral, kombinasyon ve stok süreçlerini tek
                    merkezden yönetin.
                  </p>
                </div>
              </div>

              <Link
                href="/"
                className="rounded-full bg-white/90 px-5 py-3 text-[13px] font-black text-slate-700 shadow-[0_14px_35px_rgba(15,23,42,0.055)] ring-1 ring-slate-100 transition hover:bg-white"
              >
                ⌂ Ana Sayfaya Dön
              </Link>
            </header>

            <div className="mb-6 rounded-[26px] bg-white/88 p-3 shadow-[0_20px_55px_rgba(15,23,42,0.05)] ring-1 ring-white">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-slate-400">
                    ⌕
                  </span>

                  <input
                    type="text"
                    placeholder="Taş, mineral veya anahtar kelime ara..."
                    className="h-12 w-full rounded-[20px] border border-slate-200/70 bg-white/90 pl-12 pr-4 text-[14px] font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </div>

                <button className="h-12 rounded-[20px] bg-slate-950 px-7 text-[14px] font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)] transition hover:bg-slate-800">
                  Ara
                </button>
              </div>
            </div>

            <div className="rounded-[30px] bg-white/72 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.042)] ring-1 ring-white">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-base">
                  📊
                </div>

                <div>
                  <h2 className="text-[20px] font-black text-slate-950">
                    Hesaplanmış Analizler
                  </h2>
                  <p className="text-[12px] text-slate-500">
                    Sistem verilerine göre otomatik analizler
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-[24px] bg-white/84 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.038)] ring-1 ring-white">
                  <p className="text-[13px] font-black text-slate-800">
                    Stok Değeri
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Toplam stok değeri
                  </p>
                  <h3 className="mt-6 text-[25px] font-black text-slate-950">
                    ₺ 2.450.780
                  </h3>
                  <p className="mt-3 text-[12px] font-bold text-emerald-600">
                    ↗ %12.5
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Geçen aya göre
                  </p>
                </div>

                <div className="rounded-[24px] bg-white/84 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.038)] ring-1 ring-white">
                  <p className="text-[13px] font-black text-slate-800">
                    Aylık Kayıt Trendi
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">Son 6 ay</p>

                  <div className="mt-6 flex h-[105px] items-end gap-4">
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

                  <div className="mt-3 grid grid-cols-6 text-center text-[11px] font-medium text-slate-500">
                    <span>Kas</span>
                    <span>Ara</span>
                    <span>Oca</span>
                    <span>Şub</span>
                    <span>Mar</span>
                    <span>Nis</span>
                  </div>
                </div>

                <div className="rounded-[24px] bg-white/84 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.038)] ring-1 ring-white">
                  <p className="text-[13px] font-black text-slate-800">
                    En Çok Satılan Taşlar
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">Bu ay</p>

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
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-500">
                            {rank}
                          </span>
                          <span className="text-[18px]">{icon}</span>
                          <span className="text-[13px] font-bold text-slate-700">
                            {name}
                          </span>
                        </div>
                        <span className="text-[12px] font-bold text-slate-500">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}