/**
 * "Kontrol edildi" etiketi (WT8 ortak görünüm — Doğaltaş ailesi + Biyoenerji genel arama).
 *
 * Kullanıcıya yalnız "bu sonuca baktım" hatırlatmasıdır: alarm rengi YOK (sakin, dolu yeşil),
 * WT5'teki küçük/soluk etiketten daha belirgin. Sıralama/filtre ile ilgisi yoktur.
 */
export const SEARCH_CHECKED_CARD_ACCENT = "ring-2 ring-emerald-300/80";

export function SearchCheckedBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      data-testid="search-checked-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-black tracking-wide text-white shadow-sm ${className}`}
    >
      <span aria-hidden>✓</span>
      {label}
    </span>
  );
}
