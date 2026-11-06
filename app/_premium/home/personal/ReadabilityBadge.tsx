"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — fotoğraf üzerindeki karşılama metninin okunabilirlik durumunu DÜRÜSTÇE gösterir.
 * Ölçülmeyen durum asla "geçti" / WCAG olarak gösterilmez.
 *
 * Kullanım (stüdyo):  <ReadabilityBadge />                → ana sayfa karşılamasının son ölçümü (modül deposu)
 *                     <ReadabilityBadge state={s} />       → verilen ölçüm
 * Ölçüm bu tasarım için geçerli değilse (fotoğraf yok / C düzeni) hiçbir şey çizmez; `showIdle` ile "Ölçülemedi" gösterilir.
 */
import { usePhotoReadabilityStatus, type PhotoReadabilityState } from "./usePhotoReadability";
import styles from "./readability.module.css";

export { usePhotoReadabilityStatus, getPhotoReadabilitySnapshot, subscribePhotoReadability } from "./usePhotoReadability";
export type { PhotoReadabilityState } from "./usePhotoReadability";

/** "4,62:1" — oran ölçümde aşağı yuvarlanmıştır. */
export function formatRatio(r: number): string {
  return `${(Math.floor(r * 100 + 1e-9) / 100).toFixed(2).replace(".", ",")}:1`;
}

export function readabilityText(s: Pick<PhotoReadabilityState, "status" | "ratio" | "target">): string {
  if (s.status === "pass" && s.ratio !== null) return `Fotoğraf üzerinde okunabilirlik: ${formatRatio(s.ratio)} (WCAG AA)`;
  if (s.status === "fixed" && s.ratio !== null) return `Otomatik katman uygulandı: ${formatRatio(s.ratio)}`;
  if (s.status === "insufficient") return "Okunabilirlik yetersiz — farklı odak/ton seçin";
  return "Ölçülemedi — fotoğraf yüklenince ölçülür";
}

export default function ReadabilityBadge({ state, showIdle = false, className }: { state?: PhotoReadabilityState; showIdle?: boolean; className?: string }) {
  const live = usePhotoReadabilityStatus();
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
      {readabilityText({ ...s, status })}
    </span>
  );
}
