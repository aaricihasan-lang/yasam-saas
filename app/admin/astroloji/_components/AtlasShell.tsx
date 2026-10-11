"use client";

/**
 * Gökyüzü Atlası — görsel kabuk (yalnız sunum): başlık, yörünge geometrisi ve TEK ana navigasyon.
 * Ana ekranda navigasyon büyük yönlendirmeler olarak, iç görünümlerde kompakt sekme çubuğu olarak çizilir
 * (aynı öğe listesi; aynı işlev iki kez gösterilmez). İş mantığı / yetki burada yok.
 */
import type { ReactNode } from "react";
import { Archive, ArrowRight, BookOpen, Orbit, Settings2, Sparkles } from "lucide-react";

/** "client" = Danışan Dosyası (#danisan/<id>) — Analiz Arşivi'nin detay görünümü. */
export type AtlasView = "home" | "new" | "archive" | "client" | "result" | "kb" | "audit";

export const ATLAS = {
  navy: "#0b1430",
  navy2: "#14214a",
  gold: "#c9a54e",
  blue: "#6aa8ff",
} as const;

/** Birincil eylem düğmesi (gece laciverti + altın odak). */
export const atlasPrimaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1430] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a2b5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a54e] disabled:cursor-not-allowed disabled:opacity-50";
/** İkincil düğme. */
export const atlasSecondaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-[#0b1430]/40 hover:text-[#0b1430] disabled:opacity-50";
/** İçerik paneli. */
export const atlasPanel = "rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

const NAV: { key: "new" | "archive" | "kb"; label: string; desc: string; Icon: typeof Sparkles }[] = [
  { key: "new", label: "Yeni Analiz", desc: "Danışan seçin, doğum bilgisini doğrulayın, teknikleri belirleyip hesaplayın.", Icon: Sparkles },
  { key: "archive", label: "Analiz Arşivi", desc: "Danışanlar, doğum profilleri ve kayıtlı analizler tek yerde.", Icon: Archive },
  { key: "kb", label: "Bilgi Bankası", desc: "Kendi yorumlarınız ve kaynak notlarınız; analizlerle otomatik eşleşir.", Icon: BookOpen },
];

/** Harita ve yörünge geometrisinden esinlenen ince çizgi süsleme (dekoratif; erişilebilirlik ağacında yok). */
function OrbitArt({ className }: { className?: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const signs = Array.from({ length: 12 }, (_, i) => i * 30);
  const pt = (r: number, deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)] as const;
  const planets: [number, number, string][] = [
    [168, 28, ATLAS.gold],
    [132, 152, ATLAS.blue],
    [132, 248, ATLAS.gold],
    [96, 318, ATLAS.blue],
    [168, 214, ATLAS.blue],
  ];
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={className}>
      <g fill="none" strokeWidth="0.8">
        <circle cx="200" cy="200" r="190" stroke={ATLAS.gold} strokeOpacity="0.35" />
        <circle cx="200" cy="200" r="168" stroke={ATLAS.gold} strokeOpacity="0.22" />
        <circle cx="200" cy="200" r="132" stroke={ATLAS.blue} strokeOpacity="0.22" strokeDasharray="2 5" />
        <circle cx="200" cy="200" r="96" stroke={ATLAS.blue} strokeOpacity="0.2" />
        <circle cx="200" cy="200" r="40" stroke={ATLAS.gold} strokeOpacity="0.25" />
        {ticks.map((d) => {
          const [x1, y1] = pt(186, d);
          const [x2, y2] = pt(d % 30 === 0 ? 168 : 180, d);
          return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ATLAS.gold} strokeOpacity={d % 30 === 0 ? 0.45 : 0.22} />;
        })}
        {signs.map((d) => {
          const [x1, y1] = pt(168, d);
          const [x2, y2] = pt(96, d);
          return <line key={`s${d}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity="0.05" />;
        })}
        {/* açı (aspect) çizgileri */}
        {[
          [0, 2],
          [1, 3],
          [0, 4],
          [2, 3],
        ].map(([a, b]) => {
          const [x1, y1] = pt(planets[a][0], planets[a][1]);
          const [x2, y2] = pt(planets[b][0], planets[b][1]);
          return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ATLAS.blue} strokeOpacity="0.3" />;
        })}
      </g>
      {planets.map(([r, d, c], i) => {
        const [x, y] = pt(r, d);
        return <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 3.6} fill={c} fillOpacity="0.9" />;
      })}
    </svg>
  );
}

export function AtlasHeader({
  view,
  resultFrom = "new",
  onNavigate,
  ownerTools,
  bare = false,
}: {
  /** Analiz Arşivi / Danışan Dosyası: yalnız başlık + alt yazı (sekme satırı ve "Önizleme ve denetim" gösterilmez). */
  bare?: boolean;
  view: AtlasView;
  /** Sonuç görünümü hangi bölümden açıldı (sekme vurgusu için). */
  resultFrom?: "new" | "archive";
  onNavigate: (v: AtlasView) => void;
  /** Yalnız iç görünümlerde ve yalnız owner'da gösterilir (ana ekranda gösterilmez). */
  ownerTools?: ReactNode;
}) {
  const home = view === "home";
  /** Sonuç çalışma masası ve Hazırlık Merkezi'nde başlık tek satır (harita / ön izleme için dikey alan). */
  const dense = view === "result" || view === "new";
  const activeKey = view === "result" ? resultFrom : view === "client" ? "archive" : view;
  return (
    <header className="relative overflow-hidden bg-[#0b1430] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(106,168,255,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(201,165,78,0.10),transparent_50%)]" />
      <OrbitArt
        className={`pointer-events-none absolute ${
          home ? "-right-24 -top-20 h-[440px] w-[440px] opacity-90 sm:-right-10 lg:right-[6%]" : "-right-16 -top-28 h-[300px] w-[300px] opacity-60"
        }`}
      />
      <div className="relative mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {home ? (
          <div className="flex flex-col gap-8 pb-8 pt-10 sm:pt-14">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#c9a54e]">
                <Orbit className="h-4 w-4" /> Astroloji
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Gökyüzü Atlası</h1>
              <p className="mt-3 text-base text-slate-300 sm:text-lg">Gökyüzünün dili, analizlerinizin derinliği.</p>
            </div>
            <nav aria-label="Gökyüzü Atlası" className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {NAV.map(({ key, label, desc, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onNavigate(key)}
                  className="group flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-sm transition hover:border-[#c9a54e]/60 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#c9a54e]/40 text-[#c9a54e]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-base font-semibold">
                      {label}
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#c9a54e]" />
                    </span>
                    <span className="mt-1 block text-sm text-slate-400">{desc}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
        ) : (
          <div className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 ${dense ? "pt-1.5 lg:flex-nowrap" : "pt-4"}`}>
            <button type="button" onClick={() => onNavigate("home")} className="flex shrink-0 items-center gap-3 py-1 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c9a54e]/40 text-[#c9a54e]">
                <Orbit className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-lg font-semibold leading-tight tracking-tight">Gökyüzü Atlası</span>
                {!dense && <span className="block text-xs text-slate-400">Gökyüzünün dili, analizlerinizin derinliği.</span>}
              </span>
            </button>
            {!dense && !bare && ownerTools}
            {bare ? (
              <div className="w-full pb-3" aria-hidden="true" />
            ) : (
            <nav aria-label="Gökyüzü Atlası" className={`-mb-px flex gap-1 overflow-x-auto ${dense ? "w-full lg:w-auto lg:flex-1" : "w-full"}`}>
              {NAV.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-current={activeKey === key ? "page" : undefined}
                  onClick={() => onNavigate(key)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 ${dense ? "py-2.5" : "py-3"} text-sm font-medium transition ${
                    activeKey === key ? "border-[#c9a54e] text-white" : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
              {dense && <span className="ml-auto hidden shrink-0 items-center lg:flex">{ownerTools}</span>}
              {view === "audit" && (
                <span className="inline-flex shrink-0 items-center gap-2 border-b-2 border-[#c9a54e] px-3 py-3 text-sm font-medium text-white">
                  <Settings2 className="h-4 w-4" /> Alan denetimi
                </span>
              )}
            </nav>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Görünüm başlığı (iç görünümler). */
export function AtlasViewTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
