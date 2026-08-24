import type { ReactNode } from "react";

/** BF-13 — Yaşam Hafızası liste iskeleti (layout-shift önleyici). */
export function ResultsSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
          <div className="mb-2 h-4 w-24 rounded-full bg-slate-200/80" />
          <div className="mb-2 h-5 w-2/3 rounded bg-slate-200/80" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="mt-1 h-4 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export type EmptyVariant = "cold-start" | "client-cold-start" | "no-results" | "filtered" | "disabled" | "error";

const VARIANT: Record<EmptyVariant, { icon: string; title: string; message: string }> = {
  "cold-start": {
    icon: "🔎",
    title: "Aramaya başlayın",
    message: "Taş, protokol, sembol, çakra veya bir konu yazın; mesleki bilgi havuzunuzda arayalım.",
  },
  // Danışan Hafızası (client-scoped) soğuk başlangıç — mesleki havuz copy'sinden AYRI.
  "client-cold-start": {
    icon: "🔎",
    title: "Aramaya başlayın",
    message: "Danışan geçmişinizde seans, not, ödev, taş, kombinasyon veya randevu içeriği arayın.",
  },
  "no-results": {
    icon: "🗂️",
    title: "Sonuç bulunamadı",
    message: "Bu arama için kayıt bulunamadı. Farklı bir kelime deneyin.",
  },
  filtered: {
    icon: "🧭",
    title: "Seçili modülde sonuç yok",
    message: "Sonuçlar var ama seçtiğiniz modüllerde değil. Filtreyi genişletin.",
  },
  disabled: {
    icon: "🔒",
    title: "Yaşam Hafızası bu hesapta henüz aktif değil",
    message: "Bu özellik hesabınız için etkinleştirildiğinde arama yapabilirsiniz.",
  },
  error: {
    icon: "⚠️",
    title: "Bir şeyler ters gitti",
    message: "Arama tamamlanamadı. Lütfen tekrar deneyin.",
  },
};

/** BF-13 — durum kartı (ilk açılış / boş / filtreli boş / kapalı / hata). */
export function WorkspaceEmpty({
  variant,
  action,
}: {
  variant: EmptyVariant;
  action?: ReactNode;
}) {
  const v = VARIANT[variant];
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-emerald-100 text-2xl">
        <span aria-hidden>{v.icon}</span>
      </div>
      <h2 className="text-lg font-black text-slate-800">{v.title}</h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600">{v.message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
