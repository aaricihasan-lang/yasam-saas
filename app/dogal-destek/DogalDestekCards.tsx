"use client";

import Link from "next/link";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, Flower2, Gem, Wheat, type LucideIcon } from "lucide-react";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import styles from "./dogalDestek.module.css";

/**
 * Doğal Destek & Rehber alt kartları. Parent route erişimi ModuleRouteGuard +
 * routeModuleAccess (/dogal-destek OR kuralı) ile kapılanır; bu bileşen yalnız
 * KULLANICININ GERÇEKTEN İZNİ OLAN alt kartı gösterir.
 *
 * İzin kaynakları REUSE edilir (yeni auth mimarisi ÜRETİLMEZ):
 *   - Doğaltaş / Aromaterapi / Şifa Rehberi: readYasamUser() + syncYasamUserFromDb() (canlı
 *     module_permissions) + merkezî OR hasAnyModulePermissionFlag (flag-tabanlı).
 *   - Beslenme (tam modül): server-authoritative checkBeslenmeAccess() (admin VEYA beslenme=true).
 *
 * FLICKER FIX: gerçek kartlar İKİ authorization kaynağı da kesinleşmeden (userResolved &&
 * beslenmeResolved) render EDİLMEZ → kartlar TEK SEFERDE görünür (2→3 sıçraması yok). Çözülene
 * kadar iskelet/spinner ya da loading metni GÖSTERİLMEZ; kart alanı SESSİZCE boş kalır, yalnız
 * container min-height'ı korunarak dikey sıçrama önlenir. Kartlar hazır olunca çok kısa ve sade
 * bir opacity geçişiyle görünür (dikkat çeken animasyon yok). Ayrı "Besinlerim"/manuel-besin alt
 * kartı ÜRÜNDEN KALDIRILDI (CUSTOM besin yönetimi tam Beslenme modülünün içindedir: /beslenme →
 * Besinler). `clients` bu hub'ı/alt kartı açmaz.
 */
type SupportFolder = {
  title: string;
  desc: string;
  href: string;
  /** 2026-10-18 premium görünüm: kart görseli (public/premium/dogal-destek), renk tonu, çizgi ikon, prototip sırası. */
  art: { src: string; w: number; h: number };
  accent: "amber" | "sage" | "mint" | "violet";
  Icon: LucideIcon;
};

const flagFolders: (SupportFolder & { keys: string[] })[] = [
  // 2026-10-17 (owner kararı): Doğaltaş ana panelden bu merkeze taşındı. Adres (/dogaltas), veri ve
  // modül kapısı (stones/dogaltas — routeModuleAccess + sunucu API'leri) DEĞİŞMEDİ; yalnız navigasyon.
  {
    title: "Doğaltaş",
    desc: "Taş ve mineral kayıtları, kombinasyonlar ve danışan eşleşmeleri",
    href: "/dogaltas",
    keys: ["stones", "dogaltas"],
    art: { src: "/premium/dogal-destek/dogaltas.webp", w: 391, h: 300 },
    accent: "violet",
    Icon: Gem,
  },
  {
    title: "Aromaterapi",
    desc: "Uçucu yağlar, sabit yağlar ve karışımlar",
    href: "/aromaterapi",
    keys: ["aromatherapy", "aromaterapi"],
    art: { src: "/premium/dogal-destek/aromaterapi.webp", w: 448, h: 302 },
    accent: "amber",
    Icon: Flower2,
  },
  {
    title: "Şifa Rehberi",
    desc: "Rahatsızlık kayıtları, belirtiler ve destekleyici öneriler",
    href: "/sifa-rehberi",
    keys: ["sifa_rehberi", "healing"],
    art: { src: "/premium/dogal-destek/sifa-rehberi.webp", w: 431, h: 302 },
    accent: "sage",
    Icon: BookOpen,
  },
];

// Tam Beslenme alt kartı (server-authoritative access).
const BESLENME_FOLDER: SupportFolder = {
  title: "Beslenme",
  desc: "Besinler, beslenme yaklaşımları ve profesyonel beslenme bilgileri",
  href: "/beslenme",
  art: { src: "/premium/dogal-destek/beslenme.webp", w: 398, h: 300 },
  accent: "mint",
  Icon: Wheat,
};

/** Kart sayısına göre dengeli responsive grid (mobil 1 · sm 2 · 3 kart lg 3). */
function gridClass(count: number): string {
  // 2026-10-24 (owner): 4 kart vitrin gibi tüm içerik genişliğine yayılır (eskiden max-w-4xl → ortada küçük kalıyordu).
  if (count >= 4) return "max-w-none grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-5xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "max-w-3xl grid-cols-1 sm:grid-cols-2";
}

const TILT_MAX_X = 3.5 * 0.45;
const TILT_MAX_Y = 4.5 * 0.45;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py", "--gx", "--gy"];

/** Fareyle hafif 3D eğim + görsel katman parallax'ı (dokunmatik / "hareketi azalt" açıkken yok). Yalnız görsel. */
function onTiltMove(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const px = Math.min(Math.max(x / r.width - 0.5, -0.5), 0.5);
  const py = Math.min(Math.max(y / r.height - 0.5, -0.5), 0.5);
  el.dataset.tilting = "true";
  el.style.setProperty("--rx", `${(-py * 2 * TILT_MAX_X).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${(px * 2 * TILT_MAX_Y).toFixed(2)}deg`);
  el.style.setProperty("--px", px.toFixed(3));
  el.style.setProperty("--py", py.toFixed(3));
  el.style.setProperty("--gx", `${x.toFixed(0)}px`);
  el.style.setProperty("--gy", `${y.toFixed(0)}px`);
}

function onTiltLeave(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  delete el.dataset.tilting;
  for (const p of TILT_PROPS) el.style.removeProperty(p);
}

export default function DogalDestekCards() {
  const [user, setUser] = useState<YasamUser | null>(null);
  // İki authorization kaynağı ayrı ayrı "resolved" olarak izlenir → ikisi de bitmeden render yok.
  const [userResolved, setUserResolved] = useState(false);
  const [beslenmeAccess, setBeslenmeAccess] = useState(false);
  const [beslenmeResolved, setBeslenmeResolved] = useState(false);
  // Kartlar mount olduktan bir kare sonra opacity 0→1 (çok kısa, sade fade — dikkat çekmez).
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    // Canlı module_permissions ile kesinleştir (login_user RPC izinleri döndürmez). Hata da olsa
    // finally ile resolve → sonsuz loading olmaz; yetki fail-closed kalır.
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setUser(fresh ?? cached ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(cached ?? null);
      })
      .finally(() => {
        if (!cancelled) setUserResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void checkBeslenmeAccess()
      .then((ok) => {
        if (!cancelled) setBeslenmeAccess(ok === true);
      })
      .catch(() => {
        if (!cancelled) setBeslenmeAccess(false);
      })
      .finally(() => {
        if (!cancelled) setBeslenmeResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accessResolved = userResolved && beslenmeResolved;

  useEffect(() => {
    if (!accessResolved) return;
    // Kartlar DOM'a girdikten sonra bir sonraki kare: opacity 0→1 geçişini tetikle.
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [accessResolved]);

  // Çözülene kadar SESSİZ boşluk — iskelet/spinner ya da loading metni YOK, gerçek kart YOK
  // (2→3 flicker'ı önle). Yalnız min-height korunur → yetki gelince layout dikey sıçramaz.
  if (!accessResolved) {
    return <div className="min-h-[16rem] w-full" aria-busy="true" aria-hidden />;
  }

  // Tüm access sonuçları kesin → görünür kartları TEK SEFERDE oluştur.
  const visible: SupportFolder[] = flagFolders.filter((folder) =>
    hasAnyModulePermissionFlag(user, [...folder.keys]),
  );
  if (beslenmeAccess) visible.push(BESLENME_FOLDER);

  return (
    <div
      className={`mx-auto grid min-h-[16rem] w-full items-stretch gap-6 transition-opacity duration-300 ease-out ${
        revealed ? "opacity-100" : "opacity-0"
      } ${gridClass(visible.length)} ${styles.cards}`}
    >
      {visible.map(({ title, desc, href, art, accent, Icon }) => (
        <Link
          key={title}
          href={href}
          data-support-card={title}
          data-accent={accent}
          className={styles.card}
          onPointerMove={onTiltMove}
          onPointerLeave={onTiltLeave}
        >
          <span className={styles.cardArt} aria-hidden>
            <span className={styles.artLayer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.src} width={art.w} height={art.h} alt="" decoding="async" draggable={false} />
            </span>
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardIcon} aria-hidden>
              <Icon className="h-6 w-6" strokeWidth={1.6} />
            </span>
            <h2 className={styles.cardTitle}>{title}</h2>
            <p className={styles.cardDesc}>{desc}</p>
          </span>
        </Link>
      ))}
    </div>
  );
}
