import Link from "next/link";

const hubModules = [
  {
    title: "Tüm Ürünler",
    desc: "Doğaltaş, yağ, sabun, krem, tespih ve diğer tüm ürünleri tek listede görüntüleyin.",
    icon: "📋",
    accent: "from-violet-100 to-indigo-50 border-violet-200/80 ring-violet-100",
    href: "/urun-stok/canli-stok",
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
    desc: "Satış raporları, kâr analizi ve satın alma karar destek merkezi.",
    icon: "🧾",
    accent: "from-rose-100 to-red-50 border-rose-200/80 ring-rose-100",
    href: "/urun-stok/satis-gecmisi",
  },
  {
    title: "Stok Hareketleri",
    desc: "Tüm ürün girişleri, satışlar, çıkışlar ve stok değişim geçmişi",
    icon: "📊",
    accent: "from-slate-100 to-zinc-50 border-slate-200/80 ring-slate-100",
    href: "/urun-stok/stok-hareketleri",
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
  "group relative flex min-h-[160px] flex-col justify-between rounded-[18px] border-2 bg-gradient-to-br p-5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 backdrop-blur-xl transition-all duration-300";

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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/90 text-xl shadow-md ring-1 ring-white/60">
            {item.icon}
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${
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
        <h3 className="mt-3 text-base font-black leading-tight text-slate-900 sm:text-lg">
          {item.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.desc}</p>
      </div>
      <span
        className={`mt-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.15em] ${
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

      <div className="relative z-10 w-full px-5 pb-8 pt-4 xl:px-10">
        <header className="mb-5 rounded-[20px] border-2 border-white/90 bg-white/75 px-6 py-5 text-center shadow-[0_12px_40px_rgba(139,92,246,0.08)] backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-700/90">
            Yaşam Sistemi
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            <span className="bg-[linear-gradient(90deg,#d97706_0%,#a855f7_50%,#0891b2_100%)] bg-clip-text text-transparent">
              Ürün & Stok
            </span>{" "}
            Merkezi
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
            Tüm ürünlerinizi, stoklarınızı, satış ve fiyatlandırma süreçlerinizi tek merkezden yönetin.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Modüller</h2>
            <p className="mt-0.5 text-sm font-medium text-slate-500">
              Alt modüller yakında aktif edilecek.
            </p>
          </div>
          <span className="rounded-full border border-amber-200/90 bg-amber-50/90 px-3 py-1 text-xs font-black text-amber-900 shadow-sm">
            9 modül
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {hubModules.map((item) => (
            <HubModuleCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </main>
  );
}
