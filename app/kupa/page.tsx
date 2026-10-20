import Link from "next/link";
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

type Area = { title: string; desc: string; art: string; href: string };

type MainCardProps = { href: string; title: string; desc: string; cta: string; art: string; Icon: typeof FolderOpen };

function MainCard({ href, title, desc, cta, art, Icon }: MainCardProps) {
  return (
    <Link href={href} className={styles.mCard}>
      <span className={styles.mIcon} aria-hidden>
        <Icon className={styles.ico} width={30} height={30} strokeWidth={1.8} />
      </span>
      <span className={styles.mText}>
        <span className={styles.mEyebrow}>Çalışma Alanı</span>
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
const SUPPORT: Area[] = [
  {
    title: "Hacamat Noktaları",
    desc: "Hacamat bölgelerini ve kayıtlı açıklamalarını görüntüleyin.",
    art: "destek-noktalar",
    href: "/kupa/noktalar",
  },
  {
    title: "Kupa Teknikleri",
    desc: "Kuru, yaş ve farklı uygulama tekniklerini yönetin.",
    art: "destek-teknikler",
    href: "/kupa/teknikler",
  },
  {
    title: "Güvenlik & Kontrendikasyonlar",
    desc: "Kendi güvenlik / dikkat maddelerinizi oluşturun, düzenleyin ve protokollere bağlayın.",
    art: "destek-guvenlik",
    href: "/kupa/guvenlik",
  },
];

export default function KupaLandingPage() {
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.heroArt} src="/premium/kupa/hero-spa.webp" width={1784} height={452} alt="" aria-hidden decoding="async" draggable={false} />
      <div className={styles.inner}>
        <nav className={styles.crumbs} aria-label="Konum">
          <Link href="/">Ana Sayfa</Link>
          <span className={styles.sep} aria-hidden>/</span>
          <Link href="/enerji-beden">Beden &amp; Enerji Uygulamaları</Link>
          <span className={styles.sep} aria-hidden>/</span>
          <span className={styles.cur} aria-current="page">Kupa &amp; Hacamat</span>
        </nav>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <i aria-hidden />
            Profesyonel Çalışma Alanı
          </p>
          <h1 className={styles.title}>Kupa &amp; Hacamat Terapisi</h1>
          <p className={styles.desc}>
            Hacamat protokollerinizi oluşturun; bölgeleri, teknikleri, uygulama akışını, güvenlik notlarını, bilgileri ve
            kaynakları tek çalışma alanında yönetin.
          </p>
        </header>

        <section className={styles.mainCards} aria-label="Çalışma alanı">
          {/* 1) PRIMARY — Hacamat Protokolleri (dominant) */}
          <MainCard
            href="/kupa/protokoller"
            title="Hacamat Protokolleri"
            desc="Rahatsızlık veya çalışma amacına göre bölgeleri, teknikleri, uygulama akışını, güvenliği, bilgileri ve kaynakları tek yerde yönetin."
            cta="Protokolleri Aç"
            art="kart-protokoller"
            Icon={FolderOpen}
          />
          {/* 2) İKİNCİ ÇALIŞMA ALANI — Hacamat Takvimi */}
          <MainCard
            href="/kupa/takvim"
            title="Hacamat Takvimi"
            desc="Kendi yıllık hacamat çalışma takviminizi oluşturun; Gregoryen ve Hicrî tarihleri birlikte görün, uygulama günlerinizi kendiniz belirleyin."
            cta="Takvimi Aç"
            art="kart-takvim"
            Icon={CalendarDays}
          />
        </section>

        <div className={styles.secHead}>
          <h2 className={styles.secTitle}>
            <BookOpen className={styles.ico} width={20} height={20} strokeWidth={2} aria-hidden />
            Destek Kütüphaneleri
          </h2>
          <span className={styles.secLine} aria-hidden />
        </div>
        <section className={styles.support} aria-label="Destek kütüphaneleri">
          {SUPPORT.map((a) => (
            <Link key={a.href} href={a.href} className={styles.sCard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.sArt} src={`/premium/kupa/${a.art}.webp`} width={294} height={276} alt="" aria-hidden decoding="async" draggable={false} />
              <span className={styles.sText}>
                <span className={styles.sTitle}>{a.title}</span>
                <span className={styles.sDesc}>{a.desc}</span>
                <span className={styles.sCta}>
                  Aç
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
        <p className={styles.note}>
          Not: Bu modül geleneksel kullanım / kaynaklandırılmış ilişki bilgisini düzenler; hiçbir konu otomatik olarak
          &quot;tedavi eder&quot; anlamı taşımaz.
        </p>
      </div>
    </main>
  );
}
