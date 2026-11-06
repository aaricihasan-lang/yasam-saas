"use client";

/**
 * Uzman ana sayfası — sağ sütun: Bugünün Enerjisi paneli (çağıranın verdiği düğüm) + Son Aktiviteler (yalnız veri varsa).
 *
 * P3 (Kişisel Dijital Ofis): yalnız SUNUM AYRIŞTIRMASI. Markup ve CSS sınıfları app/page.tsx'teki önceki satır içi hâliyle
 * BİREBİR aynıdır; davranış değişikliği yoktur.
 */
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import premium from "./home.module.css";

export type HomeRecentItem = { icon: string; label: string; relDate: string };

export default function HomeRightColumn({ live, recentActivity }: { live: ReactNode; recentActivity: HomeRecentItem[] | null }) {
  const t = useTranslations("home");
  return (
    <aside className={premium.right}>
      {live}
      {recentActivity !== null && recentActivity.length > 0 ? (
        <section className={premium.panel} aria-labelledby="home-recent-title">
          <h2 id="home-recent-title" className={premium.panelTitle}>{t("dashboard.recentActivity")}</h2>
          <ul className={premium.actList}>
            {recentActivity.map((act, i) => (
              <li key={i} className={premium.act}>
                <span className={premium.actIcon} aria-hidden>{act.icon}</span>
                <span className={premium.actWho}>
                  <strong>{act.label}</strong>
                  <small>{act.relDate}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
