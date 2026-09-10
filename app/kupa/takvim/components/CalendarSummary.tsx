"use client";

/**
 * FAZ 5 / AŞAMA 3 — Anlamsal takvim özeti (owner görsel gereksinimi).
 *
 * ESKİ belirsizlik ("31 gün seçili" tek başına) KALDIRILDI. Yerine üç net sayı:
 *   Otomatik (sistem Sünnet/Altın) • Uzman Seçimi (uzmanın kendi günleri) • Toplam.
 * Değişmez formül: auto + practitioner = total (DAİMA). Sayılar ŞU ANKİ taslağı yansıtır.
 *
 * Bekleyen değişiklikler AYRI ve GÖRSEL OLARAK İKİNCİL bir satırda gösterilir; üç ana
 * sayıyı bozmaz (owner önce otomatik/uzman/toplam'ı anlamalı).
 */
export function CalendarSummary({
  autoCount,
  practitionerCount,
  totalCount,
  additions,
  removals,
}: {
  autoCount: number;
  practitionerCount: number;
  totalCount: number;
  additions: number;
  removals: number;
}) {
  const dirty = additions > 0 || removals > 0;
  return (
    <div className="flex flex-col gap-3">
      {/* Üç ana anlamsal sayı — pastel kompakt kartlar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryChip
          label="Otomatik"
          value={autoCount}
          sub="Sünnet / Altın"
          className="border-emerald-200 bg-emerald-50 text-emerald-800"
          valueClassName="text-emerald-900"
        />
        <SummaryChip
          label="Uzman Seçimi"
          value={practitionerCount}
          sub="kendi günleriniz"
          className="border-indigo-200 bg-indigo-50 text-indigo-800"
          valueClassName="text-indigo-900"
        />
        <SummaryChip
          label="Toplam"
          value={totalCount}
          sub="planlı gün"
          className="border-amber-200 bg-amber-50 text-amber-800"
          valueClassName="text-amber-900"
        />
      </div>

      {/* İkincil (bilinçli olarak baskın DEĞİL) bekleyen-değişiklik satırı */}
      {dirty ? (
        <p className="text-xs font-medium text-amber-700" aria-live="polite">
          {additions + removals} değişiklik henüz kaydedilmedi
          <span className="text-amber-500">
            {" "}
            ({additions > 0 ? `${additions} eklenecek` : ""}
            {additions > 0 && removals > 0 ? ", " : ""}
            {removals > 0 ? `${removals} kaldırılacak` : ""})
          </span>
        </p>
      ) : null}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  sub,
  className,
  valueClassName,
}: {
  label: string;
  value: number;
  sub: string;
  className: string;
  valueClassName: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center ${className}`}>
      <span className={`text-2xl font-black leading-none sm:text-3xl ${valueClassName}`}>{value}</span>
      <span className="mt-1 text-[11px] font-bold uppercase tracking-wide sm:text-xs">{label}</span>
      <span className="mt-0.5 text-[10px] font-medium opacity-70">{sub}</span>
    </div>
  );
}
