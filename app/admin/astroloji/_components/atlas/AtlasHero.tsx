"use client";

/**
 * Gökyüzü Atlası — ana ekran sahnesi: tam genişlikte 3D gök küresi + başlık + üç giriş yüzeyi (TEK navigasyon).
 * Sahne dekoratiftir; işlevler sahne yüklenmese de (WebGL yok / hata / yavaş ağ) aynen çalışır.
 */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { StaticSky } from "./CelestialScene";
import { atlasDisplay, atlasText } from "./fonts";

const CelestialScene = dynamic(() => import("./CelestialScene"), {
  ssr: false,
  loading: () => <StaticSky className="absolute inset-0 h-full w-full opacity-60" />,
});

/* ── Amblemler (ince çizgi, altın) ─────────────────────────────────────────────────────────────── */
function CompassEmblem() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="32" cy="32" r="26" opacity="0.55" />
      <circle cx="32" cy="32" r="19" opacity="0.35" strokeDasharray="1.5 3" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={32 + 26 * Math.cos(a)} y1={32 + 26 * Math.sin(a)} x2={32 + 23 * Math.cos(a)} y2={32 + 23 * Math.sin(a)} opacity="0.7" />;
      })}
      <path d="M32 9 L36 28 L55 32 L36 36 L32 55 L28 36 L9 32 L28 28 Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M32 18 L34.5 32 L32 46 L29.5 32 Z" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <circle cx="32" cy="32" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="46" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="45" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function AtlasEmblem() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M12 14 C20 11 26 12 32 16 C38 12 44 11 52 14 V50 C44 47 38 48 32 52 C26 48 20 47 12 50 Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M32 16 V52" opacity="0.6" />
      <circle cx="22" cy="30" r="7" opacity="0.8" />
      <ellipse cx="22" cy="30" rx="7" ry="2.6" opacity="0.55" />
      <path d="M22 23 V37" opacity="0.55" />
      <path d="M38 24 H47 M38 30 H46 M38 36 H45 M38 42 H44" opacity="0.6" />
      <circle cx="47" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function BookEmblem() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M8 44 C18 40 26 41 32 46 C38 41 46 40 56 44 V22 C46 18 38 19 32 24 C26 19 18 18 8 22 Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M32 24 V46" opacity="0.6" />
      <g fill="currentColor" stroke="none">
        <circle cx="20" cy="9" r="1.6" />
        <circle cx="29" cy="14" r="1.2" />
        <circle cx="38" cy="8" r="1.8" />
        <circle cx="46" cy="15" r="1.2" />
      </g>
      <path d="M20 9 L29 14 L38 8 L46 15" opacity="0.55" strokeDasharray="2 2" />
      <path d="M14 30 C18 29 22 29 26 31 M14 36 C18 35 22 35 26 37 M38 31 C42 29 46 29 50 30 M38 37 C42 35 46 35 50 36" opacity="0.5" />
    </svg>
  );
}

type Portal = { key: "new" | "archive" | "kb"; title: string; desc: string; emblem: ReactNode; tint: string; ring: string; glow: string; chip: string; line: string };
const PORTALS: Portal[] = [
  {
    key: "new",
    title: "Yeni Analiz",
    desc: "Doğum profilini seçin, Batı · Vedik · KP tekniklerini belirleyin, haritayı hesaplayın.",
    emblem: <CompassEmblem />,
    tint: "from-[#9c86e8]/[0.22] via-[#E9E0FA]/[0.06] to-transparent",
    ring: "group-hover:border-[#E9E0FA]/60",
    glow: "bg-[#9c86e8]",
    chip: "text-[#c9b8f7]",
    line: "from-transparent via-[#c9b8f7] to-transparent",
  },
  {
    key: "archive",
    title: "Analiz Arşivi",
    desc: "Danışanlar, doğum profilleri ve kayıtlı analizlerden oluşan çalışma kütüphaneniz.",
    emblem: <AtlasEmblem />,
    tint: "from-[#46b3a3]/[0.22] via-[#DDF3F0]/[0.06] to-transparent",
    ring: "group-hover:border-[#DDF3F0]/60",
    glow: "bg-[#5cc5b5]",
    chip: "text-[#8fdccf]",
    line: "from-transparent via-[#8fdccf] to-transparent",
  },
  {
    key: "kb",
    title: "Bilgi Bankası",
    desc: "Kendi yorum ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir.",
    emblem: <BookEmblem />,
    tint: "from-[#d9a65a]/[0.22] via-[#FFF0D2]/[0.06] to-transparent",
    ring: "group-hover:border-[#FFF0D2]/60",
    glow: "bg-[#d9b56f]",
    chip: "text-[#e9c98a]",
    line: "from-transparent via-[#e9c98a] to-transparent",
  },
];

export default function AtlasHero({ onNavigate, children }: { onNavigate: (v: "new" | "archive" | "kb") => void; children?: ReactNode }) {
  return (
    <section className={`${atlasDisplay.variable} ${atlasText.variable} relative isolate overflow-hidden bg-[#080F24] text-[#F6F2EA] [font-family:var(--font-atlas-text)]`} aria-labelledby="atlas-title" data-testid="atlas-hero">
      {/* katmanlı arka plan: derin gece → indigo; sahne üstte */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_70%_35%,rgba(52,49,108,0.85),transparent_70%),linear-gradient(180deg,#080F24_0%,#0B1430_55%,#0B1430_100%)]" />
      <CelestialScene className="pointer-events-none absolute inset-x-0 top-0 h-[460px] [mask-image:linear-gradient(180deg,#000_70%,transparent)] sm:h-[560px] lg:h-[660px]" />
      {/* okunabilirlik için sol kenarda yumuşak karartma */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,15,36,0)_0%,rgba(8,15,36,0)_30%,rgba(8,15,36,0.75)_52%,rgba(8,15,36,0.9)_100%)] sm:bg-[linear-gradient(90deg,rgba(8,15,36,0.92)_0%,rgba(8,15,36,0.55)_38%,rgba(8,15,36,0)_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#0B1430]" />

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[360px] flex-col justify-end pb-8 pt-[260px] sm:min-h-[420px] sm:pb-10 sm:pt-28 lg:min-h-[520px] lg:justify-center lg:pb-16 lg:pt-16">
          <div className="max-w-xl">
            <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-[#E6CF9F] sm:text-[13px]">
              <span className="h-px w-10 bg-gradient-to-r from-transparent via-[#D9B56F]/70 to-[#D9B56F]" />
              <span>YAŞAM SİSTEMİ</span>
              <span className="-mx-1 text-[#D9B56F]/70" aria-hidden="true">·</span>
              <span>ASTROLOJİ</span>
            </p>
            <h1
              id="atlas-title"
              className="mt-4 text-[2.05rem] font-light leading-[1.12] tracking-[0.06em] text-[#ECE5D6] [font-family:var(--font-atlas-display)] [text-shadow:0_0_16px_rgba(217,181,111,0.06),0_2px_14px_rgba(8,15,36,0.8)] sm:text-[2.7rem] lg:text-[3.2rem]"
            >
              <span className="block">GÖKYÜZÜ</span>
              <span className="block bg-gradient-to-r from-[#EAD8B0] via-[#E1C590] to-[#D4B271] bg-clip-text font-normal tracking-[0.1em] text-transparent">ATLASI</span>
            </h1>
            <span className="mt-5 block h-px w-20 bg-gradient-to-r from-[#D9B56F]/80 via-[#D9B56F]/35 to-transparent" aria-hidden="true" />
            <p className="mt-4 max-w-md text-base font-light leading-relaxed tracking-[0.015em] text-[#E3E0EA] sm:text-[1.08rem] lg:text-lg">Gökyüzünün dili, analizlerinizin derinliği.</p>
          </div>
        </div>

        <nav aria-label="Gökyüzü Atlası" className="relative grid grid-cols-1 gap-3 pb-10 lg:grid-cols-3 lg:gap-4">
          {PORTALS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onNavigate(p.key)}
              className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br ${p.tint} p-4 text-left backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5 ${p.ring}`}
            >
              <span className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full ${p.glow} opacity-35 blur-3xl transition-opacity duration-300 group-hover:opacity-60`} />
              <span className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r ${p.line} opacity-80`} />
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 motion-reduce:hidden" />
              <span className={`relative h-14 w-14 shrink-0 ${p.chip} sm:h-16 sm:w-16`}>{p.emblem}</span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-lg font-semibold tracking-[0.01em] text-[#F6F2EA]">{p.title}</span>
                <span className="mt-1 block text-sm leading-snug text-[#F6F2EA]/78">{p.desc}</span>
              </span>
              <span className="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-[#F6F2EA]/70 transition group-hover:border-[#D9B56F]/70 group-hover:text-[#D9B56F] sm:flex">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M4 10h11M11 5l5 5-5 5" />
                </svg>
              </span>
            </button>
          ))}
        </nav>

        {children}
      </div>
    </section>
  );
}
