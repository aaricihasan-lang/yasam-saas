"use client";

/**
 * Gökyüzü Atlası — görsel kabuk (yalnız sunum): tasarım sistemi değerleri, iç görünüm başlığı ve TEK ana navigasyon.
 * Ana ekranın büyük giriş kartları AtlasHero'dadır; iç görünümlerde aynı öğeler kompakt sekme kapsülü olarak çizilir
 * (aynı işlev iki kez gösterilmez). İş mantığı / yetki burada yok.
 */
import type { ReactNode } from "react";
import { Archive, BookOpen, ChevronRight, Orbit, Settings2, Sparkles } from "lucide-react";
import { atlasDisplay, atlasText } from "./atlas/fonts";

/** "client" = Danışan Dosyası (#danisan/<id>) — Analiz Arşivi'nin detay görünümü. "soon" = Yakında (yalnız statik bilgi). */
export type AtlasView = "home" | "new" | "archive" | "client" | "result" | "kb" | "audit" | "soon";

export const ATLAS = {
  navy: "#0b1430",
  navy2: "#14214a",
  gold: "#c9a54e",
  blue: "#6aa8ff",
} as const;

/* ── TASARIM SİSTEMİ (tek kaynak) ────────────────────────────────────────────────────────────────
 * Gece kabuğu (lacivert zemin) + iki yüzey türü:
 *   • atlasSurface — koyu cam panel (gezinme, araç çubukları, kabuk öğeleri; açık metin)
 *   • atlasPanel   — "kâğıt" panel (yoğun veri, liste, form, okuma; koyu metin) → rapor gibi ama arayüz içinde
 * Altın: birincil eylem ve vurgu çizgileri. Hazırlık Merkezi ve Sonuç masası aynı değerleri kullanır. */
export const atlasSurface =
  "relative rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_48px_-28px_rgba(0,0,0,0.85)]";
/** Altın küçük başlık (eyebrow). */
export const atlasEyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#E6CF9F]/85";
/** Birincil eylem düğmesi (altın). */
export const atlasPrimaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[linear-gradient(180deg,#E6C887,#C9A158)] px-4 py-2 text-sm font-semibold text-[#0B1430] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-10px_rgba(217,181,111,0.7)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B1430] disabled:cursor-not-allowed disabled:opacity-50";
/** İkincil düğme (kâğıt panel üzerinde). */
export const atlasSecondaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9c9a3] bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-[#b8954e] hover:text-[#0b1430] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e] disabled:opacity-50";
/** Hayalet düğme (koyu kabuk üzerinde). */
export const atlasGhostBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-[#F6F2EA]/90 transition hover:border-[#D9B56F]/70 hover:text-[#F6E7C3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] disabled:opacity-40";
/** Tehlikeli eylem (kâğıt panel üzerinde). */
export const atlasDangerBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white/70 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-40";
/** İçerik paneli ("kâğıt"). */
export const atlasPanel =
  "rounded-2xl border border-[#e7dcc3] bg-[#FBF8F2] text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_50px_-30px_rgba(0,0,0,0.9)] max-sm:rounded-none max-sm:border-x-0";
/** Koyu kabuk üzerindeki giriş alanı. */
export const atlasDarkInput =
  "rounded-lg border border-white/12 bg-black/25 px-3 py-2 text-sm text-[#F6F2EA] placeholder:text-[#F6F2EA]/40 outline-none transition focus:border-[#D9B56F]/70 [color-scheme:dark]";
/** Kâğıt panel üzerindeki giriş alanı. */
export const atlasPaperInput =
  "rounded-lg border border-[#d9c9a3] bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#b8954e] focus:ring-2 focus:ring-[#D9B56F]/25";
/** İç görünümlerin gece zemini (ana sayfa hariç). */
export const atlasNightBg = "bg-[radial-gradient(ellipse_90%_60%_at_50%_0%,#1c2257_0%,#0d1438_45%,#080F24_100%)]";

/** Atlas ana sekmeleri (tek kaynak; gece kabuğu ve açık premium başlık aynı listeyi kullanır). */
export const ATLAS_NAV: { key: "new" | "archive" | "kb"; label: string; Icon: typeof Sparkles }[] = [
  { key: "new", label: "Yeni Analiz", Icon: Sparkles },
  { key: "archive", label: "Analiz Arşivi", Icon: Archive },
  { key: "kb", label: "Bilgi Bankası", Icon: BookOpen },
];

/** Harita ve yörünge geometrisinden esinlenen ince çizgi süsleme (dekoratif; erişilebilirlik ağacında yok). */
function OrbitArt({ className }: { className?: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const pt = (r: number, deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)] as const;
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={className}>
      <g fill="none" strokeWidth="0.8">
        <circle cx="200" cy="200" r="190" stroke={ATLAS.gold} strokeOpacity="0.3" />
        <circle cx="200" cy="200" r="168" stroke={ATLAS.gold} strokeOpacity="0.18" />
        <circle cx="200" cy="200" r="132" stroke={ATLAS.blue} strokeOpacity="0.18" strokeDasharray="2 5" />
        {ticks.map((d) => {
          const [x1, y1] = pt(186, d);
          const [x2, y2] = pt(d % 30 === 0 ? 168 : 180, d);
          return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ATLAS.gold} strokeOpacity={d % 30 === 0 ? 0.4 : 0.18} />;
        })}
      </g>
    </svg>
  );
}

/**
 * İç görünümlerin başlığı (ana sayfa AtlasHero'dadır). Gece zemininde saydam; amblem + ad, ana sekmeler (altın
 * vurgulu kapsül) ve isteğe bağlı owner araçları. Analiz Arşivi / Danışan Dosyası'nda sekme satırı yerine konum
 * izi (breadcrumb) gösterilir.
 */
export function AtlasHeader({
  view,
  resultFrom = "new",
  onNavigate,
  ownerTools,
  bare = false,
}: {
  /** Analiz Arşivi / Danışan Dosyası: sekme satırı ve "Önizleme ve denetim" yerine konum izi. */
  bare?: boolean;
  view: AtlasView;
  /** Sonuç görünümü hangi bölümden açıldı (sekme vurgusu için). */
  resultFrom?: "new" | "archive";
  onNavigate: (v: AtlasView) => void;
  /** Yalnız iç görünümlerde ve yalnız owner'da gösterilir. */
  ownerTools?: ReactNode;
}) {
  /** Sonuç çalışma masası ve Hazırlık Merkezi'nde başlık tek satır (harita / ön izleme için dikey alan). */
  const dense = view === "result" || view === "new";
  const activeKey = view === "result" ? resultFrom : view === "client" ? "archive" : view;
  const crumbs: { label: string; to?: AtlasView }[] =
    view === "client" ? [{ label: "Analiz Arşivi", to: "archive" }, { label: "Danışan Dosyası" }] : [{ label: "Analiz Arşivi" }];
  return (
    <header className={`${atlasDisplay.variable} ${atlasText.variable} relative overflow-hidden text-[#F6F2EA] [font-family:var(--font-atlas-text)]`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_120%_at_92%_0%,rgba(106,168,255,0.12),transparent_60%),radial-gradient(ellipse_40%_120%_at_0%_100%,rgba(217,181,111,0.08),transparent_60%)]" />
      <OrbitArt className="pointer-events-none absolute -right-20 -top-32 h-[300px] w-[300px] opacity-50" />
      <div className="relative mx-auto w-full max-w-[1600px] px-3 sm:px-6 lg:px-8">
        <div className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-white/[0.07] ${dense ? "py-2 lg:flex-nowrap" : "py-3"}`}>
          <button type="button" onClick={() => onNavigate("home")} className="group flex shrink-0 items-center gap-3 py-0.5 text-left" title="Gökyüzü Atlası ana ekranı">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#D9B56F]/50 text-[#E6CF9F] shadow-[0_0_24px_-6px_rgba(217,181,111,0.6)] transition group-hover:border-[#D9B56F]">
              <span className="absolute inset-1 rounded-full border border-[#D9B56F]/20" />
              <Orbit className="h-[18px] w-[18px]" />
            </span>
            <span>
              {!dense && <span className="block text-[10px] font-semibold tracking-[0.2em] text-[#E6CF9F]/80">YAŞAM SİSTEMİ · ASTROLOJİ</span>}
              <span className="block text-[17px] font-light leading-tight tracking-[0.06em] [font-family:var(--font-atlas-display)]">
                GÖKYÜZÜ <span className="text-[#E1C590]">ATLASI</span>
              </span>
            </span>
          </button>

          {bare ? (
            <nav aria-label="Konum" className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[#F6F2EA]/60">
                {crumbs.map((c, i) => (
                  <li key={c.label} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#D9B56F]/60" aria-hidden="true" />}
                    {c.to ? (
                      <button type="button" onClick={() => onNavigate(c.to!)} className="rounded px-1 hover:text-[#F6E7C3]">
                        {c.label}
                      </button>
                    ) : (
                      <span aria-current="page" className="px-1 font-medium text-[#F6F2EA]">
                        {c.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          ) : (
            <nav aria-label="Gökyüzü Atlası" className={`flex gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-black/20 p-1 [scrollbar-width:none] ${dense ? "w-full lg:w-auto" : "w-full sm:w-auto"}`}>
              {ATLAS_NAV.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-current={activeKey === key ? "page" : undefined}
                  onClick={() => onNavigate(key)}
                  className={`inline-flex flex-1 shrink-0 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition sm:flex-none sm:px-3.5 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] ${
                    activeKey === key
                      ? "bg-[linear-gradient(180deg,rgba(230,200,135,0.22),rgba(201,161,88,0.08))] font-medium text-[#F6E7C3] shadow-[inset_0_0_0_1px_rgba(217,181,111,0.45)]"
                      : "text-[#F6F2EA]/65 hover:bg-white/[0.05] hover:text-[#F6F2EA]"
                  }`}
                >
                  <Icon className="hidden h-4 w-4 sm:block" /> {label}
                </button>
              ))}
              {view === "audit" && (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-[#F6F2EA]">
                  <Settings2 className="h-4 w-4" /> Alan denetimi
                </span>
              )}
            </nav>
          )}
          {!bare && ownerTools && <span className={dense ? "hidden shrink-0 lg:flex" : "flex shrink-0"}>{ownerTools}</span>}
        </div>
      </div>
    </header>
  );
}

/** Görünüm başlığı (iç görünümler; gece zemininde): altın eyebrow + ince serif başlık + açıklama. */
export function AtlasViewTitle({ title, sub, eyebrow, actions }: { title: string; sub?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className={`${atlasDisplay.variable} flex flex-wrap items-end justify-between gap-3 max-sm:px-3`}>
      <div className="min-w-0">
        {eyebrow && <p className={atlasEyebrow}>{eyebrow}</p>}
        <h2 className="mt-1 text-2xl font-light tracking-[0.03em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-[1.75rem]">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-sm text-[#F6F2EA]/65">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
