"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BIOENERJI_SECTIONS_IN_ORDER, type BiyoenerjiSectionKey } from "../biyoenerjiFolderConfig";
import styles from "@/app/_premium/biyoenerji/enerjiBedenleri.module.css";

/**
 * Enerji Bedenleri premium ekranının bölüm sekmeleri — aynı altı route (BiyoenerjiSectionNav ile aynı kaynak).
 * Tek satır yuvarlak sekme; dar ekranda yatay kaydırılır (sayfa taşmaz), etkin sekme açılışta görünür alana alınır.
 */
export default function EnerjiBedenleriTabs({ activeSection }: { activeSection: BiyoenerjiSectionKey }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    // Yalnız yatay kaydırma (scrollIntoView sayfayı dikeyde kaydırabilirdi).
    const target = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
    scroller.scrollLeft = Math.max(0, target);
  }, [activeSection]);

  return (
    <nav aria-label="Biyoenerji bölümleri" className={styles.tabsWrap}>
      <div ref={scrollerRef} className={styles.tabs}>
        {BIOENERJI_SECTIONS_IN_ORDER.map((card) => {
          const { Icon } = card;
          const isActive = card.key === activeSection;
          return (
            <Link
              key={card.key}
              ref={isActive ? activeRef : undefined}
              href={card.href}
              aria-current={isActive ? "page" : undefined}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
              <span>{card.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
