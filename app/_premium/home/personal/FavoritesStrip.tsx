"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — "Favorilerim" kısayol şeridi.
 *
 * Favori YETKİ DEĞİLDİR: yalnız erişilebilir (sol menünün zaten ürettiği gruplarda bulunan) ve gizlenmemiş modüller,
 * uzmanın kayıtlı sırasıyla, en çok 8 adet gösterilir. Gizlenen modül favoride görünmez ama tercihi silinmez.
 * Favori yoksa hiçbir şey çizilmez.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { FAVORITES_MAX } from "@/lib/workspace/catalog";
import type { UiPrefs } from "@/lib/workspace/schema";
import type { ModuleLinkView } from "./moduleLinks";
import { usePwText } from "./i18n";
import styles from "./personal.module.css";

/** Merkez → ana sayfa kartındaki nesne görseli (sabit ekran dekoru; kayıt içeriğine bağlı değil). */
const CENTER_IMG: Record<string, string> = {
  clients: "ql-hd-danisan",
  yasam_hafizasi: "ql-hd-hafiza",
  energy_body: "ql-hd-beden",
  sifa_rehberi: "ql-hd-dogal",
  digital_content: "ql-hd-dijital",
  numerology: "ql-hd-analiz",
  stok: "ql-hd-urun",
};

/** Saf: görünür favoriler (sıra korunur). */
export function visibleFavorites(links: readonly ModuleLinkView[], prefs: Pick<UiPrefs, "favorites" | "hiddenModules">): ModuleLinkView[] {
  const hidden = new Set(prefs.hiddenModules);
  const byKey = new Map(links.map((l) => [l.key, l]));
  const out: ModuleLinkView[] = [];
  for (const f of prefs.favorites) {
    if (out.length >= FAVORITES_MAX) break;
    if (!f.startsWith("module:")) continue;
    const l = byKey.get(f.slice("module:".length));
    if (!l || !l.accessible || hidden.has(f) || hidden.has(`center:${l.centerKey}`)) continue;
    if (out.some((o) => o.key === l.key)) continue;
    out.push(l);
  }
  return out;
}

export default function FavoritesStrip({ links, prefs, focus = false }: {
  /** moduleLinkViews(moduleNavGroups) */
  links: readonly ModuleLinkView[];
  prefs: Pick<UiPrefs, "favorites" | "hiddenModules">;
  /** Odak modunda daha büyük kısayollar. */
  focus?: boolean;
}) {
  const t = useTranslations("home");
  const tx = usePwText();
  const favs = visibleFavorites(links, prefs);
  if (!favs.length) return null;
  const label = (l: ModuleLinkView) => (l.labelKey === "yasamHafizasi" ? t("modules.yasam_hafizasi.title") : t(`premium.nav.${l.labelKey}`));
  return (
    <section className={`${styles.favs} ${focus ? styles.favsFocus : ""}`} aria-labelledby="pw-favs-title" data-testid="home-favorites">
      <h3 id="pw-favs-title" className={styles.favTitle}>
        <Star className={styles.favStar} strokeWidth={0} fill="currentColor" aria-hidden />
        {tx("favorites")}
      </h3>
      <ul className={styles.favList}>
        {favs.map((l) => (
          <li key={l.key}>
            <Link href={l.href} className={styles.favItem} data-fav={l.key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/premium/ana-sayfa/${CENTER_IMG[l.centerKey] ?? "ql-hd-analiz"}.webp`} alt="" aria-hidden />
              <span>{label(l)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
