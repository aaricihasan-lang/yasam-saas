"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/numeroloji/numerolojiBilgiBankasi.module.css";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

// I18N: sekme kimlikleri kod değeridir; görünen ad numerology.knowledge.page.tabs.* (TR birebir).
const BILGI_TABS = [
  { id: "kayit-ekle" as const, labelKey: "tabs.add" as const },
  { id: "dogaltas-ata" as const, labelKey: "tabs.assignStone" as const },
  { id: "kayit-listesi" as const, labelKey: "tabs.list" as const },
];

type BilgiTabId = (typeof BILGI_TABS)[number]["id"];

export default function NumerolojiBilgiBankasiPage() {
  useBfcacheRefresh();
  const tr = useTranslations("numerology.knowledge.page");
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [tab, setTab] = useState<BilgiTabId>(isDemo ? "kayit-listesi" : "kayit-ekle");

  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.inner}>
        {isDemo && (
          <DemoModuleBanner className="mb-3" message={tr("demoBanner")} />
        )}
        {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS). Üç sekme ve bileşenler aynen. */}
        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroArt} src="/premium/numeroloji/bilgi-bankasi-hero.webp" width={1472} height={316} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={styles.heroBody}>
            <h1 className={styles.title}>{tr("title")}</h1>
            <p className={styles.sub}>{tr("subtitle")}</p>
          </div>
        </header>

        <nav className={styles.tabs} aria-label={tr("tabsAria")}>
          {BILGI_TABS.filter((t) => !isDemo || t.id === "kayit-listesi").map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            >
              {tr(t.labelKey)}
            </button>
          ))}
        </nav>

        <div className={styles.panel}>
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </main>
  );
}
