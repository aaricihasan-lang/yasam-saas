"use client";

import Link from "next/link";
import { Brain, ClipboardList, Copy, FilePenLine, Map as MapIcon, type LucideIcon } from "lucide-react";
import { ReflexologyDisclaimer } from "./ReflexologyDisclaimer";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import { tiltLeave, tiltMove } from "@/app/_premium/enerji-beden/cardTilt";
import styles from "@/app/_premium/refleksoloji/refleksoloji.module.css";

/**
 * Refleksoloji ana menüsü. 2026-10-18 premium görünüm (owner onaylı prototip 8f2db54): 3 + 2 geniş yatay kart,
 * sağda onaylı referanstan kesilmiş görsel; "Modüle Git" butonu YOK, kartın tamamı tek bağlantı.
 * Adresler, kart metinleri, başlık rozeti ve REF-002 sağlık bilgilendirmesi canlıdaki gibi korunur.
 */
type HubModule = {
  href: string;
  title: string;
  /** premium görsel anahtarı (public/premium/refleksoloji/<key>.webp) + renk tonu */
  key: string;
  Icon: LucideIcon;
  lines: readonly string[];
  art: { w: number; h: number };
  wide?: boolean;
};

const MENU_MODULES: HubModule[] = [
  {
    href: "/refleksoloji/bolge-haritasi",
    title: "Bölge Haritası",
    key: "bolge-haritasi",
    Icon: MapIcon,
    lines: [
      "Organ seç → bölge çiz → atlasa kaydet.",
      "Kayıtlı atlası görüntüle ve düzenle.",
    ],
    art: { w: 219, h: 285 },
  },
  {
    href: "/refleksoloji/kayitli-atlas",
    title: "Kayıtlı Atlas",
    key: "kayitli-atlas",
    Icon: Brain,
    lines: ["Kaydedilmiş organ bölgelerini listele, görüntüle ve düzenle."],
    art: { w: 243, h: 285 },
  },
  {
    href: "/refleksoloji/protokol-haritasi",
    title: "Protokol Haritası",
    key: "protokol-haritasi",
    Icon: ClipboardList,
    lines: [
      "Hedef soruna göre protokol yaz.",
      "İlgili organları seç → haritada otomatik göster.",
    ],
    art: { w: 233, h: 285 },
  },
  {
    href: "/refleksoloji/kayitli-protokoller",
    title: "Kayıtlı Protokoller",
    key: "kayitli-protokoller",
    Icon: Copy,
    lines: ["Kayıtlı protokolleri listele ve görüntüle."],
    art: { w: 439, h: 258 },
    wide: true,
  },
  {
    href: "/refleksoloji/notlar",
    title: "Notlar",
    key: "notlar",
    Icon: FilePenLine,
    lines: ["Klinik seans notları ve ek bilgi alanı."],
    art: { w: 481, h: 258 },
    wide: true,
  },
];

function ReflexologyHubCard({ module }: { module: HubModule }) {
  const { Icon } = module;
  return (
    <Link
      href={module.href}
      className={`${styles.card} ${module.wide ? styles.cardWide : ""}`}
      data-card={module.key}
      onPointerMove={(e) => tiltMove(e, module.wide ? 0.45 : 0.6)}
      onPointerLeave={tiltLeave}
    >
      <div className={styles.cardArt} style={{ aspectRatio: `${module.art.w} / ${module.art.h}` }} aria-hidden>
        <span className={styles.artLayer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/premium/refleksoloji/${module.key}.webp`}
            width={module.art.w}
            height={module.art.h}
            alt=""
            decoding="async"
            draggable={false}
          />
        </span>
        <span className={styles.sheen} />
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardIcon} aria-hidden>
          <Icon className="h-[26px] w-[26px]" strokeWidth={1.7} />
        </span>
        <h2 className={styles.cardTitle}>{module.title}</h2>
        <p className={styles.cardDesc}>{module.lines.join(" ")}</p>
      </div>
    </Link>
  );
}

function ReflexologyMainMenu() {
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.scene} aria-hidden>
        <span className={styles.sceneSun} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneLeft}`} src="/premium/refleksoloji/yan-sol.webp" width={54} height={923} alt="" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneRight}`} src="/premium/refleksoloji/yan-sag.webp" width={52} height={673} alt="" decoding="async" />
      </div>

      <div className={styles.inner}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span>Yaşam Sistemi</span>
          </p>
          <h1 className={styles.heroTitle}>
            <span>Refleksoloji</span>
          </h1>
          <p className={styles.heroSub}>Ayak refleksoloji atlası, protokoller ve klinik çalışma alanı</p>
          <p className={styles.pill}>Ayak Refleksolojisi • Atlas • Protokol • Klinik Notlar</p>
        </header>

        <section className={styles.cards} aria-label="Refleksoloji çalışma alanları">
          {MENU_MODULES.map((module) => (
            <ReflexologyHubCard key={module.href} module={module} />
          ))}
        </section>

        {/* REF-002: satış öncesi sağlık/uyumluluk bilgilendirmesi (ince, akışı engellemez). */}
        <div className={styles.disclaimer}>
          <ReflexologyDisclaimer variant="compact" className="px-1 text-center" />
        </div>
      </div>
    </main>
  );
}

export { ReflexologyMainMenu };
export default ReflexologyMainMenu;
