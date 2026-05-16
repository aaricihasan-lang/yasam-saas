import Link from "next/link";

const MODULE_CARDS = [
  {
    href: "/dashboard/refleksoloji/bolge-haritasi",
    title: "Bölge Haritası",
    description: "Ayak ve el bölgelerinin harita görünümü ve refleks nokta eşlemesi.",
    icon: "🗺️",
    tint: "from-violet-100/90 via-white to-fuchsia-50/80",
  },
  {
    href: "/dashboard/refleksoloji/kayitli-atlas",
    title: "Kayıtlı Atlas",
    description: "Kayıtlı refleksoloji atlas kayıtlarının listesi ve yönetim alanı.",
    icon: "📚",
    tint: "from-indigo-100/90 via-white to-violet-50/80",
  },
  {
    href: "/dashboard/refleksoloji/protokol-haritasi",
    title: "Protokol Haritası",
    description: "Seans protokolü için görsel harita ve uygulama akış şeması.",
    icon: "🧭",
    tint: "from-purple-100/90 via-white to-pink-50/80",
  },
  {
    href: "/dashboard/refleksoloji/kayitli-protokoller",
    title: "Kayıtlı Protokoller",
    description: "Tanımlı protokollerin arşivi, düzenleme ve hızlı erişim alanı.",
    icon: "📋",
    tint: "from-fuchsia-100/90 via-white to-rose-50/80",
  },
  {
    href: "/dashboard/refleksoloji/notlar",
    title: "Notlar",
    description: "Danışan ve seans notları, serbest metin kayıt ve takip alanı.",
    icon: "📝",
    tint: "from-violet-100/80 via-white to-sky-50/70",
  },
] as const;

const cardBase =
  "group relative flex min-h-[220px] flex-col overflow-hidden rounded-[24px] border border-white/90 bg-white/70 p-6 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-violet-200/90 hover:bg-white/90 hover:shadow-[0_20px_52px_-14px_rgba(91,33,182,0.28)] active:scale-[0.99] sm:min-h-[240px] sm:p-7";

export default function RefleksolojiHubPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(145deg,#f5f0ff_0%,#ede9fe_38%,#faf5ff_72%,#eef2ff_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute -right-20 top-1/4 h-96 w-96 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <header className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-violet-700/90">Yaşam Sistemi</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">Refleksoloji</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
            Bölge haritası, kayıtlı atlas, protokol haritası, kayıtlı protokoller ve notlar alanı.
          </p>
        </header>

        <div className="mt-10 grid flex-1 grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
          {MODULE_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className={`${cardBase} no-underline`}>
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tint} opacity-80 transition group-hover:opacity-100`}
                aria-hidden
              />
              <div className="relative flex flex-1 flex-col">
                <span
                  className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-200/80 bg-white/90 text-2xl shadow-sm ring-1 ring-violet-100/60"
                  aria-hidden
                >
                  {card.icon}
                </span>
                <h2 className="mt-5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{card.title}</h2>
                <p className="mt-2 flex-1 text-sm font-medium leading-relaxed text-slate-600">{card.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700 transition group-hover:text-violet-900">
                  Modüle git
                  <span aria-hidden className="transition group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs font-medium text-slate-500 sm:mt-10">
          İçerikler masaüstü refleksoloji yapısına göre adım adım aktarılacaktır.
        </p>
      </div>
    </main>
  );
}
