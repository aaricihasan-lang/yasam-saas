"use client";

/**
 * Gökyüzü Atlası — ana ekran "kontrol paneli": solda dikey giriş kartları (TEK navigasyon), sağda hareketli kozmik
 * panel + başlık. Masaüstünde sayfa, üstteki Yaşam Sistemi çubuğu dâhil görünür yüksekliğe sığar (dikey kaydırma yok).
 *
 * 2026-10-21 AÇIK PREMIUM 3D görünüm (owner PASS): yerleşim önceki ekranla birebir (4 kart aynı sıra / oran, tek büyük
 * sağ panel, aynı kırılımlar); tema tek kaynakta: ./premium/atlasGiris.module.css. Sağ panel bağımsız hareketli
 * katmanlardan oluşur — statik zemin (referans; basılı metin onarıldı), dönen zodyak çarkı (SVG, burç glifleri proje
 * sembol yazı tipinden), ters dönen iç halka, ışıyan güneş, üç derinlikte yerinde dönen / süzülen gezegenler, çark
 * üstünde yörüngede ilerleyen gezegenler, yıldız parıltısı, ışık tozu + fare derinliği. Yalnız transform / opacity;
 * sekme gizliyken durur; "hareketi azalt" açıkken durur. Yalnız görünüm değişti: giriş kartlarının yönlendirmesi
 * (onNavigate / onRecent), "Yeni doğum profili" (onNewProfile), Analiz Merkezi'ne dönüş ve "Yakında" aynen korunur.
 */
import Link from "next/link";
import { Fraunces, Jost } from "next/font/google";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./premium/atlasGiris.module.css";

const gaDisplay = Fraunces({ subsets: ["latin", "latin-ext"], axes: ["opsz", "SOFT"], variable: "--ga-display", display: "swap" });
const gaLabel = Jost({ subsets: ["latin", "latin-ext"], weight: ["500"], variable: "--ga-label", display: "swap" });

const ART = "/premium/gokyuzu-atlasi";

/** Dört köşeli yıldız (parıltı + ayraç). */
function Star4() {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">
      <path d="M0 -12 C1 -3 3 -1 12 0 C3 1 1 3 0 12 C-1 3 -3 1 -12 0 C-3 -1 -1 -3 0 -12Z" fill="currentColor" />
    </svg>
  );
}

/** Yıldız parıltıları: konum (% sahne), boyut (px), gecikme (sn) — sabit (SSR/istemci aynı). */
const TWINKLES = [
  { x: 54, y: 9, s: 16, d: 0 },
  { x: 86, y: 6, s: 11, d: 2.4 },
  { x: 47, y: 22, s: 9, d: 4.1 },
  { x: 97, y: 38, s: 10, d: 1.2 },
  { x: 72, y: 76, s: 14, d: 3.3 },
  { x: 52, y: 88, s: 10, d: 5.2 },
  { x: 93, y: 66, s: 9, d: 0.8 },
  { x: 41, y: 58, s: 8, d: 6 },
  { x: 63, y: 14, s: 12, d: 1.8 },
  { x: 80, y: 52, s: 10, d: 4.6 },
  { x: 58, y: 64, s: 9, d: 2.9 },
  { x: 31, y: 10, s: 8, d: 5.7 },
];

/** Yavaş yükselen ışık tozu: başlangıç (%), boyut (px), süre / gecikme (sn), yön (px). */
const DUST = [
  { x: 52, y: 70, s: 4, dur: 26, d: 0, dx: 40, dy: -90 },
  { x: 66, y: 85, s: 3, dur: 30, d: 6, dx: -30, dy: -110 },
  { x: 78, y: 60, s: 4, dur: 24, d: 12, dx: 30, dy: -80 },
  { x: 90, y: 88, s: 3, dur: 28, d: 3, dx: -40, dy: -100 },
  { x: 60, y: 40, s: 3, dur: 32, d: 9, dx: 50, dy: -70 },
  { x: 84, y: 30, s: 4, dur: 27, d: 15, dx: -30, dy: -60 },
  { x: 44, y: 50, s: 3, dur: 29, d: 18, dx: 40, dy: -90 },
  { x: 72, y: 20, s: 3, dur: 31, d: 21, dx: 20, dy: -50 },
];

/**
 * Gezegen katmanları — zemindeki ikizlerinin TAM üstünde (sahne %: sol, üst, genişlik). Derinlik: arka (yavaş, küçük
 * genlik) · orta · ön (daha belirgin). dur = süzülme süresi, spin = kendi ekseninde dönüş süresi, amp = genlik.
 */
type PlanetLayer = { file: string; x: number; y: number; w: number; dur: number; spin: number; amp: number; delay: number; ring?: boolean; big?: boolean };
const BACK: PlanetLayer[] = [
  { file: "giris-p-a", x: 35.685, y: 1.317, w: 9.959, dur: 16, spin: 120, amp: -3, delay: -2 },
  { file: "giris-p-d", x: 84.544, y: 12.335, w: 4.564, dur: 14, spin: 90, amp: -3, delay: -5 },
  { file: "giris-p-c", x: 46.266, y: 13.533, w: 5.394, dur: 15, spin: 100, amp: -3, delay: -8 },
  { file: "giris-p-l", x: 86.1, y: 48.862, w: 4.564, dur: 13, spin: 80, amp: -3, delay: -3 },
];
const MID: PlanetLayer[] = [
  { file: "giris-p-i1", x: 66.805, y: 24.551, w: 4.149, dur: 11, spin: 60, amp: -4, delay: -1 },
  { file: "giris-p-i2", x: 54.149, y: 32.216, w: 3.734, dur: 12, spin: 55, amp: -4, delay: -6 },
  { file: "giris-p-i3", x: 55.394, y: 38.323, w: 5.809, dur: 10, spin: 70, amp: -4, delay: -3 },
  { file: "giris-p-i4", x: 75.104, y: 37.365, w: 4.772, dur: 12, spin: 65, amp: -4, delay: -9 },
  { file: "giris-p-i5", x: 60.996, y: 45.749, w: 3.734, dur: 11, spin: 50, amp: -4, delay: -4 },
  { file: "giris-p-k", x: 54.046, y: 62.754, w: 5.394, dur: 13, spin: 75, amp: -4, delay: -7 },
];
const FRONT: PlanetLayer[] = [
  { file: "giris-p-mavi", x: 37.552, y: 44.431, w: 10.373, dur: 9, spin: 80, amp: -6, delay: -2, big: true },
  { file: "giris-p-saturn", x: 81.639, y: 26.707, w: 18.361, dur: 14, spin: 0, amp: -5, delay: -6, ring: true, big: true },
  { file: "giris-p-jupiter", x: 68.672, y: 47.305, w: 22.822, dur: 12, spin: 140, amp: -6, delay: -4, big: true },
];

function Planet({ p }: { p: PlanetLayer }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok
    <img
      src={`${ART}/${p.file}.webp`}
      alt=""
      draggable={false}
      decoding="async"
      className={`${styles.planet} ${p.ring ? styles.planetRing : ""} ${p.big ? styles.planetBig : ""}`}
      data-planet={p.file}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, "--dur": `${p.dur}s`, "--spin": `${p.spin || 9999}s`, "--amp": `${p.amp}px`, "--delay": `${p.delay}s` } as CSSProperties}
    />
  );
}

/** Zodyak çarkı (SVG; 400 birim = referansta 400 px çap): opak burç bandı, altın halkalar, çentikler, 12 burç glifi. */
const SIGNS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const pt = (r: number, deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)] as const;
function ZodiacWheel() {
  const start = -83; // referanstaki ilk burcun (Koç) açısı
  return (
    <svg viewBox="0 0 400 400" className={styles.wheelSpin} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ga-band" cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="#fbf8ff" />
          <stop offset="80%" stopColor="#f3edff" />
          <stop offset="100%" stopColor="#fffaf0" />
        </radialGradient>
        <linearGradient id="ga-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1d79e" />
          <stop offset="55%" stopColor="#c99a4b" />
          <stop offset="100%" stopColor="#9b6b25" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="159" fill="none" stroke="url(#ga-band)" strokeWidth="64" opacity="0.97" />
      <g fill="none" stroke="url(#ga-gold)">
        <circle cx="200" cy="200" r="191" strokeWidth="2.4" />
        <circle cx="200" cy="200" r="185" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="133" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="127" strokeWidth="2" />
        {Array.from({ length: 72 }, (_, i) => {
          const d = i * 5 + start + 15;
          const major = i % 6 === 0;
          const [x1, y1] = pt(191, d);
          const [x2, y2] = pt(major ? 127 : 185, d);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={major ? 1.1 : 0.7} strokeOpacity={major ? 0.9 : 0.6} />;
        })}
      </g>
      <g className={styles.glyph} fill="url(#ga-gold)" fontSize="30" textAnchor="middle" dominantBaseline="central">
        {SIGNS.map((s, i) => {
          const d = start + i * 30;
          const [x, y] = pt(158, d);
          return (
            <text key={s} x={x} y={y} transform={`rotate(${d + 90} ${x} ${y})`}>
              {s + "︎"}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
/** İç halka (ters yönde döner) — ince altın yay + noktalar. */
function InnerRing() {
  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#c99a4b">
        <circle cx="200" cy="200" r="196" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 9" />
        <circle cx="200" cy="200" r="150" strokeOpacity="0.35" strokeWidth="1" />
      </g>
      {Array.from({ length: 8 }, (_, i) => {
        const [x, y] = pt(196, i * 45 + 10);
        return <circle key={i} cx={x} cy={y} r="3.2" fill="#e8c98a" />;
      })}
    </svg>
  );
}
/** Dış yörünge çizgisi (çok yavaş döner). */
function OuterRing() {
  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#c99a4b">
        <circle cx="200" cy="200" r="198" strokeOpacity="0.45" strokeWidth="0.9" />
        {Array.from({ length: 36 }, (_, i) => {
          const [x1, y1] = pt(198, i * 10);
          const [x2, y2] = pt(i % 3 === 0 ? 190 : 194, i * 10);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.5" strokeWidth="0.8" />;
        })}
      </g>
    </svg>
  );
}

type PortalKey = "new" | "archive" | "kb" | "recent";
type Portal = { key: PortalKey; title: string; desc: string; tone: "violet" | "teal" | "gold" | "blue"; icon: string; orb: string };
const PORTALS: Portal[] = [
  {
    key: "new",
    title: "Yeni Analiz",
    desc: "Doğum profilini seçin, Batı · Vedik · KP tekniklerini belirleyin, haritayı hesaplayın.",
    tone: "violet",
    icon: "giris-ikon-yeni",
    orb: "giris-p-i3",
  },
  {
    key: "archive",
    title: "Analiz Arşivi",
    desc: "Danışanlar, doğum profilleri ve kayıtlı analizlerden oluşan çalışma kütüphaneniz.",
    tone: "teal",
    icon: "giris-ikon-arsiv",
    orb: "giris-p-a",
  },
  {
    key: "kb",
    title: "Bilgi Bankası",
    desc: "Kendi yorum ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir.",
    tone: "gold",
    icon: "giris-ikon-bilgi",
    orb: "giris-p-k",
  },
  {
    key: "recent",
    title: "Son Çalışmalar",
    desc: "En son işlem yapılan doğum profilleri — kaldığınız yerden devam edin.",
    tone: "blue",
    icon: "giris-ikon-son",
    orb: "giris-p-mavi",
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
      <span className={styles.cardDecor} aria-hidden="true">
        <span className={styles.cardArc} />
        {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
        <img className={styles.cardOrb} src={`${ART}/${p.orb}.webp`} alt="" draggable={false} decoding="async" />
        <span className={styles.cardSpark} style={{ right: "22%", top: "16%" }}>
          <Star4 />
        </span>
        <span className={styles.cardSpark} style={{ right: "15%", bottom: "14%" }}>
          <Star4 />
        </span>
      </span>
      <span className={styles.cardIcon} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
        <img src={`${ART}/${p.icon}.webp`} width={196} height={196} alt="" draggable={false} decoding="async" />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{p.title}</span>
        <span className={styles.cardDesc}>{p.desc}</span>
      </span>
      <span className={styles.cardChevron} aria-hidden="true">
        <ChevronRight strokeWidth={2.4} />
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
  onHorary,
}: {
  onNavigate: (v: "new" | "archive" | "kb") => void;
  onRecent: () => void;
  onNewProfile: () => void;
  /** "Yakında" bilgilendirme görünümü (statik; veri / istek yok). */
  onSoon: () => void;
  /** Batı Horary (William Lilly) önizlemesi; yalnız önizleme bayrağı açıkken verilir (yoksa bağlantı çizilmez). */
  onHorary?: () => void;
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
          {/* Sahne: bağımsız hareketli katmanlar (dekor; erişilebilirlik ağacında yok, tıklamayı engellemez) */}
          <div className={styles.art} aria-hidden="true" data-testid="atlas-scene">
            {/* eslint-disable-next-line @next/next/no-img-element -- dekor zemin; boyutlar sabit, dış istek yok */}
            <img className={styles.base} src={`${ART}/giris-zemin.webp`} width={964} height={835} alt="" draggable={false} decoding="async" />
            <div className={`${styles.layer} ${styles.depthBack}`}>
              {BACK.map((p) => (
                <Planet key={p.file} p={p} />
              ))}
              {TWINKLES.map((s, i) => (
                <span
                  key={`t${i}`}
                  className={styles.twinkle}
                  style={{ left: `${s.x}%`, top: `${s.y}%`, "--s": `${s.s}px`, "--dur": `${6 + (s.d % 3)}s`, "--delay": `${-s.d}s` } as CSSProperties}
                >
                  <Star4 />
                </span>
              ))}
            </div>
            <div className={`${styles.layer} ${styles.depthMid}`}>
              <div className={styles.wheel} data-testid="atlas-zodiac">
                <div className={styles.wheelOuter}>
                  <OuterRing />
                </div>
                <ZodiacWheel />
                <div className={styles.wheelInner}>
                  <InnerRing />
                </div>
              </div>
              <div className={styles.sun}>
                <span className={styles.sunGlow} />
                {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
                <img src={`${ART}/giris-gunes.webp`} width={128} height={128} alt="" draggable={false} decoding="async" />
              </div>
              {MID.map((p) => (
                <Planet key={p.file} p={p} />
              ))}
              <div className={styles.orbit} style={{ "--dur": "70s", "--d": "33%" } as CSSProperties} data-testid="atlas-orbit">
                {/* eslint-disable-next-line @next/next/no-img-element -- dekor */}
                <img className={styles.orbitBody} src={`${ART}/giris-p-i4.webp`} alt="" draggable={false} decoding="async" style={{ "--w": "10.7%" } as CSSProperties} />
              </div>
              <div className={`${styles.orbit} ${styles.orbitReverse}`} style={{ "--dur": "46s", "--d": "20.7%" } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element -- dekor */}
                <img className={styles.orbitBody} src={`${ART}/giris-p-i2.webp`} alt="" draggable={false} decoding="async" style={{ "--w": "13%" } as CSSProperties} />
              </div>
            </div>
            <div className={`${styles.layer} ${styles.depthFront}`}>
              {FRONT.map((p) => (
                <Planet key={p.file} p={p} />
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
            </div>
          </div>
          <div className={styles.textGlow} aria-hidden="true" />

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
            {onHorary && (
              <button type="button" onClick={onHorary} className={styles.soonLink} aria-label="Horary — William Lilly soru haritası" data-testid="atlas-horary-link">
                <span className={styles.soonLinkMark} aria-hidden="true">
                  <Star4 />
                </span>
                <span className={styles.soonLinkEyebrow}>HORARY</span>
                <span className={styles.soonLinkText}>— William Lilly</span>
              </button>
            )}
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
              <span className={styles.titleTop}>Gökyüzü</span>
              <span className={styles.titleBottom}>Atlası</span>
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
              <ChevronRight className={styles.newProfileChevron} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
