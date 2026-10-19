import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { BIOENERJI_FOLDER_BASE, findBiyoenerjiSection } from "../biyoenerjiFolderConfig";
import BiyoenerjiBreadcrumb from "./BiyoenerjiBreadcrumb";
import EnerjiBedenleriTabs from "./EnerjiBedenleriTabs";
import { BiyoenerjiDisclaimer } from "./BiyoenerjiDisclaimer";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/biyoenerji/enerjiBedenleri.module.css";

/**
 * 2026-10-19 — Enerji Bedenleri premium kabuğu (owner onaylı referans görsel). YALNIZ bu sayfa kullanır;
 * diğer beş sekme BiyoenerjiSectionShell'de kalır. Breadcrumb, geri bağlantıları, altı bölüm route'u ve
 * sağlık bilgilendirmesi canlıdaki gibi korunur; hero görseli dekoratif (aria-hidden).
 */
export default function EnerjiBedenleriShell({
  badge,
  title,
  subtitle,
  children,
}: {
  badge: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const found = findBiyoenerjiSection("enerji-bedenleri");
  const crumbs = [
    { label: "Biyoenerji", href: BIOENERJI_FOLDER_BASE },
    ...(found ? [{ label: found.group.title }, { label: found.card.title }] : []),
  ];
  // "Enerji Bedenleri" → son kelime mor vurgulu (referanstaki gibi).
  const splitAt = title.lastIndexOf(" ");
  const titleHead = splitAt > 0 ? title.slice(0, splitAt + 1) : "";
  const titleTail = splitAt > 0 ? title.slice(splitAt + 1) : title;

  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <BiyoenerjiBreadcrumb items={crumbs} />
          <div className={styles.backLinks}>
            <Link href={BIOENERJI_FOLDER_BASE} className={styles.backLink}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Biyoenerji
            </Link>
            <Link href="/enerji-beden" className={styles.backLink}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Beden &amp; Enerji Uygulamaları
            </Link>
          </div>
        </div>

        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.heroArt}
            src="/premium/biyoenerji/enerji-bedenleri-hero.webp"
            width={924}
            height={360}
            alt=""
            aria-hidden
            decoding="async"
            draggable={false}
          />
          <div className={styles.heroBody}>
            <p className={styles.badge}>
              <span className={styles.badgeIcon} aria-hidden>
                <Layers className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
              {badge}
            </p>
            <h1 className={styles.title}>
              {titleHead}
              <span className={styles.titleAccent}>{titleTail}</span>
            </h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <EnerjiBedenleriTabs activeSection="enerji-bedenleri" />
        </header>

        <div className="min-w-0">{children}</div>
        <div className={styles.disclaimer}>
          <BiyoenerjiDisclaimer />
        </div>
      </div>
    </main>
  );
}
