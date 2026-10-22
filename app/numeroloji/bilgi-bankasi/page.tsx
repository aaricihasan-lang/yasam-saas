"use client";

import { useState } from "react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/numeroloji/numerolojiBilgiBankasi.module.css";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

const BILGI_TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle / Düzenle" },
  { id: "dogaltas-ata" as const, label: "Doğaltaş Ata" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type BilgiTabId = (typeof BILGI_TABS)[number]["id"];

export default function NumerolojiBilgiBankasiPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [tab, setTab] = useState<BilgiTabId>(isDemo ? "kayit-listesi" : "kayit-ekle");

  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.inner}>
        {isDemo && (
          <DemoModuleBanner className="mb-3" message="Numeroloji bilgi bankası demo hesabında görüntülenebilir. Kayıt ekleme, düzenleme ve silme işlemleri yapılamaz." />
        )}
        {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS). Üç sekme ve bileşenler aynen. */}
        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroArt} src="/premium/numeroloji/bilgi-bankasi-hero.webp" width={1472} height={316} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={styles.heroBody}>
            <h1 className={styles.title}>Bilgi Bankası</h1>
            <p className={styles.sub}>Numeroloji eğitim ve bilgi içeriklerinizi bu alanda yönetirsiniz.</p>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Bilgi bankası sekmeleri">
          {BILGI_TABS.filter((t) => !isDemo || t.id === "kayit-listesi").map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            >
              {t.label}
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
