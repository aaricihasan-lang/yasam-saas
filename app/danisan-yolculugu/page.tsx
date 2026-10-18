"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Fraunces, Jost } from "next/font/google";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { DyIcon, type DyIconName } from "@/app/danisan-yolculugu/_premium/DyArt";
import { DyFolderCard } from "@/app/danisan-yolculugu/_premium/DyFolderCard";
import styles from "@/app/danisan-yolculugu/_premium/dy.module.css";
import { formatDate } from "@/lib/i18n/format";

// ─── Yardımcı: ISO tarihi → DD.MM.YYYY ──────────────────────────────────────
// Merkezî locale-duyarlı format helper üzerinden; boş/geçersizde mevcut "—"
// davranışı korunur (formatDate boş string döndürür).
function isoToTR(iso: string | null | undefined): string {
  return formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" }) || "—";
}

// ─── Yardımcı: Sayıyı okunabilir stringe çevir ──────────────────────────────
function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return String(n);
}

// 2026-10-18 premium görünüm (owner onaylı v2 prototipi, tasarım arşivi 0f861c4): başlık Fraunces, etiket Jost —
// next/font ile kendi sunucumuzdan (dış istek yok); Türkçe için latin-ext.
const dyDisplay = Fraunces({ subsets: ["latin", "latin-ext"], axes: ["opsz", "SOFT"], variable: "--dy-display", display: "swap" });
const dyLabel = Jost({ subsets: ["latin", "latin-ext"], weight: ["500"], variable: "--dy-label", display: "swap" });

// ─── Sabit kart tanımları (renk + ikon) ─────────────────────────────────────
// `id` = stabil çeviri anahtarı (clients.landing.stats.<id>); görünen etiket
// render sırasında t() ile üretilir. Sıra = stats[] dizisinin sırası.
const STAT_CARD_DEFS: { id: string; icon: DyIconName; accent: string }[] = [
  { id: "total",              icon: "users",         accent: "purple" },
  { id: "thisMonthNew",       icon: "userPlus",      accent: "blue" },
  { id: "lastCreated",        icon: "calendar",      accent: "amber" },
  { id: "thisMonthAppts",     icon: "calendarPlus",  accent: "indigo" },
  { id: "nextAppt",           icon: "activity",      accent: "violet" },
  { id: "thisMonthCompleted", icon: "calendarCheck", accent: "emerald" },
];

// `key` = stabil çeviri anahtarı (clients.landing.folders.<key>); görünen
// title/desc/cta render sırasında t() ile üretilir. href sabit kalır.
const journeyFolders: { key: "kayit" | "liste" | "takip"; href: string; accent: "emerald" | "violet" | "cyan" }[] = [
  { key: "kayit", href: "/danisan-yolculugu/kayit", accent: "emerald" },
  { key: "liste", href: "/danisan-yolculugu/liste", accent: "violet" },
  { key: "takip", href: "/danisan-yolculugu/takip", accent: "cyan" },
];

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function DanisanYolculuguPage() {
  const t = useTranslations("clients.landing");
  const tNav = useTranslations("navigation");
  // 6 stat değeri — yükleme öncesi "—"
  const [stats, setStats] = useState<string[]>(Array(6).fill("—"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      // Demo vitrin hesabı da gerçek (sentetik demo tenant) özet ucunu kullanır.
      const uid = readYasamUser()?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      const token = readSessionToken();
      const headers: Record<string, string> = {
        "x-user-id": uid,
        ...(token ? { "x-session-token": token } : {}),
      };

      // Hafif özet endpoint'i — satırları indirmeden sunucuda sayım.
      // FAZ 2 F6: ay sınırları + "şimdi" artık SUNUCUDA Europe/Istanbul'a göre
      // üretilir; tarayıcı saat dilimi parametresi GÖNDERİLMEZ.
      const res = await fetch(`/api/clients/stats`, { headers });
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const json = (await res.json()) as {
        stats?: {
          totalClients: number;
          thisMonthClients: number;
          lastClientDate: string | null;
          thisMonthAppts: number;
          nextApptDate: string | null;
          thisMonthCompleted: number;
        };
      };
      if (cancelled) return;
      const s = json.stats;
      if (!s) {
        setLoading(false);
        return;
      }

      setStats([
        fmtCount(s.totalClients),          // 1 Toplam Danışan
        fmtCount(s.thisMonthClients),      // 2 Bu Ay Yeni
        isoToTR(s.lastClientDate),         // 3 Son Kayıt
        fmtCount(s.thisMonthAppts),        // 4 Bu Ay Randevu
        isoToTR(s.nextApptDate),           // 5 En Yakın Randevu
        fmtCount(s.thisMonthCompleted),    // 6 Bu Ay Tamamlanan
      ]);
      setLoading(false);
    }

    void loadStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={`${styles.root} ${dyDisplay.variable} ${dyLabel.variable}`}>
      <div className={styles.page}>
        {/* Başlık şeridi */}
        <header className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden>
            <DyIcon name="journey" size={24} stroke={2} />
          </span>
          <div className={styles.heroHead}>
            <p className={styles.eyebrow}>{tNav("brand")}</p>
            <h1 className={styles.heroTitle}>{t("hero.title")}</h1>
          </div>
          <p className={styles.heroSub}>{t("hero.subtitle")}</p>
        </header>

        <div className={styles.grid}>
          {/* Hızlı İşlemler */}
          <section className={styles.quick} aria-labelledby="dy-quick-title">
            <div className={styles.sectionHead}>
              <h2 id="dy-quick-title" className={styles.sectionTitle}>{t("quickActions.title")}</h2>
              <p className={styles.sectionSub}>{t("quickActions.subtitle")}</p>
            </div>
            <div className={styles.folders}>
              {journeyFolders.map((folder, i) => (
                <DyFolderCard
                  key={folder.key}
                  folderKey={folder.key}
                  index={i}
                  accent={folder.accent}
                  href={folder.href}
                  title={t(`folders.${folder.key}.title`)}
                  desc={t(`folders.${folder.key}.desc`)}
                  cta={t(`folders.${folder.key}.cta`)}
                />
              ))}
            </div>
          </section>

          {/* Genel Özet — gerçek /api/clients/stats verisi; kişisel bilgi gösterilmez. */}
          <aside className={styles.summary} aria-labelledby="dy-summary-title">
            <h2 id="dy-summary-title" className={styles.summaryTitle}>{t("summary.title")}</h2>
            <p className={styles.summarySub}>{t("summary.subtitle")}</p>
            <div className={styles.stats}>
              {STAT_CARD_DEFS.map((def, i) => {
                const label = t(`stats.${def.id}`);
                const value = loading ? "—" : stats[i];
                return (
                  <div key={def.id} className={styles.stat} data-accent={def.accent}>
                    <span className={styles.statIcon} aria-hidden>
                      <DyIcon name={def.icon} size={20} stroke={2} />
                    </span>
                    <div className={styles.statText}>
                      <p
                        className={`${styles.statValue} ${value.length > 4 ? styles.long : ""} ${loading ? styles.loading : ""}`}
                      >
                        {value}
                      </p>
                      <p className={styles.statLabel} title={label}>{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.privacy}>
              <span className={styles.privacyIcon} aria-hidden>
                <DyIcon name="shield" size={20} stroke={2} />
              </span>
              <div className="min-w-0">
                <p className={styles.privacyTitle}>{t("summary.privacyTitle")}</p>
                <p className={styles.privacyDesc}>{t("summary.privacyDesc")}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
