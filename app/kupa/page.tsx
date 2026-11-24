import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BookOpen, CalendarDays, ChevronRight, FolderOpen } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/kupa/kupaAnaSayfa.module.css";

/**
 * Kupa & Hacamat Terapisi — modül landing.
 *
 * 2026-10-20 premium görünüm (owner GÖRSEL PASS prototipi: C:\YasamSistemi-Gorsel-Tasarim\kupa-hacamat-ana-sayfa).
 * YALNIZ sunum: metinler, kart sırası, bağlantılar (/kupa/protokoller, /kupa/takvim, /kupa/noktalar,
 * /kupa/teknikler, /kupa/guvenlik) ve editoryal not canlıdaki gibi. Yeni fetch/API/sayaç YOK — statik navigasyon.
 *
 * HİYERARŞİ (FAZ 4 sadeleştirme): 1) iki çalışma alanı (Protokoller dominant, Takvim ikinci)
 * 2) DESTEK KÜTÜPHANELERİ (3 kart). Kaynaklar/Bilgi standalone altyapısı KORUNUR ama landing'de görünmez
 * (protokol içinden bağlanır) — owner 2026-10-20: yalnız mevcut 3 destek kartı.
 * Görseller sayfaya ait sabit dekordur (gezinme kartı; kayıt değil).
 */

type Area = { key: "points" | "techniques" | "safety"; art: string; href: string };

type MainCardProps = { href: string; eyebrow: string; title: string; desc: string; cta: string; art: string; Icon: typeof FolderOpen };

function MainCard({ href, eyebrow, title, desc, cta, art, Icon }: MainCardProps) {
  return (
    <Link href={href} className={styles.mCard}>
      <span className={styles.mIcon} aria-hidden>
        <Icon className={styles.ico} width={30} height={30} strokeWidth={1.8} />
      </span>
      <span className={styles.mText}>
        <span className={styles.mEyebrow}>{eyebrow}</span>
        <span className={styles.mTitle}>{title}</span>
        <span className={styles.mDesc}>{desc}</span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.mArt} src={`/premium/kupa/${art}.webp`} alt="" aria-hidden decoding="async" draggable={false} />
      <span className={styles.mCta}>
        {cta}
        <ArrowRight className={styles.ico} width={18} height={18} strokeWidth={2.2} aria-hidden />
      </span>
    </Link>
  );
}

// Destek kütüphaneleri — protokollerde kullanılan temel kayıtlar (sade kullanıcı dili).
// Metinler: messages/<dil>/cupping.json → cupping.home.support.<key>.
const SUPPORT: Area[] = [
  { key: "points", art: "destek-noktalar", href: "/kupa/noktalar" },
  { key: "techniques", art: "destek-teknikler", href: "/kupa/teknikler" },
  { key: "safety", art: "destek-guvenlik", href: "/kupa/guvenlik" },
];

export default async function KupaLandingPage() {
  const t = await getTranslations("cupping.home");
  const ts = await getTranslations("cupping.shell");
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.heroArt} src="/premium/kupa/hero-spa.webp" width={1784} height={452} alt="" aria-hidden decoding="async" draggable={false} />
      <div className={styles.inner}>
        <nav className={styles.crumbs} aria-label={ts("crumbAria")}>
          <Link href="/">{ts("crumbHome")}</Link>
          <span className={styles.sep} aria-hidden>/</span>
          <Link href="/enerji-beden">{ts("crumbEnergyBody")}</Link>
          <span className={styles.sep} aria-hidden>/</span>
          <span className={styles.cur} aria-current="page">{ts("moduleName")}</span>
        </nav>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <i aria-hidden />
            {t("eyebrow")}
          </p>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.desc}>{t("desc")}</p>
        </header>

        <section className={styles.mainCards} aria-label={t("mainCardsAria")}>
          {/* 1) PRIMARY — Hacamat Protokolleri (dominant) */}
          <MainCard
            href="/kupa/protokoller"
            eyebrow={t("mainEyebrow")}
            title={t("protocols.title")}
            desc={t("protocols.desc")}
            cta={t("protocols.cta")}
            art="kart-protokoller"
            Icon={FolderOpen}
          />
          {/* 2) İKİNCİ ÇALIŞMA ALANI — Hacamat Takvimi */}
          <MainCard
            href="/kupa/takvim"
            eyebrow={t("mainEyebrow")}
            title={t("calendar.title")}
            desc={t("calendar.desc")}
            cta={t("calendar.cta")}
            art="kart-takvim"
            Icon={CalendarDays}
          />
        </section>

        <div className={styles.secHead}>
          <h2 className={styles.secTitle}>
            <BookOpen className={styles.ico} width={20} height={20} strokeWidth={2} aria-hidden />
            {t("supportTitle")}
          </h2>
          <span className={styles.secLine} aria-hidden />
        </div>
        <section className={styles.support} aria-label={t("supportAria")}>
          {SUPPORT.map((a) => (
            <Link key={a.href} href={a.href} className={styles.sCard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.sArt} src={`/premium/kupa/${a.art}.webp`} width={294} height={276} alt="" aria-hidden decoding="async" draggable={false} />
              <span className={styles.sText}>
                <span className={styles.sTitle}>{t(`support.${a.key}.title`)}</span>
                <span className={styles.sDesc}>{t(`support.${a.key}.desc`)}</span>
                <span className={styles.sCta}>
                  {t("supportCta")}
                  <ArrowRight className={styles.ico} width={16} height={16} strokeWidth={2.2} aria-hidden />
                </span>
              </span>
              <span className={styles.sChev} aria-hidden>
                <ChevronRight className={styles.ico} width={16} height={16} strokeWidth={2} />
              </span>
            </Link>
          ))}
        </section>

        {/* Sakin editoryal not (medical claim YOK). */}
        <p className={styles.note}>{t("note")}</p>
      </div>
    </main>
  );
}
