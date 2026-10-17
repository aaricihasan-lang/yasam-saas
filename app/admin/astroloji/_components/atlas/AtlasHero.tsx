"use client";

/**
 * Gökyüzü Atlası — ana ekran "kontrol paneli": solda dikey giriş kartları (TEK navigasyon), sağda hareketli 3D gök
 * sahnesi + başlık. Masaüstünde sayfa, üstteki Yaşam Sistemi çubuğu dâhil görünür yüksekliğe sığar (dikey kaydırma yok).
 * Sahne dekoratiftir; işlevler sahne yüklenmese de (WebGL yok / hata / yavaş ağ) aynen çalışır.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { StaticSky } from "./CelestialScene";
import { atlasDisplay, atlasText } from "./fonts";

const CelestialScene = dynamic(() => import("./CelestialScene"), {
  ssr: false,
  loading: () => <StaticSky className="absolute inset-0 h-full w-full opacity-60" />,
});

/* ── Amblemler (ince çizgi) ────────────────────────────────────────────────────────────────────── */
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
function ClockEmblem() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="currentColor" fillOpacity="0.1" />
      <circle cx="32" cy="32" r="16" opacity="0.4" strokeDasharray="1.5 3" />
      <path d="M32 18 V32 L42 38" opacity="0.85" />
      <path d="M10 26 A23 23 0 0 1 20 12 M14 12 L20 12 L20 18" opacity="0.6" />
      <circle cx="32" cy="32" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="51" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

type PortalKey = "new" | "archive" | "kb" | "recent";
type Portal = { key: PortalKey; title: string; desc: string; emblem: ReactNode; tint: string; ring: string; glow: string; chip: string; line: string };
const PORTALS: Portal[] = [
  {
    key: "new",
    title: "Yeni Analiz",
    desc: "Doğum profilini seçin, Batı · Vedik · KP tekniklerini belirleyin, haritayı hesaplayın.",
    emblem: <CompassEmblem />,
    tint: "from-[#9c86e8]/[0.22] via-[#E9E0FA]/[0.05] to-transparent",
    ring: "hover:border-[#E9E0FA]/60",
    glow: "bg-[#9c86e8]",
    chip: "text-[#c9b8f7]",
    line: "from-transparent via-[#c9b8f7] to-transparent",
  },
  {
    key: "archive",
    title: "Analiz Arşivi",
    desc: "Danışanlar, doğum profilleri ve kayıtlı analizlerden oluşan çalışma kütüphaneniz.",
    emblem: <AtlasEmblem />,
    tint: "from-[#46b3a3]/[0.22] via-[#DDF3F0]/[0.05] to-transparent",
    ring: "hover:border-[#DDF3F0]/60",
    glow: "bg-[#5cc5b5]",
    chip: "text-[#8fdccf]",
    line: "from-transparent via-[#8fdccf] to-transparent",
  },
  {
    key: "kb",
    title: "Bilgi Bankası",
    desc: "Kendi yorum ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir.",
    emblem: <BookEmblem />,
    tint: "from-[#d9a65a]/[0.22] via-[#FFF0D2]/[0.05] to-transparent",
    ring: "hover:border-[#FFF0D2]/60",
    glow: "bg-[#d9b56f]",
    chip: "text-[#e9c98a]",
    line: "from-transparent via-[#e9c98a] to-transparent",
  },
  {
    key: "recent",
    title: "Son Çalışmalar",
    desc: "En son işlem yapılan doğum profilleri — kaldığınız yerden devam edin.",
    emblem: <ClockEmblem />,
    tint: "from-[#5b8be0]/[0.2] via-[#DCE8FF]/[0.04] to-transparent",
    ring: "hover:border-[#DCE8FF]/55",
    glow: "bg-[#6f9be8]",
    chip: "text-[#a9c4f5]",
    line: "from-transparent via-[#a9c4f5] to-transparent",
  },
];

export default function AtlasHero({
  onNavigate,
  onRecent,
  onNewProfile,
}: {
  onNavigate: (v: "new" | "archive" | "kb") => void;
  onRecent: () => void;
  onNewProfile: () => void;
}) {
  // İlk ekran = görünür alan − üstteki admin çubuğu: bölümün sayfa üstünden uzaklığı ölçülüp CSS değişkenine yazılır.
  const firstRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = firstRef.current;
    if (!el) return;
    const measure = () => el.style.setProperty("--atlas-top", `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // "Son Çalışmalar" → Analiz Arşivi, "Son analiz: en yeni" sıralamasıyla (onRecent).
  const open = (k: PortalKey) => (k === "recent" ? onRecent() : onNavigate(k));

  return (
    <div className={`${atlasDisplay.variable} ${atlasText.variable} relative isolate overflow-hidden bg-[#080F24] text-[#F6F2EA] [font-family:var(--font-atlas-text)]`} data-testid="atlas-hero">
      {/* katmanlı arka plan: derin gece → indigo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_72%_32%,rgba(52,49,108,0.8),transparent_70%),radial-gradient(ellipse_40%_35%_at_8%_18%,rgba(76,58,150,0.22),transparent_70%),linear-gradient(180deg,#080F24_0%,#0B1430_60%,#0B1430_100%)]" />

      {/* ── İLK EKRAN: sol kartlar + sağ sahne (mobil/tablet: sahne üstte, kartlar 2×2) ── */}
      <section
        ref={firstRef}
        aria-labelledby="atlas-title"
        className="relative mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:h-[calc(100svh-var(--atlas-top,72px))] lg:min-h-[520px] lg:grid-cols-[minmax(360px,420px)_1fr] lg:gap-6 lg:px-8 lg:py-5 xl:grid-cols-[470px_1fr]"
      >
        <div className="relative h-[330px] overflow-hidden sm:h-[380px] lg:order-2 lg:h-full lg:rounded-[28px] lg:border lg:border-white/[0.07] lg:bg-[#0A1230]/40">
          <CelestialScene className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(180deg,#000_75%,transparent)] lg:[mask-image:none]" />
          {/* okunabilirlik: metin tarafında yumuşak karartma */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,15,36,0)_30%,rgba(8,15,36,0.85)_100%)] sm:bg-[linear-gradient(90deg,rgba(8,15,36,0.85)_0%,rgba(8,15,36,0.45)_34%,rgba(8,15,36,0)_58%)]" />

          {/* 2026-10-15: Atlas, Yaşam Analiz Merkezi'nin içinde → modülden çıkış oraya döner. */}
          <Link
            href="/life-analysis"
            className="absolute left-3 top-3 z-10 inline-flex min-h-[40px] items-center gap-1 rounded-full border border-white/15 bg-[#0A1230]/70 px-3 py-1.5 text-[12.5px] font-medium text-[#F6F2EA]/90 backdrop-blur transition hover:border-[#D9B56F]/60 hover:text-[#F6E7C3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] sm:left-5 sm:top-4"
            data-testid="atlas-back-to-center"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Yaşam Analiz Merkezi
          </Link>
          <div className="relative flex h-full flex-col justify-end px-3 pb-5 sm:max-w-[62%] sm:justify-center sm:px-8 sm:pb-0 lg:max-w-[50%] lg:px-12">
            <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-[#E6CF9F] sm:text-[13px]">
              <span className="h-px w-8 bg-gradient-to-r from-transparent via-[#D9B56F]/70 to-[#D9B56F] sm:w-10" />
              <span>YAŞAM SİSTEMİ</span>
              <span className="-mx-1 text-[#D9B56F]/70" aria-hidden="true">·</span>
              <span>ASTROLOJİ</span>
            </p>
            <h1
              id="atlas-title"
              className="mt-3 text-[1.85rem] font-light leading-[1.1] tracking-[0.06em] text-[#ECE5D6] [font-family:var(--font-atlas-display)] [text-shadow:0_0_16px_rgba(217,181,111,0.06),0_2px_14px_rgba(8,15,36,0.8)] sm:mt-4 sm:text-[2.6rem] xl:text-[3.3rem]"
            >
              <span className="block">GÖKYÜZÜ</span>
              <span className="block bg-gradient-to-r from-[#EAD8B0] via-[#E1C590] to-[#D4B271] bg-clip-text font-normal tracking-[0.1em] text-transparent">ATLASI</span>
            </h1>
            <span className="mt-4 hidden h-px w-20 bg-gradient-to-r from-[#D9B56F]/80 via-[#D9B56F]/35 to-transparent sm:block" aria-hidden="true" />
            <p className="mt-2 max-w-md text-sm font-light leading-relaxed tracking-[0.015em] text-[#E3E0EA] sm:mt-4 sm:text-[1.05rem] xl:text-lg">Gökyüzünün dili, analizlerinizin derinliği.</p>
            <div className="mt-4 sm:mt-7">
              <button
                type="button"
                onClick={onNewProfile}
                className="inline-flex items-center gap-2 rounded-full border border-[#D9B56F]/55 bg-[#D9B56F]/[0.08] px-4 py-2 text-sm font-medium text-[#F6E7C3] shadow-[0_0_30px_-8px_rgba(217,181,111,0.55)] backdrop-blur-sm transition hover:border-[#D9B56F] hover:bg-[#D9B56F]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F] sm:px-5 sm:py-2.5"
              >
                <span aria-hidden="true">＋</span> Yeni doğum profili
              </button>
            </div>
          </div>
        </div>

        <nav aria-label="Gökyüzü Atlası" className="relative z-10 grid grid-cols-2 gap-2 px-2 pb-6 pt-1 sm:gap-3 sm:px-6 lg:order-1 lg:grid-cols-1 lg:content-center lg:gap-3.5 lg:p-0">
          {PORTALS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => open(p.key)}
              data-portal={p.key}
              className={`group relative flex min-h-[72px] items-center gap-3 overflow-hidden rounded-2xl border border-white/12 bg-[#0B1430]/55 bg-gradient-to-br ${p.tint} p-3 text-left backdrop-blur-md transition duration-300 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F] motion-reduce:transition-none sm:gap-4 sm:p-4 lg:min-h-[96px] lg:px-4 lg:py-3.5 lg:hover:translate-x-1 lg:motion-reduce:hover:translate-x-0 xl:p-5 ${p.ring}`}
            >
              <span className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full ${p.glow} opacity-30 blur-3xl transition-opacity duration-300 group-hover:opacity-60`} />
              <span className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r ${p.line} opacity-80`} />
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 motion-reduce:hidden" />
              <span className={`relative h-10 w-10 shrink-0 ${p.chip} sm:h-14 sm:w-14 lg:h-12 lg:w-12 xl:h-14 xl:w-14`}>{p.emblem}</span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight tracking-[0.01em] text-[#F6F2EA] sm:text-lg">{p.title}</span>
                <span className="mt-1 hidden text-sm leading-snug text-[#F6F2EA]/75 sm:block lg:text-[13.5px]">{p.desc}</span>
              </span>
              <span className="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-[#F6F2EA]/70 transition group-hover:border-[#D9B56F]/70 group-hover:text-[#D9B56F] sm:flex">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M4 10h11M11 5l5 5-5 5" />
                </svg>
              </span>
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}
