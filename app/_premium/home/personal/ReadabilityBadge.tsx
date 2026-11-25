"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — fotoğraf üzerindeki karşılama metninin okunabilirlik durumunu DÜRÜSTÇE gösterir.
 * Ölçülmeyen durum asla "geçti" / WCAG olarak gösterilmez.
 *
 * Kullanım (stüdyo):  <ReadabilityBadge />                → ana sayfa karşılamasının son ölçümü (modül deposu)
 *                     <ReadabilityBadge state={s} />       → verilen ölçüm
 * Ölçüm bu tasarım için geçerli değilse (fotoğraf yok / C düzeni) hiçbir şey çizmez; `showIdle` ile "Ölçülemedi" gösterilir.
 */
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { usePhotoReadabilityStatus, type PhotoReadabilityState } from "./usePhotoReadability";
import styles from "./readability.module.css";

export { usePhotoReadabilityStatus, getPhotoReadabilitySnapshot, subscribePhotoReadability } from "./usePhotoReadability";
export type { PhotoReadabilityState } from "./usePhotoReadability";

/** "4,62:1" — oran ölçümde aşağı yuvarlanmıştır. Kaynak dil dışında ondalık ayraç nokta ("4.62:1"). */
export function formatRatio(r: number, locale: string = DEFAULT_LOCALE): string {
  const fixed = (Math.floor(r * 100 + 1e-9) / 100).toFixed(2);
  return `${locale === DEFAULT_LOCALE ? fixed.replace(".", ",") : fixed}:1`;
}

type ReadabilityT = (key: "pass" | "fixed" | "insufficient" | "unmeasured", values?: { ratio: string }) => string;

/** t / locale verilmezse Türkçe (eski davranış, birebir); verilirse home.personalReadability kataloğu. */
export function readabilityText(s: Pick<PhotoReadabilityState, "status" | "ratio" | "target">, t?: ReadabilityT, locale: string = DEFAULT_LOCALE): string {
  if (t) {
    if (s.status === "pass" && s.ratio !== null) return t("pass", { ratio: formatRatio(s.ratio, locale) });
    if (s.status === "fixed" && s.ratio !== null) return t("fixed", { ratio: formatRatio(s.ratio, locale) });
    return t(s.status === "insufficient" ? "insufficient" : "unmeasured");
  }
  if (s.status === "pass" && s.ratio !== null) return `Fotoğraf üzerinde okunabilirlik: ${formatRatio(s.ratio)} (WCAG AA)`;
  if (s.status === "fixed" && s.ratio !== null) return `Otomatik katman uygulandı: ${formatRatio(s.ratio)}`;
  if (s.status === "insufficient") return "Okunabilirlik yetersiz — farklı odak/ton seçin";
  return "Ölçülemedi — fotoğraf yüklenince ölçülür";
}

export default function ReadabilityBadge({ state, showIdle = false, className }: { state?: PhotoReadabilityState; showIdle?: boolean; className?: string }) {
  const live = usePhotoReadabilityStatus();
  const tR = useTranslations("home.personalReadability");
  const locale = useLocale();
  const s = state ?? live;
  if (!s.applicable && !showIdle) return null;
  // Oran yoksa "geçti" / "düzeltildi" gösterilmez
  const status = (s.status === "pass" || s.status === "fixed") && s.ratio === null ? "unmeasured" : s.status;
  return (
    <span
      className={`${styles.badge} ${styles[`b_${status}`] ?? ""} ${className ?? ""}`}
      role="status"
      aria-live="polite"
      data-pw-readability-badge={status}
      data-pw-readability-ratio={status === "unmeasured" || s.ratio === null ? undefined : String(s.ratio)}
    >
      {readabilityText({ ...s, status }, tR, locale)}
    </span>
  );
}
