"use client";

/**
 * Üst çubuktaki (AppLogoLink) Hızlı Erişim Menüsü düğmesi — prototipteki #qn-open.
 * Tablet/mobilde her zaman; masaüstünde yalnız menünün panel olarak açıldığı hassas ekranlarda görünür.
 * Oturum yoksa / menünün gösterilmediği adreslerde hiç çizilmez.
 */
import { useTranslations } from "next-intl";
import QuickNavIcon from "./QuickNavIcon";
import { setQuickNavState, useQuickNavState } from "./quickNavStore";
import styles from "./quickNav.module.css";

export default function QuickNavMenuButton() {
  const t = useTranslations("navigation.quickNav");
  const { available, overlay, drawerOpen } = useQuickNavState();
  if (!available) return null;
  return (
    <button
      type="button"
      className={`${styles.openBtn} ${overlay ? "" : styles.openBtnDrawerOnly}`}
      onClick={() => setQuickNavState({ drawerOpen: !drawerOpen })}
      aria-controls="quick-nav"
      aria-expanded={drawerOpen}
      aria-label={t("open")}
      title={t("open")}
      data-testid="quick-nav-open"
    >
      <QuickNavIcon name="menu" strokeWidth={1.8} />
    </button>
  );
}
