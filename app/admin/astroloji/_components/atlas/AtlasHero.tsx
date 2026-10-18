"use client";

/**
 * Gökyüzü Atlası — ana ekran "kontrol paneli": solda dikey giriş kartları (TEK navigasyon), sağda hareketli kozmik
 * panel + başlık. Masaüstünde sayfa, üstteki Yaşam Sistemi çubuğu dâhil görünür yüksekliğe sığar (dikey kaydırma yok).
 *
 * 2026-10-18 premium v2 görünüm (owner onaylı prototip, tasarım arşivi 140614b): kart arka planları ve gök küresi
 * referanstan kesilmiş raster görseller (public/premium/gokyuzu-atlasi); başlık / açıklamalar HTML. Kartlarda OK YOK;
 * kartın tamamı tek düğme. Kozmik hareket yalnız CSS (yıldız parıltısı, ışık tozu, kayan yıldız, halkada dolaşan ışık)
 * + fare derinliği; "hareketi azalt" açıkken durur. Yalnız görünüm değişti: giriş kartlarının yönlendirmesi
 * (onNavigate / onRecent), "Yeni doğum profili" (onNewProfile) ve Analiz Merkezi'ne dönüş bağlantısı aynen korunur.
 */
import Link from "next/link";
import { Fraunces, Jost } from "next/font/google";
import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./atlasHero.module.css";

const gaDisplay = Fraunces({ subsets: ["latin", "latin-ext"], axes: ["opsz", "SOFT"], variable: "--ga-display", display: "swap" });
const gaLabel = Jost({ subsets: ["latin", "latin-ext"], weight: ["500"], variable: "--ga-label", display: "swap" });

/** Dört köşeli yıldız (parıltı + ayraç). */
function Star4() {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">
      <path d="M0 -12 C1 -3 3 -1 12 0 C3 1 1 3 0 12 C-1 3 -3 1 -12 0 C-3 -1 -1 -3 0 -12Z" fill="currentColor" />
    </svg>
  );
}

/** Sağ panel yıldız parıltıları: konum (% panel), boyut (px), gecikme (sn) — sabit (SSR/istemci aynı). */
const TWINKLES = [
  { x: 54, y: 9, s: 16, d: 0 },
  { x: 86, y: 6, s: 11, d: 2.4 },
  { x: 44, y: 24, s: 9, d: 4.1 },
  { x: 97, y: 38, s: 10, d: 1.2 },
  { x: 72, y: 80, s: 14, d: 3.3 },
  { x: 48, y: 90, s: 10, d: 5.2 },
  { x: 93, y: 70, s: 9, d: 0.8 },
  { x: 38, y: 58, s: 8, d: 6 },
  { x: 63, y: 30, s: 12, d: 1.8 },
  { x: 80, y: 52, s: 10, d: 4.6 },
  { x: 58, y: 66, s: 9, d: 2.9 },
  { x: 30, y: 12, s: 8, d: 5.7 },
];

/** Yavaş akan ışık tozu: başlangıç konumu (%), boyut (px), süre / gecikme (sn), yön (px). */
const DUST = [
  { x: 52, y: 70, s: 3, dur: 26, d: 0, dx: 40, dy: -90 },
  { x: 66, y: 85, s: 2, dur: 30, d: 6, dx: -30, dy: -110 },
  { x: 78, y: 60, s: 3, dur: 24, d: 12, dx: 30, dy: -80 },
  { x: 90, y: 88, s: 2, dur: 28, d: 3, dx: -40, dy: -100 },
  { x: 60, y: 40, s: 2, dur: 32, d: 9, dx: 50, dy: -70 },
  { x: 84, y: 30, s: 3, dur: 27, d: 15, dx: -30, dy: -60 },
  { x: 44, y: 50, s: 2, dur: 29, d: 18, dx: 40, dy: -90 },
  { x: 72, y: 20, s: 2, dur: 31, d: 21, dx: 20, dy: -50 },
];

type PortalKey = "new" | "archive" | "kb" | "recent";
type Portal = { key: PortalKey; title: string; desc: string; tone: "violet" | "teal" | "gold" | "blue"; art: string };
const PORTALS: Portal[] = [
  {
    key: "new",
    title: "Yeni Analiz",
    desc: "Doğum profilini seçin, Batı · Vedik · KP tekniklerini belirleyin, haritayı hesaplayın.",
    tone: "violet",
    art: "kart-yeni-analiz",
  },
  {
    key: "archive",
    title: "Analiz Arşivi",
    desc: "Danışanlar, doğum profilleri ve kayıtlı analizlerden oluşan çalışma kütüphaneniz.",
    tone: "teal",
    art: "kart-analiz-arsivi",
  },
  {
    key: "kb",
    title: "Bilgi Bankası",
    desc: "Kendi yorum ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir.",
    tone: "gold",
    art: "kart-bilgi-bankasi",
  },
  {
    key: "recent",
    title: "Son Çalışmalar",
    desc: "En son işlem yapılan doğum profilleri — kaldığınız yerden devam edin.",
    tone: "blue",
    art: "kart-son-calismalar",
  },
];

// Owner sınırı: kart eğimi ~2–3°; dokunmatikte ve "hareketi azalt" açıkken eğim/derinlik yok.
const TILT_X = 2 * 0.7;
const TILT_Y = 2.2 * 0.7;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py"];

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fareyle eğim (tilt>0) ve iç katman derinliği; rAF ile kare başına en çok bir güncelleme. */
function useTilt(tilt: number) {
  const frame = useRef<number | null>(null);
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch" || reduceMotion()) return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = Math.min(Math.max((clientX - r.left) / r.width - 0.5, -0.5), 0.5);
      const py = Math.min(Math.max((clientY - r.top) / r.height - 0.5, -0.5), 0.5);
      if (tilt > 0) {
        el.dataset.tilting = "true";
        el.style.setProperty("--rx", `${(-py * 2 * TILT_X * tilt).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(px * 2 * TILT_Y * tilt).toFixed(2)}deg`);
      }
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    });
  };
  const onPointerLeave = (e: ReactPointerEvent<HTMLElement>) => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const el = e.currentTarget;
    delete el.dataset.tilting;
    for (const p of TILT_PROPS) el.style.removeProperty(p);
  };
  return { onPointerMove, onPointerLeave };
}

function PortalCard({ p, onOpen }: { p: Portal; onOpen: (k: PortalKey) => void }) {
  const tilt = useTilt(1);
  return (
    <button type="button" onClick={() => onOpen(p.key)} data-portal={p.key} data-tone={p.tone} className={styles.card} {...tilt}>
      <span className={styles.cardBg} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
        <img src={`/premium/gokyuzu-atlasi/${p.art}.webp`} width={542} height={155} alt="" draggable={false} />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{p.title}</span>
        <span className={styles.cardDesc}>{p.desc}</span>
      </span>
      <span className={styles.sheen} aria-hidden="true" />
    </button>
  );
}

export default function AtlasHero({
  onNavigate,
  onRecent,
  onNewProfile,
  onSoon,
}: {
  onNavigate: (v: "new" | "archive" | "kb") => void;
  onRecent: () => void;
  onNewProfile: () => void;
  /** "Yakında" bilgilendirme görünümü (statik; veri / istek yok). */
  onSoon: () => void;
}) {
  // İlk ekran = görünür alan − üstteki admin çubuğu: bölümün sayfa üstünden uzaklığı ölçülüp CSS değişkenine yazılır.
  const firstRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = firstRef.current;
    if (!el) return;
    const measure = () => el.style.setProperty("--atlas-top", `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Sekme görünmezken sürekli kozmik animasyonlar duraklar (pil / işlemci).
  useEffect(() => {
    const el = firstRef.current;
    if (!el) return;
    const sync = () => {
      el.dataset.paused = document.hidden ? "true" : "false";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const panelDepth = useTilt(0);

  // "Son Çalışmalar" → Analiz Arşivi, "Son analiz: en yeni" sıralamasıyla (onRecent).
  const open = (k: PortalKey) => (k === "recent" ? onRecent() : onNavigate(k));

  return (
    <div ref={firstRef} className={`${gaDisplay.variable} ${gaLabel.variable} ${styles.root}`} data-testid="atlas-hero" lang="tr">
      <div className={styles.page}>
        <nav aria-label="Gökyüzü Atlası" className={styles.cards}>
          {PORTALS.map((p) => (
            <PortalCard key={p.key} p={p} onOpen={open} />
          ))}
        </nav>

        <section aria-labelledby="atlas-title" className={styles.panel} {...panelDepth}>
          <div className={styles.panelSky} aria-hidden="true" />
          <div className={`${styles.sphere} ${styles.depth}`} style={{ "--d": 6 } as CSSProperties} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
            <img src="/premium/gokyuzu-atlasi/gok-kure.webp" width={570} height={668} alt="" draggable={false} />
            <span className={styles.sphereGlow} />
            <span className={styles.orbitSweep}>
              <span className={styles.orbitLight} />
            </span>
          </div>
          <div className={`${styles.planet} ${styles.depth}`} style={{ "--d": 3 } as CSSProperties} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
            <img src="/premium/gokyuzu-atlasi/gezegen.webp" width={500} height={142} alt="" draggable={false} />
          </div>
          <div className={`${styles.stars} ${styles.depth}`} style={{ "--d": 9 } as CSSProperties} aria-hidden="true">
            {TWINKLES.map((s, i) => (
              <span
                key={`t${i}`}
                className={styles.twinkle}
                style={{ left: `${s.x}%`, top: `${s.y}%`, "--s": `${s.s}px`, "--dur": `${6 + (s.d % 3)}s`, "--delay": `${-s.d}s` } as CSSProperties}
              >
                <Star4 />
              </span>
            ))}
            {DUST.map((m, i) => (
              <span
                key={`m${i}`}
                className={styles.mote}
                style={
                  {
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    "--s": `${m.s}px`,
                    "--dur": `${m.dur}s`,
                    "--delay": `${-m.d}s`,
                    "--dx": `${m.dx}px`,
                    "--dy": `${m.dy}px`,
                  } as CSSProperties
                }
              />
            ))}
            <span className={styles.shooting} />
          </div>

          {/* 2026-10-15: Atlas, Yaşam Analiz Merkezi'nin içinde → modülden çıkış oraya döner.
              2026-10-19: "Yakında" bağlantısı hemen yanında (ilk ekranda görünür); yalnız statik bilgi görünümünü açar. */}
          <div className={styles.topLinks}>
            <Link href="/life-analysis" className={styles.backPill} data-testid="atlas-back-to-center">
              <ChevronLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              <span>Yaşam Analiz Merkezi</span>
            </Link>
            <button type="button" onClick={onSoon} className={styles.soonLink} aria-label="Yakında — Yeni Haritalar ve Astroloji Ekolleri" data-testid="atlas-soon-link">
              <span className={styles.soonLinkMark} aria-hidden="true">
                <Star4 />
              </span>
              <span className={styles.soonLinkEyebrow}>YAKINDA</span>
              <span className={styles.soonLinkText}>— Yeni Haritalar</span>
            </button>
          </div>

          <div className={styles.heroText}>
            <p className={styles.eyebrow}>
              <span>Yaşam Sistemi</span>
              <span className={styles.eyebrowDot} aria-hidden="true">
                ·
              </span>
              <span>Astroloji</span>
            </p>
            <h1 id="atlas-title" className={styles.heroTitle}>
              <span>Gökyüzü</span>
              <span>Atlası</span>
            </h1>
            <p className={styles.heroDivider} aria-hidden="true">
              <span />
              <Star4 />
              <span />
            </p>
            <p className={styles.heroSub}>Gökyüzünün dili, analizlerinizin derinliği.</p>
            <button type="button" onClick={onNewProfile} className={styles.newProfile}>
              <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              <span>Yeni doğum profili</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
