import Link from "next/link";

const hubModules = [
  {
    title: "Tüm Ürünler",
    desc: "Doğaltaş, yağ, sabun, krem, tespih ve diğer tüm ürünleri tek listede görüntüleyin.",
    icon: "📋",
    accent: "from-violet-100 to-indigo-50 border-violet-200/80 ring-violet-100",
  },
  {
    title: "Doğaltaş Ürün/Stok",
    desc: "Bileklik, dizi, kolye ve ham taş stokları; maliyet ve satış fiyatı.",
    icon: "💎",
    accent: "from-cyan-100 to-teal-50 border-cyan-200/80 ring-cyan-100",
    href: "/urun-stok/dogaltas",
  },
  {
    title: "Yağ Ürün/Stok",
    desc: "Uçucu yağ, sabit yağ ve karışım yağ ürünleri.",
    icon: "🌿",
    accent: "from-emerald-100 to-green-50 border-emerald-200/80 ring-emerald-100",
    href: "/urun-stok/yag",
  },
  {
    title: "Sabun / Krem Ürünleri",
    desc: "Doğal sabun, krem ve bakım ürünleri stok yönetimi.",
    icon: "🧼",
    accent: "from-sky-100 to-blue-50 border-sky-200/80 ring-sky-100",
    href: "/urun-stok/sabun-krem",
  },
  {
    title: "Tespih / Takı / Aksesuar",
    desc: "Tespih, bileklik, kolye ve aksesuar ürün stokları.",
    icon: "📿",
    accent: "from-amber-100 to-orange-50 border-amber-200/80 ring-amber-100",
    href: "/urun-stok/aksesuar",
  },
  {
    title: "Satış & Fiyatlandırma",
    desc: "Sepet, kur, maliyet, kâr hesabı ve satış kaydı.",
    icon: "💰",
    accent: "from-fuchsia-100 to-pink-50 border-fuchsia-200/80 ring-fuchsia-100",
    href: "/urun-stok/satis-fiyatlandirma",
  },
  {
    title: "Satış Geçmişi",
    desc: "Tamamlanan satışlar, kâr özeti ve kayıt detayları.",
    icon: "🧾",
    accent: "from-rose-100 to-red-50 border-rose-200/80 ring-rose-100",
  },
  {
    title: "Stok Hareketleri",
    desc: "Giriş, çıkış ve satışa bağlı stok hareket geçmişi.",
    icon: "📊",
    accent: "from-slate-100 to-zinc-50 border-slate-200/80 ring-slate-100",
  },
  {
    title: "Diğer Ürünler",
    desc: "Kategoriye sığmayan tüm özel ürünler, farklı satış kalemleri ve serbest ürün stokları.",
    icon: "🛍️",
    accent: "from-lime-100 to-yellow-50 border-lime-200/80 ring-lime-100",
    href: "/urun-stok/diger",
  },
] as const;

const cardBase =
  "group relative flex min-h-[220px] flex-col justify-between rounded-[28px] border-2 bg-gradient-to-br p-7 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 backdrop-blur-xl transition-all duration-300";

function HubModuleCard({ item }: { item: (typeof hubModules)[number] }) {
  const href = "href" in item ? item.href : undefined;
  const isActive = Boolean(href);
  const badge =
    "statusLabel" in item && item.statusLabel
      ? item.statusLabel
      : isActive
        ? "Aktif"
        : "Yakında";

  const inner = (
    <>
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-3xl shadow-md ring-1 ring-white/60">
            {item.icon}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
              typeof badge === "object" && badge !== null && "color" in badge
                ? (badge as { color: string }).color
                : isActive
                  ? "border-cyan-200/90 bg-cyan-50 text-cyan-800"
                  : "border-slate-200/90 bg-white/90 text-slate-500"
            }`}
          >
            {typeof badge === "string"
              ? badge
              : typeof badge === "object" && badge !== null && "text" in badge
                ? (badge as { text: string }).text
                : ""}
          </span>
        </div>
        <h3 className="mt-5 text-xl font-black leading-tight text-slate-900 sm:text-2xl">
          {item.title}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-slate-600">{item.desc}</p>
      </div>
      <span
        className={`mt-6 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.15em] ${
          isActive ? "text-cyan-700" : "text-slate-400"
        }`}
      >
        {isActive ? "Modüle git" : "Modül hazırlanıyor"}
        <span aria-hidden>→</span>
      </span>
    </>
  );

  const cls = `${cardBase} ${item.accent} ${
    isActive
      ? "opacity-100 hover:-translate-y-1 hover:shadow-xl"
      : "cursor-default opacity-[0.97]"
  }`;

  if (href) {
    return (
      <Link href={href} className={`${cls} block no-underline`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cls} aria-disabled>
      {inner}
    </div>
  );
}

export default function UrunStokHubPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(251,191,36,0.18),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(139,92,246,0.14),transparent_30%),radial-gradient(circle_at_50%_95%,rgba(34,211,238,0.12),transparent_35%),linear-gradient(160deg,#fffbeb_0%,#f5f3ff_42%,#f0fdfa_100%)] text-slate-950 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute right-[-5%] top-[12%] h-96 w-96 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="absolute bottom-[-8%] left-[30%] h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-16 pt-8 xl:px-10">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex h-14 items-center gap-3 rounded-full border border-violet-200 bg-gradient-to-r from-cyan-50 to-violet-50 px-8 text-base font-black text-slate-700 shadow-[0_8px_30px_rgba(139,92,246,0.12)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-violet-400 hover:shadow-[0_12px_36px_rgba(139,92,246,0.22)] no-underline xl:text-lg"
          >
            <span className="text-xl" aria-hidden>
              ←
            </span>
            Ana Panele Dön
          </Link>
        </div>

        <header className="mb-12 rounded-[36px] border-2 border-white/90 bg-white/75 px-10 py-12 text-center shadow-[0_24px_70px_rgba(139,92,246,0.10)] backdrop-blur-xl sm:px-14 sm:py-14">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-700/90">
            Yaşam Sistemi
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem] lg:leading-tight">
            <span className="bg-[linear-gradient(90deg,#d97706_0%,#a855f7_50%,#0891b2_100%)] bg-clip-text text-transparent">
              Ürün & Stok
            </span>{" "}
            Merkezi
          </h1>
          <div
            className="mx-auto mt-6 h-px max-w-xl bg-gradient-to-r from-transparent via-amber-300/60 to-transparent"
            aria-hidden
          />
          <p className="mx-auto mt-6 max-w-3xl text-lg font-medium leading-relaxed text-slate-600 sm:text-xl">
            Tüm ürünlerinizi, stoklarınızı, satış ve fiyatlandırma süreçlerinizi tek merkezden
            yönetin. Aşağıdan modül seçin.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">Modüller</h2>
            <p className="mt-1 text-base font-medium text-slate-600">
              Alt modüller yakında aktif edilecek.
            </p>
          </div>
          <span className="rounded-full border border-amber-200/90 bg-amber-50/90 px-5 py-2 text-sm font-black text-amber-900 shadow-sm">
            9 modül
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {hubModules.map((item) => (
            <HubModuleCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </main>
  );
}
