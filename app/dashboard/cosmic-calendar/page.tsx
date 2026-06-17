import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getHijriDate, getHijriMonthYear } from "@/lib/cosmic/hijri";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getDailyEnergySummary } from "@/lib/cosmic/energy";
import { getPlanetaryHour, CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";

export const dynamic = "force-dynamic";

// ─── Sabit veriler ────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

type CalEvent = { icon: string; label: string };

const MONTH_EVENTS: Partial<Record<number, CalEvent[]>> = {
  17: [{ icon: "🩸", label: "Hacamat" }],
  19: [{ icon: "📅", label: "Beyaz Gün" }],
  21: [{ icon: "🌕", label: "Dolunay" }, { icon: "🩸", label: "Hacamat" }],
  28: [{ icon: "🪐", label: "Merkür Retro" }],
};

const HACAMAT_DAYS = new Set([3, 5, 17, 19, 21]);

const UPCOMING_EVENTS = [
  { days: 3,  text: "Beyaz Gün",                icon: "📅" },
  { days: 5,  text: "Hacamat için uygun gün",    icon: "🩸" },
  { days: 8,  text: "Dolunay",                   icon: "🌕" },
  { days: 12, text: "Merkür retrosu başlangıcı", icon: "🪐" },
] as const;

const LEGEND_ITEMS = [
  { icon: "🌙", label: "Hicri" },
  { icon: "🩸", label: "Hacamat" },
  { icon: "🌕", label: "Dolunay" },
  { icon: "🌑", label: "Yeni Ay" },
  { icon: "🪐", label: "Retro" },
  { icon: "📅", label: "Randevu" },
] as const;

const BADGES = [
  "🌙 Hicri Takvim",
  "🩸 Hacamat Günleri",
  "🌕 Ay Fazları",
  "🪐 Gezegen Saatleri",
] as const;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMiladiDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric", month: "long", year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString("tr-TR");
  }
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function CosmicCalendarPage() {
  const now = new Date();

  // Takvim
  const year     = now.getFullYear();
  const month    = now.getMonth();
  const todayDay = now.getDate();
  const cells    = buildCalendarCells(year, month);

  // Kozmik hesaplamalar
  const hijriDate      = getHijriDate(now);
  const hijriMonthYear = getHijriMonthYear(now);
  const moonPhase      = getMoonPhase(now);
  const moonSign       = getMoonSign(now);
  const miladiDate     = formatMiladiDate(now);

  // Günlük enerji yorumu (kural tabanlı)
  const energy = getDailyEnergySummary(now);

  // Gezegen saati hesaplama (gün doğumu/batımı tabanlı)
  const ph = getPlanetaryHour(now);

  // Kozmik Özet kart satırları
  const cosmicSummary = [
    { icon: "📅",            label: "Miladi",          value: miladiDate },
    { icon: "🌙",            label: "Hicri",           value: hijriDate },
    { icon: moonPhase.emoji, label: "Ay Fazı",         value: moonPhase.name },
    { icon: moonSign.emoji,  label: "Ay Burcu",        value: moonSign.name },
    { icon: "🔢",            label: "Numeroloji",      value: "5 · Değişim" },
    { icon: "⏰",            label: "Gezegen Saati",   value: `${ph.aktifGezegen.symbol} ${ph.aktifGezegen.name}` },
    { icon: "🩸",            label: "Sonraki Hacamat", value: "3 gün sonra" },
  ];

  // Sağ panel durum satırları
  const rightStats: Array<{ icon: string; label: string; value: string; color: string; sub?: string }> = [
    { icon: moonPhase.emoji, label: "Ay Fazı",           value: moonPhase.name,    color: "text-violet-700" },
    { icon: "🕋",            label: "Hicri",             value: hijriDate,          color: "text-slate-800" },
    { icon: "🩸",            label: "Sonraki Hacamat",   value: "3 gün sonra",      color: "text-rose-600" },
    { icon: "🪐",            label: "Retro Durumu",      value: "Aktif Retro Yok",  color: "text-emerald-600" },
    {
      icon:  "⏰",
      label: "Gezegen Saati",
      value: `${ph.aktifGezegen.symbol} ${ph.aktifGezegen.name}`,
      color: "text-indigo-700",
      sub:   `Sonraki: ${ph.sonrakiGezegen.symbol} ${ph.sonrakiGezegen.name} · ${ph.kalanDakika} dk`,
    },
  ];

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-indigo-400/15 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-violet-300/[0.12] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pt-4 pb-12 lg:px-8">

        {/* ── Hero ── */}
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-indigo-200 via-violet-100 to-cyan-100 px-5 py-4 shadow-[0_12px_40px_rgba(99,102,241,0.18)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-violet-400/20 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/20 blur-[80px]" aria-hidden />

          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-xl text-white shadow-md">
                  🌙
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                    Yaşam Sistemi
                  </p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                    Yaşam Takvimi / Kozmik Ajanda
                  </h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Günlük enerji, hicri takvim, hacamat günleri ve kozmik döngüler tek merkezde.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BADGES.map((b) => (
                  <span
                    key={b}
                    className="rounded-full border border-indigo-200/80 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 backdrop-blur-sm"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-indigo-700"
            >
              <ArrowLeft className="h-3 w-3" />
              Geri
            </Link>
          </div>
        </section>

        {/* ── Bugünün Enerjisi — ana yıldız kart ── */}
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-indigo-500/20 bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-800 p-4 shadow-[0_24px_64px_rgba(109,40,217,0.30),0_8px_24px_rgba(99,102,241,0.20)] sm:p-5">
          {/* Subtle inner glow overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]" aria-hidden />
          {/* Decorative orbs */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-40 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden />

          <div className="relative">
            {/* Label + title */}
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300/70">
              🌙 Bugünün Enerjisi
            </p>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {energy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-[13px] font-medium leading-relaxed text-indigo-100/80 sm:text-sm">
              {energy.summary}
            </p>

            {/* 3 vurgu kutusu */}
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">
                  🎯 Odak
                </p>
                <p className="text-[13px] font-bold text-white">{energy.focus}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">
                  ⚡ Enerji Teması
                </p>
                <p className="text-[13px] font-bold text-white">{energy.theme}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">
                  💡 Öneri
                </p>
                <p className="text-[13px] font-bold text-white">{energy.recommendation}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bugünün Kozmik Özeti — kompakt ── */}
        <div className="mb-4 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br from-indigo-600/[0.07] via-violet-500/[0.05] to-cyan-400/[0.07] p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            🌙 Kozmik Özet
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
            {cosmicSummary.map(({ icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-white/80 bg-white/60 px-2 py-1.5 backdrop-blur-sm"
              >
                <p className="text-[8px] font-semibold text-slate-400">
                  {icon} {label}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-black leading-tight text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ana Grid: Takvim (sol) + Panel (sağ) ── */}
        <div className="grid grid-cols-1 gap-4 lg:items-start lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px]">

          {/* ── Sol: Aylık Takvim + Yaklaşan Olaylar ── */}
          <div className="flex flex-col gap-4">

            <div className="rounded-3xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">

              <div className="mb-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-800">
                    {MONTH_NAMES_TR[month]} {year}
                  </h2>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200/80">
                    🌙 {hijriMonthYear}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-slate-100/80 pb-2">
                  {LEGEND_ITEMS.map(({ icon, label }) => (
                    <span key={label} className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      {icon} {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {DAY_HEADERS.map((h) => (
                  <div key={h} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {h}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) {
                    return <div key={`e-${i}`} className="h-10 rounded-lg" />;
                  }
                  const isToday         = day === todayDay;
                  const events          = MONTH_EVENTS[day] ?? [];
                  const hasHacamatEvent = events.some((e) => e.icon === "🩸");
                  const showHacamatDot  = HACAMAT_DAYS.has(day) && !hasHacamatEvent && !isToday;

                  return (
                    <div
                      key={day}
                      className={`flex h-10 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                        isToday
                          ? "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-md shadow-indigo-300/40"
                          : events.length > 0
                            ? "border border-indigo-100 bg-indigo-50/60"
                            : showHacamatDot
                              ? "border border-rose-100 bg-rose-50/50"
                              : "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {isToday && (
                        <span className="text-[7px] leading-none text-white/80">bugün</span>
                      )}
                      {!isToday && events.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {events.slice(0, 2).map((ev, ei) => (
                            <span key={ei} className="text-[9px] leading-none" title={ev.label}>
                              {ev.icon}
                            </span>
                          ))}
                        </div>
                      )}
                      {showHacamatDot && (
                        <span className="text-[9px] leading-none" title="Hacamat günü">🩸</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Yaklaşan Olaylar */}
            <div className="rounded-3xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
                Yaklaşan Olaylar
              </p>
              <div className="space-y-0.5">
                {UPCOMING_EVENTS.map(({ days, text, icon }) => (
                  <div key={text} className="flex items-center gap-2 rounded-xl bg-slate-50/70 px-2.5 py-1.5">
                    <span className="text-sm leading-none">{icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-800">{text}</span>
                    <span className="shrink-0 rounded-full bg-indigo-100/80 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-indigo-700">
                      {days}g
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sağ Panel ── */}
          <div className="flex flex-col gap-3">

            <div className="rounded-3xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
                Günlük Durum
              </p>
              <div className="space-y-1">
                {rightStats.map(({ icon, label, value, color, sub }) => (
                  <div key={label} className="flex items-start justify-between rounded-xl bg-slate-50/70 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {icon} {label}
                    </span>
                    <div className="min-w-0 text-right">
                      <span className={`text-[11px] font-black ${color}`}>{value}</span>
                      {sub ? <p className="text-[10px] text-slate-400">{sub}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-rose-100 bg-rose-50/60 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-rose-700">
                Bu Ay Hacamat Günleri
              </p>
              <p className="mb-2 text-[11px] text-slate-500">
                Hicri 3., 5., 17., 19. ve 21. günler.
              </p>
              <div className="mb-2.5 flex flex-wrap gap-1">
                {Array.from(HACAMAT_DAYS).map((d) => (
                  <span key={d} className="rounded-lg border border-rose-200 bg-white/80 px-2 py-0.5 text-[11px] font-black text-rose-700">
                    {d}. Gün
                  </span>
                ))}
              </div>
              <p className="rounded-xl border border-amber-100 bg-amber-50/70 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-700">
                ⚠️ Yalnızca bilgilendirme amaçlıdır. Tıbbi karar yerine geçmez.
              </p>
            </div>

            {/* ── Şu Anki Gezegen Saati ── */}
            <div className="overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-indigo-50 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
                ⏰ Şu Anki Gezegen Saati
              </p>

              {/* Aktif gezegen — büyük görsel */}
              <div className="mb-2 flex items-center gap-3 rounded-2xl border border-indigo-200/50 bg-white/80 px-3 py-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl text-white shadow-md">
                  {ph.aktifGezegen.symbol}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">
                    {ph.isDayHour ? "Gündüz Saati" : "Gece Saati"} · {ph.isDayHour ? ph.saatIndex + 1 : ph.saatIndex - 11}. saat
                  </p>
                  <p className="text-sm font-black text-slate-900">
                    {ph.aktifGezegen.name} Saati
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">
                    {ph.aktifGezegen.description}
                  </p>
                </div>
              </div>

              {/* Aktif / Sonraki / Kalan */}
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <div className="rounded-xl bg-white/70 px-2 py-1.5">
                  <p className="text-[9px] text-slate-400">Aktif</p>
                  <p className="text-[12px] font-black text-indigo-700">
                    {ph.aktifGezegen.symbol} {ph.aktifGezegen.name}
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 px-2 py-1.5">
                  <p className="text-[9px] text-slate-400">Sonraki</p>
                  <p className="text-[12px] font-black text-slate-700">
                    {ph.sonrakiGezegen.symbol} {ph.sonrakiGezegen.name}
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 px-2 py-1.5">
                  <p className="text-[9px] text-slate-400">Kalan</p>
                  <p className="text-[12px] font-black text-violet-700">{ph.kalanDakika} dk</p>
                </div>
              </div>

              {/* 7 gezegen sırası — aktif vurgulu */}
              <div className="mb-2 flex items-center justify-between rounded-2xl border border-indigo-100/80 bg-white/60 px-2 py-1.5">
                {CHALDEAN_PLANETS.map((planet, idx) => {
                  const isActive = idx === ph.aktifChaldeanIdx;
                  return (
                    <div
                      key={planet.name}
                      className={`flex flex-col items-center gap-0.5 transition-all ${
                        isActive ? "scale-125" : "opacity-35"
                      }`}
                    >
                      <span
                        className={`text-base leading-none ${
                          isActive ? "text-indigo-600" : "text-slate-500"
                        }`}
                      >
                        {planet.symbol}
                      </span>
                      <span
                        className={`text-[8px] leading-none ${
                          isActive ? "font-black text-indigo-700" : "text-slate-400"
                        }`}
                      >
                        {planet.name.substring(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Gün doğumu / batımı */}
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>☀️ Doğum: {ph.gunDogumuStr}</span>
                <span>🌅 Batım: {ph.gunBatimiStr}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
